const fs = require('fs')

function noop() {}

function createRuntimeManager(options = {}) {
  const settings = options.settings || {}
  const {
    botsConfigs = [],
    START_STAGGER = 0,
    START_STAGGER_JITTER = 0,
    PERIODIC_REJOIN_MS = 0,
    ROTATION_DELAY_BETWEEN_BOTS = 0,
    GLOBAL_ERROR_THRESHOLD = 1,
    GLOBAL_ERROR_TIME_WINDOW = 60000,
    STOP_ON_NO_INTERNET = false,
    NO_INTERNET_THRESHOLD = 3,
    PAUSE_FILE_PATH = 'pause.txt',
    PAUSE_CHECK_INTERVAL = 1000,
    MEMORY_LIMIT_MB = 0,
    OFFLINE_WATCHDOG_MS = 60000,
    OFFLINE_WATCHDOG_INTERVAL_MS = 10000,
    ONLINE_MINING_STALL_MS = 60000,
    ENABLE_SOFT_RESTART = false,
    ENABLE_PERIODIC_ROTATION = false
  } = settings

  const setTimeout = options.setTimeout || global.setTimeout
  const clearTimeout = options.clearTimeout || global.clearTimeout
  const setInterval = options.setInterval || global.setInterval
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const addLog = options.addLog || noop
  const updateBotStatus = options.updateBotStatus || noop
  const setRuntimeHealth = options.setRuntimeHealth || noop
  const updateUI = options.updateUI || noop
  const monitorData = options.monitorData || { bots: {}, startTime: Date.now() }
  const getScreen = options.getScreen || (() => null)
  const clearTrackedTimers = options.clearTrackedTimers || noop
  const removeProcessHandlers = options.removeProcessHandlers || noop
  const restoreProcessOutputs = options.restoreProcessOutputs || noop
  const emitRuntimeEvent = options.emitRuntimeEvent || noop
  const runtimeLogger = options.runtimeLogger || { closeAll: noop }
  const hostControlled = options.hostControlled === true
  let createBot = typeof options.createBot === 'function' ? options.createBot : null

  let activeBots = []
  let globalErrorTimestamps = []
  let noInternetErrors = []
  let restarting = false
  let rotationInProgress = false
  let diggingPaused = false
  let manualPauseRequested = false
  let filePauseRequested = false
  let shuttingDown = false
  let startupTimers = []
  let rotationSchedulerStarted = false
  let runtimeStarted = false
  let runtimeEnabled = options.initialRuntimeEnabled !== false
  let lastMemoryRestartAt = 0
  let maintenanceStarted = false

  function createManagedBot(config) {
    if (typeof createBot !== 'function') {
      throw new Error('createBot factory is not configured')
    }
    return createBot(config)
  }

  function restartManagedBotInstance(botObj, reason, logMessage) {
    const cfg = botsConfigs.find(c => c.username === botObj.username)
    if (!cfg) {
      addLog('warning', 'SYSTEM', `Не найден конфиг для перезапуска ${botObj.username} (${reason})`)
      return false
    }

    try {
      if (botObj.cleanup) botObj.cleanup()
    } catch (error) {}

    const newBotObj = createManagedBot(cfg)
    const index = activeBots.findIndex(b => b.username === botObj.username)
    if (index !== -1) {
      activeBots[index] = newBotObj
    } else {
      activeBots.push(newBotObj)
    }

    if (logMessage) {
      addLog('warning', 'SYSTEM', logMessage)
    }
    addLog('success', 'SYSTEM', `Бот ${botObj.username} принудительно перезапущен`)
    return true
  }

  function checkAndRestartStuckBots() {
    if (!runtimeEnabled || shuttingDown) return
    const now = Date.now()

    for (const botObj of activeBots) {
      const botData = monitorData.bots[botObj.username]
      if (!botData) continue

      const lastBlockTime = Number(botData.lastBlockTime) || monitorData.startTime || now
      const lastActivityTime = Math.max(
        lastBlockTime,
        Number(botData.lastActivityTime) || 0,
        Number(botData.rateStatusChangedAt) || 0
      )
      const timeSinceLastBlock = now - lastBlockTime
      const timeSinceLastActivity = now - (lastActivityTime || now)
      const reconnectPending =
        typeof botObj.hasReconnectPending === 'function'
          ? botObj.hasReconnectPending()
          : Boolean(botObj.hasReconnectPending)
      const botFilterBusy =
        typeof botObj.isBotFilterBusy === 'function'
          ? botObj.isBotFilterBusy()
          : Boolean(botObj.isBotFilterBusy)
      const lifecycle =
        typeof botObj.getLifecycleSnapshot === 'function'
          ? botObj.getLifecycleSnapshot()
          : { state: 'unknown', ageMs: 0 }
      const reconnectDueAt = Number(botObj.reconnectDueAt) || 0
      const reconnectOverdue =
        reconnectDueAt > 0 && now - reconnectDueAt > Math.min(OFFLINE_WATCHDOG_MS, 30000)
      const reconnectStuck =
        lifecycle.state === 'waiting-reconnect' &&
        lifecycle.ageMs > OFFLINE_WATCHDOG_MS &&
        (!reconnectPending || reconnectOverdue)
      const lifecycleBusy =
        lifecycle.state === 'botfilter' ||
        lifecycle.state === 'held' ||
        (lifecycle.state === 'waiting-reconnect' && !reconnectStuck)
      const isOnlineBot = Boolean(botObj.bot && botObj.bot.entity && botObj.isOnline)

      if (!isOnlineBot) {
        const recoverableStatus = botData.status === 'оффлайн' || botData.status === 'ожидание'

        if (
          timeSinceLastActivity > OFFLINE_WATCHDOG_MS &&
          recoverableStatus &&
          !botFilterBusy &&
          !lifecycleBusy &&
          (!reconnectPending || reconnectOverdue || reconnectStuck)
        ) {
          const reason =
            reconnectStuck || reconnectOverdue ? 'reconnect timer stuck' : 'offline watchdog'
          setRuntimeHealth('runtime-stale', {
            lastReconnectReason: reason,
            lastRecoveryAction: 'bot instance restart'
          })
          restartManagedBotInstance(
            botObj,
            reason,
            `Бот ${botObj.username} застрял оффлайн (${Math.round(timeSinceLastActivity / 1000)}с, ${reason}) - перезапуск`
          )
        }
        continue
      }

      const miningLooksStale =
        botData.status === 'копает' &&
        lifecycle.state === 'mining' &&
        timeSinceLastBlock > ONLINE_MINING_STALL_MS

      if (
        miningLooksStale &&
        !diggingPaused &&
        !botFilterBusy &&
        !lifecycleBusy &&
        !reconnectPending
      ) {
        const reason = 'online mining stall'
        setRuntimeHealth('runtime-stale', {
          lastReconnectReason: reason,
          lastRecoveryAction: 'bot instance restart',
          diagnosis: `Бот онлайн, но нет подтвержденных блоков ${Math.round(timeSinceLastBlock / 1000)}с.`
        })
        restartManagedBotInstance(
          botObj,
          reason,
          `BOT STALE: ${botObj.username} онлайн, но добыча молчит ${Math.round(timeSinceLastBlock / 1000)}с -> перезапуск`
        )
      }
    }
  }

  function applyDiggingPauseState(source = 'manual') {
    const nextPaused = manualPauseRequested || filePauseRequested
    if (nextPaused === diggingPaused) return

    const now = Date.now()
    diggingPaused = nextPaused
    const status = diggingPaused ? 'ПРИОСТАНОВЛЕНО' : 'ВОЗОБНОВЛЕНО'
    addLog('info', 'SYSTEM', `Копание ${status} (${source})`)

    for (const botData of Object.values(monitorData.bots)) {
      if (botData.status === 'копает' || botData.status === 'пауза') {
        botData.status = diggingPaused ? 'пауза' : 'копает'
        botData.rateActiveSince = diggingPaused ? 0 : now
        botData.rateStatusChangedAt = now
        botData.effectiveBlocksLastMinute = 0
        botData.effectiveBlocksPerSecond = 0
        botData.blocksLastMinute = 0
        botData.blocksPerSecond = 0
      }
    }

    for (const botObj of activeBots) {
      if (typeof botObj.resetSpeedGuardGrace === 'function') {
        botObj.resetSpeedGuardGrace(source)
      }
    }

    updateUI()
  }

  function setManualPause(nextPaused) {
    manualPauseRequested = nextPaused
    applyDiggingPauseState('ручной режим')
  }

  function toggleManualPause() {
    setManualPause(!manualPauseRequested)
  }

  function setFilePause(nextPaused) {
    filePauseRequested = nextPaused
    applyDiggingPauseState('pause.txt')
  }

  function readPauseFileState() {
    try {
      if (!fs.existsSync(PAUSE_FILE_PATH)) return false
      const content = fs.readFileSync(PAUSE_FILE_PATH, 'utf8').trim().toLowerCase()
      if (!content) return true
      return !['0', 'false', 'off', 'resume', 'run'].includes(content)
    } catch (e) {
      addLog('warning', 'SYSTEM', `Не удалось прочитать pause-файл: ${e.message}`)
      return false
    }
  }

  function clearStartupTimers() {
    for (const timer of startupTimers) {
      try {
        clearTimeout(timer)
      } catch (e) {}
    }
    startupTimers = []
  }

  function noteGlobalError() {
    if (!runtimeEnabled || shuttingDown) return
    const now = Date.now()
    globalErrorTimestamps.push(now)
    globalErrorTimestamps = globalErrorTimestamps.filter(t => now - t <= GLOBAL_ERROR_TIME_WINDOW)
    addLog(
      'warning',
      'SYSTEM',
      `Счётчик ошибок: ${globalErrorTimestamps.length}/${GLOBAL_ERROR_THRESHOLD}`
    )
    if (globalErrorTimestamps.length >= GLOBAL_ERROR_THRESHOLD) {
      addLog('error', 'SYSTEM', 'Достигнут порог ошибок -> полный перезапуск')
      fullRestart('global-error-threshold')
    }
  }

  function noteNoInternetError() {
    if (!runtimeEnabled || shuttingDown) return
    if (!STOP_ON_NO_INTERNET) {
      noteGlobalError()
      return
    }
    const now = Date.now()
    noInternetErrors.push(now)
    noInternetErrors = noInternetErrors.filter(t => now - t <= 120000)
    addLog(
      'warning',
      'SYSTEM',
      `Ошибки интернета: ${noInternetErrors.length}/${NO_INTERNET_THRESHOLD}`
    )
    if (noInternetErrors.length >= NO_INTERNET_THRESHOLD) {
      addLog('error', 'SYSTEM', 'Потеряно подключение к интернету - остановка')
      gracefulShutdown('no-internet', 1)
    }
  }

  function fullRestart(reason = 'manual') {
    if (!runtimeEnabled || restarting || shuttingDown) return
    restarting = true
    globalErrorTimestamps = []
    noInternetErrors = []
    clearStartupTimers()
    addLog('info', 'SYSTEM', `Полный перезапуск: ${reason}`)
    for (const a of activeBots) {
      try {
        if (a.cleanup) a.cleanup()
      } catch (e) {}
      try {
        if (a.bot) a.bot.quit()
      } catch (e) {}
    }
    activeBots = []
    const delay = 2000 + Math.floor(Math.random() * 4000)
    setTimeout(() => {
      if (!runtimeEnabled || shuttingDown) {
        restarting = false
        return
      }
      restarting = false
      startAllBots()
    }, delay)
  }

  async function rotateBots() {
    if (rotationInProgress || activeBots.length === 0) return
    rotationInProgress = true

    addLog(
      'info',
      'ROTATION',
      ` Начинаю плановую ротацию ботов (интервал: ${Math.round(PERIODIC_REJOIN_MS / 60000)} мин)`
    )

    const onlineBots = activeBots.filter(b => b.bot && b.bot.entity && b.isOnline)

    if (onlineBots.length === 0) {
      addLog('warning', 'ROTATION', 'Нет онлайн ботов - отменяю ротацию')
      rotationInProgress = false
      return
    }

    addLog('info', 'ROTATION', `Онлайн ботов: ${onlineBots.length}/${activeBots.length}`)

    for (let i = 0; i < activeBots.length; i++) {
      const botObj = activeBots[i]
      const username = botObj.username

      if (!botObj.bot || !botObj.bot.entity || !botObj.isOnline) {
        addLog('warning', 'ROTATION', `Бот ${username} офлайн, пропускаю`)
        continue
      }

      addLog('info', 'ROTATION', `Перезапуск бота ${username} (${i + 1}/${activeBots.length})`)
      updateBotStatus(username, 'ротация')

      try {
        botObj.isRotating = true
        if (botObj.cleanup) botObj.cleanup()
        if (botObj.bot) botObj.bot.quit()
      } catch (e) {
        addLog('warning', 'ROTATION', `Ошибка при остановке ${username}: ${e.message}`)
      }

      await sleep(5000)

      const cfg = botsConfigs.find(c => c.username === username)
      if (cfg) {
        const newBotObj = createManagedBot(cfg)
        activeBots[i] = newBotObj
        addLog('success', 'ROTATION', `Бот ${username} перезапущен`)
      } else {
        addLog('error', 'ROTATION', `Конфиг для ${username} не найден!`)
      }

      if (i < activeBots.length - 1) {
        addLog('info', 'ROTATION', `Следующий бот через ${ROTATION_DELAY_BETWEEN_BOTS / 1000}с`)
        await sleep(ROTATION_DELAY_BETWEEN_BOTS)
      }
    }

    addLog('success', 'ROTATION', '+ Ротация завершена')
    rotationInProgress = false
  }

  function startRotationScheduler() {
    if (rotationSchedulerStarted) return
    rotationSchedulerStarted = true

    if (!ENABLE_PERIODIC_ROTATION) {
      addLog('info', 'SYSTEM', 'Плановая ротация отключена')
      return
    }

    setInterval(() => {
      if (!runtimeEnabled || shuttingDown) return
      rotateBots().catch(err => {
        addLog('error', 'ROTATION', `Ошибка ротации: ${err.message}`)
        rotationInProgress = false
      })
    }, PERIODIC_REJOIN_MS)

    addLog(
      'info',
      'SYSTEM',
      ` Планировщик ротации: каждые ${Math.round(PERIODIC_REJOIN_MS / 60000)} минут`
    )
  }

  function checkMemoryUsage() {
    if (!runtimeEnabled || !ENABLE_SOFT_RESTART || !MEMORY_LIMIT_MB || restarting || shuttingDown)
      return

    const rssMb = process.memoryUsage().rss / 1024 / 1024
    if (rssMb <= MEMORY_LIMIT_MB) return

    const now = Date.now()
    if (now - lastMemoryRestartAt < 15 * 60 * 1000) return

    lastMemoryRestartAt = now
    addLog(
      'warning',
      'SYSTEM',
      `RSS ${rssMb.toFixed(1)} MB > лимит ${MEMORY_LIMIT_MB} MB -> мягкий перезапуск`
    )
    fullRestart('memory-limit')
  }

  function gracefulShutdown(signal = 'SIGTERM', exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true
    runtimeEnabled = false
    runtimeStarted = false
    addLog('info', 'SYSTEM', `Получен ${signal} - завершаю работу`)
    stopAllBots()

    const screen = getScreen()
    if (screen) {
      try {
        screen.destroy()
      } catch (e) {}
    }

    if (hostControlled) {
      clearTrackedTimers()
      removeProcessHandlers()
      runtimeLogger.closeAll({ writeExitMessage: false })
      restoreProcessOutputs()
      emitRuntimeEvent('host-shutdown', { signal, exitCode })
      return
    }

    setTimeout(() => process.exit(exitCode), 250)
  }

  function stopAllBots() {
    clearStartupTimers()
    addLog('info', 'SYSTEM', 'Остановка всех ботов')
    for (const a of activeBots) {
      try {
        if (a.cleanup) a.cleanup()
      } catch (e) {}
    }
    activeBots = []
    rotationInProgress = false
  }

  function startAllBots() {
    if (!runtimeEnabled || shuttingDown) return
    clearStartupTimers()
    addLog('info', 'SYSTEM', `Запуск ${botsConfigs.length} бот(ов)`)
    for (let i = 0; i < botsConfigs.length; i++) {
      const cfg = botsConfigs[i]
      const delay = i * START_STAGGER + Math.floor(Math.random() * START_STAGGER_JITTER)
      addLog('info', 'SYSTEM', `${cfg.username} запустится через ${Math.round(delay / 1000)}с`)
      const timer = setTimeout(() => {
        startupTimers = startupTimers.filter(t => t !== timer)
        if (shuttingDown) return
        try {
          const botObj = createManagedBot(cfg)
          activeBots.push(botObj)
        } catch (e) {
          addLog('error', 'SYSTEM', `Не удалось создать ${cfg.username}: ${e.message}`)
        }
      }, delay)
      startupTimers.push(timer)
    }
  }

  function startRuntimeManager() {
    if (runtimeStarted && runtimeEnabled) return
    shuttingDown = false
    restarting = false
    runtimeEnabled = true
    runtimeStarted = true
    startAllBots()
    startRotationScheduler()
    updateUI()
  }

  function stopRuntimeManager() {
    runtimeEnabled = false
    runtimeStarted = false
    restarting = false
    clearStartupTimers()
    stopAllBots()
    updateUI()
  }

  function shutdownForHost(reason = 'host-reload') {
    addLog('info', 'SYSTEM', `Host shutdown: ${reason}`)
    runtimeEnabled = false
    runtimeStarted = false
    shuttingDown = true
    clearStartupTimers()
    stopAllBots()
    clearTrackedTimers()
    removeProcessHandlers()
    const screen = getScreen()
    if (screen) {
      try {
        screen.destroy()
      } catch (e) {}
    }
    runtimeLogger.closeAll({ writeExitMessage: false })
    restoreProcessOutputs()
  }

  function startMaintenance() {
    if (maintenanceStarted) return
    maintenanceStarted = true
    setInterval(checkAndRestartStuckBots, OFFLINE_WATCHDOG_INTERVAL_MS)
    setFilePause(readPauseFileState())
    setInterval(() => setFilePause(readPauseFileState()), PAUSE_CHECK_INTERVAL)
    setInterval(checkMemoryUsage, 60000)
  }

  return {
    setCreateBot(factory) {
      createBot = factory
    },
    getActiveBots() {
      return activeBots
    },
    isRuntimeEnabled() {
      return runtimeEnabled
    },
    isShuttingDown() {
      return shuttingDown
    },
    isDiggingPaused() {
      return diggingPaused
    },
    isManualPauseRequested() {
      return manualPauseRequested
    },
    toggleManualPause,
    setManualPause,
    setFilePause,
    readPauseFileState,
    noteGlobalError,
    noteNoInternetError,
    fullRestart,
    gracefulShutdown,
    stopAllBots,
    startAllBots,
    startRuntimeManager,
    stopRuntimeManager,
    shutdownForHost,
    startMaintenance,
    checkAndRestartStuckBots,
    checkMemoryUsage,
    startRotationScheduler,
    rotateBots,
    clearStartupTimers
  }
}

module.exports = {
  createRuntimeManager
}

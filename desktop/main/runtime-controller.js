const { spawn: defaultSpawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const {
  createHealthState,
  getRuntimeRecoveryDecision,
  updateHealthState
} = require('../../stability-center')
const {
  BOT_EVENT_PREFIX,
  MAX_RECENT_CHAT_LOGS,
  MAX_RECENT_LOGS,
  RUNTIME_STALE_AFTER_MS,
  RUNTIME_STALE_RESTART_COOLDOWN_MS
} = require('./constants')

function createInitialRuntimeState(now = Date.now()) {
  return {
    status: 'stopped',
    startedAt: null,
    stoppedAt: null,
    lastEventAt: null,
    exitCode: null,
    exitSignal: null,
    pid: null,
    isPaused: false,
    resources: {
      cpuPercent: 0,
      memoryMb: 0
    },
    snapshot: {
      totalBlocks: 0,
      uptimeMs: 0,
      activeBots: 0,
      totalBots: 0,
      paused: false,
      currentRatePerMinute: 0,
      currentRatePerSecond: 0,
      currentEffectiveRatePerMinute: 0,
      currentEffectiveRatePerSecond: 0,
      currentRawRatePerMinute: 0,
      currentRawRatePerSecond: 0,
      performance: {
        rawRate: 0,
        rawRatePerSecond: 0,
        effectiveRate: 0,
        effectiveRatePerSecond: 0,
        peakRate: 0,
        sustainableRate: 0,
        confirmationRatio: 1,
        confirmLatencyMs: 0,
        packetMode: 'fast',
        packetBudget: null,
        fallbackDigCount: 0,
        pendingBreaks: 0,
        stalePendingCleared: 0,
        lastMiningBottleneck: '',
        lastSlowdownReason: ''
      },
      bots: {}
    },
    health: createHealthState(now),
    logs: [],
    chatLogs: []
  }
}

function createRuntimeController({
  configStore,
  paths,
  processRef = process,
  spawnProcess = defaultSpawn,
  getIsQuitting,
  publishRuntimeState,
  updateTrayMenu
}) {
  let runtimeChild = null
  let restartAfterStop = false
  let stdoutBuffer = ''
  let stderrBuffer = ''
  let lastRuntimeStaleRestartAt = 0
  const runtimeState = createInitialRuntimeState()

  function getRuntimeChild() {
    return runtimeChild
  }

  function pushLog(entry) {
    runtimeState.logs = [...runtimeState.logs, entry].slice(-MAX_RECENT_LOGS)
  }

  function pushChatLog(entry) {
    const now = new Date()
    const message = String(entry?.message ?? entry?.rawMessage ?? '').trim()
    if (!message) return

    const normalizedEntry = {
      ...entry,
      botName: entry?.botName || 'SERVER',
      source: entry?.source || 'chat',
      position: entry?.position || 'unknown',
      message,
      rawMessage: entry?.rawMessage ?? message,
      time: entry?.time || now.toLocaleTimeString('ru-RU'),
      timestamp: entry?.timestamp || now.toISOString()
    }

    runtimeState.chatLogs = [...(runtimeState.chatLogs || []), normalizedEntry].slice(
      -MAX_RECENT_CHAT_LOGS
    )
  }

  function setRuntimeHealth(reason, details = {}) {
    runtimeState.health = updateHealthState(runtimeState.health, { reason, ...details }, Date.now())
    runtimeState.snapshot = {
      ...runtimeState.snapshot,
      health: runtimeState.health
    }
    return runtimeState.health
  }

  function buildRuntimePayload() {
    const health =
      runtimeState.snapshot?.health || runtimeState.health || createHealthState(Date.now())
    return {
      ...runtimeState,
      health,
      snapshot: {
        ...runtimeState.snapshot,
        health
      },
      configPath: paths.getRuntimeConfigPath(),
      defaultConfigPath: paths.getDefaultConfigPath(),
      logPath: paths.getRuntimeLogPath(),
      chatLogPath: paths.getRuntimeChatLogPath(),
      runtimeDir: paths.getRuntimeDir()
    }
  }

  function publishState() {
    updateTrayMenu()
    publishRuntimeState(buildRuntimePayload())
  }

  function appendRawProcessOutput(source, line) {
    const trimmed = line.trim()
    if (!trimmed) return

    runtimeState.lastEventAt = Date.now()
    pushLog({
      level: source === 'stderr' ? 'error' : 'info',
      botName: source.toUpperCase(),
      message: trimmed,
      rawMessage: trimmed,
      time: new Date().toLocaleTimeString('ru-RU'),
      timestamp: new Date().toISOString()
    })
    publishState()
  }

  function handleRuntimeEvent(eventType, payload) {
    runtimeState.lastEventAt = Date.now()

    if (eventType === 'log') {
      pushLog(payload)
    } else if (eventType === 'chat') {
      pushChatLog(payload)
    } else if (eventType === 'resources') {
      runtimeState.resources = {
        cpuPercent: payload.cpuPercent || 0,
        memoryMb: payload.memoryMb || 0
      }
    } else if (eventType === 'snapshot') {
      runtimeState.snapshot = payload
      runtimeState.health = payload.health || runtimeState.health
      runtimeState.isPaused = Boolean(payload.paused)
    }

    publishState()
  }

  function flushBufferedOutput(bufferName, chunk, source) {
    const nextBuffer = `${bufferName === 'stdout' ? stdoutBuffer : stderrBuffer}${chunk.toString()}`
    const lines = nextBuffer.split(/\r?\n/)
    const remainder = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith(BOT_EVENT_PREFIX)) {
        try {
          const rawEvent = JSON.parse(line.slice(BOT_EVENT_PREFIX.length))
          handleRuntimeEvent(rawEvent.type, rawEvent.payload || {})
        } catch (error) {
          appendRawProcessOutput(
            'stderr',
            `Не удалось разобрать событие рантайма: ${error.message}`
          )
        }
        continue
      }

      appendRawProcessOutput(source, line)
    }

    if (bufferName === 'stdout') {
      stdoutBuffer = remainder
    } else {
      stderrBuffer = remainder
    }
  }

  function attachRuntimeProcess(childProcess) {
    childProcess.stdout.on('data', chunk => flushBufferedOutput('stdout', chunk, 'stdout'))
    childProcess.stderr.on('data', chunk => flushBufferedOutput('stderr', chunk, 'stderr'))

    childProcess.once('spawn', () => {
      const now = Date.now()
      runtimeState.status = 'running'
      runtimeState.startedAt = now
      runtimeState.lastEventAt = now
      runtimeState.stoppedAt = null
      runtimeState.exitCode = null
      runtimeState.exitSignal = null
      runtimeState.pid = childProcess.pid
      publishState()
    })

    childProcess.once('exit', (code, signal) => {
      if (stdoutBuffer.trim()) {
        appendRawProcessOutput('stdout', stdoutBuffer)
        stdoutBuffer = ''
      }
      if (stderrBuffer.trim()) {
        appendRawProcessOutput('stderr', stderrBuffer)
        stderrBuffer = ''
      }

      runtimeChild = null
      runtimeState.status = code === 0 || signal === 'SIGTERM' ? 'stopped' : 'error'
      runtimeState.stoppedAt = Date.now()
      runtimeState.exitCode = code
      runtimeState.exitSignal = signal
      runtimeState.pid = null
      if (runtimeState.status === 'error') {
        setRuntimeHealth('runtime-stale', {
          lastRecoveryAction: `runtime exited (${code ?? signal ?? 'unknown'})`
        })
      }
      publishState()

      if (restartAfterStop) {
        restartAfterStop = false
        startRuntime()
      }
    })
  }

  function startRuntime() {
    configStore.ensureRuntimeFiles()

    if (runtimeChild) {
      publishState()
      return buildRuntimePayload()
    }

    runtimeState.status = 'starting'
    runtimeState.logs = []
    runtimeState.chatLogs = []
    runtimeState.health = updateHealthState(
      runtimeState.health,
      {
        reason: 'mining-ok',
        lastRecoveryAction: 'runtime starting'
      },
      Date.now()
    )
    stdoutBuffer = ''
    stderrBuffer = ''
    publishState()

    const child = spawnProcess(
      processRef.execPath,
      [paths.getBackendEntryPath(), '--headless', '--emit-json'],
      {
        cwd: paths.getRuntimeCwd(),
        env: {
          ...processRef.env,
          ELECTRON_RUN_AS_NODE: '1',
          BOT_GUI_MODE: '1',
          BOT_CONFIG_PATH: paths.getRuntimeConfigPath(),
          BOT_LOG_PATH: paths.getRuntimeLogPath(),
          BOT_CHAT_LOG_PATH: paths.getRuntimeChatLogPath()
        },
        windowsHide: true
      }
    )

    runtimeChild = child
    attachRuntimeProcess(child)

    return buildRuntimePayload()
  }

  function stopRuntime() {
    restartAfterStop = false

    if (!runtimeChild) {
      runtimeState.status = 'stopped'
      publishState()
      return buildRuntimePayload()
    }

    const childToStop = runtimeChild

    runtimeState.status = 'stopping'
    publishState()
    childToStop.kill('SIGTERM')

    setTimeout(() => {
      if (runtimeChild && runtimeChild === childToStop) {
        childToStop.kill('SIGKILL')
      }
    }, 5000)

    return buildRuntimePayload()
  }

  function restartRuntime() {
    if (!runtimeChild) {
      return startRuntime()
    }

    restartAfterStop = true
    return stopRuntime()
  }

  function setPauseFile(nextPaused) {
    const pauseFilePath = configStore.getPauseFilePath()
    fs.mkdirSync(path.dirname(pauseFilePath), { recursive: true })

    if (nextPaused) {
      fs.writeFileSync(pauseFilePath, 'pause', 'utf8')
    } else if (fs.existsSync(pauseFilePath)) {
      fs.unlinkSync(pauseFilePath)
    }

    runtimeState.isPaused = nextPaused
    runtimeState.snapshot = {
      ...runtimeState.snapshot,
      paused: nextPaused
    }
    publishState()
  }

  function syncPauseState(config) {
    runtimeState.isPaused = fs.existsSync(configStore.getPauseFilePath(config))
    runtimeState.snapshot = {
      ...runtimeState.snapshot,
      paused: runtimeState.isPaused
    }
  }

  function checkRuntimeStaleness() {
    if (getIsQuitting() || !runtimeChild) return
    const now = Date.now()
    if (now - lastRuntimeStaleRestartAt < RUNTIME_STALE_RESTART_COOLDOWN_MS) return

    const decision = getRuntimeRecoveryDecision({
      now,
      running: runtimeState.status === 'running' || runtimeState.status === 'starting',
      desired: true,
      lastEventAt: runtimeState.lastEventAt || runtimeState.startedAt,
      staleAfterMs: RUNTIME_STALE_AFTER_MS
    })

    if (decision.action !== 'restart-runtime') return

    lastRuntimeStaleRestartAt = now
    setRuntimeHealth('runtime-stale', {
      lastRecoveryAction: 'desktop watchdog restart',
      diagnosis: `Runtime молчит ${Math.round((decision.staleForMs || 0) / 1000)}с, приложение перезапускает backend.`
    })
    pushLog({
      level: 'warning',
      botName: 'SYSTEM',
      message: `BOT STALE: runtime молчит ${Math.round((decision.staleForMs || 0) / 1000)}с -> перезапуск`,
      rawMessage: `BOT STALE: runtime молчит ${Math.round((decision.staleForMs || 0) / 1000)}с -> перезапуск`,
      time: new Date().toLocaleTimeString('ru-RU'),
      timestamp: new Date().toISOString()
    })
    publishState()
    restartRuntime()
  }

  function scheduleAutoStartRuntime(desktopSettings) {
    if (!desktopSettings?.autoStartBotsOnLaunch) return

    setTimeout(() => {
      if (runtimeChild || getIsQuitting()) return
      pushLog({
        level: 'info',
        botName: 'SYSTEM',
        message: 'Автозапуск ботов при входе в программу',
        rawMessage: 'Автозапуск ботов при входе в программу'
      })
      startRuntime()
    }, 1200)
  }

  function killRuntimeChild(signal) {
    if (runtimeChild) {
      runtimeChild.kill(signal)
    }
  }

  return {
    appendRawProcessOutput,
    buildRuntimePayload,
    checkRuntimeStaleness,
    flushBufferedOutput,
    getRuntimeChild,
    handleRuntimeEvent,
    killRuntimeChild,
    pushLog,
    restartRuntime,
    runtimeState,
    scheduleAutoStartRuntime,
    setPauseFile,
    setRuntimeHealth,
    startRuntime,
    stopRuntime,
    syncPauseState
  }
}

module.exports = {
  createInitialRuntimeState,
  createRuntimeController
}

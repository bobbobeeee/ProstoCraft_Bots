const path = require('path')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const { formatBlocksPerMinute, formatBlocksPerSecond } = require('./monitoring')
const { updateHealthState } = require('./stability-center')
const { createSpeedGuardProfile } = require('./speed-guard')
const {
  createPacketGovernor,
  getPacketGovernorLimits,
  getPacketGovernorSnapshot
} = require('./runtime-core/packet-governor')
const {
  createMiningController,
  getMiningControllerLimits,
  getMiningControllerSnapshot
} = require('./runtime-core/mining-controller')
const { createBotSessionFactory } = require('./runtime-core/bot-session')
const { createRuntimeSettings, loadRuntimeConfig } = require('./runtime-core/config-schema')
const {
  cleanLogMessage,
  normalizeChatText,
  stringifyDiagnostic: stringifyRuntimeDiagnostic,
  summarizeDiagnosticDetails: summarizeRuntimeDiagnosticDetails
} = require('./runtime-core/runtime-formatters')
const { createRuntimeLogger } = require('./runtime-core/runtime-logger')
const {
  classifyLogHealth,
  createRuntimeState,
  getHealthLogLabel,
  getMiningControllerAggregate: getRuntimeMiningControllerAggregate,
  getPacketGovernorAggregate: getRuntimePacketGovernorAggregate
} = require('./runtime-core/runtime-state')
const { createRuntimeManager } = require('./runtime-core/runtime-manager')
const { createRuntimeUi } = require('./runtime-core/runtime-ui')
const {
  createProcessLifecycle,
  installConsoleNoiseFilters,
  isIgnorableProcessError
} = require('./runtime-core/process-guard')

let runtimeManager = null
let runtimeUi = null

function getRuntimeManager() {
  if (!runtimeManager) {
    throw new Error('runtime manager is not initialized')
  }
  return runtimeManager
}

function fullRestart(reason = 'manual') {
  return getRuntimeManager().fullRestart(reason)
}

function noteGlobalError() {
  return getRuntimeManager().noteGlobalError()
}

function noteNoInternetError() {
  return getRuntimeManager().noteNoInternetError()
}

function gracefulShutdown(signal = 'SIGTERM', exitCode = 0) {
  return getRuntimeManager().gracefulShutdown(signal, exitCode)
}

function setManualPause(nextPaused) {
  return getRuntimeManager().setManualPause(nextPaused)
}

function startRuntimeManager() {
  return getRuntimeManager().startRuntimeManager()
}

function stopRuntimeManager() {
  return getRuntimeManager().stopRuntimeManager()
}

function shutdownForHost(reason = 'host-reload') {
  return getRuntimeManager().shutdownForHost(reason)
}

function safeRender() {
  return runtimeUi.safeRender()
}

function updateScriptResources() {
  return runtimeUi.updateScriptResources()
}

const HOST_CONTROLLED = Boolean(global.__BOT_HOST__)
const MOBILE_RUNTIME_PROFILE = HOST_CONTROLLED && process.env.BOT_MOBILE_RUNTIME === '1'
const BASE_CONSOLE = global.__BOT_BASE_CONSOLE__ || {
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  log: console.log.bind(console)
}
const BASE_STDERR_WRITE =
  global.__BOT_BASE_STDERR_WRITE__ || process.stderr.write.bind(process.stderr)
global.__BOT_BASE_CONSOLE__ = BASE_CONSOLE
global.__BOT_BASE_STDERR_WRITE__ = BASE_STDERR_WRITE

const processLifecycle = createProcessLifecycle()
const { setTimeout, clearTimeout, setInterval, clearInterval } = processLifecycle

function restoreProcessOutputs() {
  processGuard.restore()
}

let physicsPlugin
try {
  physicsPlugin = require('mineflayer-physics')
} catch (e) {
  console.warn('! mineflayer-physics не установлен - физика может работать некорректно')
  console.warn('Установите: npm install mineflayer-physics')
}

// ============================================================================
// ============================================================================
const _warn = BASE_CONSOLE.warn
const _error = BASE_CONSOLE.error
const _log = BASE_CONSOLE.log
const processGuard = installConsoleNoiseFilters({
  baseConsole: BASE_CONSOLE,
  stderrWrite: BASE_STDERR_WRITE
})

function getArgValue(flagName) {
  const exactPrefix = `${flagName}=`
  for (let index = 0; index < process.argv.length; index++) {
    const current = process.argv[index]
    if (current === flagName) return process.argv[index + 1]
    if (typeof current === 'string' && current.startsWith(exactPrefix)) {
      return current.slice(exactPrefix.length)
    }
  }
  return null
}

const GUI_EVENT_MODE = process.argv.includes('--emit-json') || process.env.BOT_GUI_MODE === '1'
const CONFIG_FILE_PATH = path.resolve(
  process.env.BOT_CONFIG_PATH || getArgValue('--config') || path.join(__dirname, 'config.json')
)
const CONFIG_DIR = path.dirname(CONFIG_FILE_PATH)

function emitRuntimeEvent(type, payload = {}) {
  if (typeof global.__BOT_EVENT_EMITTER__ === 'function') {
    try {
      global.__BOT_EVENT_EMITTER__(type, payload)
    } catch (error) {}
  }

  if (!GUI_EVENT_MODE) return
  try {
    process.stdout.write(`@@BOT_EVENT@@${JSON.stringify({ type, payload })}\n`)
  } catch (error) {}
}

processLifecycle.registerProcessHandler('uncaughtException', err => {
  const msg = String(err && err.message ? err.message : err)
  if (isIgnorableProcessError(msg)) return

  const details = String(err && err.stack ? err.stack : msg).slice(0, 4000)
  if (!HOST_CONTROLLED) {
    try {
      _error('[UNCAUGHT]', details)
    } catch (e) {}
  }
  try {
    addLog('error', 'SYSTEM', `uncaught-exception: ${details}`)
  } catch (e) {}
  setTimeout(() => {
    try {
      fullRestart(`uncaught-exception: ${msg.slice(0, 120)}`)
    } catch (restartError) {
      try {
        _error('[UNCAUGHT][RESTART_FAILED]', restartError)
      } catch (e) {}
      if (!HOST_CONTROLLED) {
        process.exit(1)
      }
    }
  }, 100)
})

processLifecycle.registerProcessHandler('unhandledRejection', (reason, promise) => {
  const msg = String(reason && reason.message ? reason.message : reason)
  if (isIgnorableProcessError(msg)) return

  const details = String(reason && reason.stack ? reason.stack : msg).slice(0, 4000)
  if (!HOST_CONTROLLED) {
    try {
      _error('[UNHANDLED_REJECTION]', details)
    } catch (e) {}
  }
  try {
    addLog('error', 'SYSTEM', `unhandled-rejection: ${details}`)
  } catch (e) {}
  setTimeout(() => {
    try {
      fullRestart(`unhandled-rejection: ${msg.slice(0, 120)}`)
    } catch (restartError) {
      try {
        _error('[UNHANDLED_REJECTION][RESTART_FAILED]', restartError)
      } catch (e) {}
      if (!HOST_CONTROLLED) {
        process.exit(1)
      }
    }
  }, 100)
})

// ============================================================================
// ============================================================================
const LOG_FILE_PATH = path.resolve(process.env.BOT_LOG_PATH || path.join(CONFIG_DIR, 'bot.log'))
const CHAT_LOG_FILE_PATH = path.resolve(
  process.env.BOT_CHAT_LOG_PATH || path.join(CONFIG_DIR, 'chat.log')
)
const MAX_LOG_SIZE = 50 * 1024 * 1024
const runtimeLogger = createRuntimeLogger({
  logFilePath: LOG_FILE_PATH,
  chatLogFilePath: CHAT_LOG_FILE_PATH,
  maxLogSize: MAX_LOG_SIZE,
  normalizeChatText
})

function writeToLogFile(message) {
  runtimeLogger.writeToLogFile(message)
}

function writeToChatLogFile(entry) {
  runtimeLogger.writeToChatLogFile(entry)
}

runtimeLogger.init()

process.on('exit', () => {
  runtimeLogger.closeAll()
})

let config
try {
  config = loadRuntimeConfig(CONFIG_FILE_PATH, path.join(__dirname, 'config.json'))
} catch (error) {
  console.error('ERR Ошибка загрузки config.json:', error.message)
  process.exit(1)
}

const runtimeSettings = createRuntimeSettings(config, {
  configDir: CONFIG_DIR,
  mobileRuntimeProfile: MOBILE_RUNTIME_PROFILE
})

const {
  SERVER_HOST,
  SERVER_PORT,
  MC_VERSION,
  DEBUG_MODE,
  DETAILED_EVENT_LOGGING,
  LOG_SERVER_MESSAGES,
  DIAGNOSTIC_MAX_VALUE_LENGTH,
  DIAGNOSTIC_FULL_PACKET_DETAILS,
  DIG_DELAY,
  EMPTY_SCAN_DELAY_MS,
  BREAK_PACKET_PENDING_RETRY_MS,
  BREAK_PACKET_MIN_TARGET_COOLDOWN_MS,
  BREAK_PACKET_MAX_PER_SECOND,
  BREAK_PACKET_BURST_WINDOW_MS,
  BREAK_PACKET_BURST_LIMIT,
  BREAK_PACKET_SAFE_MAX_PER_SECOND,
  BREAK_PACKET_SAFE_BURST_LIMIT,
  BREAK_PACKET_SAFE_REPEATS,
  PACKET_ONLY_FALLBACK_MS,
  MINING_CONTROLLER_ADJUST_INTERVAL_MS,
  MINING_CONTROLLER_SOFT_RECOVERY_LIMIT,
  MINING_CONTROLLER_MIN_BUDGET_SCALE,
  MINING_CONTROLLER_GOOD_CONFIRMATION_RATIO,
  MINING_CONTROLLER_BAD_CONFIRMATION_RATIO,
  MINING_CONTROLLER_STALE_PENDING_MS,
  FAST_DIG_RETRY_MS,
  PERIODIC_REJOIN_MS,
  SNAPSHOT_INTERVAL,
  RESOURCE_INTERVAL,
  PAUSE_FILE_PATH,
  ENABLE_ADAPTIVE_PACKET_GOVERNOR,
  ENABLE_ADAPTIVE_MINING_CONTROLLER,
  SPEED_WINDOW_MS,
  PACKET_GOVERNOR_RECOVERY_MS
} = runtimeSettings

const HEADLESS_MODE =
  process.argv.includes('--headless') ||
  process.env.BOT_HEADLESS === '1' ||
  !process.stdout.isTTY ||
  !process.stdin.isTTY

// ============================================================================
// ============================================================================
let screen = null
let grid = null
let resourcesBox = null
let logBox = null
let infoBox = null
let botsTable = null

if (!HEADLESS_MODE) {
  screen = blessed.screen({ smartCSR: true, title: 'Minecraft Bot Monitor' })
  grid = new contrib.grid({ rows: 12, cols: 12, screen: screen })

  resourcesBox = grid.set(6, 8, 3, 4, blessed.box, {
    label: '  Ресурсы скрипта ',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'magenta' }, label: { fg: 'magenta', bold: true } }
  })

  logBox = grid.set(6, 0, 6, 8, contrib.log, {
    label: '  Логи ',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' }, label: { fg: 'yellow', bold: true } },
    bufferLength: 100
  })

  infoBox = grid.set(0, 0, 2, 12, blessed.box, {
    label: ' Общая статистика ',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' }, label: { fg: 'cyan', bold: true } }
  })

  botsTable = grid.set(2, 0, 4, 12, contrib.table, {
    label: ' Боты и скорость ',
    keys: true,
    vi: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: false,
    columnSpacing: 2,
    columnWidth: [16, 12, 10, 12]
  })
}

// ============================================================================
// ============================================================================
const stabilityCooldowns = new Map()
const packetSafetyCooldowns = new Map()
const packetGovernors = new Map()
const miningControllers = new Map()
const speedGuardProfiles = new Map()
const botFilterRetryStates = new Map()

const runtimeState = createRuntimeState({
  speedWindowMs: SPEED_WINDOW_MS,
  writeToLogFile,
  requestUiRefresh: () => requestUiRefresh()
})
const monitorData = runtimeState.getMonitorData()

function setRuntimeHealth(reason, details = {}) {
  return runtimeState.setRuntimeHealth(reason, details)
}

function recordTimelineEvent(event = {}) {
  return runtimeState.recordTimelineEvent(event)
}

function getPacketGovernor(botName) {
  if (!packetGovernors.has(botName)) {
    packetGovernors.set(
      botName,
      createPacketGovernor({
        enabled: ENABLE_ADAPTIVE_PACKET_GOVERNOR,
        recoveryMs: PACKET_GOVERNOR_RECOVERY_MS
      })
    )
  }
  return packetGovernors.get(botName)
}

function getMiningController(botName) {
  const key = botName || 'default'
  if (!miningControllers.has(key)) {
    miningControllers.set(
      key,
      createMiningController({
        enabled: ENABLE_ADAPTIVE_MINING_CONTROLLER,
        adjustIntervalMs: MINING_CONTROLLER_ADJUST_INTERVAL_MS,
        minBudgetScale: MINING_CONTROLLER_MIN_BUDGET_SCALE,
        maxBudgetScale: 1,
        goodConfirmationRatio: MINING_CONTROLLER_GOOD_CONFIRMATION_RATIO,
        badConfirmationRatio: MINING_CONTROLLER_BAD_CONFIRMATION_RATIO,
        stalePendingMs: MINING_CONTROLLER_STALE_PENDING_MS,
        latencyWarnMs: PACKET_ONLY_FALLBACK_MS,
        softRecoveryLimit: MINING_CONTROLLER_SOFT_RECOVERY_LIMIT,
        softRecoveryCooldownMs: Math.max(50, FAST_DIG_RETRY_MS * 2)
      })
    )
  }
  return miningControllers.get(key)
}

function getPacketGovernorBaseLimits() {
  const baseLimits = {
    fastPerSecond: BREAK_PACKET_MAX_PER_SECOND,
    fastBurst: BREAK_PACKET_BURST_LIMIT,
    safePerSecond: BREAK_PACKET_SAFE_MAX_PER_SECOND,
    safeBurst: BREAK_PACKET_SAFE_BURST_LIMIT,
    burstWindowMs: BREAK_PACKET_BURST_WINDOW_MS,
    targetCooldownMs: BREAK_PACKET_MIN_TARGET_COOLDOWN_MS,
    pendingRetryMs: BREAK_PACKET_PENDING_RETRY_MS,
    safeRepeats: BREAK_PACKET_SAFE_REPEATS
  }

  return baseLimits
}

function getPacketGovernorAggregate() {
  return getRuntimePacketGovernorAggregate(
    packetGovernors,
    getPacketGovernorSnapshot,
    ENABLE_ADAPTIVE_PACKET_GOVERNOR
  )
}

function getMiningControllerAggregate(now = Date.now()) {
  return getRuntimeMiningControllerAggregate(miningControllers, getMiningControllerSnapshot, now)
}

function getSpeedGuardProfile(username) {
  const key = username || 'default'
  if (!speedGuardProfiles.has(key)) {
    speedGuardProfiles.set(key, createSpeedGuardProfile())
  }
  return speedGuardProfiles.get(key)
}

// ============================================================================
// ============================================================================
function refreshBotRates(now = Date.now()) {
  runtimeState.refreshBotRates(now)
}

function buildRuntimeSnapshot() {
  return runtimeState.buildRuntimeSnapshot({
    configFilePath: CONFIG_FILE_PATH,
    logFilePath: LOG_FILE_PATH,
    diggingPaused: runtimeManager ? runtimeManager.isDiggingPaused() : false,
    packetGovernors,
    miningControllers,
    enableAdaptivePacketGovernor: ENABLE_ADAPTIVE_PACKET_GOVERNOR,
    enableAdaptiveMiningController: ENABLE_ADAPTIVE_MINING_CONTROLLER,
    createPacketGovernor,
    createMiningController,
    getPacketGovernor,
    getMiningController,
    getPacketGovernorAggregate,
    getMiningControllerAggregate,
    getPacketGovernorLimits,
    getMiningControllerLimits,
    getPacketGovernorBaseLimits,
    getPacketGovernorSnapshot,
    getMiningControllerSnapshot,
    getSpeedGuardProfile
  })
}

let uiRefreshPending = false
function requestUiRefresh() {
  if (HEADLESS_MODE || uiRefreshPending) return

  uiRefreshPending = true
  setTimeout(() => {
    uiRefreshPending = false
    updateUI()
  }, 100)
}

function addLog(level, botName, message) {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  const colors = {
    info: '{cyan-fg}',
    success: '{green-fg}',
    warning: '{yellow-fg}',
    error: '{red-fg}'
  }
  const icons = { info: 'i', success: '+', warning: '!', error: 'x' }
  const color = colors[level] || '{white-fg}'
  const icon = icons[level] || 'i'

  const cleanMessage = cleanLogMessage(message)

  const healthReason = classifyLogHealth(level, cleanMessage)
  if (healthReason && healthReason !== 'mining-ok') {
    setRuntimeHealth(healthReason, {
      message: cleanMessage,
      lastNetworkError: ['network-reset', 'dns-failure', 'connect-timeout'].includes(healthReason)
        ? cleanMessage
        : undefined,
      lastRecoveryAction:
        level === 'error' || level === 'warning' ? 'auto-recovery pending' : undefined
    })
  }
  if (level === 'warning' || level === 'error') {
    recordTimelineEvent({
      type: 'log',
      severity: level,
      reason: healthReason || '',
      botName,
      message: cleanMessage
    })
  }

  const plainLine = `[${time}] [${level.toUpperCase()}] [${botName}] ${cleanMessage}`
  if (HEADLESS_MODE && !GUI_EVENT_MODE) {
    _log(plainLine)
  } else if (logBox) {
    logBox.log(`${color}[${time}] ${icon} [${botName}]{/} ${cleanMessage}`)
  }

  emitRuntimeEvent('log', {
    level,
    botName,
    message: cleanMessage,
    rawMessage: message,
    time,
    timestamp: new Date().toISOString()
  })

  const levelNames = { info: 'INFO', success: 'SUCC', warning: 'WARN', error: 'ERR ' }
  const levelName = levelNames[level] || 'INFO'
  const fileMessage = `[${levelName}] [${botName.padEnd(20)}] ${message}`
  writeToLogFile(fileMessage)
}

function addChatLog(botName, message, source = 'server-message', details = {}) {
  const text = normalizeChatText(message)
  if (!text) return

  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

  const entry = {
    botName,
    source,
    position: details.position,
    sender: details.sender,
    packetName: details.packetName || 'message',
    kind: details.kind,
    evidence: details.evidence,
    message: text,
    rawMessage: message,
    time,
    timestamp: now.toISOString()
  }

  emitRuntimeEvent('chat', entry)
  writeToChatLogFile(entry)
}

function updateBotStatus(botName, status, data = {}) {
  runtimeState.updateBotStatus(botName, status, data)
}

function summarizeDiagnosticDetails(eventName, details = {}) {
  return summarizeRuntimeDiagnosticDetails(eventName, details, {
    fullPacketDetails: DIAGNOSTIC_FULL_PACKET_DETAILS
  })
}

function stringifyDiagnostic(details = {}) {
  return stringifyRuntimeDiagnostic(details, {
    maxValueLength: DIAGNOSTIC_MAX_VALUE_LENGTH
  })
}

function addDiagnosticLog(botName, eventName, details = {}) {
  if (!DETAILED_EVENT_LOGGING) return
  const payload = stringifyDiagnostic(details)
  addLog('info', botName, `[DIAG] ${eventName}${payload ? ` ${payload}` : ''}`)
}

function updateUI() {
  refreshBotRates()
  emitRuntimeEvent('snapshot', buildRuntimeSnapshot())
  if (HEADLESS_MODE) return
  runtimeUi.updateInfoBox()
  runtimeUi.updateBotsTable()
  safeRender()
}

// ============================================================================
// ============================================================================

// ============================================================================
// ============================================================================
const sleep = ms => new Promise(r => setTimeout(r, ms))

runtimeManager = createRuntimeManager({
  settings: runtimeSettings,
  initialRuntimeEnabled: !HOST_CONTROLLED || process.env.BOT_AUTOSTART === '1',
  hostControlled: HOST_CONTROLLED,
  setTimeout,
  clearTimeout,
  setInterval,
  sleep,
  addLog,
  updateBotStatus,
  setRuntimeHealth,
  updateUI,
  monitorData,
  getScreen: () => screen,
  clearTrackedTimers: processLifecycle.clearTrackedTimers,
  removeProcessHandlers: processLifecycle.removeProcessHandlers,
  restoreProcessOutputs,
  emitRuntimeEvent,
  runtimeLogger
})

runtimeUi = createRuntimeUi({
  boxes: {
    screen,
    resourcesBox,
    infoBox,
    botsTable
  },
  monitorData,
  getRuntimeManager: () => runtimeManager,
  getHeadlessMode: () => HEADLESS_MODE,
  emitRuntimeEvent,
  getHealthLogLabel,
  periodicRejoinMs: PERIODIC_REJOIN_MS
})

const createBot = createBotSessionFactory({
  settings: runtimeSettings,
  context: {
    physicsPlugin,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    sleep,
    getActiveBots: () => runtimeManager.getActiveBots(),
    isRuntimeEnabled: () => runtimeManager.isRuntimeEnabled(),
    isShuttingDown: () => runtimeManager.isShuttingDown(),
    isDiggingPaused: () => runtimeManager.isDiggingPaused(),
    addLog,
    addChatLog,
    addDiagnosticLog,
    updateBotStatus,
    setRuntimeHealth,
    recordTimelineEvent,
    refreshBotRates,
    noteGlobalError,
    noteNoInternetError,
    summarizeDiagnosticDetails,
    getPacketGovernor,
    getMiningController,
    getPacketGovernorBaseLimits,
    getSpeedGuardProfile,
    monitorData,
    stabilityCooldowns,
    packetSafetyCooldowns,
    botFilterRetryStates
  }
})

runtimeManager.setCreateBot(createBot)

// ============================================================================
// ============================================================================
if (screen) {
  screen.key(['escape', 'q', 'C-c'], () => {
    gracefulShutdown('keyboard', 0)
  })

  screen.key(['r'], () => {
    monitorData.totalBlocks = 0
    for (const bot of Object.values(monitorData.bots)) {
      bot.blocksTotal = 0
    }
    addLog('info', 'SYSTEM', 'Статистика сброшена')
    updateUI()
  })

  screen.key(['p', 'space'], () => {
    runtimeManager.toggleManualPause()
  })
}

// ============================================================================
// ============================================================================
addLog('info', 'SYSTEM', ' Менеджер ботов запущен')
addLog('info', 'SYSTEM', `Сервер: ${SERVER_HOST}:${SERVER_PORT} (${MC_VERSION})`)
addLog('info', 'SYSTEM', `Config: ${CONFIG_FILE_PATH}`)
addLog('info', 'SYSTEM', `Log file: ${LOG_FILE_PATH}`)
addLog(
  'info',
  'SYSTEM',
  `Режим отладки: ${DEBUG_MODE ? 'ВКЛ' : 'ВЫКЛ'} | [DIAG]: ${DETAILED_EVENT_LOGGING ? 'ВКЛ' : 'ВЫКЛ'} | server messages: ${LOG_SERVER_MESSAGES ? 'ВКЛ' : 'ВЫКЛ'}`
)
if (HEADLESS_MODE) {
  addLog(
    'info',
    'SYSTEM',
    `Headless режим: ВКЛ (${process.argv.includes('--headless') ? '--headless' : 'auto'})`
  )
  addLog(
    'info',
    'SYSTEM',
    `Пауза через файл: ${path.basename(PAUSE_FILE_PATH)} | удалить/false/off = продолжить`
  )
} else {
  addLog('info', 'SYSTEM', 'Q/ESC - выход | R - сброс статистики | P/SPACE - пауза')
}

if (MOBILE_RUNTIME_PROFILE) {
  addLog(
    'info',
    'SYSTEM',
    `Mobile low-power профиль активен: dig ${DIG_DELAY}мс, scan ${EMPTY_SCAN_DELAY_MS}мс, snapshot ${SNAPSHOT_INTERVAL}мс`
  )
}

runtimeManager.startMaintenance()
setInterval(updateUI, SNAPSHOT_INTERVAL)
setInterval(updateScriptResources, RESOURCE_INTERVAL)

setInterval(() => {
  refreshBotRates()
  const uptime = Date.now() - monitorData.startTime
  const hours = Math.floor(uptime / 3600000)
  const minutes = Math.floor((uptime % 3600000) / 60000)
  const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
  const totalBots = Object.keys(monitorData.bots).length
  const avgRate =
    monitorData.totalBlocks > 0 && uptime > 0
      ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1)
      : '0.0'
  const currentRatePerMinute = Object.values(monitorData.bots).reduce(
    (sum, bot) => sum + (bot.blocksLastMinute || 0),
    0
  )
  const currentRawRatePerMinute = Object.values(monitorData.bots).reduce(
    (sum, bot) => sum + (bot.rawBlocksLastMinute || 0),
    0
  )
  const currentRatePerMinuteLabel = formatBlocksPerMinute(currentRatePerMinute)
  const currentRawRatePerMinuteLabel = formatBlocksPerMinute(currentRawRatePerMinute)
  const health = updateHealthState(monitorData.health, {}, Date.now())
  monitorData.health = health

  writeToLogFile(
    `=== СТАТИСТИКА === Время: ${hours}ч ${minutes}м | Боты: ${activeBots}/${totalBots} | Добыто: ${monitorData.totalBlocks} блоков | Скорость: ${avgRate} бл/ч`
  )

  writeToLogFile(`RATE/MIN: ${currentRatePerMinuteLabel} | RAW: ${currentRawRatePerMinuteLabel}`)
  writeToLogFile(`HEALTH: ${getHealthLogLabel(health.reason)} | ${health.diagnosis}`)
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    writeToLogFile(
      `  ${botName.padEnd(20)} | Статус: ${botData.status.padEnd(12)} | Добыто: ${botData.blocksTotal} | Effective: ${formatBlocksPerSecond(botData.blocksPerSecond || 0)} | Raw: ${formatBlocksPerSecond(botData.rawBlocksPerSecond || 0)}`
    )
  }
}, 300000)

processLifecycle.registerProcessHandler('SIGINT', () => gracefulShutdown('SIGINT', 0))
processLifecycle.registerProcessHandler('SIGTERM', () => gracefulShutdown('SIGTERM', 0))

const runtimeManagerApi = {
  start: startRuntimeManager,
  stop: stopRuntimeManager,
  restart: reason => fullRestart(reason || 'host-restart'),
  setPaused: setManualPause,
  getRuntimeSnapshot: buildRuntimeSnapshot,
  shutdownForHost
}

module.exports = runtimeManagerApi

if (HOST_CONTROLLED) {
  if (typeof global.__BOT_HOST__?.register === 'function') {
    global.__BOT_HOST__.register(runtimeManagerApi)
  }

  if (runtimeManager.isRuntimeEnabled()) {
    startRuntimeManager()
  } else {
    addLog('info', 'SYSTEM', 'Host mode: runtime загружен и ждет команду на запуск')
    updateUI()
  }
} else {
  startRuntimeManager()
}

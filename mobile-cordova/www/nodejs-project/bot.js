const mineflayer = require('mineflayer')
const vec3 = require('vec3')
const fs = require('fs')
const path = require('path')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const os = require('os')
const { computeBotRateStats, formatBlocksPerMinute, formatBlocksPerSecond } = require('./monitoring')
const {
  classifyHealthEvent,
  computeSmartRateStats,
  createHealthState,
  updateHealthState
} = require('./stability-center')
const {
  calculateBotFilterReconnectDelay,
  classifyBotFilterMessage
} = require('./bot-filter')
const {
  getReconnectDecision,
  isTooManyPacketsText
} = require('./reconnect-policy')
const {
  createSpeedGuardProfile,
  getAdaptiveRateWindowMs,
  getAdaptiveWaitMs,
  getSpeedGuardTargetRate,
  getSpeedGuardTargetRatioFromDropPercent,
  recordSpeedGuardProgress,
  rememberSpeedGuardPeak: rememberAdaptiveSpeedGuardPeak
} = require('./speed-guard')
const {
  LIMBO_FILTER_DEFAULTS,
  createFallPacket,
  getFinishPacketTicks,
  getLoadedChunkSpeed,
  getMinimumCheckMs
} = require('./limbo-filter')

const HOST_CONTROLLED = Boolean(global.__BOT_HOST__)
const MOBILE_RUNTIME_PROFILE = HOST_CONTROLLED && process.env.BOT_MOBILE_RUNTIME === '1'
const BASE_CONSOLE = global.__BOT_BASE_CONSOLE__ || {
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  log: console.log.bind(console)
}
const BASE_STDERR_WRITE = global.__BOT_BASE_STDERR_WRITE__ || process.stderr.write.bind(process.stderr)
global.__BOT_BASE_CONSOLE__ = BASE_CONSOLE
global.__BOT_BASE_STDERR_WRITE__ = BASE_STDERR_WRITE

const trackedTimeouts = new Set()
const trackedIntervals = new Set()
const nativeSetTimeout = global.setTimeout.bind(global)
const nativeClearTimeout = global.clearTimeout.bind(global)
const nativeSetInterval = global.setInterval.bind(global)
const nativeClearInterval = global.clearInterval.bind(global)

const setTimeout = (handler, timeout, ...args) => {
  const timer = nativeSetTimeout(() => {
    trackedTimeouts.delete(timer)
    if (typeof handler === 'function') {
      handler(...args)
    }
  }, timeout)
  trackedTimeouts.add(timer)
  return timer
}

const clearTimeout = timer => {
  trackedTimeouts.delete(timer)
  return nativeClearTimeout(timer)
}

const setInterval = (handler, timeout, ...args) => {
  const timer = nativeSetInterval(() => {
    if (typeof handler === 'function') {
      handler(...args)
    }
  }, timeout)
  trackedIntervals.add(timer)
  return timer
}

const clearInterval = timer => {
  trackedIntervals.delete(timer)
  return nativeClearInterval(timer)
}

const processListeners = []

function registerProcessHandler(eventName, handler) {
  process.on(eventName, handler)
  processListeners.push({ eventName, handler })
}

function removeProcessHandlers() {
  for (const { eventName, handler } of processListeners.splice(0)) {
    try {
      process.removeListener(eventName, handler)
    } catch (error) {}
  }
}

function clearTrackedTimers() {
  for (const timer of [...trackedTimeouts]) {
    try { nativeClearTimeout(timer) } catch (error) {}
    trackedTimeouts.delete(timer)
  }

  for (const timer of [...trackedIntervals]) {
    try { nativeClearInterval(timer) } catch (error) {}
    trackedIntervals.delete(timer)
  }
}

function restoreProcessOutputs() {
  console.warn = BASE_CONSOLE.warn
  console.error = BASE_CONSOLE.error
  console.log = BASE_CONSOLE.log
  process.stderr.write = BASE_STDERR_WRITE
}

let physicsPlugin
try {
  physicsPlugin = require('mineflayer-physics')
} catch(e) {
  console.warn('! mineflayer-physics не установлен - физика может работать некорректно')
  console.warn('Установите: npm install mineflayer-physics')
}


// ============================================================================
// ============================================================================
const _warn = BASE_CONSOLE.warn
const _error = BASE_CONSOLE.error
const _log = BASE_CONSOLE.log

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
  process.env.BOT_CONFIG_PATH ||
  getArgValue('--config') ||
  path.join(__dirname, 'config.json')
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

console.warn = (...args) => {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  if (msg.includes('Ignoring block entities')) return
  if (msg.includes('chunk failed to load')) return
  if (msg.includes('entity.objectType is deprecated')) return
  if (msg.includes('deprecated')) return
  if (msg.includes('ECONNRESET')) return
  if (msg.includes('ETIMEDOUT')) return
  if (msg.includes('ECONNABORTED')) return
  if (msg.includes('ENOTFOUND')) return
  if (msg.includes('EAI_AGAIN')) return
  if (msg.includes('EHOSTUNREACH')) return
  if (msg.includes('ECONNREFUSED')) return
  if (msg.includes('socket hang up')) return
  _warn(...args)
}

console.error = (...args) => {
  const msg = args.map(a => {
    if (typeof a === 'string') return a
    if (a && a.message) return a.message
    if (a && a.stack) return a.stack
    return JSON.stringify(a)
  }).join(' ')
  
  if (msg.includes('Ignoring block entities')) return
  if (msg.includes('chunk failed to load')) return
  if (msg.includes('ECONNRESET')) return
  if (msg.includes('ETIMEDOUT')) return
  if (msg.includes('ECONNABORTED')) return
  if (msg.includes('ENOTFOUND')) return
  if (msg.includes('EAI_AGAIN')) return
  if (msg.includes('EHOSTUNREACH')) return
  if (msg.includes('ECONNREFUSED')) return
  if (msg.includes('socket hang up')) return
  if (msg.includes('errno')) return
  if (msg.includes('syscall')) return
  _error(...args)
}

console.log = () => {}

registerProcessHandler('uncaughtException', err => {
  const msg = String(err && err.message ? err.message : err)
  if (msg.includes('ECONNRESET') || 
      msg.includes('ETIMEDOUT') || 
      msg.includes('ECONNABORTED') ||
      msg.includes('EHOSTUNREACH') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('EAI_AGAIN') ||
      msg.includes('socket hang up') ||
      msg.includes('errno') ||
      msg.includes('syscall')) {
    return
  }

  const details = String(err && err.stack ? err.stack : msg).slice(0, 4000)
  if (!HOST_CONTROLLED) {
    try { _error('[UNCAUGHT]', details) } catch (e) {}
  }
  try { addLog('error', 'SYSTEM', `uncaught-exception: ${details}`) } catch (e) {}
  setTimeout(() => {
    try {
      fullRestart(`uncaught-exception: ${msg.slice(0, 120)}`)
    } catch (restartError) {
      try { _error('[UNCAUGHT][RESTART_FAILED]', restartError) } catch (e) {}
      if (!HOST_CONTROLLED) {
        process.exit(1)
      }
    }
  }, 100)
})

registerProcessHandler('unhandledRejection', (reason, promise) => {
  const msg = String(reason && reason.message ? reason.message : reason)
  if (msg.includes('ECONNRESET') || 
      msg.includes('ETIMEDOUT') || 
      msg.includes('ECONNABORTED') ||
      msg.includes('EHOSTUNREACH') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('EAI_AGAIN') ||
      msg.includes('socket hang up') ||
      msg.includes('errno') ||
      msg.includes('syscall')) {
    return
  }

  const details = String(reason && reason.stack ? reason.stack : msg).slice(0, 4000)
  if (!HOST_CONTROLLED) {
    try { _error('[UNHANDLED_REJECTION]', details) } catch (e) {}
  }
  try { addLog('error', 'SYSTEM', `unhandled-rejection: ${details}`) } catch (e) {}
  setTimeout(() => {
    try {
      fullRestart(`unhandled-rejection: ${msg.slice(0, 120)}`)
    } catch (restartError) {
      try { _error('[UNHANDLED_REJECTION][RESTART_FAILED]', restartError) } catch (e) {}
      if (!HOST_CONTROLLED) {
        process.exit(1)
      }
    }
  }, 100)
})

// ============================================================================
// ============================================================================

const originalStderrWrite = BASE_STDERR_WRITE
process.stderr.write = (chunk, encoding, callback) => {
  const str = chunk.toString()
  if (str.includes('ECONNRESET') ||
      str.includes('ETIMEDOUT') ||
      str.includes('ECONNABORTED') ||
      str.includes('ENOTFOUND') ||
      str.includes('EAI_AGAIN') ||
      str.includes('EHOSTUNREACH') ||
      str.includes('ECONNREFUSED') ||
      str.includes('errno') ||
      str.includes('syscall') ||
      str.includes('socket hang up')) {
    if (callback) callback()
    return true
  }
  return originalStderrWrite(chunk, encoding, callback)
}

// ============================================================================
// ============================================================================
const LOG_FILE_PATH = path.resolve(
  process.env.BOT_LOG_PATH ||
  path.join(CONFIG_DIR, 'bot.log')
)
const CHAT_LOG_FILE_PATH = path.resolve(
  process.env.BOT_CHAT_LOG_PATH ||
  path.join(CONFIG_DIR, 'chat.log')
)
const MAX_LOG_SIZE = 50 * 1024 * 1024
let logFileStream = null
let currentLogSize = 0
let chatLogFileStream = null
let currentChatLogSize = 0

function initAppendOnlyLogFile(filePath, title) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const stream = fs.createWriteStream(filePath, { flags: 'w' })

    const startMsg = `${'='.repeat(80)}\n[${new Date().toISOString()}] === ${title} ===\n${'='.repeat(80)}\n`
    stream.write(startMsg)
    return {
      stream,
      size: Buffer.byteLength(startMsg)
    }
  } catch (e) {
    console.error(`Ошибка инициализации лог-файла ${filePath}:`, e.message)
    return {
      stream: null,
      size: 0
    }
  }
}

function initLogFile() {
  const mainLog = initAppendOnlyLogFile(LOG_FILE_PATH, 'НОВАЯ СЕССИЯ')
  logFileStream = mainLog.stream
  currentLogSize = mainLog.size

  const chatLog = initAppendOnlyLogFile(CHAT_LOG_FILE_PATH, 'НОВАЯ СЕССИЯ ЧАТА')
  chatLogFileStream = chatLog.stream
  currentChatLogSize = chatLog.size
}

function writeAppendOnlyLogLine(filePath, streamRef, currentSize, setCurrentSize, line) {
  if (!streamRef.current) return

  try {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${line}\n`
    const byteLength = Buffer.byteLength(logLine)

    if (currentSize + byteLength > MAX_LOG_SIZE) {
      streamRef.current.end()

      const backupPath = filePath + '.old'
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
      if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, backupPath)
      }

      streamRef.current = fs.createWriteStream(filePath, { flags: 'a' })
      currentSize = 0

      const rotationMsg = `[${timestamp}] === РОТАЦИЯ ЛОГА (превышен размер ${MAX_LOG_SIZE} байт) ===\n`
      streamRef.current.write(rotationMsg)
      currentSize += Buffer.byteLength(rotationMsg)
    }

    streamRef.current.write(logLine)
    setCurrentSize(currentSize + byteLength)
  } catch (e) {}
}

function writeToLogFile(message) {
  writeAppendOnlyLogLine(
    LOG_FILE_PATH,
    {
      get current() { return logFileStream },
      set current(value) { logFileStream = value }
    },
    currentLogSize,
    value => { currentLogSize = value },
    message
  )
}

function writeToChatLogFile(entry) {
  const botName = String(entry.botName || 'SERVER')
  const source = String(entry.source || 'chat')
  const position = entry.position ? `/${entry.position}` : ''
  const sender = entry.sender ? `/${entry.sender}` : ''
  const message = normalizeChatText(entry.message || entry.rawMessage)
  if (!message) return

  writeAppendOnlyLogLine(
    CHAT_LOG_FILE_PATH,
    {
      get current() { return chatLogFileStream },
      set current(value) { chatLogFileStream = value }
    },
    currentChatLogSize,
    value => { currentChatLogSize = value },
    `[CHAT] [${botName.padEnd(20)}] [${source}${position}${sender}] ${message}`
  )
}

initLogFile()

process.on('exit', () => {
  if (logFileStream) {
    const exitMsg = `[${new Date().toISOString()}] === ЗАВЕРШЕНИЕ СЕССИИ ===\n`
    logFileStream.write(exitMsg)
    logFileStream.end()
  }
  if (chatLogFileStream) {
    const exitMsg = `[${new Date().toISOString()}] === ЗАВЕРШЕНИЕ СЕССИИ ЧАТА ===\n`
    chatLogFileStream.write(exitMsg)
    chatLogFileStream.end()
  }
})

let config
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'))
} catch (error) {
  console.error('ERR Ошибка загрузки config.json:', error.message)
  process.exit(1)
}

const SERVER_HOST = config.server.host
const SERVER_PORT = Number.isFinite(Number(config.server.port)) ? Number(config.server.port) : 25565
const MC_VERSION = config.server.version
const PASSWORD = config.server.password
const MENU_SLOT_1 = config.menu.slot1
const MENU_SLOT_2 = config.menu.slot2
const HOTBAR_SLOT = config.menu.hotbarSlot
const DEBUG_MODE = config.logging?.debugMode === true
const DETAILED_EVENT_LOGGING = DEBUG_MODE
const LOG_SERVER_MESSAGES = DEBUG_MODE && config.logging?.logServerMessages !== false
const DIAGNOSTIC_MAX_VALUE_LENGTH = Math.max(500, Number(config.logging?.diagnosticMaxValueLength ?? 1400) || 1400)
const DIAGNOSTIC_POSITION_INTERVAL_MS = Math.max(5000, Number(config.logging?.diagnosticPositionIntervalMs ?? 30000) || 30000)
const DIAGNOSTIC_REPEAT_SUMMARY_MS = Math.max(5000, Number(config.logging?.diagnosticRepeatSummaryMs ?? 30000) || 30000)
const DIAGNOSTIC_FULL_PACKET_DETAILS = config.logging?.diagnosticFullPacketDetails === true
const MOBILE_SNAPSHOT_INTERVAL_MS = 4000
const MOBILE_RESOURCE_INTERVAL_MS = 5000
const MOBILE_PAUSE_CHECK_INTERVAL_MS = 4000
const MOBILE_POSITION_CHECK_INTERVAL_MS = 15000

const DIG_DELAY = Math.max(0, Number(config.timing.digDelay) || 0)
const EMPTY_SCAN_DELAY_MS = Math.max(0, Number(config.timing.emptyScanDelayMs ?? 0) || 0)
const EMPTY_TARGET_RECHECK_MS = Math.max(5, Number(config.timing.emptyTargetRecheckMs ?? 5) || 5)
const EMPTY_TARGET_LOG_AFTER_IDLE_MS = Math.max(0, Number(config.timing.emptyTargetLogAfterIdleMs ?? 15000) || 15000)
const EMPTY_TARGET_LOG_INTERVAL_MS = Math.max(1000, Number(config.timing.emptyTargetLogIntervalMs ?? 30000) || 30000)
const ENTRY_BUTTON_AFTER_PRESS_WAIT_MS = Math.max(0, Number(config.timing.entryButtonAfterPressWaitMs ?? 0) || 0)
const ENTRY_BUTTON_RETRY_INTERVAL_MS = Math.max(0, Number(config.timing.entryButtonRetryIntervalMs ?? 250) || 250)
const ENTRY_BUTTON_STARTUP_ATTEMPTS = Math.max(1, Number(config.timing.entryButtonStartupAttempts ?? 4) || 4)
const ENTRY_BUTTON_STARTUP_RETRY_MS = Math.max(50, Number(config.timing.entryButtonStartupRetryMs ?? 350) || 350)
const ENTRY_BUTTON_CONFIRM_MS = Math.max(50, Number(config.timing.entryButtonConfirmMs ?? 900) || 900)
const ENTRY_BUTTON_WATCHDOG_MS = Math.max(500, Number(config.timing.entryButtonWatchdogMs ?? 3000) || 3000)
const EMPTY_TARGET_BUTTON_RETRY_MS = Math.max(0, Number(config.timing.emptyTargetButtonRetryMs ?? 20000) || 20000)
const EMPTY_TARGET_BUTTON_RETRY_COOLDOWN_MS = Math.max(1000, Number(config.timing.emptyTargetButtonRetryCooldownMs ?? 60000) || 60000)
const EMPTY_TARGET_BUTTON_RETRY_LIMIT = Math.max(0, Number(config.timing.emptyTargetButtonRetryLimit ?? 2) || 2)
const MINING_LOOP_IDLE_MS = Math.max(1, Number(config.timing.miningLoopIdleMs ?? 2) || 2)
const MINING_BATCH_SIZE = Math.max(1, Number(config.timing.miningBatchSize ?? 96) || 96)
const BURST_BREAK_WINDOW_MS = Math.max(0, Number(config.timing.burstBreakWindowMs ?? 1500) || 1500)
const BURST_BREAK_INTERVAL_MS = Math.max(1, Number([5, 20].includes(config.timing.burstBreakIntervalMs) ? 1 : (config.timing.burstBreakIntervalMs ?? 1)) || 1)
const BURST_BREAK_REPEATS = Math.max(1, Number(config.timing.burstBreakRepeats === 3 ? 2 : (config.timing.burstBreakRepeats ?? 2)) || 2)
const BURST_BREAK_REACH = Math.max(1, Number(config.timing.burstBreakReach ?? 5.1) || 5.1)
const BURST_LOOK_REFRESH_MS = Math.max(0, Number(config.timing.burstLookRefreshMs ?? 2000) || 2000)
const BREAK_PACKET_TARGET_COOLDOWN_MS = Math.max(0, Number([25, 10].includes(config.timing.breakPacketTargetCooldownMs) ? 12 : (config.timing.breakPacketTargetCooldownMs ?? 12)) || 12)
const BREAK_PACKET_PENDING_RETRY_MS = Math.max(0, Number(config.timing.breakPacketPendingRetryMs ?? 32) || 32)
const BREAK_PACKET_MIN_TARGET_COOLDOWN_MS = Math.max(0, Number([75, 45, 20].includes(config.timing.breakPacketMinTargetCooldownMs) ? 8 : (config.timing.breakPacketMinTargetCooldownMs ?? 8)) || 8)
const BREAK_PACKET_MAX_PER_SECOND = Math.max(2, Number([72, 108, 160, 240].includes(config.timing.breakPacketMaxPerSecond) ? 300 : (config.timing.breakPacketMaxPerSecond ?? 300)) || 300)
const BREAK_PACKET_BURST_WINDOW_MS = Math.max(50, Number(config.timing.breakPacketBurstWindowMs ?? 250) || 250)
const BREAK_PACKET_BURST_LIMIT = Math.max(2, Number([18, 28, 42, 64].includes(config.timing.breakPacketBurstLimit) ? 84 : (config.timing.breakPacketBurstLimit ?? 84)) || 84)
const BREAK_PACKET_SAFE_MAX_PER_SECOND = Math.max(2, Number([42, 60, 96, 120, 150].includes(config.timing.breakPacketSafeMaxPerSecond) ? 240 : (config.timing.breakPacketSafeMaxPerSecond ?? 240)) || 240)
const BREAK_PACKET_SAFE_BURST_LIMIT = Math.max(2, Number([10, 15, 24, 32, 40].includes(config.timing.breakPacketSafeBurstLimit) ? 68 : (config.timing.breakPacketSafeBurstLimit ?? 68)) || 68)
const BREAK_PACKET_SAFE_MODE_MS = Math.max(60000, Number(config.timing.breakPacketSafeModeMs ?? 120000) || 120000)
const BREAK_PACKET_SAFE_REPEATS = Math.max(1, Number(config.timing.breakPacketSafeRepeats ?? 1) || 1)
const LOGIN_COMMAND_COOLDOWN_MS = Math.max(1000, Number(config.timing.loginCommandCooldownMs ?? 7000) || 7000)
const REACTIVE_BREAK_REPEATS = Math.max(1, Number(config.timing.reactiveBreakRepeats === 2 ? 1 : (config.timing.reactiveBreakRepeats ?? 1)) || 1)
const TRANSIENT_BREAK_REPEATS = Math.max(1, Number(config.timing.transientBreakRepeats === 2 ? 1 : (config.timing.transientBreakRepeats ?? 1)) || 1)
const PACKET_BREAK_CONFIRM_WINDOW_MS = Math.max(50, Number(config.timing.packetBreakConfirmWindowMs ?? 1500) || 1500)
const BLOCK_COUNT_DEDUPE_MS = Math.max(0, Number(config.timing.blockCountDedupeMs ?? 75) || 75)
const PACKET_ONLY_MINING = config.timing.packetOnlyMining !== false
const PACKET_ONLY_FALLBACK_MS = Math.max(100, Number(config.timing.packetOnlyFallbackMs ?? 1200) || 1200)
const PREEMPTIVE_BREAK_TARGETS = config.timing.preemptiveBreakTargets === true
const FAST_DIG_CONFIRM_MS = Math.max(5, Number(config.timing.fastDigConfirmMs ?? 15) || 15)
const FAST_DIG_RETRY_MS = Math.max(1, Number(config.timing.fastDigRetryMs ?? 5) || 5)
const FAST_DIG_MIN_VANILLA_TIME_MS = Math.max(0, Number(config.timing.fastDigMinVanillaTimeMs ?? 0) || 0)
const STUCK_THRESHOLD = Number(config.timing.stuckThreshold) || 0
const RESTART_IF_IDLE_MS = Number(config.timing.restartIfIdleMs) || 0
const DIG_ACTION_TIMEOUT_MS = Math.max(
  5000,
  Math.min(
    STUCK_THRESHOLD > 0 ? STUCK_THRESHOLD : 30000,
    RESTART_IF_IDLE_MS > 0 ? RESTART_IF_IDLE_MS : 30000
  )
)
const RECONNECT_REGULAR = config.timing.reconnectRegular
const RECONNECT_ON_INTERNET_LOSS = config.timing.reconnectOnInternetLoss
const INTERNET_RETRY_INTERVAL = config.timing.internetRetryInterval
const INTERNET_CHECK_INTERVAL = config.timing.internetCheckInterval
const MAX_INTERNET_RETRIES = config.timing.maxInternetRetries
const GRACE_AFTER_SPAWN = config.timing.graceAfterSpawn
const POST_JOIN_DIG_START_MS = Math.max(0, config.timing.postJoinDigStartMs ?? 25)
const POST_JOIN_POSITION_GRACE_MS = Math.max(0, Number(config.timing.postJoinPositionGraceMs ?? 8000) || 8000)
const STABILITY_COOLDOWN_MS = Math.max(0, Number(config.timing.stabilityCooldownMs ?? 0) || 0)
const CONNECTION_STABILITY_COOLDOWN_MS = Math.max(
  STABILITY_COOLDOWN_MS,
  Number(config.timing.connectionStabilityCooldownMs ?? 0) || 0
)
const STABILITY_COOLDOWN_MAX_MS = Math.max(
  STABILITY_COOLDOWN_MS,
  CONNECTION_STABILITY_COOLDOWN_MS,
  Number(config.timing.stabilityCooldownMaxMs ?? 0) || 0
)
const MINING_DIAGNOSTIC_INTERVAL_MS = Math.max(1000, Number(config.timing.miningDiagnosticIntervalMs ?? 30000) || 30000)
const MOVING_PISTON_WAIT_MS = Math.max(1, Number(config.timing.movingPistonWaitMs ?? 1) || 1)
const MOVING_PISTON_LOG_AFTER_IDLE_MS = Math.max(0, Number(config.timing.movingPistonLogAfterIdleMs ?? 15000) || 15000)
const configuredStartStagger = Number(config.timing.startStagger)
const configuredStartStaggerJitter = Number(config.timing.startStaggerJitter)
const START_STAGGER = Math.max(
  0,
  Number.isFinite(configuredStartStagger)
    ? (configuredStartStagger === 30000 ? 1000 : configuredStartStagger)
    : 1000
)
const START_STAGGER_JITTER = Math.max(
  0,
  Number.isFinite(configuredStartStaggerJitter)
    ? (configuredStartStaggerJitter === 15000 ? 500 : configuredStartStaggerJitter)
    : 500
)
const PERIODIC_REJOIN_MS = config.timing.periodicRejoinMs || 3600000
const ANTIBOT_MIN_INTERVAL = config.antibot.minInterval
const ANTIBOT_MAX_INTERVAL = config.antibot.maxInterval
const ANTIBOT_SHORT_MOVE_MS = config.antibot.shortMoveMs
const ANTIBOT_FALL_CHECK_ENABLED = config.antibot.fallCheckEnabled
const FEATURE_ACTIVE_FALL_CHECK_ENABLED = config.features?.enableActiveFallCheck !== false
const ACTIVE_FALL_CHECK_ENABLED = Boolean(
  ANTIBOT_FALL_CHECK_ENABLED &&
  FEATURE_ACTIVE_FALL_CHECK_ENABLED
)
const ANTIBOT_FALL_CHECK_TIMEOUT = config.antibot.fallCheckTimeout
const configuredLimboFallTicks = Number(config.antibot.limboFallTicks)
const configuredLimboFallPacketMs = Number(config.antibot.limboFallPacketMs)
const LIMBO_FALL_TICKS = Math.max(
  20,
  Number.isFinite(configuredLimboFallTicks)
    ? (configuredLimboFallTicks === 96 ? 128 : configuredLimboFallTicks)
    : LIMBO_FILTER_DEFAULTS.fallingCheckTicks
)
const LIMBO_FALL_PACKET_MS = Math.max(
  15,
  Number.isFinite(configuredLimboFallPacketMs)
    ? (configuredLimboFallPacketMs === 25 ? 50 : configuredLimboFallPacketMs)
    : LIMBO_FILTER_DEFAULTS.packetMs
)
const LIMBO_DETECTION_TIMEOUT_MS = Math.max(1500, Number(config.antibot.limboDetectionTimeoutMs ?? 4500) || 4500)
const LIMBO_COMPLETION_GRACE_MS = Math.max(0, Number(config.antibot.limboCompletionGraceMs ?? 900) || 900)
const LIMBO_POST_FALL_JOIN_MS = Math.max(0, Number(config.antibot.limboPostFallJoinMs ?? 900) || 900)
const LIMBO_MENU_WAIT_MS = Math.max(0, Number(config.antibot.limboMenuWaitMs ?? 12000) || 12000)
const SCANNER_PASSIVE_WAIT_MS = Math.max(15000, Number(config.antibot.scannerPassiveWaitMs ?? 60000) || 60000)
const SCANNER_RECENT_POSITION_MS = Math.max(500, Number(config.antibot.scannerRecentPositionMs ?? 5000) || 5000)
const SCANNER_POSITION_WAIT_MS = Math.max(500, Number(config.antibot.scannerPositionWaitMs ?? 2500) || 2500)
const LIMBO_SERVER_TIMEOUT_MS = Math.max(5000, Number(config.antibot.limboServerTimeoutMs ?? LIMBO_FILTER_DEFAULTS.timeoutMs) || LIMBO_FILTER_DEFAULTS.timeoutMs)
const MENU_ATTEMPT_LIMIT = Math.max(3, Number(config.timing.menuAttemptLimit ?? 6) || 6)
const MENU_RECOVERY_BASE_MS = Math.max(1000, Number(config.timing.menuRecoveryBaseMs ?? 3500) || 3500)
const MENU_RECOVERY_STEP_MS = Math.max(0, Number(config.timing.menuRecoveryStepMs ?? 2500) || 2500)
const MENU_RECOVERY_MAX_MS = Math.max(MENU_RECOVERY_BASE_MS, Number(config.timing.menuRecoveryMaxMs ?? 18000) || 18000)
const MENU_RECOVERY_JITTER_MS = Math.max(0, Number(config.timing.menuRecoveryJitterMs ?? 2500) || 2500)
const CLIENT_TIMEOUT_RECONNECT_MS = Math.max(3000, Number(config.timing.clientTimeoutReconnectMs ?? 6000) || 6000)
const CLIENT_TIMEOUT_RECONNECT_JITTER_MS = Math.max(0, Number(config.timing.clientTimeoutReconnectJitterMs ?? 4000) || 4000)
const MENU_ACTION_INTERVAL_MS = 350
const MENU_WINDOW_TRANSITION_WAIT_MS = 2200
const MENU_SUBSERVER_JOIN_WAIT_MS = 10000
const GLOBAL_ERROR_THRESHOLD = config.globalRestart.errorThreshold
const GLOBAL_ERROR_TIME_WINDOW = config.globalRestart.timeWindowMs
const STOP_ON_NO_INTERNET = config.globalRestart.stopOnNoInternet
const NO_INTERNET_THRESHOLD = config.globalRestart.noInternetThreshold
const botsConfigs = Array.isArray(config.bots) ? config.bots : []

const ROTATION_DELAY_BETWEEN_BOTS = config.timing.rotationDelayBetweenBots || 120000

const POSITION_CHECK_INTERVAL = MOBILE_RUNTIME_PROFILE
  ? Math.max(Number(config.position?.checkInterval) || 10000, MOBILE_POSITION_CHECK_INTERVAL_MS)
  : (Number(config.position?.checkInterval) || 10000)
const POSITION_RETURN_TIMEOUT = config.position?.returnTimeout || 8000
const POSITION_FAR_RECONNECT_IDLE_MS = Math.max(5000, Number(config.position?.farReconnectIdleMs ?? 30000) || 30000)
const POSITION_FAR_DISTANCE = Math.max(50, Number(config.position?.farDistance ?? 500) || 500)
const POSITION_RECHECK_SAMPLES = Math.max(1, Number(config.position?.recheckSamples ?? 3) || 3)
const POSITION_RECHECK_DELAY_MS = Math.max(100, Number(config.position?.recheckDelayMs ?? 700) || 700)
const POSITION_NEAR_MINING_EXTRA_REACH = Math.max(0, Number(config.position?.nearMiningExtraReach ?? 1) || 1)
const UI_RENDER_INTERVAL = Number(config.ui?.renderIntervalMs) || 1000
const SNAPSHOT_INTERVAL = MOBILE_RUNTIME_PROFILE
  ? Math.max(UI_RENDER_INTERVAL, MOBILE_SNAPSHOT_INTERVAL_MS)
  : UI_RENDER_INTERVAL
const RESOURCE_INTERVAL = MOBILE_RUNTIME_PROFILE
  ? Math.max(UI_RENDER_INTERVAL, MOBILE_RESOURCE_INTERVAL_MS)
  : UI_RENDER_INTERVAL
const PAUSE_FILE_PATH = path.resolve(CONFIG_DIR, config.pause?.file || 'pause.txt')
const PAUSE_CHECK_INTERVAL = MOBILE_RUNTIME_PROFILE
  ? Math.max(Number(config.pause?.checkInterval) || 1000, MOBILE_PAUSE_CHECK_INTERVAL_MS)
  : (Number(config.pause?.checkInterval) || 1000)
const CHAT_CAPTCHA_RECONNECT_MS = Math.max(600000, Number(config.maintenance?.chatCaptchaReconnectMs ?? 30 * 60 * 1000) || 30 * 60 * 1000)
const MEMORY_LIMIT_MB = config.globalRestart?.memoryLimitMB || 0
const OFFLINE_WATCHDOG_MS = Math.max(30000, Number(config.maintenance?.offlineWatchdogMs ?? 90000) || 90000)
const OFFLINE_WATCHDOG_INTERVAL_MS = Math.max(10000, Number(config.maintenance?.offlineWatchdogIntervalMs ?? 30000) || 30000)
const BOT_FILTER_RETRY_BASE_MS = Math.max(5000, Number(config.maintenance?.botFilterRetryBaseMs ?? 8000) || 8000)
const BOT_FILTER_RETRY_MAX_MS = Math.max(BOT_FILTER_RETRY_BASE_MS, Number(config.maintenance?.botFilterRetryMaxMs ?? 120000) || 120000)
const BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD = Math.max(1, Number(config.maintenance?.botFilterFallAttemptsBeforeHold ?? 2) || 2)
const BOT_FILTER_FALL_HOLD_MS = Math.max(CHAT_CAPTCHA_RECONNECT_MS, Number(config.maintenance?.botFilterFallHoldMs ?? CHAT_CAPTCHA_RECONNECT_MS) || CHAT_CAPTCHA_RECONNECT_MS)
const ENABLE_SOFT_RESTART = config.features?.enableSoftRestart !== false
// When enabled, the miner first tries an instant client-side break packet pair.
// If the server does not confirm the block update quickly, it falls back to
// mineflayer.dig(), so vanilla/strict servers still work.
const ENABLE_AGGRESSIVE_MINING = config.features?.enableAggressiveMining !== false
const ENABLE_PERIODIC_ROTATION = config.features?.enablePeriodicRotation === true
const SPEED_WINDOW_MS = Math.max(1000, config.monitor?.speedWindowMs || 10000)
const SPEED_GUARD_ENABLED = config.features?.enableSpeedGuard !== false
const SPEED_GUARD_INTERVAL_MS = Math.max(1000, Number(config.timing?.speedGuardIntervalMs ?? 5000) || 5000)
const SPEED_GUARD_START_GRACE_MS = Math.max(15000, Number(config.timing?.speedGuardStartGraceMs ?? 45000) || 45000)
const SPEED_GUARD_LOW_RATE_MS = Math.max(SPEED_GUARD_INTERVAL_MS, Number(config.timing?.speedGuardLowRateMs ?? 25000) || 25000)
const SPEED_GUARD_RECOVERY_COOLDOWN_MS = Math.max(5000, Number(config.timing?.speedGuardRecoveryCooldownMs ?? 15000) || 15000)
const SPEED_GUARD_ALLOWED_DROP_PERCENT = Math.min(50, Math.max(1, Number(config.timing?.speedGuardAllowedDropPercent ?? 10) || 10))
const SPEED_GUARD_TARGET_RATIO = getSpeedGuardTargetRatioFromDropPercent(
  config.timing?.speedGuardAllowedDropPercent,
  config.timing?.speedGuardTargetRatio ?? 0.9
)
const SPEED_GUARD_RATE_WINDOW_MS = Math.max(SPEED_WINDOW_MS, Number(config.timing?.speedGuardRateWindowMs ?? 30000) || 30000)
const SPEED_GUARD_BUTTON_IDLE_MS = Math.max(5000, Number(config.timing?.speedGuardButtonIdleMs ?? 12000) || 12000)
const SPEED_GUARD_NO_PROGRESS_RECONNECT_MS = Math.max(15000, Number(config.timing?.speedGuardNoProgressReconnectMs ?? 35000) || 35000)
const SPEED_GUARD_RECONNECT_AFTER_RECOVERIES = Math.max(1, Number(config.timing?.speedGuardReconnectAfterRecoveries ?? 3) || 3)
const HEADLESS_MODE = process.argv.includes('--headless') ||
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
const monitorData = {
  startTime: Date.now(),
  bots: {},
  totalBlocks: 0,
  health: createHealthState(Date.now())
}
const stabilityCooldowns = new Map()
const packetSafetyCooldowns = new Map()
const speedGuardProfiles = new Map()
const botFilterRetryStates = new Map()
monitorData.scriptResources = {
  cpu: [],
  ram: [],
  x: []
}

function setRuntimeHealth(reason, details = {}) {
  const previousReason = monitorData.health?.reason
  monitorData.health = updateHealthState(monitorData.health, { reason, ...details }, Date.now())

  if (monitorData.health.reason !== previousReason && monitorData.health.reason !== 'mining-ok') {
    const label = getHealthLogLabel(monitorData.health.reason)
    writeToLogFile(`[HEALTH] ${label}: ${monitorData.health.diagnosis}`)
  }

  return monitorData.health
}

function classifyLogHealth(level, message) {
  if (!message) return null
  const reason = classifyHealthEvent({ message })
  if (reason !== 'mining-ok') return reason
  if (level === 'error') return classifyHealthEvent({ message: `network ${message}` })
  return null
}

function getHealthLogLabel(reason) {
  if (reason === 'dns-failure') return 'NETWORK DNS'
  if (reason === 'connect-timeout') return 'NETWORK TIMEOUT'
  if (reason === 'network-reset') return 'NETWORK RESET'
  if (reason === 'server-world-reset') return 'SERVER RESET'
  if (reason === 'runtime-stale') return 'BOT STALE'
  if (reason === 'speed-drop') return 'MINING SPEED'
  if (reason === 'chat-captcha-hold') return 'BOTFILTER CHAT'
  if (reason === 'botfilter-hold') return 'BOTFILTER HOLD'
  return String(reason || 'HEALTH').toUpperCase()
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
function safeRender() {
  if (!screen || HEADLESS_MODE) return
  try { screen.render() } catch (e) {}
}

function refreshBotRates(now = Date.now()) {
  for (const botData of Object.values(monitorData.bots)) {
    const stats = computeSmartRateStats({
      blockTimes: botData.blockTimes,
      now,
      rawWindowMs: 60000,
      speedWindowMs: SPEED_WINDOW_MS,
      status: botData.status,
      activeSince: botData.rateActiveSince || 0
    })
    botData.blockTimes = stats.blockTimes
    botData.rawBlocksLastMinute = stats.rawBlocksLastMinute
    botData.rawBlocksPerSecond = stats.rawBlocksPerSecond
    botData.rawRatePerMinute = stats.rawRatePerMinute
    botData.effectiveBlocksLastMinute = stats.effectiveRatePerMinute
    botData.effectiveBlocksPerSecond = stats.effectiveBlocksPerSecond
    botData.effectiveWindowMs = stats.effectiveWindowMs
    botData.rateRecovering = stats.recovering
    botData.blocksLastMinute = stats.effectiveRatePerMinute
    botData.blocksPerSecond = stats.effectiveBlocksPerSecond
  }
}

function updateInfoBox() {
  if (!infoBox) return

  const uptime = Date.now() - monitorData.startTime
  const hours = Math.floor(uptime / 3600000)
  const minutes = Math.floor((uptime % 3600000) / 60000)
  const seconds = Math.floor((uptime % 60000) / 1000)
  const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
  const totalBots = Object.keys(monitorData.bots).length
  const avgRate = monitorData.totalBlocks > 0 && uptime > 0
    ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1) : '0.0'
  const currentRate = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.blocksPerSecond || 0), 0)
  const currentRatePerMinute = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.blocksLastMinute || 0), 0)
  const rawRatePerMinute = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.rawBlocksLastMinute || 0), 0)
  const health = monitorData.health || createHealthState()

  infoBox.setContent([
    `  {cyan-fg}  Время работы:{/cyan-fg}  {bold}${hours}ч ${minutes}м ${seconds}с{/bold}`,
    `  {green-fg} Боты активны:{/green-fg}  {bold}${activeBots}/${totalBots}{/bold}`,
    `  {yellow-fg} Добыто блоков:{/yellow-fg}  {bold}${monitorData.totalBlocks}{/bold}`,
    `  {magenta-fg} Средняя скорость:{/magenta-fg}  {bold}${avgRate} блоков/час{/bold}`,
    `  {white-fg} Effective:{/white-fg}  {bold}${formatBlocksPerSecond(currentRate)} | ${formatBlocksPerMinute(currentRatePerMinute)}{/bold}`,
    `  {white-fg} Raw:{/white-fg}  {bold}${formatBlocksPerMinute(rawRatePerMinute)}{/bold}`,
    `  {${health.severity === 'error' ? 'red' : health.severity === 'warning' ? 'yellow' : 'green'}-fg} Health:{/}  {bold}${getHealthLogLabel(health.reason)}{/bold}`,
    `  {blue-fg} Ротация:{/blue-fg}  {bold}каждые ${Math.round(PERIODIC_REJOIN_MS / 60000)} мин{/bold}`,
    `  {${diggingPaused ? 'red' : 'green'}-fg} Копание:{/}  {bold}${diggingPaused ? 'ПАУЗА' : 'АКТИВНО'}{/bold}`
  ].join('\n'))
  return

  infoBox.setContent(`
  {cyan-fg}  Время работы:{/cyan-fg}  {bold}${hours}ч ${minutes}м ${seconds}с{/bold}
  {green-fg} Боты активны:{/green-fg}  {bold}${activeBots}/${totalBots}{/bold}
  {yellow-fg}  Добыто блоков:{/yellow-fg}  {bold}${monitorData.totalBlocks}{/bold}
  {magenta-fg} Средняя скорость:{/magenta-fg}  {bold}${avgRate} блоков/час{/bold}
  {white-fg} Текущая скорость:{/white-fg}  {bold}${formatBlocksPerSecond(currentRate)}{/bold}
  {blue-fg} Ротация:{/blue-fg}  {bold}каждые ${Math.round(PERIODIC_REJOIN_MS/60000)} мин{/bold}
  {${diggingPaused ? 'red' : 'green'}-fg}  Копание:{/}  {bold}${diggingPaused ? 'ПАУЗА' : 'АКТИВНО'}{/bold}
  `)
}
let lastCpuUsage = process.cpuUsage()
let lastCpuTime = Date.now()

function updateScriptResources() {
  const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
  const currentCpuUsage = process.cpuUsage()
  const currentTime = Date.now()
  const elapsedTime = currentTime - lastCpuTime
  const elapsedCpu = (currentCpuUsage.user - lastCpuUsage.user + currentCpuUsage.system - lastCpuUsage.system) / 1000
  const cpuPercent = elapsedTime > 0 ? Math.min(100, (elapsedCpu / elapsedTime) * 100).toFixed(1) : '0.0'

  lastCpuUsage = currentCpuUsage
  lastCpuTime = currentTime

  emitRuntimeEvent('resources', {
    cpuPercent: Number(cpuPercent),
    memoryMb: Number(memUsage)
  })

  if (!resourcesBox) return

  resourcesBox.setContent(`
  {yellow-fg} CPU:{/yellow-fg}  {bold}${cpuPercent}%{/bold}
  {cyan-fg} RAM:{/cyan-fg}  {bold}${memUsage} MB{/bold}
  `)

  safeRender()
}

function updateBotsTable() {
  if (!botsTable) return

  const headers = ['Имя бота', 'Статус', 'Добыто', 'Скорость']
  const data = []
  headers[3] = 'Speed (b/m)'
  const statusColors = {
    'копает': '{green-fg}',
    'ожидание': '{yellow-fg}',
    'оффлайн': '{red-fg}',
    'подключается': '{cyan-fg}',
    'ротация': '{magenta-fg}',
    'пауза': '{red-fg}',
    'возврат': '{blue-fg}'
  }
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    const color = statusColors[botData.status] || '{white-fg}'
    const displayStatus = diggingPaused && botData.status === 'копает' ? 'пауза' : botData.status
    data.push([
      botName,
      `${statusColors[displayStatus] || color}${displayStatus}{/}`,
      String(botData.blocksTotal || 0),
      formatBlocksPerMinute(botData.blocksLastMinute || 0)
    ])
  }
  botsTable.setData({ headers, data })
}

function buildRuntimeSnapshot() {
  const now = Date.now()
  const uptime = now - monitorData.startTime
  const currentRatePerMinute = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.blocksLastMinute || 0), 0)
  const currentRatePerSecond = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.blocksPerSecond || 0), 0)
  const currentRawRatePerMinute = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.rawBlocksLastMinute || 0), 0)
  const currentRawRatePerSecond = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.rawBlocksPerSecond || 0), 0)
  const health = updateHealthState(monitorData.health, {}, now)
  monitorData.health = health

  return {
    totalBlocks: monitorData.totalBlocks,
    uptimeMs: uptime,
    activeBots: Object.values(monitorData.bots).filter(b => b.status === 'копает').length,
    totalBots: Object.keys(monitorData.bots).length,
    paused: diggingPaused,
    configPath: CONFIG_FILE_PATH,
    logFilePath: LOG_FILE_PATH,
    currentRatePerMinute,
    currentRatePerSecond,
    currentEffectiveRatePerMinute: currentRatePerMinute,
    currentEffectiveRatePerSecond: currentRatePerSecond,
    currentRawRatePerMinute,
    currentRawRatePerSecond,
    health: {
      state: health.state,
      reason: health.reason,
      severity: health.severity,
      since: health.since,
      downtimeMs: health.downtimeMs,
      diagnosis: health.diagnosis,
      lastNetworkError: health.lastNetworkError,
      lastReconnectReason: health.lastReconnectReason,
      lastRecoveryAction: health.lastRecoveryAction
    },
    bots: Object.fromEntries(
      Object.entries(monitorData.bots).map(([botName, botData]) => [
        botName,
        {
          status: diggingPaused && botData.status === 'копает' ? 'пауза' : botData.status,
          blocksTotal: botData.blocksTotal || 0,
          blocksLastMinute: botData.blocksLastMinute || 0,
          blocksPerSecond: botData.blocksPerSecond || 0,
          effectiveBlocksLastMinute: botData.effectiveBlocksLastMinute || 0,
          effectiveBlocksPerSecond: botData.effectiveBlocksPerSecond || 0,
          rawBlocksLastMinute: botData.rawBlocksLastMinute || 0,
          rawBlocksPerSecond: botData.rawBlocksPerSecond || 0,
          rateRecovering: Boolean(botData.rateRecovering),
          rateActiveSince: botData.rateActiveSince || 0,
          effectiveWindowMs: botData.effectiveWindowMs || 0,
          lastBlockTime: botData.lastBlockTime || null
        }
      ])
    )
  }
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
  const colors = { 'info': '{cyan-fg}', 'success': '{green-fg}', 'warning': '{yellow-fg}', 'error': '{red-fg}' }
  const icons = { 'info': 'i', 'success': '+', 'warning': '!', 'error': 'x' }
  const color = colors[level] || '{white-fg}'
  const icon = icons[level] || 'i'
  
  const stringMessage = String(message ?? '')
  const cleanMessage = stringMessage
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[+✗⚠•⏸▶OKERR]/g, '')
    .trim()

  const healthReason = classifyLogHealth(level, cleanMessage)
  if (healthReason && healthReason !== 'mining-ok') {
    setRuntimeHealth(healthReason, {
      message: cleanMessage,
      lastNetworkError: ['network-reset', 'dns-failure', 'connect-timeout'].includes(healthReason) ? cleanMessage : undefined,
      lastRecoveryAction: level === 'error' || level === 'warning' ? 'auto-recovery pending' : undefined
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
  
  const levelNames = { 'info': 'INFO', 'success': 'SUCC', 'warning': 'WARN', 'error': 'ERR ' }
  const levelName = levelNames[level] || 'INFO'
  const fileMessage = `[${levelName}] [${botName.padEnd(20)}] ${message}`
  writeToLogFile(fileMessage)
}

function normalizeServerMessagePosition(position) {
  if (position === 0) return 'chat'
  if (position === 1) return 'system'
  if (position === 2) return 'game_info'
  if (typeof position === 'string' && position.trim()) {
    const normalized = position.trim().toLowerCase().replace(/[\s-]+/g, '_')
    if (normalized === '0' || normalized === 'chat') return 'chat'
    if (normalized === '1' || normalized === 'system') return 'system'
    if (
      normalized === '2' ||
      normalized === 'game_info' ||
      normalized === 'gameinfo' ||
      normalized === 'action_bar' ||
      normalized === 'actionbar'
    ) {
      return 'game_info'
    }
    return normalized
  }
  return 'unknown'
}

function getServerMessageSource(position) {
  return `server-${normalizeServerMessagePosition(position).replace(/_/g, '-')}`
}

function isVisibleServerMessagePosition(position) {
  const normalized = normalizeServerMessagePosition(position)
  return normalized === 'chat' || normalized === 'system' || normalized === 'unknown'
}

function normalizeChatText(text) {
  return String(text ?? '')
    .replace(/\u00a7[0-9A-FK-OR]/gi, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
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
    message: text,
    rawMessage: message,
    time,
    timestamp: now.toISOString()
  }

  emitRuntimeEvent('chat', entry)
  writeToChatLogFile(entry)
}

function updateBotStatus(botName, status, data = {}) {
  const now = Date.now()
  if (!monitorData.bots[botName]) {
    monitorData.bots[botName] = {
      status,
      blocksTotal: 0,
      blocksLastMinute: 0,
      blocksPerSecond: 0,
      rawBlocksLastMinute: 0,
      rawBlocksPerSecond: 0,
      effectiveBlocksLastMinute: 0,
      effectiveBlocksPerSecond: 0,
      rateActiveSince: status === 'копает' ? now : 0,
      rateStatusChangedAt: now,
      lastBlockTime: now,
      blockTimes: []
    }
  }
  const bot = monitorData.bots[botName]
  const previousStatus = bot.status
  bot.status = status
  if (previousStatus !== status) {
    bot.rateStatusChangedAt = now
    if (status === 'копает') {
      bot.rateActiveSince = now
      setRuntimeHealth('mining-ok', { lastRecoveryAction: 'mining-resumed' })
    } else {
      bot.rateActiveSince = 0
    }
  }
  if (data.blockMined) {
    bot.blocksTotal++
    monitorData.totalBlocks++
    bot.blockTimes.push(now)
    bot.lastBlockTime = now
  } else if (data.timestamp) {
    bot.lastBlockTime = data.timestamp
  }
  refreshBotRates()
  requestUiRefresh()
}

function normalizeDiagnosticValue(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      errno: value.errno,
      syscall: value.syscall,
      address: value.address,
      port: value.port,
      stack: value.stack ? value.stack.split('\n').slice(0, 8).join(' | ') : undefined
    }
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    if (
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.z) &&
      Object.keys(value).some(key => ['x', 'y', 'z'].includes(key))
    ) {
      return {
        x: Number(value.x.toFixed ? value.x.toFixed(3) : value.x),
        y: Number(value.y.toFixed ? value.y.toFixed(3) : value.y),
        z: Number(value.z.toFixed ? value.z.toFixed(3) : value.z)
      }
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map(item => normalizeDiagnosticValue(item, seen))
    }

    const output = {}
    for (const [key, nestedValue] of Object.entries(value).slice(0, 40)) {
      if (typeof nestedValue === 'function') continue
      output[key] = normalizeDiagnosticValue(nestedValue, seen)
    }
    return output
  }

  return value
}

function shortenDiagnosticText(value, maxLength = 300) {
  const text = String(value ?? '')
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function summarizeDiagnosticPacket(eventName, packet) {
  if (DIAGNOSTIC_FULL_PACKET_DETAILS || !packet || typeof packet !== 'object') {
    return packet
  }

  if (eventName === 'client-packet:login' || eventName === 'client-packet:respawn') {
    return {
      entityId: packet.entityId,
      gameMode: packet.gameMode,
      previousGameMode: packet.previousGameMode,
      worldName: packet.worldName,
      worldNamesCount: Array.isArray(packet.worldNames) ? packet.worldNames.length : undefined,
      dimension: typeof packet.dimension === 'string' ? packet.dimension : undefined,
      hashedSeed: packet.hashedSeed,
      maxPlayers: packet.maxPlayers,
      reducedDebugInfo: packet.reducedDebugInfo,
      enableRespawnScreen: packet.enableRespawnScreen
    }
  }

  if (eventName === 'client-packet:position' || eventName === 'client-write:position') {
    return {
      x: Number.isFinite(Number(packet.x)) ? Number(Number(packet.x).toFixed(3)) : packet.x,
      y: Number.isFinite(Number(packet.y)) ? Number(Number(packet.y).toFixed(3)) : packet.y,
      z: Number.isFinite(Number(packet.z)) ? Number(Number(packet.z).toFixed(3)) : packet.z,
      yaw: packet.yaw,
      pitch: packet.pitch,
      flags: packet.flags,
      teleportId: packet.teleportId ?? packet.teleportID ?? packet.teleport_id,
      onGround: packet.onGround
    }
  }

  if (eventName === 'client-packet:kick_disconnect' || eventName === 'client-packet:disconnect') {
    return { reason: shortenDiagnosticText(packet.reason, 500) }
  }

  if (eventName === 'client-packet:open_window') {
    return {
      windowId: packet.windowId,
      inventoryType: packet.inventoryType,
      windowTitle: shortenDiagnosticText(packet.windowTitle ?? packet.title, 160),
      slotCount: packet.slotCount
    }
  }

  return packet
}

function summarizeServerMessageJson(json) {
  if (DIAGNOSTIC_FULL_PACKET_DETAILS || !json || typeof json !== 'object') {
    return json
  }

  return {
    text: shortenDiagnosticText(json.text, 240),
    color: json.color,
    extraCount: Array.isArray(json.extra) ? json.extra.length : undefined
  }
}

function summarizeDiagnosticDetails(eventName, details = {}) {
  if (!details || typeof details !== 'object') return details
  const summarized = { ...details }

  if (Object.prototype.hasOwnProperty.call(summarized, 'packet')) {
    summarized.packet = summarizeDiagnosticPacket(eventName, summarized.packet)
  }

  if (eventName.startsWith('client-write:') && Object.prototype.hasOwnProperty.call(summarized, 'payload')) {
    summarized.payload = summarizeDiagnosticPacket(eventName, summarized.payload)
  }

  if (eventName === 'server-message') {
    summarized.text = shortenDiagnosticText(summarized.text, 500)
    summarized.json = summarizeServerMessageJson(summarized.json)
  }

  if (Object.prototype.hasOwnProperty.call(summarized, 'error')) {
    summarized.error = normalizeDiagnosticValue(summarized.error)
  }

  return summarized
}

function stringifyDiagnostic(details = {}) {
  try {
    const normalized = normalizeDiagnosticValue(details)
    const text = JSON.stringify(normalized)
    if (!text) return ''
    return text.length > DIAGNOSTIC_MAX_VALUE_LENGTH
      ? `${text.slice(0, DIAGNOSTIC_MAX_VALUE_LENGTH)}...`
      : text
  } catch (error) {
    return String(details)
  }
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
  updateInfoBox()
  updateBotsTable()
  safeRender()
}

// ============================================================================
// ============================================================================
function checkAndRestartStuckBots() {
  if (!runtimeEnabled || shuttingDown) return
  const now = Date.now()
  
  for (const botObj of activeBots) {
    if (!botObj.bot || !botObj.bot.entity || !botObj.isOnline) {
      const botData = monitorData.bots[botObj.username]
      if (botData) {
        const timeSinceLastBlock = now - botData.lastBlockTime
        const reconnectPending = typeof botObj.hasReconnectPending === 'function'
          ? botObj.hasReconnectPending()
          : Boolean(botObj.hasReconnectPending)
        const botFilterBusy = typeof botObj.isBotFilterBusy === 'function'
          ? botObj.isBotFilterBusy()
          : Boolean(botObj.isBotFilterBusy)
        const lifecycle = typeof botObj.getLifecycleSnapshot === 'function'
          ? botObj.getLifecycleSnapshot()
          : { state: 'unknown', ageMs: 0 }
        const reconnectDueAt = Number(botObj.reconnectDueAt) || 0
        const reconnectOverdue = reconnectDueAt > 0 && now - reconnectDueAt > Math.min(OFFLINE_WATCHDOG_MS, 30000)
        const reconnectStuck = lifecycle.state === 'waiting-reconnect' &&
          lifecycle.ageMs > OFFLINE_WATCHDOG_MS &&
          (!reconnectPending || reconnectOverdue)
        const lifecycleBusy = lifecycle.state === 'botfilter' || (lifecycle.state === 'waiting-reconnect' && !reconnectStuck)
        const recoverableStatus = botData.status === 'оффлайн' || botData.status === 'ожидание'
        
        if (
          timeSinceLastBlock > OFFLINE_WATCHDOG_MS &&
          recoverableStatus &&
          !botFilterBusy &&
          !lifecycleBusy &&
          (!reconnectPending || reconnectOverdue || reconnectStuck)
        ) {
          const reason = reconnectStuck || reconnectOverdue ? 'reconnect timer stuck' : 'offline watchdog'
          setRuntimeHealth('runtime-stale', {
            lastReconnectReason: reason,
            lastRecoveryAction: 'bot instance restart'
          })
          addLog('warning', 'SYSTEM', `Бот ${botObj.username} застрял офлайн (${Math.round(timeSinceLastBlock/1000)}с, ${reason}) - перезапуск`)
          
          const cfg = botsConfigs.find(c => c.username === botObj.username)
          if (cfg) {
            try {
              if (botObj.cleanup) botObj.cleanup()
            } catch(e) {}
            
            const newBotObj = createBot(cfg)
            const index = activeBots.findIndex(b => b.username === botObj.username)
            if (index !== -1) {
              activeBots[index] = newBotObj
              addLog('success', 'SYSTEM', `Бот ${botObj.username} принудительно перезапущен`)
            }
          }
        }
      }
    }
  }
}

setInterval(checkAndRestartStuckBots, OFFLINE_WATCHDOG_INTERVAL_MS)

// ============================================================================
// ============================================================================
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
let runtimeEnabled = !HOST_CONTROLLED || process.env.BOT_AUTOSTART === '1'

function applyDiggingPauseState(source = 'manual') {
  const nextPaused = manualPauseRequested || filePauseRequested
  if (nextPaused === diggingPaused) return

  diggingPaused = nextPaused
  const status = diggingPaused ? 'ПРИОСТАНОВЛЕНО' : 'ВОЗОБНОВЛЕНО'
  addLog('info', 'SYSTEM', `Копание ${status} (${source})`)

  for (const botData of Object.values(monitorData.bots)) {
    if (botData.status === 'копает' || botData.status === 'пауза') {
      botData.status = diggingPaused ? 'пауза' : 'копает'
    }
  }

  updateUI()
}

function setManualPause(nextPaused) {
  manualPauseRequested = nextPaused
  applyDiggingPauseState('ручной режим')
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
    try { clearTimeout(timer) } catch (e) {}
  }
  startupTimers = []
}

function noteGlobalError() {
  if (!runtimeEnabled || shuttingDown) return
  const now = Date.now()
  globalErrorTimestamps.push(now)
  globalErrorTimestamps = globalErrorTimestamps.filter(t => now - t <= GLOBAL_ERROR_TIME_WINDOW)
  addLog('warning', 'SYSTEM', `Счётчик ошибок: ${globalErrorTimestamps.length}/${GLOBAL_ERROR_THRESHOLD}`)
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
  addLog('warning', 'SYSTEM', `Ошибки интернета: ${noInternetErrors.length}/${NO_INTERNET_THRESHOLD}`)
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
    try { if (a.cleanup) a.cleanup() } catch (e) {}
    try { if (a.bot) a.bot.quit() } catch (e) {}
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

// ============================================================================
// ============================================================================
async function rotateBots() {
  if (rotationInProgress || activeBots.length === 0) return
  rotationInProgress = true
  
  addLog('info', 'ROTATION', ` Начинаю плановую ротацию ботов (интервал: ${Math.round(PERIODIC_REJOIN_MS/60000)} мин)`)
  
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
    
    addLog('info', 'ROTATION', `Перезапуск бота ${username} (${i+1}/${activeBots.length})`)
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
      const newBotObj = createBot(cfg)
      activeBots[i] = newBotObj
      addLog('success', 'ROTATION', `Бот ${username} перезапущен`)
    } else {
      addLog('error', 'ROTATION', `Конфиг для ${username} не найден!`)
    }
    
    if (i < activeBots.length - 1) {
      addLog('info', 'ROTATION', `Следующий бот через ${ROTATION_DELAY_BETWEEN_BOTS/1000}с`)
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
  
  addLog('info', 'SYSTEM', ` Планировщик ротации: каждые ${Math.round(PERIODIC_REJOIN_MS/60000)} минут`)
}

let lastMemoryRestartAt = 0
function checkMemoryUsage() {
  if (!runtimeEnabled || !ENABLE_SOFT_RESTART || !MEMORY_LIMIT_MB || restarting || shuttingDown) return

  const rssMb = process.memoryUsage().rss / 1024 / 1024
  if (rssMb <= MEMORY_LIMIT_MB) return

  const now = Date.now()
  if (now - lastMemoryRestartAt < 15 * 60 * 1000) return

  lastMemoryRestartAt = now
  addLog('warning', 'SYSTEM', `RSS ${rssMb.toFixed(1)} MB > лимит ${MEMORY_LIMIT_MB} MB -> мягкий перезапуск`)
  fullRestart('memory-limit')
}

function gracefulShutdown(signal = 'SIGTERM', exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  runtimeEnabled = false
  runtimeStarted = false
  addLog('info', 'SYSTEM', `Получен ${signal} - завершаю работу`)
  stopAllBots()

  if (screen) {
    try { screen.destroy() } catch (e) {}
  }

  if (HOST_CONTROLLED) {
    clearTrackedTimers()
    removeProcessHandlers()
    if (logFileStream) {
      try { logFileStream.end() } catch (e) {}
      logFileStream = null
    }
    restoreProcessOutputs()
    emitRuntimeEvent('host-shutdown', { signal, exitCode })
    return
  }

  setTimeout(() => process.exit(exitCode), 250)
}

// ============================================================================
// ============================================================================
function createBot(cfg) {
  const username = cfg.username
  const speedGuardProfile = getSpeedGuardProfile(username)
  const blocksToMine = cfg.blocksToMine
  const miningTargets = blocksToMine.map(({ x, y, z }) => vec3(x, y, z))
  const miningTargetKeys = new Set(blocksToMine.map(({ x, y, z }) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`))
  const standPosition = cfg.standPosition ? vec3(cfg.standPosition.x, cfg.standPosition.y, cfg.standPosition.z) : null
  let activeStandPosition = standPosition ? standPosition.clone() : null
  const entryButtonPosition = cfg.entryButton?.enabled
    ? vec3(cfg.entryButton.x, cfg.entryButton.y, cfg.entryButton.z)
    : null
  const maxDistance = cfg.maxDistanceFromStand || 0.6
  
  let bot = null
  let menuTimer = null, reconnectTimer = null, reconnectGraceTimer = null
  let positionCheckTimer = null, positionCheckStartTimer = null
  let speedGuardTimer = null
  let fallCheckTimer = null, limboFallStartTimer = null, limboFallIntervalTimer = null, limboFallTimeoutTimer = null
  let keepAliveTimer = null, fullServerRetryTimer = null
  let postJoinStartTimer = null, recreateRetryTimer = null, menuFlowWakeTimer = null
  let entryButtonWatchdogTimer = null
  let joinedSubserver = false, lastDigTime = 0
  let spawnGraceUntil = 0, backoff = RECONNECT_REGULAR
  let menuAttempts = 0, lastMenuAttempt = 0
  let menuRecoveryCount = 0
  let menuFlowRunning = false
  let menuFlowQueued = false
  let menuFlowWakeDueAt = 0
  let menuStage = 'idle'
  let menuStageStartedAt = Date.now()
  let isReturningToPosition = false
  let reconnectScheduled = false
  let reconnectDueAt = 0
  let reconnectReason = ''
  let waitingForFall = false
  let initialY = null
  let fallCheckPassed = false
  let fallCheckActive = false
  let limboSavedPhysicsEnabled = null
  let authQuickLogin = false
  let retryingFullServer = false
  let isOnline = false
  let scannerHoldUntil = 0
  let lastScannerLogAt = 0
  let scannerWaitChallengeActive = false
  let limboSuccessSeen = false
  let lastLimboPositionPacket = null
  let botFilterRetryCount = Number(botFilterRetryStates.get(username)?.retryCount) || 0
  let botFilterLastFailureAt = Number(botFilterRetryStates.get(username)?.lastFailureAt) || 0
  let lifecycleState = 'connecting'
  let lifecycleStateChangedAt = Date.now()
  let isRotating = false
  let lastKeepAlive = Date.now()
  let botHandle = null
  let sessionEpoch = 1
  let digLoopRunning = false
  let waitKickCount = 0
  let positionConfirmed = false
  let lastEntryButtonAttemptAt = 0
  let entryButtonPressedThisJoin = false
  let entryButtonPressedJoinSeq = 0
  let entryButtonFlowRunning = false
  let subserverJoinSeq = 0
  let emptyTargetButtonRetryCount = 0
  let lastEmptyTargetButtonRetryAt = 0
  let lastBlockMinedAt = 0
  let lastMiningDiagnosticAt = 0
  let lastEmptyTargetsLogAt = 0
  let lastMiningLookAt = 0
  let lastReactiveBreakAt = 0
  let lastPositionDiagnosticAt = 0
  let lastMenuOpenAttemptAt = 0
  let lastLoginCommandAt = 0
  let diagnosticEventSeq = 0
  const diagnosticRepeatState = new Map()
  let openServerMenuItem = async (source = 'uninitialized') => {
    diagEvent('menu-open-unavailable', { source })
    return false
  }

  function setLifecycleState(nextState, source = 'unknown', details = {}) {
    if (lifecycleState === nextState) return
    const previousState = lifecycleState
    lifecycleState = nextState
    lifecycleStateChangedAt = Date.now()
    diagEvent('lifecycle-state', {
      previousState,
      state: lifecycleState,
      source,
      ...details
    })
  }

  function getLifecycleSnapshot() {
    return {
      state: lifecycleState,
      ageMs: Date.now() - lifecycleStateChangedAt
    }
  }
  let packetOnlyStartedAt = 0
  let speedGuardStartedAt = 0
  let speedGuardLowSince = 0
  let speedGuardLastRecoveryAt = 0
  let speedGuardRecoveries = 0
  let speedGuardCheckRunning = false
  let breakPacketSecondWindowStartedAt = 0
  let breakPacketSecondWindowCount = 0
  let breakPacketBurstWindowStartedAt = 0
  let breakPacketBurstWindowCount = 0
  let lastBreakPacketThrottleLogAt = 0
  const lastBreakPacketByTarget = new Map()
  const pendingPacketBreaks = new Map()
  const lastCountedBlockByTarget = new Map()

  function getPositionKey(position) {
    if (!position) return ''
    return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`
  }

  function isMiningTargetPosition(position) {
    return miningTargetKeys.has(getPositionKey(position))
  }

  function getStandDelta() {
    const anchor = activeStandPosition || standPosition
    if (!anchor || !bot || !bot.entity) return null

    const dx = anchor.x - bot.entity.position.x
    const dy = anchor.y - bot.entity.position.y
    const dz = anchor.z - bot.entity.position.z

    return {
      dx,
      dy,
      dz,
      distance2d: Math.hypot(dx, dz),
      distance3d: Math.hypot(dx, dy, dz)
    }
  }

  function isCurrentSession(epoch) {
    return epoch === sessionEpoch
  }

  function getReconnectGraceDelay() {
    return Math.max(0, spawnGraceUntil - Date.now())
  }

  function hasReconnectPendingLocal() {
    return Boolean(reconnectScheduled || reconnectTimer || reconnectGraceTimer || recreateRetryTimer)
  }

  function getStabilityCooldownRemaining() {
    return Math.max(0, (stabilityCooldowns.get(username) || 0) - Date.now())
  }

  function isFastMiningAllowed() {
    return ENABLE_AGGRESSIVE_MINING && !hasReconnectPendingLocal()
  }

  function isBurstBreakAllowed() {
    return isFastMiningAllowed() && getStabilityCooldownRemaining() <= 0
  }

  function getPacketSafetyRemaining() {
    return Math.max(0, (packetSafetyCooldowns.get(username) || 0) - Date.now())
  }

  function isPacketSafetyModeActive() {
    return getPacketSafetyRemaining() > 0
  }

  function getBreakPacketLimits() {
    const safeMode = isPacketSafetyModeActive()
    return {
      safeMode,
      perSecond: safeMode ? BREAK_PACKET_SAFE_MAX_PER_SECOND : BREAK_PACKET_MAX_PER_SECOND,
      burstWindowMs: BREAK_PACKET_BURST_WINDOW_MS,
      burst: safeMode ? BREAK_PACKET_SAFE_BURST_LIMIT : BREAK_PACKET_BURST_LIMIT,
      targetCooldownMs: BREAK_PACKET_MIN_TARGET_COOLDOWN_MS,
      pendingRetryMs: BREAK_PACKET_PENDING_RETRY_MS
    }
  }

  function activatePacketSafetyMode(reason = 'too many packets') {
    const now = Date.now()
    const currentUntil = packetSafetyCooldowns.get(username) || 0
    const until = Math.max(currentUntil, now + BREAK_PACKET_SAFE_MODE_MS)
    packetSafetyCooldowns.set(username, until)
    breakPacketSecondWindowStartedAt = 0
    breakPacketSecondWindowCount = 0
    breakPacketBurstWindowStartedAt = 0
    breakPacketBurstWindowCount = 0

    addLog('warning', username, `Packet-safe режим ${Math.ceil((until - now) / 60000)}м: ${reason}`)
    diagEvent('packet-safe-mode-activated', { reason, until, limits: getBreakPacketLimits() })
  }

  function getEffectiveBreakPacketRepeats(repeats) {
    const value = Math.max(1, Number(repeats) || 1)
    if (isPacketSafetyModeActive()) {
      return Math.min(value, BREAK_PACKET_SAFE_REPEATS)
    }

    const limits = getBreakPacketLimits()
    const secondPressure = limits.perSecond > 0 ? breakPacketSecondWindowCount / limits.perSecond : 0
    const burstPressure = limits.burst > 0 ? breakPacketBurstWindowCount / limits.burst : 0
    const pressure = Math.max(secondPressure, burstPressure)

    if (pressure >= 0.72) return 1
    if (pressure >= 0.48) return Math.min(value, 2)
    return value
  }

  function reserveBreakPacketBudget(packetCount = 2) {
    const now = Date.now()
    const limits = getBreakPacketLimits()

    if (!breakPacketSecondWindowStartedAt || now - breakPacketSecondWindowStartedAt >= 1000) {
      breakPacketSecondWindowStartedAt = now
      breakPacketSecondWindowCount = 0
    }

    if (!breakPacketBurstWindowStartedAt || now - breakPacketBurstWindowStartedAt >= limits.burstWindowMs) {
      breakPacketBurstWindowStartedAt = now
      breakPacketBurstWindowCount = 0
    }

    if (
      breakPacketSecondWindowCount + packetCount > limits.perSecond ||
      breakPacketBurstWindowCount + packetCount > limits.burst
    ) {
      if (now - lastBreakPacketThrottleLogAt > 5000) {
        lastBreakPacketThrottleLogAt = now
        diagEvent('break-packet-throttled', {
          requestedPackets: packetCount,
          secondWindowCount: breakPacketSecondWindowCount,
          burstWindowCount: breakPacketBurstWindowCount,
          limits,
          packetSafetyRemainingMs: getPacketSafetyRemaining()
        })
      }
      return false
    }

    breakPacketSecondWindowCount += packetCount
    breakPacketBurstWindowCount += packetCount
    return true
  }

  function canSendBreakPacketForTarget(position, cooldownMs = BREAK_PACKET_TARGET_COOLDOWN_MS) {
    if (!position || cooldownMs <= 0) return true

    const key = getPositionKey(position)
    const now = Date.now()
    const lastSentAt = lastBreakPacketByTarget.get(key) || 0
    if (now - lastSentAt < cooldownMs) {
      return false
    }

    return true
  }

  function canRetryPendingBreak(position, retryMs = BREAK_PACKET_PENDING_RETRY_MS) {
    if (!position || retryMs <= 0) return true

    const key = getPositionKey(position)
    const sentAt = pendingPacketBreaks.get(key) || 0
    return !sentAt || Date.now() - sentAt >= retryMs
  }

  function markBreakPacketTargetSent(position) {
    if (!position) return
    lastBreakPacketByTarget.set(getPositionKey(position), Date.now())
  }

  function prunePacketBreakTracking(now = Date.now()) {
    const packetTtl = PACKET_BREAK_CONFIRM_WINDOW_MS * 2
    for (const [key, sentAt] of pendingPacketBreaks) {
      if (now - sentAt > packetTtl) pendingPacketBreaks.delete(key)
    }

    const countTtl = Math.max(1000, BLOCK_COUNT_DEDUPE_MS * 20)
    for (const [key, countedAt] of lastCountedBlockByTarget) {
      if (now - countedAt > countTtl) lastCountedBlockByTarget.delete(key)
    }
  }

  function markPacketBreakAttempt(position) {
    if (!position) return
    pendingPacketBreaks.set(getPositionKey(position), Date.now())
  }

  function hasRecentPacketBreak(position, now = Date.now()) {
    if (!position) return false
    const sentAt = pendingPacketBreaks.get(getPositionKey(position)) || 0
    return sentAt > 0 && now - sentAt <= PACKET_BREAK_CONFIRM_WINDOW_MS
  }

  function isMiningPositionInReach(position) {
    const distance = getPositionDistance(position)
    return Number.isFinite(distance) && distance <= BURST_BREAK_REACH
  }

  function recordMinedBlock(position, source = 'dig') {
    if (source === 'packet' && !isMiningPositionInReach(position)) {
      pendingPacketBreaks.delete(getPositionKey(position))
      return false
    }

    const now = Date.now()
    const key = getPositionKey(position)

    if (key) {
      const lastCountedAt = lastCountedBlockByTarget.get(key) || 0
      if (BLOCK_COUNT_DEDUPE_MS > 0 && now - lastCountedAt < BLOCK_COUNT_DEDUPE_MS) {
        return false
      }

      lastCountedBlockByTarget.set(key, now)
      pendingPacketBreaks.delete(key)
    }

    lastDigTime = now
    lastBlockMinedAt = now
    lastEmptyTargetsLogAt = 0
    packetOnlyStartedAt = PACKET_ONLY_MINING ? now : 0
    refreshActiveStandPositionFromMining(source)
    recordSpeedGuardProgress(speedGuardProfile, now)

    if (!positionConfirmed) {
      positionConfirmed = true
      addLog(
        'info',
        username,
        source === 'packet' ? 'Позиция подтверждена (packet-break)' : 'Позиция подтверждена (первый блок)'
      )
      diagEvent('position-confirmed-by-mining', { source, position })
    }

    updateBotStatus(username, 'копает', { blockMined: true })
    prunePacketBreakTracking(now)
    return true
  }

  function getPacketOnlyIdleMs(now = Date.now()) {
    if (!packetOnlyStartedAt) return Infinity
    const lastConfirmedAt = lastBlockMinedAt >= packetOnlyStartedAt ? lastBlockMinedAt : 0
    return now - (lastConfirmedAt || packetOnlyStartedAt)
  }

  function getMiningProgressAgeMs(now = Date.now()) {
    const lastProgressAt = Math.max(lastBlockMinedAt || 0, lastDigTime || 0)
    return lastProgressAt > 0 ? now - lastProgressAt : Infinity
  }

  function hasRecentMiningProgress(windowMs = POSITION_FAR_RECONNECT_IDLE_MS) {
    return getMiningProgressAgeMs() <= windowMs
  }

  function getCurrentRatePerMinute() {
    refreshBotRates()
    const botData = monitorData.bots[username]
    if (!botData) return 0

    const stats = computeSmartRateStats({
      blockTimes: botData.blockTimes,
      now: Date.now(),
      rawWindowMs: getSpeedGuardRateWindowMs(),
      speedWindowMs: getSpeedGuardRateWindowMs(),
      status: botData.status,
      activeSince: botData.rateActiveSince || 0
    })
    return Number.isFinite(stats.effectiveRatePerMinute) ? stats.effectiveRatePerMinute : 0
  }

  function getSpeedGuardPeak() {
    return Math.max(0, Number(speedGuardProfile.peakRatePerMinute) || 0)
  }

  function rememberSpeedGuardPeak(ratePerMinute) {
    return rememberAdaptiveSpeedGuardPeak(speedGuardProfile, ratePerMinute, Date.now(), getSpeedGuardRateMemoryMs())
  }

  function getSpeedGuardTarget() {
    return getSpeedGuardTargetRate(speedGuardProfile, SPEED_GUARD_TARGET_RATIO)
  }

  function getSpeedGuardRateWindowMs() {
    return getAdaptiveRateWindowMs(speedGuardProfile, SPEED_GUARD_RATE_WINDOW_MS)
  }

  function getSpeedGuardRateMemoryMs() {
    return getAdaptiveWaitMs(speedGuardProfile, SPEED_GUARD_RATE_WINDOW_MS * 4, 12)
  }

  function getSpeedGuardLowRateMs() {
    return Math.max(getSpeedGuardRateWindowMs(), getAdaptiveWaitMs(speedGuardProfile, SPEED_GUARD_LOW_RATE_MS, 2))
  }

  function getSpeedGuardButtonIdleMs() {
    return getAdaptiveWaitMs(speedGuardProfile, SPEED_GUARD_BUTTON_IDLE_MS, 2)
  }

  function getSpeedGuardNoProgressReconnectMs() {
    return getAdaptiveWaitMs(speedGuardProfile, SPEED_GUARD_NO_PROGRESS_RECONNECT_MS, 4)
  }

  function resetSpeedGuardLowState() {
    speedGuardLowSince = 0
    speedGuardRecoveries = 0
  }

  function stopSpeedGuard() {
    try { if (speedGuardTimer) clearInterval(speedGuardTimer) } catch (error) {}
    speedGuardTimer = null
    speedGuardCheckRunning = false
    speedGuardStartedAt = 0
    speedGuardLowSince = 0
    speedGuardRecoveries = 0
  }

  async function recoverSpeedDrop(expectedSessionEpoch, currentRate, targetRate, snapshot) {
    const now = Date.now()
    const buttonIdleMs = getSpeedGuardButtonIdleMs()
    const noProgressReconnectMs = getSpeedGuardNoProgressReconnectMs()

    const idleFor = getMiningProgressAgeMs(now)
    const emptyTargets = snapshot?.all?.length > 0 && snapshot.all.every(target => target.state === 'empty')
    const unloadedTargets = snapshot?.all?.length > 0 && snapshot.all.every(target => target.state === 'unloaded')
    const activeProgress = Number.isFinite(idleFor) && idleFor < Math.min(buttonIdleMs, noProgressReconnectMs)
    const speedDropExceeded = targetRate > 0 && currentRate < targetRate
    if (activeProgress && !emptyTargets && !unloadedTargets && digLoopRunning && !speedDropExceeded) {
      diagEvent('speed-guard-active-progress-hold', {
        currentRate,
        targetRate,
        allowedDropPercent: SPEED_GUARD_ALLOWED_DROP_PERCENT,
        idleFor,
        targets: snapshot?.all?.map(formatTargetSnapshot)
      })
      return
    }

    if (now - speedGuardLastRecoveryAt < SPEED_GUARD_RECOVERY_COOLDOWN_MS) return

    speedGuardLastRecoveryAt = now
    speedGuardRecoveries += 1
    const recoveryAttempt = Math.min(speedGuardRecoveries, SPEED_GUARD_RECONNECT_AFTER_RECOVERIES)
    const rateText = `${Math.round(currentRate)}<${Math.round(targetRate)} б/м`
    const shouldLogRecoveryWarning =
      emptyTargets ||
      unloadedTargets ||
      !digLoopRunning ||
      speedDropExceeded ||
      (Number.isFinite(idleFor) && idleFor >= 3000)

    if (shouldLogRecoveryWarning) {
      setRuntimeHealth('speed-drop', {
        lastRecoveryAction: 'speed-guard recovery',
        diagnosis: `Причина просадки: скорость ${Math.round(currentRate)} б/м ниже адаптивной цели ${Math.round(targetRate)} б/м.`
      })
      addLog(
        'warning',
        username,
        `Speed-guard: просадка ${rateText}, простой ${Number.isFinite(idleFor) ? Math.round(idleFor / 1000) : '?'}с -> восстановление ${recoveryAttempt}/${SPEED_GUARD_RECONNECT_AFTER_RECOVERIES}`
      )
    }

    diagEvent('speed-guard-recovery', {
      currentRate,
      targetRate,
      peakRate: getSpeedGuardPeak(),
      idleFor,
      buttonIdleMs,
      noProgressReconnectMs,
      activeProgress,
      speedDropExceeded,
      allowedDropPercent: SPEED_GUARD_ALLOWED_DROP_PERCENT,
      recoveries: speedGuardRecoveries,
      emptyTargets,
      unloadedTargets,
      targets: snapshot?.all?.map(formatTargetSnapshot)
    })

    if (unloadedTargets && Number.isFinite(idleFor) && idleFor >= buttonIdleMs) {
      const confirmed = await confirmFarCoordinateState(expectedSessionEpoch, 'speed-guard-unloaded')
      if (confirmed.confirmed) {
        reconnectBecauseCoordinateFar(confirmed.health, 'speed-guard-unloaded')
        return
      }
    }

    if (
      entryButtonPosition &&
      emptyTargets &&
      Number.isFinite(idleFor) &&
      idleFor >= buttonIdleMs &&
      !entryButtonFlowRunning
    ) {
      addLog('warning', username, 'Speed-guard: шахта пустая, повторяю кнопку генератора')
      await pressEntryButton({ waitAfter: false })
      if (!isMiningSessionReady(expectedSessionEpoch)) return
      await runBurstBreakWindow(expectedSessionEpoch, Math.min(BURST_BREAK_WINDOW_MS, 900))
      return
    }

    packetOnlyStartedAt = 0
    pendingPacketBreaks.clear()
    lastBreakPacketByTarget.clear()

    if (!digLoopRunning && isEntryButtonPressedForCurrentJoin()) {
      addLog('warning', username, 'Speed-guard: mining loop не активен, запускаю заново')
      startDiggingLoop(expectedSessionEpoch).catch(() => {})
      return
    }

    await ensureMiningLookAt(true)
    if (!isMiningSessionReady(expectedSessionEpoch)) return

    const burstPackets = await runBurstBreakWindow(expectedSessionEpoch, Math.min(BURST_BREAK_WINDOW_MS, 900))
    if (burstPackets > 0) {
      resetSpeedGuardLowState()
      return
    }

    if (Number.isFinite(idleFor) && idleFor < noProgressReconnectMs) {
      diagEvent('speed-guard-reconnect-skipped-active-progress', {
        currentRate,
        targetRate,
        idleFor,
        noProgressReconnectMs,
        recoveries: speedGuardRecoveries
      })
      return
    }

    if (
      speedGuardRecoveries >= SPEED_GUARD_RECONNECT_AFTER_RECOVERIES ||
      (Number.isFinite(idleFor) && idleFor >= noProgressReconnectMs)
    ) {
      addLog('warning', username, 'Speed-guard: мягкое восстановление не помогло -> быстрый перезаход')
      updateBotStatus(username, 'ожидание')
      scheduleReconnectLocal(2000, true, 'speed-guard-low-rate')
    }
  }

  async function runSpeedGuardCheck(expectedSessionEpoch) {
    if (
      !SPEED_GUARD_ENABLED ||
      speedGuardCheckRunning ||
      diggingPaused ||
      isReturningToPosition ||
      !isCurrentSession(expectedSessionEpoch) ||
      !joinedSubserver ||
      !bot ||
      hasReconnectPendingLocal()
    ) {
      return
    }

    speedGuardCheckRunning = true
    try {
      if (!isEntryButtonPressedForCurrentJoin()) {
        if (!entryButtonFlowRunning) {
          addLog('warning', username, 'Speed-guard: post-join кнопка не подтверждена, повторяю')
          await runEntryButtonFlow(expectedSessionEpoch, 'speed-guard')
        }
        return
      }

      if (!digLoopRunning) {
        addLog('warning', username, 'Speed-guard: mining loop остановлен, запускаю')
        startDiggingLoop(expectedSessionEpoch).catch(() => {})
        return
      }

      const now = Date.now()
      if (speedGuardStartedAt && now - speedGuardStartedAt < SPEED_GUARD_START_GRACE_MS) {
        return
      }

      const currentRate = getCurrentRatePerMinute()
      const peakRate = rememberSpeedGuardPeak(currentRate)
      const targetRate = getSpeedGuardTarget()
      const progressAge = getMiningProgressAgeMs(now)
      const rateWindowMs = getSpeedGuardRateWindowMs()
      const rateMemoryMs = getSpeedGuardRateMemoryMs()
      const lowRateMs = getSpeedGuardLowRateMs()
      const noProgressReconnectMs = getSpeedGuardNoProgressReconnectMs()

      const hasFreshProgress = Number.isFinite(progressAge) && progressAge <= Math.max(rateWindowMs, lowRateMs)
      const isLearningBaseline = targetRate <= 0
      const isHealthyRate = targetRate > 0 && currentRate >= targetRate
      if (isHealthyRate || (isLearningBaseline && hasFreshProgress)) {
        if (monitorData.health?.reason === 'speed-drop') {
          setRuntimeHealth('mining-ok', { lastRecoveryAction: 'speed restored' })
        }
        resetSpeedGuardLowState()
        return
      }

      if (!speedGuardLowSince) {
        speedGuardLowSince = now
        diagEvent('speed-guard-low-rate-start', {
          currentRate,
          targetRate,
          peakRate,
          progressAge,
          rateWindowMs,
          rateMemoryMs,
          lowRateMs,
          noProgressReconnectMs
        })
        return
      }

      if (now - speedGuardLowSince < lowRateMs && progressAge < noProgressReconnectMs) {
        return
      }

      const snapshot = buildMiningSnapshot(0)
      await recoverSpeedDrop(expectedSessionEpoch, currentRate, targetRate, snapshot)
    } finally {
      speedGuardCheckRunning = false
    }
  }

  function startSpeedGuard(expectedSessionEpoch) {
    if (!SPEED_GUARD_ENABLED || speedGuardTimer) return
    speedGuardStartedAt = Date.now()
    speedGuardLowSince = 0
    speedGuardRecoveries = 0
    speedGuardLastRecoveryAt = 0
    speedGuardTimer = setInterval(() => {
      runSpeedGuardCheck(expectedSessionEpoch).catch(error => {
        diagEvent('speed-guard-error', { error })
      })
    }, SPEED_GUARD_INTERVAL_MS)
    diagEvent('speed-guard-started', {
      adaptive: true,
      intervalMs: SPEED_GUARD_INTERVAL_MS,
      startGraceMs: SPEED_GUARD_START_GRACE_MS,
      rateWindowMs: getSpeedGuardRateWindowMs(),
      rateMemoryMs: getSpeedGuardRateMemoryMs(),
      lowRateMs: getSpeedGuardLowRateMs(),
      noProgressReconnectMs: getSpeedGuardNoProgressReconnectMs(),
      targetRatio: SPEED_GUARD_TARGET_RATIO,
      allowedDropPercent: SPEED_GUARD_ALLOWED_DROP_PERCENT,
      peakRate: getSpeedGuardPeak()
    })
  }

  function setMenuStage(stage, source = 'unknown') {
    if (menuStage === stage) return
    menuStage = stage
    menuStageStartedAt = Date.now()
    if (stage === 'chat-captcha-hold') {
      setLifecycleState('botfilter', source, { menuStage: stage })
    } else if (stage === 'joined') {
      setLifecycleState('joining', source, { menuStage: stage })
    } else if (stage !== 'idle') {
      setLifecycleState('menu', source, { menuStage: stage })
    }
    diagEvent('menu-stage', { stage, source })
  }

  function flattenMinecraftText(value, options = {}) {
    const arrayJoiner = options.arrayJoiner ?? ' '
    const partJoiner = options.partJoiner ?? ' '

    if (value == null) return ''

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return flattenMinecraftText(JSON.parse(trimmed), options)
        } catch (error) {
          return value
        }
      }
      return value
    }

    if (Array.isArray(value)) {
      return value.map(entry => flattenMinecraftText(entry, options)).filter(Boolean).join(arrayJoiner)
    }

    if (typeof value === 'object') {
      const parts = []
      if (Object.prototype.hasOwnProperty.call(value, 'text')) {
        parts.push(flatifyMinecraftTextPart(value.text, options))
      }
      if (value.translate) parts.push(flattenMinecraftText(value.translate, options))
      if (value.fallback && parts.length === 0) parts.push(flattenMinecraftText(value.fallback, options))
      if (value.with && parts.length === 0) parts.push(flattenMinecraftText(value.with, options))
      if (value.extra) parts.push(flattenMinecraftText(value.extra, options))
      if (value.value && parts.length === 0) parts.push(flattenMinecraftText(value.value, options))
      if (value.name && parts.length === 0) parts.push(flattenMinecraftText(value.name, options))
      return parts.filter(Boolean).join(partJoiner)
    }

    return String(value)
  }

  function flatifyMinecraftTextPart(value, options = {}) {
    if (value == null) return ''
    return typeof value === 'object'
      ? flattenMinecraftText(value, options)
      : String(value)
  }

  function getMessageJson(message) {
    if (!message || typeof message !== 'object') return null
    if (message.json) return message.json
    if (message.unsigned?.json) return message.unsigned.json
    return null
  }

  function isUsableChatText(value) {
    const text = normalizeChatText(value)
    return Boolean(text && text !== '[object Object]' && text !== 'undefined' && text !== 'null')
  }

  function getMinecraftMessageText(message) {
    const candidates = []
    const addCandidate = getter => {
      try {
        const value = getter()
        if (isUsableChatText(value)) {
          candidates.push(normalizeChatText(value))
        }
      } catch (error) {}
    }

    addCandidate(() => typeof message?.toString === 'function' ? message.toString() : null)
    addCandidate(() => typeof message?.unsigned?.toString === 'function' ? message.unsigned.toString() : null)
    addCandidate(() => flattenMinecraftText(message?.json, { arrayJoiner: '', partJoiner: '' }))
    addCandidate(() => flattenMinecraftText(message?.unsigned?.json, { arrayJoiner: '', partJoiner: '' }))
    addCandidate(() => typeof message === 'string' ? message : null)
    addCandidate(() => flattenMinecraftText(message, { arrayJoiner: '', partJoiner: '' }))

    return candidates[0] || ''
  }

  function getWindowTitleText(window) {
    return flattenMinecraftText(window?.title || '')
  }

  function getItemDisplayText(item) {
    const display = item?.nbt?.value?.display?.value
    if (!display) return ''

    const parts = []
    if (display.Name) parts.push(flattenMinecraftText(display.Name.value ?? display.Name))
    const lore = display.Lore?.value?.value || display.Lore?.value
    if (Array.isArray(lore)) parts.push(flattenMinecraftText(lore))
    return parts.filter(Boolean).join(' ')
  }

  function getWindowSlotText(window, slot) {
    if (!window || !Array.isArray(window.slots)) return ''
    return getItemDisplayText(window.slots[slot])
  }

  function classifyServerMenuWindow(window) {
    if (!window) return { kind: 'none', title: '', slot1Text: '', slot2Text: '' }

    const title = getWindowTitleText(window)
    const lowTitle = title.toLowerCase()
    const slot1Text = getWindowSlotText(window, MENU_SLOT_1)
    const slot2Text = getWindowSlotText(window, MENU_SLOT_2)
    const lowSlot1 = slot1Text.toLowerCase()
    const lowSlot2 = slot2Text.toLowerCase()

    if (lowTitle.includes('выбор игры') || lowTitle.includes('game')) {
      return { kind: 'game', title, slot1Text, slot2Text }
    }

    if (lowTitle.includes('выбор скайблока') || lowTitle.includes('skyblock')) {
      return { kind: 'skyblock', title, slot1Text, slot2Text }
    }

    if (lowSlot2.includes('второй скайблок') || lowSlot2.includes('second skyblock')) {
      return { kind: 'skyblock', title, slot1Text, slot2Text }
    }

    if (lowSlot1.includes('скайблок') || lowSlot1.includes('skyblock')) {
      return { kind: 'game', title, slot1Text, slot2Text }
    }

    return { kind: 'unknown', title, slot1Text, slot2Text }
  }

  function beginSubserverJoin() {
    joinedSubserver = true
    subserverJoinSeq += 1
    menuRecoveryCount = 0
    botFilterRetryCount = 0
    botFilterLastFailureAt = 0
    botFilterRetryStates.delete(username)
    setLifecycleState('joining', 'subserver-join')
    setMenuStage('joined', 'subserver-join')
    positionConfirmed = false
    entryButtonPressedThisJoin = false
    entryButtonPressedJoinSeq = 0
    entryButtonFlowRunning = false
    lastEntryButtonAttemptAt = 0
    diagEvent('subserver-join-begin', {})
  }

  function isEntryButtonPressedForCurrentJoin() {
    return entryButtonPressedThisJoin && entryButtonPressedJoinSeq === subserverJoinSeq
  }

  function refreshActiveStandPositionFromMining(source = 'mining') {
    if (!standPosition || !bot?.entity?.position) return

    const currentPosition = bot.entity.position.clone()
    if (!activeStandPosition) {
      activeStandPosition = currentPosition
      return
    }

    const distanceToAnchor = activeStandPosition.distanceTo(currentPosition)
    if (distanceToAnchor > 500) {
      adoptCurrentPositionAsStand(source)
    }
  }

  function activateStabilityCooldown(reason, durationMs = STABILITY_COOLDOWN_MS) {
    if (durationMs <= 0) return

    const now = Date.now()
    const currentUntil = stabilityCooldowns.get(username) || 0
    const currentRemaining = Math.max(0, currentUntil - now)
    const nextRemaining = Math.min(STABILITY_COOLDOWN_MAX_MS, currentRemaining + durationMs)
    const nextUntil = now + nextRemaining

    stabilityCooldowns.set(username, nextUntil)
    addLog('warning', username, `Стабильный режим ${Math.ceil(nextRemaining / 60000)}м: ${reason}`)
  }

  function invalidateSession() {
    sessionEpoch += 1
    digLoopRunning = false
  }

  function createDigTimeoutError() {
    const error = new Error(`dig timeout after ${Math.round(DIG_ACTION_TIMEOUT_MS / 1000)}s`)
    error.code = 'BOT_DIG_TIMEOUT'
    return error
  }

  function isDigTimeoutError(error) {
    return error?.code === 'BOT_DIG_TIMEOUT'
  }

  function getDigFaceForBlock(block) {
    if (!bot?.entity || !block?.position) return 1

    const eyePosition = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
    const blockCenter = block.position.offset(0.5, 0.5, 0.5)
    const delta = {
      x: eyePosition.x - blockCenter.x,
      y: eyePosition.y - blockCenter.y,
      z: eyePosition.z - blockCenter.z
    }
    const absX = Math.abs(delta.x)
    const absY = Math.abs(delta.y)
    const absZ = Math.abs(delta.z)

    if (absY >= absX && absY >= absZ) return delta.y > 0 ? 1 : 0
    if (absX >= absZ) return delta.x > 0 ? 5 : 4
    return delta.z > 0 ? 3 : 2
  }

  function getSafeDigTime(block) {
    if (typeof bot?.digTime !== 'function') return Infinity
    try {
      const digTime = bot.digTime(block)
      return Number.isFinite(digTime) ? digTime : Infinity
    } catch (error) {
      return Infinity
    }
  }

  function getMiningLookTarget() {
    if (!miningTargets.length) return null

    const total = miningTargets.reduce((acc, pos) => {
      acc.x += pos.x + 0.5
      acc.y += pos.y + 0.5
      acc.z += pos.z + 0.5
      return acc
    }, { x: 0, y: 0, z: 0 })

    return vec3(
      total.x / miningTargets.length,
      total.y / miningTargets.length,
      total.z / miningTargets.length
    )
  }

  async function lookAtMiningTargets() {
    const target = getMiningLookTarget()
    if (!target || !bot?.entity) return

    try {
      await bot.lookAt(target, true)
      lastMiningLookAt = Date.now()
    } catch (error) {}
  }

  async function ensureMiningLookAt(force = false) {
    if (BURST_LOOK_REFRESH_MS <= 0) return

    const now = Date.now()
    if (!force && now - lastMiningLookAt < BURST_LOOK_REFRESH_MS) {
      return
    }

    await lookAtMiningTargets()
  }

  function sendBreakPacketToTarget(target, options = {}) {
    if (!isFastMiningAllowed() || !bot?._client || !target?.position) {
      return false
    }

    const preemptive = options.preemptive ?? PREEMPTIVE_BREAK_TARGETS
    const repeats = getEffectiveBreakPacketRepeats(options.repeats ?? BURST_BREAK_REPEATS)
    const block = target.block || bot.blockAt(target.position)
    if ((!block || block.type === 0) && !preemptive) {
      return false
    }

    const location = block?.position || target.position
    const distance = Number.isFinite(target.distance) ? target.distance : getPositionDistance(location)
    if (!Number.isFinite(distance) || distance > BURST_BREAK_REACH) {
      return false
    }

    const cooldownMs = Math.max(
      BREAK_PACKET_MIN_TARGET_COOLDOWN_MS,
      Math.max(0, Number(options.cooldownMs ?? BREAK_PACKET_TARGET_COOLDOWN_MS) || 0)
    )
    if (!options.skipCooldown && !canSendBreakPacketForTarget(location, cooldownMs)) {
      return false
    }

    const pendingRetryMs = Math.max(0, Number(options.pendingRetryMs ?? BREAK_PACKET_PENDING_RETRY_MS) || 0)
    if (!options.skipPendingRetry && !canRetryPendingBreak(location, pendingRetryMs)) {
      return false
    }

    const face = getDigFaceForBlock(block || { position: target.position })

    try {
      let sentPairs = 0
      for (let i = 0; i < repeats; i++) {
        if (!reserveBreakPacketBudget(2)) break
        bot._client.write('block_dig', { status: 0, location, face })
        bot._client.write('block_dig', { status: 2, location, face })
        sentPairs++
      }

      if (sentPairs <= 0) {
        return false
      }
      markBreakPacketTargetSent(location)
      markPacketBreakAttempt(location)
      return true
    } catch (error) {
      return false
    }
  }

  async function breakUpdatedMiningBlock(block) {
    if (!block || block.type === 0 || !isMiningTargetPosition(block.position)) {
      return false
    }

    const distance = getPositionDistance(block.position)
    if (!Number.isFinite(distance) || distance > BURST_BREAK_REACH) {
      return false
    }

    if (!isMiningSessionReady(sessionEpoch)) {
      return false
    }

    await ensureMiningLookAt()
    const sent = sendBreakPacketToTarget({
      index: -1,
      position: block.position,
      block,
      distance,
      state: 'mineable'
    }, { preemptive: false, repeats: REACTIVE_BREAK_REPEATS })

    if (sent) {
      lastDigTime = Date.now()
      lastReactiveBreakAt = lastDigTime
      try { bot.swingArm() } catch (error) {}
      updateBotStatus(username, 'копает')
    }

    return sent
  }

  function handleBlockUpdate(oldBlock, newBlock) {
    const position = newBlock?.position || oldBlock?.position
    if (!position || !isMiningTargetPosition(position)) {
      return
    }

    const oldWasSolid = oldBlock && oldBlock.type !== 0
    const becameAir = oldWasSolid && (!newBlock || newBlock.type === 0)

    if (becameAir && hasRecentPacketBreak(position)) {
      recordMinedBlock(position, 'packet')
      return
    }

    if (!newBlock || newBlock.type === 0) {
      return
    }

    breakUpdatedMiningBlock(newBlock).catch(() => {})
  }

  async function runBurstBreakWindow(expectedSessionEpoch, timeoutMs = BURST_BREAK_WINDOW_MS) {
    if (!isBurstBreakAllowed() || timeoutMs <= 0 || !bot?._client) {
      return 0
    }

    const deadline = Date.now() + timeoutMs
    let sentPackets = 0
    let lookedAtTargets = false

    while (Date.now() <= deadline) {
      if (!isMiningSessionReady(expectedSessionEpoch)) {
        return sentPackets
      }

      const snapshot = buildMiningSnapshot(0)
      const packetTargets = snapshot.all.filter(target => (
        Number.isFinite(target.distance) &&
        target.distance <= BURST_BREAK_REACH &&
        (PREEMPTIVE_BREAK_TARGETS || (target.block && target.block.type !== 0))
      ))

      if (packetTargets.length) {
        if (!lookedAtTargets) {
          lookedAtTargets = true
          await ensureMiningLookAt()
          if (!isMiningSessionReady(expectedSessionEpoch)) {
            return sentPackets
          }
        }

        let sentThisRound = 0
        for (const target of packetTargets) {
          if (sendBreakPacketToTarget(target)) {
            sentThisRound++
          }
        }

        if (sentThisRound > 0) {
          sentPackets += sentThisRound
          lastDigTime = Date.now()
          try { bot.swingArm() } catch (error) {}
          updateBotStatus(username, 'копает')
        }
      }

      await sleep(BURST_BREAK_INTERVAL_MS)
    }

    return sentPackets
  }

  async function waitForBlockCleared(position, timeoutMs = FAST_DIG_CONFIRM_MS) {
    const deadline = Date.now() + timeoutMs

    while (Date.now() <= deadline) {
      if (!bot || !bot.world || !bot.player) return false
      const nextBlock = bot.blockAt(position)
      if (!nextBlock || nextBlock.type === 0) return true
      await sleep(FAST_DIG_RETRY_MS)
    }

    const finalBlock = bot?.blockAt?.(position)
    return !finalBlock || finalBlock.type === 0
  }

  async function tryFastDigBlock(block) {
    if (!isFastMiningAllowed() || !bot?._client || !block?.position) {
      return false
    }

    const vanillaDigTime = getSafeDigTime(block)
    if (vanillaDigTime < FAST_DIG_MIN_VANILLA_TIME_MS) {
      return false
    }

    const location = block.position

    try {
      await ensureMiningLookAt()
      const sent = sendBreakPacketToTarget({
        index: -1,
        position: location,
        block,
        distance: getPositionDistance(location),
        state: 'mineable'
      }, { preemptive: false, repeats: BURST_BREAK_REPEATS })
      if (sent) {
        bot.swingArm()
      }
      return await waitForBlockCleared(location)
    } catch (error) {
      return false
    }
  }

  async function digBlockWithTimeout(block) {
    let timeoutId = null

    try {
      if (await tryFastDigBlock(block)) {
        return
      }

      await Promise.race([
        bot.dig(block, isFastMiningAllowed()),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(createDigTimeoutError()), DIG_ACTION_TIMEOUT_MS)
        })
      ])
    } catch (error) {
      if (isDigTimeoutError(error)) {
        try { bot?.stopDigging() } catch (stopError) {}
      }
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  function logMiningDiagnostic(level, message) {
    const now = Date.now()
    if (now - lastMiningDiagnosticAt < MINING_DIAGNOSTIC_INTERVAL_MS) return
    lastMiningDiagnosticAt = now
    addLog(level, username, message)
  }

  function logEmptyTargetsDiagnostic(reason, snapshot) {
    const now = Date.now()
    const lastProgressAt = lastBlockMinedAt || lastDigTime
    const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity

    if (Number.isFinite(idleFor) && idleFor < EMPTY_TARGET_LOG_AFTER_IDLE_MS) {
      return
    }

    if (now - lastEmptyTargetsLogAt < EMPTY_TARGET_LOG_INTERVAL_MS) {
      return
    }

    lastEmptyTargetsLogAt = now
    const idleText = Number.isFinite(idleFor)
      ? `, простой ${Math.round(idleFor / 1000)}с`
      : ''

    addLog('warning', username, `${reason}${idleText}: ${describeMiningTargets(5, snapshot)}`)
  }

  function isMiningSessionReady(expectedSessionEpoch) {
    return Boolean(
      isCurrentSession(expectedSessionEpoch) &&
      bot &&
      bot.entity &&
      bot.world &&
      bot.player &&
      joinedSubserver &&
      !hasReconnectPendingLocal()
    )
  }

  function getTargetDistance(block) {
    if (!bot?.entity || !block?.position) return null

    try {
      return getPositionDistance(block.position)
    } catch (error) {
      return null
    }
  }

  function getPositionDistance(position) {
    if (!bot?.entity || !position) return null

    return position.offset(0.5, 0.5, 0.5).distanceTo(
      bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
    )
  }

  function getNearestMiningTargetDistance() {
    if (!bot?.entity || !miningTargets.length) return Infinity

    let nearestDistance = Infinity
    for (const position of miningTargets) {
      const distance = getPositionDistance(position)
      if (Number.isFinite(distance) && distance < nearestDistance) {
        nearestDistance = distance
      }
    }

    return nearestDistance
  }

  function isNearMiningTargets(extraReach = POSITION_NEAR_MINING_EXTRA_REACH) {
    const nearestDistance = getNearestMiningTargetDistance()
    return Number.isFinite(nearestDistance) && nearestDistance <= BURST_BREAK_REACH + extraReach
  }

  function adoptCurrentPositionAsStand(source = 'позиция') {
    if (!standPosition || !bot?.entity?.position) return
    activeStandPosition = bot.entity.position.clone()
    addLog('info', username, `Обновил рабочую позицию шахты (${source})`)
  }

  function formatPosition(position) {
    if (!position) return '?'
    const format = value => Number.isFinite(value) ? value.toFixed(2) : '?'
    return `${format(position.x)}, ${format(position.y)}, ${format(position.z)}`
  }

  function formatDistance(distance) {
    return Number.isFinite(distance) ? `${distance.toFixed(2)}м` : '?'
  }

  function getCoordinateHealthSnapshot() {
    const standAnchor = activeStandPosition || standPosition
    const standDelta = getStandDelta()
    const standDistance = standDelta?.distance3d ?? Infinity
    const nearestTargetDistance = getNearestMiningTargetDistance()
    const progressAgeMs = getMiningProgressAgeMs()
    let targetSnapshot = null

    try {
      targetSnapshot = bot?.world ? buildMiningSnapshot(0) : null
    } catch (error) {
      targetSnapshot = null
    }

    return {
      botPosition: bot?.entity?.position?.clone?.() || null,
      standAnchor,
      standDistance,
      nearestTargetDistance,
      progressAgeMs,
      hasRecentProgress: progressAgeMs <= POSITION_FAR_RECONNECT_IDLE_MS,
      nearStand: Number.isFinite(standDistance) && standDistance <= maxDistance,
      nearMiningTargets: Number.isFinite(nearestTargetDistance) && nearestTargetDistance <= BURST_BREAK_REACH + POSITION_NEAR_MINING_EXTRA_REACH,
      farFromStand: !Number.isFinite(standDistance) || standDistance > POSITION_FAR_DISTANCE,
      farFromMiningTargets: !Number.isFinite(nearestTargetDistance) || nearestTargetDistance > POSITION_FAR_DISTANCE,
      targetSnapshot,
      mineableTargets: targetSnapshot?.mineable?.length || 0,
      transientTargets: targetSnapshot?.transient?.length || 0,
      emptyTargets: targetSnapshot?.empty?.length || 0,
      unloadedTargets: targetSnapshot?.unloaded?.length || 0
    }
  }

  function isCoordinateHealthInWorkArea(health = getCoordinateHealthSnapshot()) {
    return Boolean(health.nearStand || health.nearMiningTargets)
  }

  function isCoordinateHealthFarFromWorkArea(health = getCoordinateHealthSnapshot()) {
    return Boolean(health.farFromStand && health.farFromMiningTargets)
  }

  function describeCoordinateHealth(health = getCoordinateHealthSnapshot()) {
    const progressText = Number.isFinite(health.progressAgeMs)
      ? `${Math.round(health.progressAgeMs / 1000)}с назад`
      : 'нет'
    const targetText = health.targetSnapshot
      ? `цели mineable=${health.mineableTargets}, transient=${health.transientTargets}, air=${health.emptyTargets}, unloaded=${health.unloadedTargets}`
      : 'цели неизвестны'

    return `bot=${formatPosition(health.botPosition)}, stand=${formatPosition(health.standAnchor)}, до stand=${formatDistance(health.standDistance)}, до блока=${formatDistance(health.nearestTargetDistance)}, добыча=${progressText}, ${targetText}`
  }

  function acceptHealthyCoordinateSnapshot(health = getCoordinateHealthSnapshot(), source = 'position') {
    if (!isCoordinateHealthInWorkArea(health)) return false

    if (health.nearMiningTargets && !health.nearStand && health.standDistance > maxDistance) {
      adoptCurrentPositionAsStand(source)
    }

    return true
  }

  async function confirmFarCoordinateState(expectedSessionEpoch, source = 'position-check') {
    let health = getCoordinateHealthSnapshot()

    for (let sample = 1; sample <= POSITION_RECHECK_SAMPLES; sample++) {
      if (!isMiningSessionReady(expectedSessionEpoch)) {
        return { confirmed: false, health, reason: 'session' }
      }

      health = getCoordinateHealthSnapshot()
      if (acceptHealthyCoordinateSnapshot(health, source)) {
        return { confirmed: false, health, reason: 'near-work-area' }
      }

      if (health.hasRecentProgress) {
        logMiningDiagnostic(
          'warning',
          `Позиция спорная, но добыча была ${Math.round(health.progressAgeMs / 1000)}с назад - перезаход пропущен: ${describeCoordinateHealth(health)}`
        )
        return { confirmed: false, health, reason: 'recent-progress' }
      }

      if (!isCoordinateHealthFarFromWorkArea(health)) {
        return { confirmed: false, health, reason: 'not-far' }
      }

      if (sample < POSITION_RECHECK_SAMPLES) {
        await sleep(POSITION_RECHECK_DELAY_MS)
      }
    }

    return { confirmed: true, health, reason: 'far-confirmed' }
  }

  function reconnectBecauseCoordinateFar(health, source = 'position-check') {
    addLog('warning', username, `Координаты не подтверждены (${source}) -> перезаход: ${describeCoordinateHealth(health)}`)
    diagEvent('coordinate-reconnect', { source, health })
    updateBotStatus(username, 'ожидание')
    activateStabilityCooldown('координаты не подтверждены')
    cleanupTimers()
    positionConfirmed = false
    scheduleReconnectLocal(3000, true, `coordinate-${source}`)
  }

  function getDiagnosticState(extra = {}) {
    let health = null
    try {
      if (bot?.entity) {
        const snapshot = getCoordinateHealthSnapshot()
        health = {
          botPosition: snapshot.botPosition,
          standDistance: Number.isFinite(snapshot.standDistance) ? Number(snapshot.standDistance.toFixed(2)) : snapshot.standDistance,
          nearestTargetDistance: Number.isFinite(snapshot.nearestTargetDistance) ? Number(snapshot.nearestTargetDistance.toFixed(2)) : snapshot.nearestTargetDistance,
          progressAgeMs: snapshot.progressAgeMs,
          nearWork: snapshot.nearStand || snapshot.nearMiningTargets,
          farFromWork: snapshot.farFromStand && snapshot.farFromMiningTargets,
          targets: {
            mineable: snapshot.mineableTargets,
            transient: snapshot.transientTargets,
            empty: snapshot.emptyTargets,
            unloaded: snapshot.unloadedTargets
          }
        }
      }
    } catch (error) {
      health = { error: error.message }
    }

    return {
      sessionEpoch,
      subserverJoinSeq,
      joinedSubserver,
      isOnline,
      status: monitorData.bots[username]?.status,
      positionConfirmed,
      entryButtonPressedThisJoin,
      entryButtonPressedJoinSeq,
      entryButtonReady: isEntryButtonPressedForCurrentJoin(),
      entryButtonFlowRunning,
      digLoopRunning,
      waitingForFall,
      fallCheckPassed,
      fallCheckActive,
      retryingFullServer,
      reconnectScheduled,
      reconnectDueInMs: reconnectDueAt ? Math.max(0, reconnectDueAt - Date.now()) : 0,
      hasReconnectPending: hasReconnectPendingLocal(),
      packetSafetyRemainingMs: getPacketSafetyRemaining(),
      miningProgressAgeMs: getMiningProgressAgeMs(),
      menuStage,
      currentWindow: bot?.currentWindow ? {
        id: bot.currentWindow.id,
        type: bot.currentWindow.type,
        title: String(bot.currentWindow.title || '').slice(0, 120)
      } : null,
      health,
      ...extra
    }
  }

  function isNoisyDiagnosticEvent(eventName) {
    return (
      eventName === 'menu-flow-skipped-before-spawn' ||
      eventName === 'menu-open-skipped-before-spawn' ||
      eventName === 'menu-flow-skipped-reconnect-pending' ||
      eventName === 'menu-open-skipped-reconnect-pending' ||
      eventName === 'menu-flow-queue-skipped-reconnect-pending' ||
      eventName === 'menu-flow-skipped-scanner' ||
      eventName === 'menu-open-skipped-scanner' ||
      eventName === 'menu-flow-queue-skipped-scanner' ||
      eventName === 'menu-open-skipped-limbo' ||
      eventName === 'menu-open-throttled' ||
      eventName === 'window-click-throttled' ||
      eventName === 'menu-flow-queued' ||
      eventName === 'client-write:position' ||
      eventName === 'client-packet:position'
    )
  }

  function getDiagnosticRepeatKey(eventName, details = {}) {
    return [
      eventName,
      details.source || '',
      details.state || '',
      details.reason || '',
      details.menuStage || menuStage
    ].join('|')
  }

  function diagEvent(eventName, details = {}) {
    if (!DETAILED_EVENT_LOGGING) return
    const now = Date.now()
    const summarizedDetails = summarizeDiagnosticDetails(eventName, details)

    if (isNoisyDiagnosticEvent(eventName)) {
      const repeatKey = getDiagnosticRepeatKey(eventName, summarizedDetails)
      const repeat = diagnosticRepeatState.get(repeatKey)

      if (repeat) {
        repeat.suppressed += 1
        repeat.lastAt = now
        repeat.lastDetails = summarizedDetails

        if (now - repeat.lastLogAt < DIAGNOSTIC_REPEAT_SUMMARY_MS) {
          return
        }

        diagnosticEventSeq += 1
        addDiagnosticLog(username, `#${diagnosticEventSeq} ${eventName} (повтор x${repeat.suppressed + 1})`, {
          ...getDiagnosticState(),
          ...repeat.lastDetails,
          repeated: repeat.suppressed + 1,
          repeatWindowMs: now - repeat.lastLogAt
        })
        repeat.suppressed = 0
        repeat.lastLogAt = now
        return
      }

      diagnosticRepeatState.set(repeatKey, {
        suppressed: 0,
        lastLogAt: now,
        lastAt: now,
        lastDetails: summarizedDetails
      })
    }

    diagnosticEventSeq += 1
    addDiagnosticLog(username, `#${diagnosticEventSeq} ${eventName}`, {
      ...getDiagnosticState(),
      ...summarizedDetails
    })
  }

  function diagPositionSnapshot(source = 'periodic', force = false) {
    if (!DETAILED_EVENT_LOGGING) return
    const now = Date.now()
    if (!force && now - lastPositionDiagnosticAt < DIAGNOSTIC_POSITION_INTERVAL_MS) {
      return
    }
    lastPositionDiagnosticAt = now
    diagEvent(`position-snapshot:${source}`, {})
  }

  function canMineBlock(block) {
    if (!block || block.type === 0) return false

    try {
      if (typeof bot?.canDigBlock === 'function') {
        return Boolean(bot.canDigBlock(block))
      }
    } catch (error) {
      return false
    }

    return block.diggable !== false
  }

  function isTransientMiningBlock(block) {
    const name = block?.name || ''
    return name === 'moving_piston' || name === 'piston_head'
  }

  function getTargetSnapshot(index) {
    const position = miningTargets[index]
    const block = bot?.blockAt?.(position)
    const target = {
      index,
      position,
      block,
      state: 'unloaded',
      name: 'не загружен',
      canMine: false,
      distance: getPositionDistance(position),
      diggable: null
    }

    if (!block) {
      return target
    }

    target.distance = getTargetDistance(block)
    target.diggable = block.diggable

    if (block.type === 0) {
      target.state = 'empty'
      target.name = 'air'
      return target
    }

    target.name = block.name || `#${block.type}`
    if (isTransientMiningBlock(block)) {
      target.state = 'transient'
      return target
    }

    target.canMine = canMineBlock(block)
    target.state = target.canMine ? 'mineable' : 'unreachable'
    return target
  }

  function buildMiningSnapshot(startIndex = 0) {
    const all = []

    for (let offset = 0; offset < miningTargets.length; offset++) {
      const index = (startIndex + offset) % miningTargets.length
      all.push(getTargetSnapshot(index))
    }

    return {
      all,
      mineable: all.filter(target => target.state === 'mineable'),
      unreachable: all.filter(target => target.state === 'unreachable'),
      transient: all.filter(target => target.state === 'transient'),
      empty: all.filter(target => target.state === 'empty'),
      unloaded: all.filter(target => target.state === 'unloaded')
    }
  }

  function formatTargetSnapshot(target) {
    const { position } = target
    const distance = Number.isFinite(target.distance)
      ? `, ${target.distance.toFixed(2)}м`
      : ''
    const diggable = target.diggable == null || target.state === 'empty' || target.state === 'unloaded' || target.state === 'transient'
      ? ''
      : `, diggable=${target.diggable}`

    return `${position.x},${position.y},${position.z}=${target.name}${distance}${diggable}`
  }

  function describeMiningTargets(limit = 5, snapshot = null) {
    const targets = (snapshot?.all || buildMiningSnapshot(0).all).slice(0, limit)
    const samples = targets.map(formatTargetSnapshot)
    const total = snapshot?.all?.length || miningTargets.length
    const suffix = total > limit ? `; +${total - limit} ещё` : ''

    return `${samples.join('; ')}${suffix}`
  }

  function hasAnyMiningTarget() {
    if (!bot || !bot.world || !bot.player) return false
    const snapshot = buildMiningSnapshot(0)
    return snapshot.mineable.length > 0 || (isFastMiningAllowed() && snapshot.all.some(target => target.block && target.block.type !== 0))
  }

  async function waitForAnyMiningTarget(expectedSessionEpoch, timeoutMs = EMPTY_TARGET_RECHECK_MS) {
    const deadline = Date.now() + Math.max(0, timeoutMs)

    do {
      if (!isCurrentSession(expectedSessionEpoch) || !bot || !joinedSubserver) {
        return false
      }
      if (hasAnyMiningTarget()) {
        return true
      }
      await sleep(EMPTY_TARGET_RECHECK_MS)
    } while (Date.now() <= deadline)

    return hasAnyMiningTarget()
  }

  async function waitAfterEmptyTargets() {
    const delay = Math.max(EMPTY_SCAN_DELAY_MS, EMPTY_TARGET_RECHECK_MS)
    if (delay > 0) {
      await sleep(delay)
    }
  }

  async function tryRescueEmptyGenerator(expectedSessionEpoch, snapshot) {
    if (
      !entryButtonPosition ||
      EMPTY_TARGET_BUTTON_RETRY_MS <= 0 ||
      EMPTY_TARGET_BUTTON_RETRY_LIMIT <= 0 ||
      emptyTargetButtonRetryCount >= EMPTY_TARGET_BUTTON_RETRY_LIMIT ||
      entryButtonFlowRunning ||
      !isMiningSessionReady(expectedSessionEpoch)
    ) {
      return false
    }

    const now = Date.now()
    const lastProgressAt = lastBlockMinedAt || lastDigTime
    const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity
    if (!Number.isFinite(idleFor) || idleFor < EMPTY_TARGET_BUTTON_RETRY_MS) {
      return false
    }

    if (now - lastEmptyTargetButtonRetryAt < EMPTY_TARGET_BUTTON_RETRY_COOLDOWN_MS) {
      return false
    }

    const allTargetsAreAir = snapshot?.all?.length > 0 && snapshot.all.every(target => target.state === 'empty')
    if (!allTargetsAreAir) {
      return false
    }

    emptyTargetButtonRetryCount += 1
    lastEmptyTargetButtonRetryAt = now
    addLog(
      'warning',
      username,
      `Генератор пуст ${Math.round(idleFor / 1000)}с -> аварийно повторяю кнопку (${emptyTargetButtonRetryCount}/${EMPTY_TARGET_BUTTON_RETRY_LIMIT})`
    )

    const pressed = await pressEntryButton({ waitAfter: false })
    if (!pressed || !isMiningSessionReady(expectedSessionEpoch)) {
      return false
    }

    const burstPackets = await runBurstBreakWindow(expectedSessionEpoch, BURST_BREAK_WINDOW_MS)
    if (burstPackets > 0 || await waitForAnyMiningTarget(expectedSessionEpoch, ENTRY_BUTTON_CONFIRM_MS)) {
      return true
    }

    addLog('warning', username, 'Аварийная кнопка нажата, но шахта всё ещё не подтвердила блоки')
    return false
  }

  async function tryRecoverUnloadedFarTargets(expectedSessionEpoch, snapshot) {
    if (
      positionConfirmed ||
      !isMiningSessionReady(expectedSessionEpoch) ||
      !snapshot?.all?.length ||
      !snapshot.all.every(target => target.state === 'unloaded')
    ) {
      return false
    }

    const nearestDistance = Math.min(
      ...snapshot.all.map(target => Number.isFinite(target.distance) ? target.distance : Infinity)
    )
    if (!Number.isFinite(nearestDistance) || nearestDistance <= POSITION_FAR_DISTANCE) {
      return false
    }

    const now = Date.now()
    const lastProgressAt = lastBlockMinedAt || lastDigTime
    const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity
    if (!Number.isFinite(idleFor) || idleFor < EMPTY_TARGET_BUTTON_RETRY_MS) {
      return false
    }

    const confirmed = await confirmFarCoordinateState(expectedSessionEpoch, 'unloaded-targets')
    if (!confirmed.confirmed) {
      return false
    }

    reconnectBecauseCoordinateFar(confirmed.health, 'цели не загружены')
    return true
  }

  async function recoverEmptyMiningTargets(expectedSessionEpoch, reason) {
    const snapshot = buildMiningSnapshot(0)
    const emptyLogBefore = lastEmptyTargetsLogAt
    logEmptyTargetsDiagnostic(reason, snapshot)
    diagPositionSnapshot('empty-targets')
    if (lastEmptyTargetsLogAt !== emptyLogBefore) {
      diagEvent('recover-empty-targets', {
        reason,
        targets: snapshot.all.map(formatTargetSnapshot)
      })
    }

    if (await tryRecoverUnloadedFarTargets(expectedSessionEpoch, snapshot)) {
      return false
    }

    if (await tryRescueEmptyGenerator(expectedSessionEpoch, snapshot)) {
      return true
    }

    const burstPackets = await runBurstBreakWindow(expectedSessionEpoch, Math.min(BURST_BREAK_WINDOW_MS, 250))
    if (burstPackets > 0) {
      return true
    }

    await waitAfterEmptyTargets()
    return true
  }

  async function recoverTransientMiningTargets(expectedSessionEpoch, snapshot) {
    if (isFastMiningAllowed() && snapshot?.transient?.length) {
      await ensureMiningLookAt()
      let sentPackets = 0
      for (const target of snapshot.transient) {
        if (!isMiningSessionReady(expectedSessionEpoch)) return false
        if (sendBreakPacketToTarget(target, { preemptive: false, repeats: TRANSIENT_BREAK_REPEATS })) {
          sentPackets++
        }
      }

      if (sentPackets > 0) {
        lastDigTime = Date.now()
        try { bot.swingArm() } catch (error) {}
      }
    }

    const now = Date.now()
    const lastProgressAt = lastBlockMinedAt || lastDigTime
    const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity
    if (
      Number.isFinite(idleFor) &&
      idleFor >= MOVING_PISTON_LOG_AFTER_IDLE_MS &&
      now - lastMiningDiagnosticAt >= MINING_DIAGNOSTIC_INTERVAL_MS
    ) {
      logMiningDiagnostic('warning', `Цели временно moving_piston, жду окно добычи: ${describeMiningTargets(5, snapshot)}`)
    }

    await sleep(MOVING_PISTON_WAIT_MS)
    return isMiningSessionReady(expectedSessionEpoch)
  }

  async function recoverUnreachableMiningTargets(expectedSessionEpoch, snapshot) {
    const burstPackets = await runBurstBreakWindow(expectedSessionEpoch, Math.min(BURST_BREAK_WINDOW_MS, 350))
    if (burstPackets > 0) {
      return isMiningSessionReady(expectedSessionEpoch)
    }

    const standDelta = getStandDelta()
    if (standPosition && standDelta && standDelta.distance3d > maxDistance) {
      logMiningDiagnostic('warning', `Цели вне досягаемости, бот смещён на ${standDelta.distance3d.toFixed(2)}м -> возвращаю на точку`)
      await returnToStandPosition()
      return isMiningSessionReady(expectedSessionEpoch)
    }

    const sample = snapshot.unreachable[0]
    if (sample) {
      logMiningDiagnostic(
        'warning',
        `Блоки есть, но копать их нельзя: ${formatTargetSnapshot(sample)}`
      )
    }

    await waitAfterEmptyTargets()
    return isMiningSessionReady(expectedSessionEpoch)
  }

  function getDigFailureKind(error) {
    if (isDigTimeoutError(error)) return 'timeout'

    const message = error && error.message ? error.message : String(error)
    if (message.includes('block is out of reach')) return 'unreachable'
    if (message.includes('digging aborted') ||
        message.includes('block no longer exists') ||
        message.includes('No block has been dug')) {
      return 'stale'
    }

    return 'error'
  }

  function resetSessionState() {
    invalidateSession()
    setLifecycleState('connecting', 'reset-session')
    joinedSubserver = false
    spawnGraceUntil = 0
    isReturningToPosition = false
    waitingForFall = false
    initialY = null
    fallCheckPassed = false
    fallCheckActive = false
    limboSavedPhysicsEnabled = null
    positionConfirmed = false
    activeStandPosition = standPosition ? standPosition.clone() : null
    lastEntryButtonAttemptAt = 0
    entryButtonPressedThisJoin = false
    entryButtonPressedJoinSeq = 0
    entryButtonFlowRunning = false
    subserverJoinSeq = 0
    emptyTargetButtonRetryCount = 0
    lastEmptyTargetButtonRetryAt = 0
    lastBlockMinedAt = 0
    isOnline = false
    scannerHoldUntil = 0
    lastScannerLogAt = 0
    scannerWaitChallengeActive = false
    limboSuccessSeen = false
    lastLimboPositionPacket = null
    try { if (limboFallStartTimer) clearTimeout(limboFallStartTimer) } catch(e){}
    limboFallStartTimer = null
    lastMiningDiagnosticAt = 0
    lastEmptyTargetsLogAt = 0
    lastMiningLookAt = 0
    lastReactiveBreakAt = 0
    lastPositionDiagnosticAt = 0
    diagnosticRepeatState.clear()
    lastMenuOpenAttemptAt = 0
    lastMenuAttempt = 0
    menuFlowQueued = false
    speedGuardStartedAt = 0
    speedGuardLowSince = 0
    speedGuardRecoveries = 0
    speedGuardCheckRunning = false
    setMenuStage('idle', 'reset-session')
    packetOnlyStartedAt = 0
    breakPacketSecondWindowStartedAt = 0
    breakPacketSecondWindowCount = 0
    breakPacketBurstWindowStartedAt = 0
    breakPacketBurstWindowCount = 0
    lastBreakPacketThrottleLogAt = 0
    lastBreakPacketByTarget.clear()
    pendingPacketBreaks.clear()
    lastCountedBlockByTarget.clear()
  }

  function disposeBotInstance() {
    cleanupTimers()
    resetSessionState()
    reconnectScheduled = false
    reconnectReason = ''
    try { if (bot) bot.removeAllListeners() } catch(e){}
    try { if (bot) bot.quit() } catch(e){}
    bot = null
  }


  function cleanupActiveSessionTimers(source = 'session-cleanup') {
    try { if (menuTimer) clearTimeout(menuTimer) } catch(e){}
    try { if (positionCheckTimer) clearInterval(positionCheckTimer) } catch(e){}
    try { if (positionCheckStartTimer) clearTimeout(positionCheckStartTimer) } catch(e){}
    try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch(e){}
    try { if (limboFallStartTimer) clearTimeout(limboFallStartTimer) } catch(e){}
    try { if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer) } catch(e){}
    try { if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer) } catch(e){}
    try { if (keepAliveTimer) clearInterval(keepAliveTimer) } catch(e){}
    try { if (fullServerRetryTimer) clearTimeout(fullServerRetryTimer) } catch(e){}
    try { if (postJoinStartTimer) clearTimeout(postJoinStartTimer) } catch(e){}
    try { if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer) } catch(e){}
    try { if (menuFlowWakeTimer) clearTimeout(menuFlowWakeTimer) } catch(e){}
    try { if (speedGuardTimer) clearInterval(speedGuardTimer) } catch(e){}
    try { restoreLimboPhysics(source) } catch(e){}

    menuTimer = null
    positionCheckTimer = null
    positionCheckStartTimer = null
    fallCheckTimer = null
    limboFallStartTimer = null
    limboFallIntervalTimer = null
    limboFallTimeoutTimer = null
    keepAliveTimer = null
    fullServerRetryTimer = null
    postJoinStartTimer = null
    entryButtonWatchdogTimer = null
    menuFlowWakeTimer = null
    speedGuardTimer = null
    menuFlowWakeDueAt = 0
    menuFlowRunning = false
    menuFlowQueued = false
    entryButtonFlowRunning = false
    retryingFullServer = false
    fallCheckActive = false
  }

  function cleanupTimers() {
    try { if (menuTimer) clearTimeout(menuTimer) } catch(e){}
    try { if (reconnectTimer) clearTimeout(reconnectTimer) } catch(e){}
    try { if (reconnectGraceTimer) clearTimeout(reconnectGraceTimer) } catch(e){}
    try { if (positionCheckTimer) clearInterval(positionCheckTimer) } catch(e){}
    try { if (positionCheckStartTimer) clearTimeout(positionCheckStartTimer) } catch(e){}
    try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch(e){}
    try { if (limboFallStartTimer) clearTimeout(limboFallStartTimer) } catch(e){}
    try { if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer) } catch(e){}
    try { if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer) } catch(e){}
    try { if (keepAliveTimer) clearInterval(keepAliveTimer) } catch(e){}
    try { if (fullServerRetryTimer) clearTimeout(fullServerRetryTimer) } catch(e){}
    try { if (postJoinStartTimer) clearTimeout(postJoinStartTimer) } catch(e){}
    try { if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer) } catch(e){}
    try { if (recreateRetryTimer) clearTimeout(recreateRetryTimer) } catch(e){}
    try { if (menuFlowWakeTimer) clearTimeout(menuFlowWakeTimer) } catch(e){}
    try { if (speedGuardTimer) clearInterval(speedGuardTimer) } catch(e){}
    try { restoreLimboPhysics('cleanup') } catch(e){}
    menuTimer = null
    reconnectTimer = null
    reconnectGraceTimer = null
    positionCheckTimer = null
    positionCheckStartTimer = null
    fallCheckTimer = null
    limboFallStartTimer = null
    limboFallIntervalTimer = null
    limboFallTimeoutTimer = null
    keepAliveTimer = null
    fullServerRetryTimer = null
    postJoinStartTimer = null
    entryButtonWatchdogTimer = null
    recreateRetryTimer = null
    menuFlowWakeTimer = null
    speedGuardTimer = null
    menuFlowWakeDueAt = 0
    menuFlowRunning = false
    menuFlowQueued = false
    entryButtonFlowRunning = false
    reconnectScheduled = false
    reconnectDueAt = 0
    reconnectReason = ''
    retryingFullServer = false
    fallCheckActive = false
  }

  async function pressEntryButton(options = {}) {
    const waitAfter = options.waitAfter !== false
    if (!entryButtonPosition || !bot || !bot.entity || !joinedSubserver) {
      diagEvent('entry-button-skip', {
        waitAfter,
        hasEntryButton: Boolean(entryButtonPosition),
        hasBot: Boolean(bot),
        hasEntity: Boolean(bot?.entity),
        joinedSubserver
      })
      return false
    }

    const now = Date.now()
    if (now - lastEntryButtonAttemptAt < ENTRY_BUTTON_RETRY_INTERVAL_MS) {
      diagEvent('entry-button-throttled', {
        sinceLastAttemptMs: now - lastEntryButtonAttemptAt,
        retryIntervalMs: ENTRY_BUTTON_RETRY_INTERVAL_MS
      })
      return false
    }
    lastEntryButtonAttemptAt = now

    let lastError = 'unknown error'

    for (let attempt = 1; attempt <= 6; attempt++) {
      if (!bot || !bot.entity || !joinedSubserver) return false

      const buttonBlock = bot.blockAt(entryButtonPosition)
      diagEvent('entry-button-attempt', {
        attempt,
        waitAfter,
        buttonPosition: entryButtonPosition,
        buttonBlock: buttonBlock ? { name: buttonBlock.name, type: buttonBlock.type, position: buttonBlock.position } : null
      })
      if (!buttonBlock || buttonBlock.type === 0) {
        lastError = 'button block not found'
        await sleep(250)
        continue
      }

      const targetPosition = buttonBlock.position.offset(0.5, 0.5, 0.5)
      const distance = bot.entity.position.distanceTo(targetPosition)
      if (distance > 4.7) {
        addLog('warning', username, `Кнопка генератора слишком далеко: ${distance.toFixed(2)}м`)
        diagEvent('entry-button-too-far', { distance, targetPosition })
        return false
      }

      try {
        addLog('info', username, `Нажимаю кнопку генератора (${entryButtonPosition.x}, ${entryButtonPosition.y}, ${entryButtonPosition.z})`)
        await bot.lookAt(targetPosition, true)
        await sleep(40 + Math.floor(Math.random() * 40))
        await bot.activateBlock(buttonBlock)
        if (waitAfter && ENTRY_BUTTON_AFTER_PRESS_WAIT_MS > 0) {
          await sleep(ENTRY_BUTTON_AFTER_PRESS_WAIT_MS)
        }
        addLog('success', username, 'Кнопка генератора нажата')
        diagEvent('entry-button-pressed', { attempt, distance })
        return true
      } catch (error) {
        lastError = error.message
        diagEvent('entry-button-error', { attempt, error })
        await sleep(200)
      }
    }

    addLog('warning', username, `Не удалось нажать кнопку генератора: ${lastError}`)
    diagEvent('entry-button-failed', { lastError })
    return false
  }

  async function pressEntryButtonOnJoin(expectedSessionEpoch) {
    if (!entryButtonPosition) return { pressed: true, confirmed: true }

    for (let attempt = 1; attempt <= ENTRY_BUTTON_STARTUP_ATTEMPTS; attempt++) {
      diagEvent('entry-button-join-attempt', { attempt, maxAttempts: ENTRY_BUTTON_STARTUP_ATTEMPTS })
      if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) {
        return { pressed: false, confirmed: false }
      }

      const pressed = await pressEntryButton({ waitAfter: false })
      if (pressed) {
        const burstPackets = await runBurstBreakWindow(expectedSessionEpoch, BURST_BREAK_WINDOW_MS)
        diagEvent('entry-button-join-pressed', { attempt, burstPackets })
        if (burstPackets > 0 || await waitForAnyMiningTarget(expectedSessionEpoch, ENTRY_BUTTON_CONFIRM_MS)) {
          return { pressed: true, confirmed: true }
        }
        addLog('warning', username, 'Кнопка генератора нажата, но реакция шахты не подтверждена; продолжаю без повторного клика')
        return { pressed: true, confirmed: false }
      }

      if (attempt < ENTRY_BUTTON_STARTUP_ATTEMPTS) {
        addLog('warning', username, `Кнопка генератора не нажалась, повтор старта ${attempt + 1}/${ENTRY_BUTTON_STARTUP_ATTEMPTS}`)
        await sleep(ENTRY_BUTTON_STARTUP_RETRY_MS)
      }
    }

    addLog('warning', username, 'Кнопка генератора не нажалась после входа')
    return { pressed: false, confirmed: false }
  }

  async function runEntryButtonFlow(expectedSessionEpoch, source = 'postjoin') {
    diagEvent('entry-button-flow-start', { source })
    if (!entryButtonPosition) {
      entryButtonPressedThisJoin = true
      entryButtonPressedJoinSeq = subserverJoinSeq
      diagEvent('entry-button-flow-no-button-configured', { source })
      return true
    }

    if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) {
      diagEvent('entry-button-flow-not-ready', { source, expectedSessionEpoch })
      return false
    }

    if (isEntryButtonPressedForCurrentJoin()) {
      diagEvent('entry-button-flow-already-ready', { source })
      return true
    }

    if (entryButtonFlowRunning) {
      diagEvent('entry-button-flow-already-running', { source })
      return false
    }

    entryButtonFlowRunning = true
    try {
      const result = await pressEntryButtonOnJoin(expectedSessionEpoch)
      if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) {
        return false
      }

      if (result?.pressed) {
        entryButtonPressedThisJoin = true
        entryButtonPressedJoinSeq = subserverJoinSeq
        try { if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer) } catch(e){}
        entryButtonWatchdogTimer = null
        diagEvent('entry-button-flow-success', { source, result })
        return true
      }

      if (source === 'watchdog') {
        addLog('warning', username, 'Post-join кнопка генератора всё ещё не нажата, оставляю повтор')
      }
      return false
    } catch (error) {
      addLog('warning', username, `Ошибка автокнопки: ${error.message}`)
      diagEvent('entry-button-flow-error', { source, error })
      return false
    } finally {
      entryButtonFlowRunning = false
    }
  }

  function scheduleEntryButtonWatchdog(expectedSessionEpoch) {
    if (!entryButtonPosition || isEntryButtonPressedForCurrentJoin() || !joinedSubserver || !bot) return
    try { if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer) } catch(e){}

    entryButtonWatchdogTimer = setTimeout(async () => {
      entryButtonWatchdogTimer = null
      if (!entryButtonPosition || isEntryButtonPressedForCurrentJoin()) return
      if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) return

      addLog('warning', username, 'Кнопка генератора не была нажата после входа -> повторяю post-join')
      const pressed = await runEntryButtonFlow(expectedSessionEpoch, 'watchdog')
      if (pressed && isCurrentSession(expectedSessionEpoch) && joinedSubserver && bot) {
        startDiggingLoop(expectedSessionEpoch).catch(() => {})
        return
      }

      if (!pressed && isCurrentSession(expectedSessionEpoch) && joinedSubserver && bot && !isEntryButtonPressedForCurrentJoin()) {
        scheduleEntryButtonWatchdog(expectedSessionEpoch)
      }
    }, ENTRY_BUTTON_WATCHDOG_MS)
  }

  function schedulePostJoinFlow() {
    if (!joinedSubserver || !bot) return
    const flowSessionEpoch = sessionEpoch

    if (standPosition) {
      startPositionCheck()
    }

    scheduleEntryButtonWatchdog(flowSessionEpoch)

    try { if (postJoinStartTimer) clearTimeout(postJoinStartTimer) } catch(e){}
    postJoinStartTimer = null

    postJoinStartTimer = setTimeout(async () => {
      postJoinStartTimer = null
      if (!isCurrentSession(flowSessionEpoch) || !joinedSubserver || !bot) return
      const buttonReady = await runEntryButtonFlow(flowSessionEpoch, 'postjoin')
      if (!isCurrentSession(flowSessionEpoch) || !joinedSubserver || !bot || hasReconnectPendingLocal()) return
      if (!buttonReady) {
        addLog('warning', username, 'Кнопка генератора не нажата после входа - добычу не запускаю до повтора')
        scheduleEntryButtonWatchdog(flowSessionEpoch)
        return
      }
      startDiggingLoop(flowSessionEpoch).catch(() => {})
    }, POST_JOIN_DIG_START_MS + Math.floor(Math.random() * 25))
  }

  // ============================================================================
  // ============================================================================
  function startKeepAliveMonitor() {
    if (keepAliveTimer) clearInterval(keepAliveTimer)
    
    keepAliveTimer = setInterval(() => {
      if (!bot || !bot._client || !joinedSubserver) return
      const now = Date.now()

      const timeSinceLastKeepAlive = now - lastKeepAlive
      
      if (timeSinceLastKeepAlive > 25000) {
        addLog('warning', username, `! Нет keep-alive ${Math.round(timeSinceLastKeepAlive/1000)}с`)
        
        if (timeSinceLastKeepAlive > 28000 && getReconnectGraceDelay() <= 0) {
          addLog('error', username, 'Keep-alive таймаут -> перезапуск')
          diagEvent('keepalive-timeout', { timeSinceLastKeepAlive })
          cleanupTimers()
          updateBotStatus(username, 'ожидание')
          scheduleReconnectLocal(5000, false, 'keepalive-timeout')
        }
      }
    }, 5000)
  }

  // ============================================================================
  // ============================================================================
  async function walkToActiveStandPosition() {
    const initialDelta = getStandDelta()
    if (!initialDelta) return false

    if (initialDelta.distance3d <= maxDistance) {
      return true
    }

    addLog('warning', username, `Отошёл от рабочей точки на ${initialDelta.distance3d.toFixed(2)}м (лимит ${maxDistance}м), возвращаюсь`)
    updateBotStatus(username, 'возврат')
    isReturningToPosition = true

    try {
      bot.clearControlStates()

      const timeout = Date.now() + POSITION_RETURN_TIMEOUT
      let stuck = 0

      while (bot && bot.entity && joinedSubserver) {
        const currentHealth = getCoordinateHealthSnapshot()
        if (acceptHealthyCoordinateSnapshot(currentHealth, 'return-loop')) {
          break
        }

        const currentDelta = getStandDelta()
        if (!currentDelta || currentDelta.distance3d <= maxDistance) {
          break
        }

        if (Date.now() > timeout) {
          addLog('warning', username, `Таймаут возврата: ${describeCoordinateHealth(currentHealth)}`)
          break
        }

        if (currentDelta.distance2d > 0.05) {
          const yaw = Math.atan2(-currentDelta.dx, -currentDelta.dz)
          bot.look(yaw, 0, true)
          bot.setControlState('forward', true)

          const oldPos = bot.entity.position.clone()
          await sleep(200)
          if (bot.entity.position.distanceTo(oldPos) < 0.1) {
            stuck++
            if (stuck > 5) {
              bot.setControlState('jump', true)
              await sleep(100)
              bot.setControlState('jump', false)
              stuck = 0
            }
          } else {
            stuck = 0
          }
        } else {
          bot.clearControlStates()
          await sleep(100)
        }
      }

      bot.clearControlStates()
      const finalHealth = getCoordinateHealthSnapshot()
      if (!acceptHealthyCoordinateSnapshot(finalHealth, 'return-final')) {
        addLog('warning', username, `Не смог подтвердить рабочую позицию после возврата: ${describeCoordinateHealth(finalHealth)}`)
        return false
      }

      addLog('success', username, 'Рабочая позиция подтверждена')
      return true
    } catch (error) {
      addLog('error', username, `Ошибка возврата: ${error.message}`)
      return false
    } finally {
      isReturningToPosition = false
      if (bot && bot.entity && joinedSubserver) {
        updateBotStatus(username, 'ожидание')
      }
    }
  }

  async function returnToStandPosition() {
    if (!standPosition || !bot || !bot.entity || !joinedSubserver || isReturningToPosition) {
      return false
    }

    const health = getCoordinateHealthSnapshot()
    if (acceptHealthyCoordinateSnapshot(health, 'position-return')) {
      return true
    }

    if (isCoordinateHealthFarFromWorkArea(health)) {
      const confirmed = await confirmFarCoordinateState(sessionEpoch, 'position-return')
      if (!confirmed.confirmed) {
        return true
      }

      reconnectBecauseCoordinateFar(confirmed.health, 'возврат к точке')
      return false
    }

    return walkToActiveStandPosition()
  }

  async function waitForPostJoinPosition(expectedSessionEpoch) {
    if (!standPosition || POST_JOIN_POSITION_GRACE_MS <= 0) {
      return true
    }

    const initialHealth = getCoordinateHealthSnapshot()
    if (acceptHealthyCoordinateSnapshot(initialHealth, 'postjoin-initial')) {
      return true
    }

    addLog('info', username, `Жду подтверждение координат после входа: ${describeCoordinateHealth(initialHealth)}`)
    const deadline = Date.now() + POST_JOIN_POSITION_GRACE_MS

    while (Date.now() <= deadline) {
      if (!isCurrentSession(expectedSessionEpoch) || !bot || !bot.entity || !joinedSubserver || hasReconnectPendingLocal()) {
        return false
      }

      const currentHealth = getCoordinateHealthSnapshot()
      if (acceptHealthyCoordinateSnapshot(currentHealth, 'postjoin-wait')) {
        return true
      }

      await sleep(250)
    }

    const confirmed = await confirmFarCoordinateState(expectedSessionEpoch, 'postjoin-timeout')
    if (confirmed.confirmed) {
      reconnectBecauseCoordinateFar(confirmed.health, 'postjoin')
      return false
    }

    return true
  }

  async function checkAndReturnToPosition() {
    if (!standPosition || !bot || !bot.entity || !joinedSubserver || 
        isReturningToPosition || !positionConfirmed) return

    diagPositionSnapshot('position-watchdog')
    const health = getCoordinateHealthSnapshot()
    if (acceptHealthyCoordinateSnapshot(health, 'position-watchdog')) {
      return
    }

    if (isCoordinateHealthFarFromWorkArea(health)) {
      const confirmed = await confirmFarCoordinateState(sessionEpoch, 'position-watchdog')
      if (!confirmed.confirmed) {
        return
      }

      reconnectBecauseCoordinateFar(confirmed.health, 'watchdog')
      return
    }

    if (health.standDistance > maxDistance) {
      await returnToStandPosition()
    }
  }

  function startPositionCheck() {
    if (!standPosition || !joinedSubserver || positionCheckTimer || positionCheckStartTimer) return

    positionCheckStartTimer = setTimeout(() => {
      positionCheckStartTimer = null
      if (!joinedSubserver || positionCheckTimer) return
      
      positionCheckTimer = setInterval(() => {
        checkAndReturnToPosition().catch(() => {})
      }, POSITION_CHECK_INTERVAL)
      
      addLog('info', username, 'Проверка позиции активирована')
    }, 30000)
  }

  // ============================================================================
  // ============================================================================
  function encodeVarInt(value) {
    const bytes = []
    let remaining = Number(value) >>> 0
    do {
      let current = remaining & 0x7f
      remaining >>>= 7
      if (remaining !== 0) current |= 0x80
      bytes.push(current)
    } while (remaining !== 0)
    return Buffer.from(bytes)
  }

  function encodeMinecraftString(value) {
    const text = Buffer.from(String(value), 'utf8')
    return Buffer.concat([encodeVarInt(text.length), text])
  }

  function summarizeClientPacketPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload
    const summary = { ...payload }
    if (Buffer.isBuffer(summary.data)) {
      summary.data = {
        length: summary.data.length,
        hex: summary.data.toString('hex').slice(0, 48)
      }
    }
    return summary
  }

  function writeClientPacket(packetName, payload, source) {
    if (!bot?._client) return false
    try {
      bot._client.write(packetName, payload)
      diagEvent(`client-write:${packetName}`, {
        source,
        payload: summarizeClientPacketPayload(payload)
      })
      return true
    } catch (error) {
      diagEvent(`client-write-error:${packetName}`, { source, error })
      return false
    }
  }

  function sendClientIdentityPackets(source = 'limbo') {
    writeClientPacket('settings', {
      locale: 'ru_ru',
      viewDistance: 8,
      chatFlags: 0,
      chatColors: true,
      skinParts: 0x7f,
      mainHand: 1
    }, source)

    writeClientPacket('custom_payload', {
      channel: 'minecraft:brand',
      data: encodeMinecraftString('vanilla')
    }, source)
  }

  function confirmLimboTeleport(teleportId, source = 'limbo-position') {
    const numericTeleportId = Number(teleportId)
    if (!Number.isFinite(numericTeleportId)) return false
    return writeClientPacket('teleport_confirm', {
      teleportId: numericTeleportId
    }, source)
  }

  function pauseLimboPhysics(source = 'limbo') {
    if (!bot) return
    try {
      if (limboSavedPhysicsEnabled === null) {
        limboSavedPhysicsEnabled = bot.physicsEnabled
      }
      bot.physicsEnabled = false
      bot.clearControlStates()
      diagEvent('limbo-physics-paused', { source, previous: limboSavedPhysicsEnabled })
    } catch (error) {
      diagEvent('limbo-physics-pause-error', { source, error })
    }
  }

  function restoreLimboPhysics(source = 'limbo') {
    if (!bot || limboSavedPhysicsEnabled === null) return
    try {
      bot.physicsEnabled = limboSavedPhysicsEnabled
      diagEvent('limbo-physics-restored', { source, restored: limboSavedPhysicsEnabled })
    } catch (error) {
      diagEvent('limbo-physics-restore-error', { source, error })
    } finally {
      limboSavedPhysicsEnabled = null
    }
  }

  function clearLimboTimers() {
    try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch (error) {}
    try { if (limboFallStartTimer) clearTimeout(limboFallStartTimer) } catch (error) {}
    try { if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer) } catch (error) {}
    try { if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer) } catch (error) {}
    fallCheckTimer = null
    limboFallStartTimer = null
    limboFallIntervalTimer = null
    limboFallTimeoutTimer = null
  }

  function completeLimboWait(source, details = {}) {
    if (joinedSubserver) return
    clearLimboTimers()
    restoreLimboPhysics(source)
    waitingForFall = false
    fallCheckPassed = true
    fallCheckActive = false
    initialY = null
    setLifecycleState('menu', source, { limboComplete: true })
    diagEvent('limbo-complete-local', { source, ...details })
  }

  function startActiveFallCheck(start = {}) {
    const source = start.source || 'unknown'
    const canRunFallCheck = Boolean(
      FEATURE_ACTIVE_FALL_CHECK_ENABLED &&
      (scannerWaitChallengeActive || source === 'scanner-recent-position' || source === 'scanner-position-packet')
    )
    if (!canRunFallCheck) {
      diagEvent('limbo-active-fall-disabled', { source: start.source || 'unknown' })
      return false
    }
    if (!bot || !bot._client || fallCheckActive || fallCheckPassed || joinedSubserver) return
    const fallSessionEpoch = sessionEpoch
    const startX = Number(start.x)
    const rawStartY = Number(start.y)
    const startY = rawStartY
    const startZ = Number(start.z)
    const teleportId = Number(start.teleportId)
    if (!Number.isFinite(startX) || !Number.isFinite(startY) || !Number.isFinite(startZ) || !Number.isFinite(teleportId)) {
      diagEvent('limbo-fall-start-rejected', {
        source,
        reason: 'missing-server-position-packet',
        start
      })
      return false
    }

    clearLimboTimers()
    pauseLimboPhysics(source)
    sendClientIdentityPackets(source)
    confirmLimboTeleport(teleportId, source)

    waitingForFall = true
    fallCheckPassed = false
    fallCheckActive = true
    initialY = startY
    setLifecycleState('botfilter', source, { fallCheckActive: true })

    let tick = 0
    let currentY = startY
    const startedAt = Date.now()
    const finishPacketTicks = getFinishPacketTicks(LIMBO_FALL_TICKS)
    const expectedTotalMs = Math.max(
      getMinimumCheckMs({ fallingCheckTicks: LIMBO_FALL_TICKS, packetMs: LIMBO_FALL_PACKET_MS }),
      finishPacketTicks * LIMBO_FALL_PACKET_MS
    )

    addLog(
      'info',
      username,
      `LimboFilter - ванильная траектория (${LIMBO_FALL_TICKS}т/${LIMBO_FALL_PACKET_MS}мс, X=${startX}, Y=${startY}, Z=${startZ})`
    )
    diagEvent('limbo-fall-start', {
      source: start.source,
      startX,
      startY,
      rawStartY,
      normalizedStartY: false,
      startZ,
      teleportId,
      ticks: LIMBO_FALL_TICKS,
      finishPacketTicks,
      packetMs: LIMBO_FALL_PACKET_MS,
      serverTimeoutMs: LIMBO_SERVER_TIMEOUT_MS
    })

    const finishFallSequence = () => {
      if (!isCurrentSession(fallSessionEpoch) || joinedSubserver || fallCheckPassed) return
      try { if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer) } catch (error) {}
      limboFallIntervalTimer = null
      fallCheckActive = false

      const elapsed = Date.now() - startedAt
      const totalFallen = initialY - currentY
      const responseWaitMs = Math.max(
        LIMBO_COMPLETION_GRACE_MS,
        LIMBO_SERVER_TIMEOUT_MS - elapsed + LIMBO_COMPLETION_GRACE_MS
      )
      addLog('success', username, `OK LimboFilter fall: ${tick} тиков, упал ${totalFallen.toFixed(1)}м, жду ответ сервера ${responseWaitMs}мс`)
      diagEvent('limbo-fall-sequence-sent', {
        tick,
        totalFallen,
        elapsed,
        responseWaitMs,
        expectedTotalMs,
        currentY
      })

      try { if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer) } catch (error) {}
      limboFallTimeoutTimer = setTimeout(() => {
        if (!isCurrentSession(fallSessionEpoch) || joinedSubserver || fallCheckPassed) return
        const delay = getBotFilterReconnectDelay('limbo-fall-response-timeout')
        logBotFilterReconnect('LimboFilter не ответил после fall-проверки', delay)
        diagEvent('limbo-fall-response-timeout', {
          tick,
          totalFallen,
          elapsed: Date.now() - startedAt,
          botPosition: bot?.entity?.position
        })
        updateBotStatus(username, 'ожидание')
        scheduleReconnectLocal(delay, true, 'limbo-fall-response-timeout')
        cleanupActiveSessionTimers('limbo-fall-response-timeout')
        waitingForFall = false
        fallCheckPassed = false
        fallCheckActive = false
        scannerWaitChallengeActive = false
        positionConfirmed = false
        try {
          if (bot?._client?.socket && !bot._client.socket.destroyed) {
            bot._client.socket.end()
          } else if (bot) {
            bot.quit()
          }
        } catch (error) {
          diagEvent('limbo-fall-timeout-close-error', { error })
        }
      }, responseWaitMs)
    }

    const sendFallTick = () => {
      if (!isCurrentSession(fallSessionEpoch) || !bot || !bot._client || joinedSubserver || fallCheckPassed) {
        clearLimboTimers()
        fallCheckActive = false
        return
      }

      tick += 1
      const fallPacket = createFallPacket({ x: startX, y: startY, z: startZ }, tick)
      if (!fallPacket) {
        addLog('warning', username, `Ошибка расчёта Limbo position на тике ${tick}`)
        return
      }
      currentY = fallPacket.y

      const sent = writeClientPacket('position', {
        x: fallPacket.x,
        y: fallPacket.y,
        z: fallPacket.z,
        onGround: false
      }, 'limbo-fall')

      if (!sent) {
        addLog('warning', username, `Ошибка отправки Limbo position на тике ${tick}`)
      }

      if (tick === 1 || tick === 5 || tick === 10 || tick % 20 === 0 || tick === LIMBO_FALL_TICKS || tick === finishPacketTicks) {
        const fallen = initialY - currentY
        addLog('info', username, `[Limbo ${tick}т] шаг ${fallPacket.fallStep.toFixed(3)}м, упал ${fallen.toFixed(1)}м`)
      }

      if (tick >= finishPacketTicks) {
        finishFallSequence()
      }
    }

    limboFallIntervalTimer = setInterval(sendFallTick, LIMBO_FALL_PACKET_MS)
    limboFallTimeoutTimer = setTimeout(() => {
      if (!isCurrentSession(fallSessionEpoch) || joinedSubserver || fallCheckPassed) return
      const delay = getBotFilterReconnectDelay('limbo-fall-hard-timeout')
      logBotFilterReconnect('LimboFilter fall hard-timeout', delay)
      scheduleReconnectLocal(delay, true, 'limbo-fall-hard-timeout')
    }, Math.max(LIMBO_SERVER_TIMEOUT_MS, finishPacketTicks * LIMBO_FALL_PACKET_MS + 6000))
    return true
  }

  function handleLimboPositionPacket(packet) {
    if (!scannerWaitChallengeActive) return
    if (!packet || joinedSubserver || fallCheckPassed) return
    const x = Number(packet.x)
    const y = Number(packet.y)
    const z = Number(packet.z)
    const teleportId = packet.teleportId ?? packet.teleportID ?? packet.teleport_id
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    if (Number.isFinite(Number(teleportId))) {
      confirmLimboTeleport(teleportId, 'position-packet')
    }
    if (y < 128) {
      if (!joinedSubserver && !waitingForFall && !fallCheckActive && !bot?.currentWindow) {
        setTimeout(() => {
          openServerMenuItem('normal-position-fallback', { minIntervalMs: 500 }).catch(() => {})
        }, 250)
      }
      return
    }

    if (!waitingForFall) {
      waitingForFall = true
      fallCheckPassed = false
    }

    diagEvent('limbo-falling-position-detected', {
      x,
      y,
      z,
      teleportId,
      flags: packet.flags,
      yaw: packet.yaw,
      pitch: packet.pitch
    })
    startActiveFallCheck({ x, y, z, teleportId, source: 'scanner-position-packet' })
  }

  async function waitForLimboBeforeMenu(expectedSessionEpoch) {
    if (!waitingForFall || fallCheckPassed || joinedSubserver || LIMBO_MENU_WAIT_MS <= 0) {
      return true
    }

    const deadline = Date.now() + LIMBO_MENU_WAIT_MS
    diagEvent('menu-wait-limbo-start', { limboMenuWaitMs: LIMBO_MENU_WAIT_MS })

    while (
      isCurrentSession(expectedSessionEpoch) &&
      bot &&
      waitingForFall &&
      !fallCheckPassed &&
      !joinedSubserver &&
      Date.now() < deadline
    ) {
      await sleep(100)
    }

    const ready = !waitingForFall || fallCheckPassed || joinedSubserver
    diagEvent('menu-wait-limbo-end', { ready, waitingForFall, fallCheckPassed, joinedSubserver })
    return ready
  }

  function startLimboFilterBypass() {
    waitingForFall = false
    fallCheckPassed = false
    fallCheckActive = false
    sendClientIdentityPackets('spawn-identity')
    diagEvent('limbo-message-gated-mode', {
      limboDetectionTimeoutMs: LIMBO_DETECTION_TIMEOUT_MS,
      activeFallOnlyAfterMessage: true
    })
  }

  function scheduleReconnectLocal(delay = backoff, forcedReconnect = false, reason = 'unspecified') {
    diagEvent('reconnect-request', { delay, forcedReconnect, reason })
    if (shuttingDown || !runtimeEnabled) {
      diagEvent('reconnect-ignored-runtime-stopped', { reason })
      return
    }

    if (reconnectScheduled) {
      const hasPendingReconnectTimer = reconnectTimer || reconnectGraceTimer || recreateRetryTimer
      if (hasPendingReconnectTimer) {
        diagEvent('reconnect-ignored-already-scheduled', { reason })
        return
      }
      reconnectScheduled = false
      reconnectDueAt = 0
      reconnectReason = ''
      addLog('warning', username, 'Reconnect-флаг завис без таймера -> ставлю reconnect заново')
    }

    if (!bot && !joinedSubserver && !forcedReconnect && !activeBots.includes(botHandle)) {
      diagEvent('reconnect-ignored-inactive-bot', { reason })
      return
    }
    
    if (isRotating) {
      isRotating = false
      diagEvent('reconnect-ignored-rotation', { reason })
      return
    }
    
    setLifecycleState('waiting-reconnect', reason, { delay, forcedReconnect })
    const reconnectHealthReason = classifyHealthEvent({ reason })
    if (reconnectHealthReason !== 'mining-ok') {
      setRuntimeHealth(reconnectHealthReason, {
        reconnectReason: reason,
        lastRecoveryAction: 'reconnect scheduled'
      })
    }
    reconnectScheduled = true
    reconnectReason = reason

    const graceDelay = getReconnectGraceDelay()
    if (graceDelay > 0 && !forcedReconnect) {
      reconnectScheduled = false
      reconnectReason = ''
      diagEvent('reconnect-delayed-by-grace', { reason, graceDelay })
      
      if (!reconnectGraceTimer) {
        reconnectGraceTimer = setTimeout(() => {
          reconnectGraceTimer = null
          scheduleReconnectLocal(delay, true, `${reason}:grace-expired`)
        }, Math.min(graceDelay, 30000))
      }
      return
    }

    const jitter = forcedReconnect ? Math.floor(Math.random() * 500) : Math.floor(Math.random() * 3000)
    reconnectDueAt = Date.now() + delay + jitter
    addLog('info', username, `Переподключение через ${Math.round((delay + jitter)/1000)}с`)
    diagEvent('reconnect-scheduled', { delay, jitter, forcedReconnect, reason, dueInMs: delay + jitter })
    updateBotStatus(username, 'ожидание')

    reconnectTimer = setTimeout(() => {
      diagEvent('reconnect-start', { reason })
      setLifecycleState('connecting', reason)
      reconnectScheduled = false
      reconnectDueAt = 0
      reconnectReason = ''
      reconnectTimer = null
      
      cleanupTimers()
      resetSessionState()
      try { 
        if (bot) {
          bot.removeAllListeners()
          bot.quit()
        }
      } catch(e) {}
      bot = null
      backoff = RECONNECT_REGULAR
      
      try {
        const index = activeBots.indexOf(botHandle)
        if (index === -1) {
          return
        }

        const newObj = createBot(cfg)

        activeBots[index] = newObj
        addLog('success', username, 'Bot instance replaced')
        diagEvent('reconnect-replaced-instance', { reason })
      } catch(e) {
        addLog('error', username, `Ошибка создания: ${e.message}`)
        diagEvent('reconnect-create-error', { reason, error: e })
        reconnectScheduled = false
        reconnectReason = ''
        recreateRetryTimer = setTimeout(() => scheduleReconnectLocal(5000, true, `${reason}:create-retry`), 5000)
      }
    }, delay + jitter)
  }

  function handleMidSessionWorldReset(packetName, packet, meta) {
    if (!joinedSubserver || hasReconnectPendingLocal() || shuttingDown || !runtimeEnabled) return

    const wasMining = digLoopRunning || isEntryButtonPressedForCurrentJoin() || positionConfirmed || hasRecentMiningProgress(30000)
    const coordinateHealth = bot?.entity ? getCoordinateHealthSnapshot() : null
    const packetSummary = packet && typeof packet === 'object'
      ? {
          keys: Object.keys(packet).slice(0, 20),
          entityId: packet.entityId,
          worldName: packet.worldName,
          gameMode: packet.gameMode ?? packet.gamemode,
          previousGameMode: packet.previousGameMode ?? packet.previousGamemode,
          metaState: meta?.state
        }
      : packet
    diagEvent('mid-session-world-reset-detected', {
      packetName,
      wasMining,
      packet: packetSummary,
      meta: meta ? { name: meta.name, state: meta.state } : null,
      coordinateHealth
    })

    addLog('warning', username, `Сервер сбросил мир во время добычи (${packetName}) -> быстрый перезаход`)
    updateBotStatus(username, 'ожидание')

    cleanupTimers()
    invalidateSession()
    positionConfirmed = false
    entryButtonPressedThisJoin = false
    entryButtonPressedJoinSeq = 0
    entryButtonFlowRunning = false
    emptyTargetButtonRetryCount = 0
    lastEmptyTargetButtonRetryAt = 0
    lastBlockMinedAt = 0
    packetOnlyStartedAt = 0

    scheduleReconnectLocal(1500, true, `mid-session-${packetName}`)
  }

  function rescheduleReconnectLocal(delay, reason) {
    try { if (reconnectTimer) clearTimeout(reconnectTimer) } catch(e){}
    try { if (reconnectGraceTimer) clearTimeout(reconnectGraceTimer) } catch(e){}
    try { if (recreateRetryTimer) clearTimeout(recreateRetryTimer) } catch(e){}
    reconnectTimer = null
    reconnectGraceTimer = null
    recreateRetryTimer = null
    reconnectScheduled = false
    reconnectDueAt = 0
    reconnectReason = ''
    scheduleReconnectLocal(delay, true, reason)
  }

  function applyReconnectDecision(decision, source = 'reconnect-policy') {
    if (!decision || decision.action === 'ignore') return false

    if (Array.isArray(decision.logs)) {
      for (const entry of decision.logs) {
        addLog(entry.level || 'info', username, entry.message)
      }
    }

    if (decision.nextWaitKickCount !== undefined) {
      waitKickCount = decision.nextWaitKickCount
    }

    if (decision.packetSafetySource) {
      activatePacketSafetyMode(decision.packetSafetySource)
    }

    if (decision.stabilityCooldownReason) {
      activateStabilityCooldown(
        decision.stabilityCooldownReason,
        decision.stabilityCooldownMs ?? CONNECTION_STABILITY_COOLDOWN_MS
      )
    }

    if (decision.noteNoInternet) {
      noteNoInternetError()
    }

    if (decision.action === 'stability-only') {
      diagEvent('reconnect-policy-stability-only', { source, decision })
      return true
    }

    if (decision.action === 'bot-filter') {
      const delay = getBotFilterReconnectDelay(decision.botFilterReason)
      backoff = delay
      logBotFilterReconnect(decision.botFilterLogReason, delay)
      scheduleReconnectLocal(delay, true, decision.scheduleReason)
      return true
    }

    if (decision.action === 'schedule') {
      backoff = decision.delay
      scheduleReconnectLocal(decision.delay, decision.forced, decision.scheduleReason)
      return true
    }

    diagEvent('reconnect-policy-unknown-action', { source, decision })
    return false
  }

  function getMenuRecoveryDelay() {
    menuRecoveryCount += 1
    const rampMs = Math.min(
      MENU_RECOVERY_MAX_MS - MENU_RECOVERY_BASE_MS,
      Math.max(0, menuRecoveryCount - 1) * MENU_RECOVERY_STEP_MS
    )
    return MENU_RECOVERY_BASE_MS + rampMs + Math.floor(Math.random() * MENU_RECOVERY_JITTER_MS)
  }

  function scheduleMenuRecovery(reason = 'menu-attempt-limit') {
    const delay = getMenuRecoveryDelay()
    const currentWindow = bot?.currentWindow
      ? {
          id: bot.currentWindow.id,
          type: bot.currentWindow.type,
          title: String(bot.currentWindow.title || '').slice(0, 160)
        }
      : null

    addLog(
      'warning',
      username,
      `Вход завис в лобби (${menuAttempts}/${MENU_ATTEMPT_LIMIT}) - быстрый перезаход через ${Math.round(delay / 1000)}с`
    )
    diagEvent('menu-fast-recovery', {
      reason,
      delay,
      menuAttempts,
      menuRecoveryCount,
      currentWindow
    })

    menuAttempts = 0
    lastMenuAttempt = 0
    lastMenuOpenAttemptAt = 0
    updateBotStatus(username, 'ожидание')
    rescheduleReconnectLocal(delay, reason)
  }

  function handleTooManyPacketsNotice(source, rawText = '') {
    const decision = getReconnectDecision(
      { type: 'too-many-packets-notice', source },
      { random: Math.random }
    )
    diagEvent('too-many-packets-notice', {
      source,
      text: String(rawText || '').slice(0, 500),
      decision
    })

    updateBotStatus(username, 'ожидание')

    if (hasReconnectPendingLocal()) {
      if (String(reconnectReason || '').startsWith('mid-session-')) {
        diagEvent('too-many-packets-kept-fast-reconnect', {
          source,
          currentReason: reconnectReason,
          ignoredDelay: decision.delay
        })
        return
      }
      if (decision.packetSafetySource) activatePacketSafetyMode(decision.packetSafetySource)
      rescheduleReconnectLocal(decision.delay, decision.scheduleReason)
      return
    }

    cleanupTimers()
    invalidateSession()
    positionConfirmed = false
    entryButtonPressedThisJoin = false
    entryButtonPressedJoinSeq = 0
    entryButtonFlowRunning = false
    applyReconnectDecision(decision, 'too-many-packets-notice')
  }

  function isAlreadyAuthorizedMessage(text) {
    return Boolean(
      text.includes('уже авториз') ||
      text.includes('already authorized') ||
      text.includes('already logged') ||
      text.includes('вы недавно входили') ||
      text.includes('ввод пароля не требуется') ||
      text.includes('you recently logged in') ||
      text.includes('password is not required')
    )
  }

  function shouldSendLoginCommand(text) {
    if (!PASSWORD || isAlreadyAuthorizedMessage(text)) return false

    return Boolean(
      text.includes('/login') ||
      text.includes('введите пароль') ||
      text.includes('введи пароль') ||
      text.includes('авторизуйтесь') ||
      text.includes('необходимо авториз') ||
      text.includes('please login') ||
      text.includes('please log in') ||
      text.includes('login with') ||
      text.includes('use /login')
    )
  }

  function isLimboSuccessText(text) {
    const normalized = String(text || '').toLowerCase()
    return Boolean(
      normalized.includes('отслеживается') ||
      normalized.includes('проверка завершена') ||
      normalized.includes('проверка успешно пройдена') ||
      normalized.includes('successfully passed') ||
      normalized.includes('passed bot-filter') ||
      normalized.includes('passed the bot-filter') ||
      normalized.includes('успешно прош') ||
      normalized.includes('успешно пройд')
    )
  }

  function maybeSendLoginCommand(rawText, text) {
    if (!shouldSendLoginCommand(text)) return

    const now = Date.now()
    if (now - lastLoginCommandAt < LOGIN_COMMAND_COOLDOWN_MS) {
      diagEvent('login-command-throttled', {
        ageMs: now - lastLoginCommandAt,
        cooldownMs: LOGIN_COMMAND_COOLDOWN_MS,
        text: String(rawText || '').slice(0, 300)
      })
      return
    }

    lastLoginCommandAt = now
    try {
      bot.chat(`/login ${PASSWORD}`)
      diagEvent('login-command-sent', { text: String(rawText || '').slice(0, 300) })
    } catch (error) {
      diagEvent('login-command-error', { error })
    }
  }

  function rememberLimboPositionPacket(packet) {
    if (!packet || typeof packet !== 'object') return
    const x = Number(packet.x)
    const y = Number(packet.y)
    const z = Number(packet.z)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    const teleportId = packet.teleportId ?? packet.teleportID ?? packet.teleport_id
    lastLimboPositionPacket = {
      x,
      y,
      z,
      teleportId,
      at: Date.now()
    }
    if (
      !joinedSubserver &&
      !scannerWaitChallengeActive &&
      !fallCheckActive &&
      !fallCheckPassed &&
      FEATURE_ACTIVE_FALL_CHECK_ENABLED &&
      y >= 128
    ) {
      confirmLimboTeleport(teleportId, 'limbo-position-prep')
      sendClientIdentityPackets('limbo-position-prep')
      pauseLimboPhysics('limbo-position-prep')
      if (!fallCheckTimer) {
        fallCheckTimer = setTimeout(() => {
          fallCheckTimer = null
          if (!scannerWaitChallengeActive && !fallCheckActive && !joinedSubserver) {
            restoreLimboPhysics('limbo-position-prep-timeout')
          }
        }, LIMBO_DETECTION_TIMEOUT_MS)
      }
    }
  }

  function getBotFilterReconnectDelay(reason = 'bot-filter') {
    const now = Date.now()
    const decision = calculateBotFilterReconnectDelay({
      reason,
      retryCount: botFilterRetryCount,
      lastFailureAt: botFilterLastFailureAt,
      now,
      retryBaseMs: BOT_FILTER_RETRY_BASE_MS,
      retryMaxMs: BOT_FILTER_RETRY_MAX_MS,
      fallAttemptsBeforeHold: BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD,
      fallHoldMs: BOT_FILTER_FALL_HOLD_MS
    })

    botFilterRetryCount = decision.retryCount
    botFilterLastFailureAt = decision.lastFailureAt
    botFilterRetryStates.set(username, {
      retryCount: botFilterRetryCount,
      lastFailureAt: botFilterLastFailureAt
    })

    if (decision.fallHoldActive) {
      diagEvent('bot-filter-fall-hold', {
        reason,
        retry: botFilterRetryCount,
        delay: decision.delay,
        threshold: BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD
      })
      return decision.delay
    }

    diagEvent('bot-filter-reconnect-delay', {
      reason,
      retry: botFilterRetryCount,
      delay: decision.delay
    })

    return decision.delay
  }

  function handleScannerWaitChallenge(rawText, source = 'server-message') {
    if (joinedSubserver || hasReconnectPendingLocal()) return
    const challengeSessionEpoch = sessionEpoch
    setLifecycleState('botfilter', source, { challenge: 'fall-wait' })
    setRuntimeHealth('botfilter-hold', {
      lastRecoveryAction: 'waiting fall-check position',
      diagnosis: 'Бот проходит fall-проверку BotFilter/LimboFilter.'
    })
    scannerWaitChallengeActive = true
    waitingForFall = true
    fallCheckPassed = false
    fallCheckActive = false
    try { if (limboFallStartTimer) clearTimeout(limboFallStartTimer) } catch (error) {}
    limboFallStartTimer = null

    const waitMs = SCANNER_POSITION_WAIT_MS
    const recentPositionAgeMs = lastLimboPositionPacket?.at ? Date.now() - lastLimboPositionPacket.at : Infinity
    const hasRecentPosition = Boolean(
      lastLimboPositionPacket &&
      Number.isFinite(recentPositionAgeMs) &&
      recentPositionAgeMs <= SCANNER_RECENT_POSITION_MS
    )
    addLog('warning', username, `BotFilter: тип проверки = fall-проверка, жду position-пакет до ${Math.round(waitMs / 1000)}с`)
    diagEvent('bot-filter-classified', {
      type: 'fall-wait',
      source,
      waitMs,
      passiveWaitLimitMs: SCANNER_PASSIVE_WAIT_MS,
      recentPositionWindowMs: SCANNER_RECENT_POSITION_MS,
      recentPositionAgeMs: Number.isFinite(recentPositionAgeMs) ? recentPositionAgeMs : null,
      recentPosition: lastLimboPositionPacket,
      text: String(rawText || '').slice(0, 500)
    })

    const startedFromRecentPosition = hasRecentPosition
      ? startActiveFallCheck({
          ...lastLimboPositionPacket,
          source: 'scanner-recent-position'
        })
      : false

    diagEvent('scanner-wait-position-packet', {
      source,
      waitMs,
      passiveWait: false,
      activeFallStarted: startedFromRecentPosition,
      recentPositionAgeMs: Number.isFinite(recentPositionAgeMs) ? recentPositionAgeMs : null
    })

    if (startedFromRecentPosition) {
      return
    }

    limboFallStartTimer = setTimeout(() => {
      limboFallStartTimer = null
      if (
        !isCurrentSession(challengeSessionEpoch) ||
        joinedSubserver ||
        hasReconnectPendingLocal() ||
        !scannerWaitChallengeActive ||
        fallCheckPassed
      ) {
        return
      }
      if (fallCheckActive) return

      const delay = getBotFilterReconnectDelay('scanner-position-missing')
      logBotFilterReconnect('BotFilter не прислал position-пакет для fall-проверки', delay)
      diagEvent('scanner-position-missing', {
        source,
        waitMs,
        botPosition: bot?.entity?.position,
        text: String(rawText || '').slice(0, 500)
      })

      updateBotStatus(username, 'ожидание')
      scheduleReconnectLocal(delay, true, 'scanner-position-missing')
      cleanupActiveSessionTimers('scanner-position-missing')
      waitingForFall = false
      fallCheckPassed = false
      scannerWaitChallengeActive = false
      isOnline = false
      positionConfirmed = false

      try {
        if (bot?._client?.socket && !bot._client.socket.destroyed) {
          bot._client.socket.end()
        } else if (bot) {
          bot.quit()
        }
      } catch (error) {
        diagEvent('scanner-position-missing-close-error', { error })
      }
    }, waitMs)
  }

  function handleChatCaptchaChallenge(rawText, source = 'server-message') {
    const now = Date.now()
    setLifecycleState('botfilter', source, { challenge: 'chat-captcha' })
    setRuntimeHealth('chat-captcha-hold', {
      lastRecoveryAction: '30-minute captcha hold',
      diagnosis: `Чат-капча обнаружена, бот ждёт ${Math.round(CHAT_CAPTCHA_RECONNECT_MS / 60000)} минут перед новым входом.`
    })
    scannerHoldUntil = Math.max(scannerHoldUntil, now + CHAT_CAPTCHA_RECONNECT_MS)
    setMenuStage('chat-captcha-hold', source)

    if (now - lastScannerLogAt >= 30000) {
      lastScannerLogAt = now
      addLog('warning', username, `BotFilter: тип проверки = чат-капча, перезаход через ${Math.round(CHAT_CAPTCHA_RECONNECT_MS / 60000)} минут`)
    }
    diagEvent('chat-captcha-reconnect-hold', {
      source,
      holdMs: scannerHoldUntil - now,
      text: String(rawText || '').slice(0, 500)
    })

    if (!hasReconnectPendingLocal()) {
      updateBotStatus(username, 'ожидание')
      scheduleReconnectLocal(CHAT_CAPTCHA_RECONNECT_MS, true, 'chat-captcha')
    }

    cleanupActiveSessionTimers('chat-captcha-hold')
    waitingForFall = false
    fallCheckPassed = false
    scannerWaitChallengeActive = false
    isOnline = false
    positionConfirmed = false
    try {
      if (bot?._client?.socket && !bot._client.socket.destroyed) {
        bot._client.socket.end()
      } else if (bot) {
        bot.quit()
      }
    } catch (error) {
      diagEvent('chat-captcha-close-error', { error })
    }
  }

  function isEntryBlockedByScanner() {
    return scannerHoldUntil > Date.now()
  }

  function isBotFilterBusy() {
    return (
      scannerHoldUntil > Date.now() ||
      scannerWaitChallengeActive ||
      waitingForFall ||
      fallCheckActive ||
      hasReconnectPendingLocal()
    )
  }

  function isInBotFilterChallenge() {
    return !joinedSubserver && (
      scannerWaitChallengeActive ||
      waitingForFall ||
      fallCheckActive ||
      fallCheckPassed ||
      scannerHoldUntil > Date.now()
    )
  }

  function logBotFilterReconnect(reasonText, delay) {
    const fallHoldActive = botFilterRetryCount >= BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD && delay >= BOT_FILTER_FALL_HOLD_MS
    addLog(
      'warning',
      username,
      fallHoldActive
        ? `LimboFilter: ${botFilterRetryCount} fall-проверки не прошли -> пауза ${Math.round(delay / 60000)} мин, чтобы не ловить чат-капчу`
        : `${reasonText} -> перезаход через ${Math.round(delay / 1000)}с (попытка ${botFilterRetryCount})`
    )
  }

  function startClient() {
    const botOptions = {
      host: SERVER_HOST,
      port: SERVER_PORT,
      username,
      auth: 'offline',
      version: MC_VERSION,
      keepAlive: true,
      keepAliveInterval: 15000
    }

    diagEvent('client-create-start', {
      host: SERVER_HOST,
      port: SERVER_PORT,
      version: MC_VERSION,
      standPosition,
      entryButtonPosition,
      miningTargets,
      maxDistance
    })
    
    bot = mineflayer.createBot(botOptions)
    diagEvent('client-created', {})
    
    if (physicsPlugin) {
      try {
        bot.loadPlugin(physicsPlugin.plugin)
        addLog('success', username, 'OK Плагин физики загружен')
      } catch(e) {
        addLog('warning', username, `! Физика не загрузилась: ${e.message}`)
      }
    }
    
    if (bot._client) {
      const diagnosticPacketNames = new Set([
        'login',
        'respawn',
        'position',
        'update_health',
        'kick_disconnect',
        'disconnect',
        'open_window',
        'close_window',
        'held_item_slot',
        'game_state_change',
        'difficulty'
      ])
      bot._client.on('packet', (data, meta) => {
        const packetName = meta?.name
        if (DETAILED_EVENT_LOGGING && diagnosticPacketNames.has(packetName)) {
          diagEvent(`client-packet:${packetName}`, {
            packet: data,
            meta: meta ? { name: meta.name, state: meta.state } : null
          })
        }

        if (packetName === 'login' || packetName === 'respawn') {
          handleMidSessionWorldReset(packetName, data, meta)
        }

        if (packetName === 'position') {
          rememberLimboPositionPacket(data)
        }

        if ((ACTIVE_FALL_CHECK_ENABLED || scannerWaitChallengeActive) && packetName === 'position') {
          handleLimboPositionPacket(data)
        }
      })

      bot._client.on('keep_alive', () => {
        lastKeepAlive = Date.now()
      })
      
      bot._client.on('error', (err) => {
        const msg = String(err && err.message ? err.message : err)
        diagEvent('client-error', { error: err })
        if (msg.includes('connect ETIMEDOUT') || msg.includes('connect ECONNREFUSED')) {
          return
        }
      })

      bot._client.on('end', reason => {
        diagEvent('client-end', { reason })
      })

      bot._client.on('connect', () => {
        diagEvent('client-connect', {})
      })
    }
    
    if (bot._client.socket) {
      bot._client.socket.on('error', error => {
        diagEvent('socket-error', { error })
      })
      bot._client.socket.on('close', hadError => {
        diagEvent('socket-close', {
          hadError,
          destroyed: bot?._client?.socket?.destroyed,
          bytesRead: bot?._client?.socket?.bytesRead,
          bytesWritten: bot?._client?.socket?.bytesWritten,
          localAddress: bot?._client?.socket?.localAddress,
          localPort: bot?._client?.socket?.localPort,
          remoteAddress: bot?._client?.socket?.remoteAddress,
          remotePort: bot?._client?.socket?.remotePort
        })
      })
      bot._client.socket.on('end', () => {
        diagEvent('socket-end', {})
      })
      bot._client.socket.on('timeout', () => {
        diagEvent('socket-timeout', {})
      })
    }

    bot.on('blockUpdate', handleBlockUpdate)
    bot.on('login', () => diagEvent('bot-login', {}))
    bot.on('respawn', () => diagEvent('bot-respawn', {}))
    bot.on('death', () => diagEvent('bot-death', {}))
    bot.on('health', () => diagEvent('bot-health', { health: bot.health, food: bot.food, oxygen: bot.oxygenLevel }))
    bot.on('windowOpen', window => {
      diagEvent('window-open', {
        id: window?.id,
        type: window?.type,
        title: getWindowTitleText(window).slice(0, 160),
        slotCount: window?.slots?.length
      })
      queueMenuFlow('window-open', 80)
    })
    bot.on('windowClose', window => {
      diagEvent('window-close', {
        id: window?.id,
        type: window?.type,
        title: getWindowTitleText(window).slice(0, 160)
      })
      queueMenuFlow('window-close', 250)
    })
    bot.on('forcedMove', () => diagEvent('bot-forced-move', {}))
    
    bot.once('spawn', async () => {
      const spawnSessionEpoch = sessionEpoch
      addLog('success', username, 'Подключен к серверу')
      setLifecycleState('connecting', 'bot-spawn')
      diagEvent('bot-spawn', { spawnSessionEpoch })
      updateBotStatus(username, 'подключается')
      isOnline = true
      lastKeepAlive = Date.now()
      spawnGraceUntil = Date.now() + GRACE_AFTER_SPAWN
      
      menuAttempts = 0
      setMenuStage('spawn', 'bot-spawn')
      
      if (bot._client && bot._client.socket) {
        bot._client.socket.on('error', error => {
          diagEvent('socket-error-after-spawn', { error })
        })
      }
      
      if (bot.physics) {
        bot.physics.gravity = 0.08
        addLog('success', username, 'OK Гравитация активна: 0.08')
      }
      
      startKeepAliveMonitor()
      
      startLimboFilterBypass()
      
      const initialDelay = 800 + Math.floor(Math.random() * 1200)
      await sleep(initialDelay)
      if (!isCurrentSession(spawnSessionEpoch) || !bot) return

      const limboReadyForMenu = await waitForLimboBeforeMenu(spawnSessionEpoch)
      if (!isCurrentSession(spawnSessionEpoch) || !bot || joinedSubserver || !limboReadyForMenu) return
      
      await driveMenuFlow('spawn-flow', { countAttempt: false })
      backoff = RECONNECT_REGULAR
    })

    function safeClickWindow(slot, options = {}) {
      if (!bot || !bot.currentWindow) return false
      const { countAttempt = true, minIntervalMs = 900 } = options
      const now = Date.now()
      if (now - lastMenuAttempt < minIntervalMs) {
        diagEvent('window-click-throttled', { slot, sinceLastAttemptMs: now - lastMenuAttempt, minIntervalMs })
        return false
      }
      lastMenuAttempt = now
      if (countAttempt) {
        menuAttempts++
      }
      const windowId = bot.currentWindow.id
      const item = bot.currentWindow.slots[slot] || { itemId: -1 }
      try {
        diagEvent('window-click', { windowId, slot, countAttempt, menuAttempts, item })
        bot._client.write('window_click', { windowId, slot, mouseButton: 0, action: 0, mode: 0, item })
        return true
      } catch (e) {
        diagEvent('window-click-error', { windowId, slot, error: e })
        noteGlobalError()
        return false
      }
    }

    openServerMenuItem = async function openServerMenuItemImpl(source = 'menu-loop', options = {}) {
      if (!bot || !bot._client || joinedSubserver) return false
      if (hasReconnectPendingLocal()) {
        diagEvent('menu-open-skipped-reconnect-pending', { source })
        return false
      }
      if (bot.currentWindow) return true
      if (!isOnline) {
        diagEvent('menu-open-skipped-before-spawn', { source })
        return false
      }
      if (isEntryBlockedByScanner()) {
        diagEvent('menu-open-skipped-scanner', {
          source,
          holdMs: scannerHoldUntil - Date.now()
        })
        return false
      }
      if (bot._client.state && bot._client.state !== 'play') {
        diagEvent('menu-open-skipped-client-state', { source, state: bot._client.state })
        return false
      }
      if (!bot.entity) {
        diagEvent('menu-open-skipped-no-entity', { source })
        return false
      }

      const {
        countAttempt = true,
        minIntervalMs = 900
      } = options
      const now = Date.now()
      if (now - lastMenuOpenAttemptAt < minIntervalMs) {
        diagEvent('menu-open-throttled', {
          source,
          sinceLastAttemptMs: now - lastMenuOpenAttemptAt,
          minIntervalMs
        })
        return false
      }
      lastMenuOpenAttemptAt = now
      if (countAttempt) {
        menuAttempts++
      }

      try { bot.setQuickBarSlot(HOTBAR_SLOT) } catch (error) {
        diagEvent('menu-open-set-slot-error', { source, error })
      }

      writeClientPacket('held_item_slot', { slotId: HOTBAR_SLOT }, `${source}:slot`)

      const thinkingDelay = Number(options.delayMs)
      if (Number.isFinite(thinkingDelay) && thinkingDelay > 0) {
        await sleep(thinkingDelay)
      }
      if (!bot || joinedSubserver || bot.currentWindow) return Boolean(bot?.currentWindow)

      diagEvent('menu-open-use-item', { source, hotbarSlot: HOTBAR_SLOT })
      return writeClientPacket('use_item', { hand: 0 }, `${source}:use-item`)
    }

    function queueMenuFlow(source = 'queued', delayMs = 0) {
      if (joinedSubserver || retryingFullServer || shuttingDown || !runtimeEnabled) return
      if (hasReconnectPendingLocal()) {
        diagEvent('menu-flow-queue-skipped-reconnect-pending', { source })
        return
      }
      if (isEntryBlockedByScanner()) {
        diagEvent('menu-flow-queue-skipped-scanner', {
          source,
          holdMs: scannerHoldUntil - Date.now()
        })
        return
      }

      const dueAt = Date.now() + Math.max(0, delayMs)
      if (menuFlowWakeTimer && menuFlowWakeDueAt <= dueAt) {
        return
      }

      try { if (menuFlowWakeTimer) clearTimeout(menuFlowWakeTimer) } catch (error) {}
      menuFlowWakeDueAt = dueAt
      menuFlowWakeTimer = setTimeout(() => {
        menuFlowWakeTimer = null
        menuFlowWakeDueAt = 0
        driveMenuFlow(source).catch(() => {})
      }, Math.max(0, delayMs))
    }

    async function driveMenuFlow(source = 'menu-loop', options = {}) {
      if (!bot || joinedSubserver) return false
      if (hasReconnectPendingLocal()) {
        diagEvent('menu-flow-skipped-reconnect-pending', { source })
        return false
      }
      if (!isOnline && !bot.currentWindow) {
        diagEvent('menu-flow-skipped-before-spawn', { source })
        return false
      }
      if (isEntryBlockedByScanner()) {
        diagEvent('menu-flow-skipped-scanner', {
          source,
          holdMs: scannerHoldUntil - Date.now()
        })
        return false
      }
      if (retryingFullServer && !options.allowDuringFullServerRetry) return false
      if (waitingForFall && !fallCheckPassed) {
        diagEvent('menu-open-skipped-limbo', { source, waitingForFall, fallCheckPassed })
        return false
      }

      if (menuFlowRunning) {
        menuFlowQueued = true
        diagEvent('menu-flow-queued', { source, menuStage })
        return false
      }

      menuFlowRunning = true
      menuFlowQueued = false

      try {
        const {
          ignoreAttemptLimit = false,
          countAttempt = true,
          allowDuringFullServerRetry = false
        } = options
        const forceProgress = allowDuringFullServerRetry === true

        if (!ignoreAttemptLimit && !retryingFullServer && menuAttempts >= MENU_ATTEMPT_LIMIT) {
          diagEvent('menu-attempt-limit', { menuAttempts, menuRecoveryCount, menuStage })
          scheduleMenuRecovery('menu-attempt-limit')
          return false
        }

        const now = Date.now()
        const stageAgeMs = now - menuStageStartedAt

        if (!bot.currentWindow) {
          if (!forceProgress && menuStage === 'game-clicked' && stageAgeMs < MENU_WINDOW_TRANSITION_WAIT_MS) {
            queueMenuFlow('wait-skyblock-window', 300)
            return false
          }

          if (!forceProgress && menuStage === 'skyblock-clicked' && stageAgeMs < MENU_SUBSERVER_JOIN_WAIT_MS) {
            queueMenuFlow('wait-subserver-teleport', 700)
            return false
          }

          setMenuStage('opening-game-menu', source)
          const opened = await openServerMenuItem(source, {
            countAttempt,
            minIntervalMs: MENU_ACTION_INTERVAL_MS
          })
          if (opened) queueMenuFlow('after-menu-open', 300)
          return opened
        }

        const menuInfo = classifyServerMenuWindow(bot.currentWindow)
        diagEvent('menu-flow-window', {
          source,
          menuStage,
          kind: menuInfo.kind,
          title: menuInfo.title,
          slot1Text: menuInfo.slot1Text.slice(0, 160),
          slot2Text: menuInfo.slot2Text.slice(0, 160)
        })

        if (menuInfo.kind === 'game') {
          if (!forceProgress && menuStage === 'game-clicked' && stageAgeMs < MENU_WINDOW_TRANSITION_WAIT_MS) {
            queueMenuFlow('wait-after-game-click', 300)
            return false
          }

          const clicked = safeClickWindow(MENU_SLOT_1, {
            countAttempt,
            minIntervalMs: MENU_ACTION_INTERVAL_MS
          })
          if (clicked) {
            setMenuStage('game-clicked', source)
            queueMenuFlow('after-game-click', 350)
          }
          return clicked
        }

        if (menuInfo.kind === 'skyblock') {
          if (!forceProgress && menuStage === 'skyblock-clicked' && stageAgeMs < MENU_SUBSERVER_JOIN_WAIT_MS) {
            queueMenuFlow('wait-after-skyblock-click', 700)
            return false
          }

          const clicked = safeClickWindow(MENU_SLOT_2, {
            countAttempt,
            minIntervalMs: MENU_ACTION_INTERVAL_MS
          })
          if (clicked) {
            setMenuStage('skyblock-clicked', source)
            queueMenuFlow('after-skyblock-click', 900)
          }
          return clicked
        }

        if (countAttempt) menuAttempts += 1
        diagEvent('menu-window-unknown', {
          source,
          menuAttempts,
          title: menuInfo.title,
          slot1Text: menuInfo.slot1Text.slice(0, 160),
          slot2Text: menuInfo.slot2Text.slice(0, 160)
        })

        try {
          if (bot.currentWindow) bot.closeWindow(bot.currentWindow)
        } catch (error) {
          diagEvent('menu-window-close-error', { source, error })
        }
        setMenuStage('unknown-window', source)
        queueMenuFlow('unknown-window-retry', 700)
        return false
      } finally {
        menuFlowRunning = false
        if (menuFlowQueued) {
          menuFlowQueued = false
          queueMenuFlow('queued-menu-flow', 50)
        }
      }
    }

    async function tryOpenMenuOnce(ignoreAttemptLimit = false) {
      return driveMenuFlow('menu-loop', { ignoreAttemptLimit })
    }

    function stopFullServerRetry() {
      retryingFullServer = false
      if (fullServerRetryTimer) {
        clearTimeout(fullServerRetryTimer)
        fullServerRetryTimer = null
      }
    }

    async function tryFullServerRetryOnce() {
      if (!retryingFullServer || joinedSubserver || !bot) return
      await driveMenuFlow('full-server-retry', {
        ignoreAttemptLimit: true,
        countAttempt: false,
        allowDuringFullServerRetry: true
      })
    }

    function startFullServerRetry() {
      if (joinedSubserver || retryingFullServer) return
      
      retryingFullServer = true
      menuAttempts = 0
      lastMenuAttempt = 0
      lastMenuOpenAttemptAt = 0
      setMenuStage('full-server-retry', 'server-full')
      addLog('warning', username, '! sb02 заполнен - повторяю вход каждую секунду')
      
      const retryLoop = async () => {
        if (!retryingFullServer || joinedSubserver) {
          stopFullServerRetry()
          return
        }
        
        await tryFullServerRetryOnce().catch(() => {})
        fullServerRetryTimer = setTimeout(retryLoop, 1000)
      }
      
      fullServerRetryTimer = setTimeout(retryLoop, 1000)
    }

    (function menuLoop(){
      if (!joinedSubserver && !retryingFullServer && !hasReconnectPendingLocal() && (!waitingForFall || fallCheckPassed)) {
        tryOpenMenuOnce().catch(()=>{})
      }
      const nextAttempt = 1000 + Math.floor(Math.random()*750)
      menuTimer = setTimeout(menuLoop, nextAttempt)
    })()

    bot.on('message', (msg, position, sender) => {
      try {
        const rawText = getMinecraftMessageText(msg)
        const messagePosition = normalizeServerMessagePosition(position)
        const messageSource = getServerMessageSource(messagePosition)
        const isVisibleChatMessage = isVisibleServerMessagePosition(messagePosition)
        const messageJson = getMessageJson(msg)

        if (!rawText) {
          diagEvent('server-message-empty', {
            source: messageSource,
            position: messagePosition,
            json: messageJson
          })
          return
        }

        if (isVisibleChatMessage) {
          addChatLog(username, rawText, messageSource, {
            position: messagePosition,
            sender: sender ? String(sender) : undefined
          })
        }

        if (LOG_SERVER_MESSAGES) {
          diagEvent('server-message', {
            source: messageSource,
            position: messagePosition,
            text: rawText.slice(0, 1000),
            json: messageJson
          })
        }
        const text = rawText.toLowerCase()

        if (isTooManyPacketsText(text)) {
          handleTooManyPacketsNotice(messageSource, rawText)
          return
        }

        maybeSendLoginCommand(rawText, text)

        if (!joinedSubserver) {
          const botFilterMessageKind = classifyBotFilterMessage(text)

          if (botFilterMessageKind !== 'none') {
            addLog(
              'info',
              username,
              `BotFilter evidence: ${botFilterMessageKind}, source=${messageSource}, position=${messagePosition}, text="${rawText.slice(0, 240)}"`
            )
            diagEvent('bot-filter-message-evidence', {
              kind: botFilterMessageKind,
              source: messageSource,
              position: messagePosition,
              visibleChat: isVisibleChatMessage,
              sender: sender ? String(sender) : undefined,
              text: rawText.slice(0, 1000),
              json: messageJson
            })
          }

          if (botFilterMessageKind === 'chat-captcha') {
            if (isVisibleChatMessage) {
              handleChatCaptchaChallenge(rawText, messageSource)
              return
            }

            diagEvent('chat-captcha-ignored', {
              source: messageSource,
              position: messagePosition,
              visibleChat: isVisibleChatMessage,
              fallCheckActive,
              waitingForFall,
              scannerWaitChallengeActive,
              text: rawText.slice(0, 500)
            })
            return
          }

          if (botFilterMessageKind === 'fall-wait') {
            handleScannerWaitChallenge(rawText, messageSource)
            return
          }
        }
        
        if (text.includes('вы недавно входили') || 
            text.includes('ввод пароля не требуется') ||
            text.includes('you recently logged in')) {
          if (!authQuickLogin) {
            authQuickLogin = true
            addLog('success', username, '+ Быстрый вход - авторизация пропущена')
          }
        }

        if ((text.includes('не удалось подключить вас к серверу') || text.includes('failed to connect you to')) &&
            (text.includes('сервер заполнен') || text.includes('server is full'))) {
          startFullServerRetry()
        }
        
        if (!joinedSubserver && isLimboSuccessText(text)) {
          limboSuccessSeen = true
          scannerHoldUntil = 0
          scannerWaitChallengeActive = false
          stopFullServerRetry()
          completeLimboWait('limbo-success-message')
          waitKickCount = 0
          updateBotStatus(username, 'ожидание')
          try { if (menuTimer) clearTimeout(menuTimer) } catch(e){}
          try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch(e){}
          
          waitingForFall = false
          fallCheckPassed = true

          if (text.includes('отслеживается') || text.includes('проверка завершена')) {
            beginSubserverJoin()
            addLog('success', username, 'Зашёл на подсервер')
            schedulePostJoinFlow()
          } else {
            addLog('success', username, 'LimboFilter пройден, жду перевод сервера')
          }
        }
      } catch (e) {
        diagEvent('server-message-handler-error', { error: e })
      }
    })

    bot.on('kicked', reason => {
      diagEvent('bot-kicked-event', { reason })
      const wasInBotFilterCheck = isInBotFilterChallenge()
      const hadLimboSuccess = limboSuccessSeen
      isOnline = false
      positionConfirmed = false
      resetSessionState()

      let r = (typeof reason === 'string') ? reason : JSON.stringify(reason)
      
      try {
        if (typeof reason === 'object' && reason.extra) {
          const textParts = reason.extra
            .filter(e => e.text)
            .map(e => e.text)
            .join(' ')
          if (textParts) r = textParts
        }
      } catch(e) {}
      
      addLog('warning', username, `Кикнут: ${r.substring(0, 300)}`)
      diagEvent('bot-kicked-parsed', { parsedReason: r })
      
      updateBotStatus(username, 'оффлайн')
      cleanupTimers()

      if (hadLimboSuccess || isLimboSuccessText(r)) {
        addLog('success', username, 'LimboFilter пройден, перезахожу после success-kick')
        scheduleReconnectLocal(1200, true, 'limbo-success-kick')
        return
      }
      
      applyReconnectDecision(
        getReconnectDecision(
          {
            type: 'kick',
            reason: r,
            wasInBotFilterCheck
          },
          {
            random: Math.random,
            waitKickCount,
            connectionStabilityCooldownMs: CONNECTION_STABILITY_COOLDOWN_MS
          }
        ),
        'kick'
      )
    })

    bot.on('end', reason => {
      diagEvent('bot-end-event', { reason })
      const wasInBotFilterCheck = isInBotFilterChallenge()
      const hadLimboSuccess = limboSuccessSeen
      isOnline = false
      positionConfirmed = false
      resetSessionState()
      if (!reconnectScheduled && !isRotating) {
        addLog('warning', username, 'Отключен от сервера')
        updateBotStatus(username, 'оффлайн')
        cleanupTimers()

        if (hadLimboSuccess) {
          addLog('success', username, 'LimboFilter пройден, socket закрыт штатно -> быстрый перезаход')
          scheduleReconnectLocal(1200, true, 'limbo-success-end')
          return
        }

        applyReconnectDecision(
          getReconnectDecision(
            {
              type: 'end',
              reason,
              wasInBotFilterCheck
            },
            { random: Math.random }
          ),
          'end'
        )
      }
    })

    bot.on('error', err => {
      const msg = String(err && err.message ? err.message : err)
      diagEvent('bot-error-event', { error: err })
      const wasInBotFilterCheck = isInBotFilterChallenge()
      const decision = getReconnectDecision(
        {
          type: 'error',
          message: msg,
          error: err,
          wasInBotFilterCheck,
          hasReconnectPending: hasReconnectPendingLocal()
        },
        {
          random: Math.random,
          clientTimeoutReconnectMs: CLIENT_TIMEOUT_RECONNECT_MS,
          clientTimeoutReconnectJitterMs: CLIENT_TIMEOUT_RECONNECT_JITTER_MS,
          connectionStabilityCooldownMs: CONNECTION_STABILITY_COOLDOWN_MS
        }
      )

      if (decision.action === 'ignore' || decision.action === 'stability-only') {
        applyReconnectDecision(decision, 'error')
        return
      }

      isOnline = false
      positionConfirmed = false
      resetSessionState()
      
      addLog('error', username, msg.substring(0, 60))
      cleanupTimers()
      updateBotStatus(username, 'оффлайн')
      applyReconnectDecision(decision, 'error')
    })
  }

  async function startDiggingLoop(expectedSessionEpoch = sessionEpoch) {
    diagEvent('mining-loop-request', { expectedSessionEpoch })
    if (digLoopRunning) return
    if (!miningTargets.length) {
      addLog('error', username, 'Нет блоков для копания')
      diagEvent('mining-loop-no-targets', {})
      return
    }

    digLoopRunning = true
    try {
      for (let i = 0; i < 100; i++) {
        if (!isCurrentSession(expectedSessionEpoch)) return
        if (isMiningSessionReady(expectedSessionEpoch)) break
        await sleep(200)
      }

      if (!isMiningSessionReady(expectedSessionEpoch)) {
        return
      }

      if (waitingForFall) {
        addLog('info', username, 'Ожидание проверки LimboFilter...')

        for (let i = 0; i < 50; i++) {
          if (!isCurrentSession(expectedSessionEpoch)) return
          if (!waitingForFall || fallCheckPassed) break
          await sleep(200)
        }
      }

      if (waitingForFall) {
        addLog('warning', username, 'Таймаут LimboFilter - начинаю копать')
        restoreLimboPhysics('mining-loop-timeout')
        waitingForFall = false
        fallCheckPassed = true
        fallCheckActive = false
      }

      if (standPosition) {
        const postJoinPositionReady = await waitForPostJoinPosition(expectedSessionEpoch)
        if (!isMiningSessionReady(expectedSessionEpoch)) {
          return
        }

        if (!postJoinPositionReady) {
          return
        }

        const returnedToStand = await returnToStandPosition()
        if (!returnedToStand) {
          return
        }

        if (!isMiningSessionReady(expectedSessionEpoch)) {
          return
        }
      }
      await ensureMiningLookAt(true)

      addLog('success', username, `Запускаю новый движок добычи (${miningTargets.length} точек, пачка ${MINING_BATCH_SIZE})`)
      setLifecycleState('mining', 'mining-loop-started')
      startSpeedGuard(expectedSessionEpoch)
      diagEvent('mining-loop-started', {
        targets: miningTargets.length,
        batchSize: MINING_BATCH_SIZE,
        breakPacketLimits: getBreakPacketLimits()
      })

      const readyAt = Date.now()
      lastDigTime = readyAt
      lastBlockMinedAt = 0
      let cursor = 0
      let lastHealthCheckAt = readyAt

      while (isMiningSessionReady(expectedSessionEpoch)) {
        if (diggingPaused) {
          lastDigTime = Date.now()
          await sleep(500)
          continue
        }

        if (isReturningToPosition) {
          await sleep(250)
          continue
        }

        const now = Date.now()
        if (now - lastHealthCheckAt >= 5000) {
          lastHealthCheckAt = now
          diagPositionSnapshot('mining-loop')

          if (RESTART_IF_IDLE_MS > 0 && now - lastDigTime > RESTART_IF_IDLE_MS) {
            addLog('warning', username, 'Долгий простой -> перезапуск')
            updateBotStatus(username, 'ожидание')
            diagEvent('mining-idle-restart', { idleMs: now - lastDigTime, restartIfIdleMs: RESTART_IF_IDLE_MS })
            scheduleReconnectLocal(undefined, false, 'mining-idle')
            return
          }

        }

        const snapshot = buildMiningSnapshot(cursor)

        if (!snapshot.mineable.length) {
          const recovered = snapshot.transient.length > 0
            ? await recoverTransientMiningTargets(expectedSessionEpoch, snapshot)
            : snapshot.unreachable.length > 0
              ? await recoverUnreachableMiningTargets(expectedSessionEpoch, snapshot)
              : await recoverEmptyMiningTargets(
                expectedSessionEpoch,
                'Нет доступных блоков для добычи'
              )

          if (!recovered || !isMiningSessionReady(expectedSessionEpoch)) {
            return
          }

          continue
        }

        let minedThisPass = 0
        const batch = snapshot.mineable.slice(0, MINING_BATCH_SIZE)
        let fastPacketsThisPass = 0
        let packetOnlyFallbackThisPass = false

        if (isFastMiningAllowed()) {
          await ensureMiningLookAt()
          for (const target of batch) {
            if (sendBreakPacketToTarget(target, { preemptive: false })) {
              fastPacketsThisPass++
            }
          }
          if (fastPacketsThisPass > 0) {
            lastDigTime = Date.now()
            try { bot.swingArm() } catch (error) {}
            await sleep(FAST_DIG_RETRY_MS)

            if (PACKET_ONLY_MINING) {
              const packetNow = Date.now()
              if (!packetOnlyStartedAt) {
                packetOnlyStartedAt = packetNow
              }

              if (getPacketOnlyIdleMs(packetNow) < PACKET_ONLY_FALLBACK_MS) {
                continue
              }

              packetOnlyStartedAt = packetNow
              packetOnlyFallbackThisPass = true
            }
          }
        }

        if (
          !packetOnlyFallbackThisPass &&
          PACKET_ONLY_MINING &&
          isFastMiningAllowed() &&
          packetOnlyStartedAt
        ) {
          const packetNow = Date.now()
          if (getPacketOnlyIdleMs(packetNow) < PACKET_ONLY_FALLBACK_MS) {
            await sleep(MINING_LOOP_IDLE_MS)
            continue
          }

          packetOnlyStartedAt = packetNow
        }

        for (const target of batch) {
          if (!isMiningSessionReady(expectedSessionEpoch) || diggingPaused || isReturningToPosition) {
            break
          }

          const freshTarget = getTargetSnapshot(target.index)
          cursor = (freshTarget.index + 1) % miningTargets.length

          if (!freshTarget.canMine || !freshTarget.block || freshTarget.block.type === 0) {
            continue
          }

          try {
            await digBlockWithTimeout(freshTarget.block)

            if (!isMiningSessionReady(expectedSessionEpoch)) return

            recordMinedBlock(freshTarget.position, 'dig')
            minedThisPass++

            if (DIG_DELAY > 0) {
              await sleep(DIG_DELAY)
            }
          } catch (error) {
            const failureKind = getDigFailureKind(error)

            if (failureKind === 'timeout') {
              addLog('warning', username, `Копание зависло (${Math.round(DIG_ACTION_TIMEOUT_MS / 1000)}с) -> перезапуск`)
              diagEvent('dig-timeout-restart', { target: freshTarget, error })
              updateBotStatus(username, 'ожидание')
              scheduleReconnectLocal(5000, true, 'dig-timeout')
              return
            }

            if (failureKind === 'unreachable') {
              logMiningDiagnostic(
                'warning',
                `Цель стала недосягаемой: ${formatTargetSnapshot(freshTarget)}`
              )
              if (standPosition) {
                await returnToStandPosition()
              }
              break
            }

            if (failureKind === 'error') {
              const errMsg = error && error.message ? error.message : String(error)
              addLog('warning', username, errMsg.substring(0, 60))
            }
          }
        }

        if (minedThisPass === 0 && fastPacketsThisPass === 0) {
          await sleep(MINING_LOOP_IDLE_MS)
        }
      }
    } catch (error) {
      addLog('error', username, `Ошибка в mining engine: ${error.message}`)
      diagEvent('mining-loop-error', { error })
      scheduleReconnectLocal(undefined, false, 'mining-loop-error')
    } finally {
      digLoopRunning = false
    }
  }


  botHandle = {
    username,
    get bot() { return bot },
    get isOnline() { return isOnline },
    get hasReconnectPending() { return hasReconnectPendingLocal() },
    get isBotFilterBusy() { return isBotFilterBusy() },
    getLifecycleSnapshot,
    get reconnectDueAt() { return reconnectDueAt },
    set isRotating(val) { isRotating = val },
    cleanup: () => {
      disposeBotInstance()
    }
  }
  startClient()
  return botHandle
}

function stopAllBots() {
  clearStartupTimers()
  addLog('info', 'SYSTEM', 'Остановка всех ботов')
  for (const a of activeBots) {
    try { if (a.cleanup) a.cleanup() } catch(e){}
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
    addLog('info', 'SYSTEM', `${cfg.username} запустится через ${Math.round(delay/1000)}с`)
    const timer = setTimeout(() => {
      startupTimers = startupTimers.filter(t => t !== timer)
      if (shuttingDown) return
      try {
        const botObj = createBot(cfg)
        activeBots.push(botObj)
      } catch (e) {
        addLog('error', 'SYSTEM', `Не удалось создать ${cfg.username}: ${e.message}`)
      }
    }, delay)
    startupTimers.push(timer)
  }
}

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
    setManualPause(!manualPauseRequested)
  })
}

// ============================================================================
// ============================================================================
addLog('info', 'SYSTEM', ' Менеджер ботов запущен')
addLog('info', 'SYSTEM', `Сервер: ${SERVER_HOST}:${SERVER_PORT} (${MC_VERSION})`)
addLog('info', 'SYSTEM', `Config: ${CONFIG_FILE_PATH}`)
addLog('info', 'SYSTEM', `Log file: ${LOG_FILE_PATH}`)
addLog('info', 'SYSTEM', `Режим отладки: ${DEBUG_MODE ? 'ВКЛ' : 'ВЫКЛ'} | [DIAG]: ${DETAILED_EVENT_LOGGING ? 'ВКЛ' : 'ВЫКЛ'} | server messages: ${LOG_SERVER_MESSAGES ? 'ВКЛ' : 'ВЫКЛ'}`)
if (HEADLESS_MODE) {
  addLog('info', 'SYSTEM', `Headless режим: ВКЛ (${process.argv.includes('--headless') ? '--headless' : 'auto'})`)
  addLog('info', 'SYSTEM', `Пауза через файл: ${path.basename(PAUSE_FILE_PATH)} | удалить/false/off = продолжить`)
} else {
  addLog('info', 'SYSTEM', 'Q/ESC - выход | R - сброс статистики | P/SPACE - пауза')
}

if (MOBILE_RUNTIME_PROFILE) {
  addLog('info', 'SYSTEM', `Mobile low-power профиль активен: dig ${DIG_DELAY}мс, scan ${EMPTY_SCAN_DELAY_MS}мс, snapshot ${SNAPSHOT_INTERVAL}мс`)
}

setFilePause(readPauseFileState())
setInterval(updateUI, SNAPSHOT_INTERVAL)
setInterval(updateScriptResources, RESOURCE_INTERVAL)
setInterval(() => setFilePause(readPauseFileState()), PAUSE_CHECK_INTERVAL)
setInterval(checkMemoryUsage, 60000)

setInterval(() => {
  refreshBotRates()
  const uptime = Date.now() - monitorData.startTime
  const hours = Math.floor(uptime / 3600000)
  const minutes = Math.floor((uptime % 3600000) / 60000)
  const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
  const totalBots = Object.keys(monitorData.bots).length
  const avgRate = monitorData.totalBlocks > 0 && uptime > 0 
    ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1) : '0.0'
  const currentRatePerMinute = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.blocksLastMinute || 0), 0)
  const currentRawRatePerMinute = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.rawBlocksLastMinute || 0), 0)
  const currentRatePerMinuteLabel = formatBlocksPerMinute(currentRatePerMinute)
  const currentRawRatePerMinuteLabel = formatBlocksPerMinute(currentRawRatePerMinute)
  const health = updateHealthState(monitorData.health, {}, Date.now())
  monitorData.health = health
  
  writeToLogFile(`=== СТАТИСТИКА === Время: ${hours}ч ${minutes}м | Боты: ${activeBots}/${totalBots} | Добыто: ${monitorData.totalBlocks} блоков | Скорость: ${avgRate} бл/ч`)
  
  writeToLogFile(`RATE/MIN: ${currentRatePerMinuteLabel} | RAW: ${currentRawRatePerMinuteLabel}`)
  writeToLogFile(`HEALTH: ${getHealthLogLabel(health.reason)} | ${health.diagnosis}`)
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    writeToLogFile(`  ${botName.padEnd(20)} | Статус: ${botData.status.padEnd(12)} | Добыто: ${botData.blocksTotal} | Effective: ${formatBlocksPerSecond(botData.blocksPerSecond || 0)} | Raw: ${formatBlocksPerSecond(botData.rawBlocksPerSecond || 0)}`)
  }
}, 300000)

registerProcessHandler('SIGINT', () => gracefulShutdown('SIGINT', 0))
registerProcessHandler('SIGTERM', () => gracefulShutdown('SIGTERM', 0))

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
  if (screen) {
    try { screen.destroy() } catch (e) {}
  }
  if (logFileStream) {
    try { logFileStream.end() } catch (e) {}
    logFileStream = null
  }
  restoreProcessOutputs()
}

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

  if (runtimeEnabled) {
    startRuntimeManager()
  } else {
    addLog('info', 'SYSTEM', 'Host mode: runtime загружен и ждет команду на запуск')
    updateUI()
  }
} else {
  startRuntimeManager()
}

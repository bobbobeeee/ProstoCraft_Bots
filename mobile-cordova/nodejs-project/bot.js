const mineflayer = require('mineflayer')
const vec3 = require('vec3')
const fs = require('fs')
const path = require('path')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const os = require('os')
const { computeBotRateStats, formatBlocksPerMinute, formatBlocksPerSecond } = require('./monitoring')

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

// Р СџР В»Р В°Р С–Р С‘Р Р… РЎвЂћР С‘Р В·Р С‘Р С”Р С‘ Р Т‘Р В»РЎРЏ Р С—РЎР‚Р В°Р Р†Р С‘Р В»РЎРЉР Р…Р С•Р С–Р С• Р С—Р В°Р Т‘Р ВµР Р…Р С‘РЎРЏ (Р С”Р В°Р С” РЎС“ РЎР‚Р ВµР В°Р В»РЎРЉР Р…Р С•Р С–Р С• Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В°)
let physicsPlugin
try {
  physicsPlugin = require('mineflayer-physics')
} catch(e) {
  console.warn('! mineflayer-physics не установлен - физика может работать некорректно')
  console.warn('Установите: npm install mineflayer-physics')
}


// ============================================================================
// Р СџР С›Р вЂќР С’Р вЂ™Р вЂєР вЂўР СњР ВР вЂў Р СњР вЂўР СњР Р€Р вЂ“Р СњР В«Р Тђ Р вЂєР С›Р вЂњР С›Р вЂ™
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

// Р СџР С•Р В»Р Р…Р С•РЎРѓРЎвЂљРЎРЉРЎР‹ Р С•РЎвЂљР С”Р В»РЎР‹РЎвЂЎР В°Р ВµР С console.warn Р Т‘Р В»РЎРЏ РЎРѓР ВµРЎвЂљР ВµР Р†РЎвЂ№РЎвЂ¦ Р С•РЎв‚¬Р С‘Р В±Р С•Р С”
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

  try { _error('[UNCAUGHT]', msg) } catch (e) {}
  setTimeout(() => {
    try {
      fullRestart('uncaught-exception')
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

  try { _error('[UNHANDLED_REJECTION]', msg) } catch (e) {}
  setTimeout(() => {
    try {
      fullRestart('unhandled-rejection')
    } catch (restartError) {
      try { _error('[UNHANDLED_REJECTION][RESTART_FAILED]', restartError) } catch (e) {}
      if (!HOST_CONTROLLED) {
        process.exit(1)
      }
    }
  }, 100)
})

// ============================================================================
// Р вЂ”Р С’Р вЂњР В Р Р€Р вЂ”Р С™Р С’ Р С™Р С›Р СњР В¤Р ВР вЂњР Р€Р В Р С’Р В¦Р ВР В
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
// Р вЂєР С›Р вЂњР ВР В Р С›Р вЂ™Р С’Р СњР ВР вЂў Р вЂ™ Р В¤Р С’Р в„ўР вЂє
// ============================================================================
const LOG_FILE_PATH = path.resolve(
  process.env.BOT_LOG_PATH ||
  path.join(CONFIG_DIR, 'bot.log')
)
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10 Р СљР вЂ
let logFileStream = null
let currentLogSize = 0

function initLogFile() {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true })
    if (fs.existsSync(LOG_FILE_PATH)) {
      const stats = fs.statSync(LOG_FILE_PATH)
      currentLogSize = stats.size
      
      if (currentLogSize > MAX_LOG_SIZE) {
        const backupPath = LOG_FILE_PATH + '.old'
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath)
        }
        fs.renameSync(LOG_FILE_PATH, backupPath)
        currentLogSize = 0
      }
    }
    
    logFileStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' })
    
    const startMsg = `\n${'='.repeat(80)}\n[${new Date().toISOString()}] === НОВАЯ СЕССИЯ ===\\n${'='.repeat(80)}\n`
    logFileStream.write(startMsg)
    currentLogSize += Buffer.byteLength(startMsg)
    
  } catch (e) {
    console.error('Ошибка инициализации лог-файла:', e.message)
  }
}

function writeToLogFile(message) {
  if (!logFileStream) return
  
  try {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${message}\n`
    const byteLength = Buffer.byteLength(logLine)
    
    if (currentLogSize + byteLength > MAX_LOG_SIZE) {
      logFileStream.end()
      
      const backupPath = LOG_FILE_PATH + '.old'
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
      if (fs.existsSync(LOG_FILE_PATH)) {
        fs.renameSync(LOG_FILE_PATH, backupPath)
      }
      
      logFileStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' })
      currentLogSize = 0
      
      const rotationMsg = `[${timestamp}] === РОТАЦИЯ ЛОГА (превышен размер ${MAX_LOG_SIZE} байт) ===\\n`
      logFileStream.write(rotationMsg)
      currentLogSize += Buffer.byteLength(rotationMsg)
    }
    
    logFileStream.write(logLine)
    currentLogSize += byteLength
    
  } catch (e) {}
}

initLogFile()

process.on('exit', () => {
  if (logFileStream) {
    const exitMsg = `[${new Date().toISOString()}] === ЗАВЕРШЕНИЕ СЕССИИ ===\\n`
    logFileStream.write(exitMsg)
    logFileStream.end()
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
const MC_VERSION = config.server.version
const PASSWORD = config.server.password
const MENU_SLOT_1 = config.menu.slot1
const MENU_SLOT_2 = config.menu.slot2
const HOTBAR_SLOT = config.menu.hotbarSlot
const MOBILE_SNAPSHOT_INTERVAL_MS = 4000
const MOBILE_RESOURCE_INTERVAL_MS = 5000
const MOBILE_PAUSE_CHECK_INTERVAL_MS = 4000
const MOBILE_POSITION_CHECK_INTERVAL_MS = 15000

const DIG_DELAY = Math.max(0, Number(config.timing.digDelay) || 0)
const EMPTY_SCAN_DELAY_MS = Math.max(0, Number(config.timing.emptyScanDelayMs ?? 0) || 0)
const STUCK_THRESHOLD = Number(config.timing.stuckThreshold) || 0
const DIG_LOOP_WATCHDOG_MS = Math.max(5000, STUCK_THRESHOLD)
const RESTART_IF_IDLE_MS = Number(config.timing.restartIfIdleMs) || 0
const RECONNECT_REGULAR = config.timing.reconnectRegular
const RECONNECT_ON_INTERNET_LOSS = config.timing.reconnectOnInternetLoss
const INTERNET_RETRY_INTERVAL = config.timing.internetRetryInterval
const INTERNET_CHECK_INTERVAL = config.timing.internetCheckInterval
const MAX_INTERNET_RETRIES = config.timing.maxInternetRetries
const GRACE_AFTER_SPAWN = config.timing.graceAfterSpawn
const POST_JOIN_DIG_START_MS = Math.max(0, config.timing.postJoinDigStartMs ?? 25)
const START_STAGGER = config.timing.startStagger
const START_STAGGER_JITTER = config.timing.startStaggerJitter
const PERIODIC_REJOIN_MS = config.timing.periodicRejoinMs || 3600000
const ANTIBOT_MIN_INTERVAL = config.antibot.minInterval
const ANTIBOT_MAX_INTERVAL = config.antibot.maxInterval
const ANTIBOT_SHORT_MOVE_MS = config.antibot.shortMoveMs
const ANTIBOT_FALL_CHECK_ENABLED = config.antibot.fallCheckEnabled
const ANTIBOT_FALL_CHECK_TIMEOUT = config.antibot.fallCheckTimeout
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
const MEMORY_LIMIT_MB = config.globalRestart?.memoryLimitMB || 0
const ENABLE_SOFT_RESTART = config.features?.enableSoftRestart !== false
const ENABLE_AGGRESSIVE_MINING = config.features?.enableAggressiveMining !== false && !MOBILE_RUNTIME_PROFILE
const ENABLE_PERIODIC_ROTATION = config.features?.enablePeriodicRotation === true
const SPEED_WINDOW_MS = Math.max(1000, config.monitor?.speedWindowMs || 10000)
const HEADLESS_MODE = process.argv.includes('--headless') ||
  process.env.BOT_HEADLESS === '1' ||
  !process.stdout.isTTY ||
  !process.stdin.isTTY

// ============================================================================
// Р вЂњР В Р С’Р В¤Р ВР В§Р вЂўР РЋР С™Р ВР в„ў Р ВР СњР СћР вЂўР В Р В¤Р вЂўР в„ўР РЋ (BLESSED)
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
// Р вЂќР С’Р СњР СњР В«Р вЂў Р СљР С›Р СњР ВР СћР С›Р В Р ВР СњР вЂњР С’
// ============================================================================
const monitorData = {
  startTime: Date.now(),
  bots: {},
  totalBlocks: 0
}
monitorData.scriptResources = {
  cpu: [],
  ram: [],
  x: []
}


// ============================================================================
// Р В¤Р Р€Р СњР С™Р В¦Р ВР В UI
// ============================================================================
function safeRender() {
  if (!screen || HEADLESS_MODE) return
  try { screen.render() } catch (e) {}
}

function refreshBotRates(now = Date.now()) {
  for (const botData of Object.values(monitorData.bots)) {
    const stats = computeBotRateStats(botData.blockTimes, now, SPEED_WINDOW_MS)
    botData.blockTimes = stats.blockTimes
    botData.blocksLastMinute = stats.blocksLastMinute
    botData.blocksPerSecond = stats.blocksPerSecond
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

  infoBox.setContent([
    `  {cyan-fg}  Время работы:{/cyan-fg}  {bold}${hours}ч ${minutes}Рј ${seconds}с{/bold}`,
    `  {green-fg} Боты активны:{/green-fg}  {bold}${activeBots}/${totalBots}{/bold}`,
    `  {yellow-fg} Добыто блоков:{/yellow-fg}  {bold}${monitorData.totalBlocks}{/bold}`,
    `  {magenta-fg} Средняя скорость:{/magenta-fg}  {bold}${avgRate} блоков/час{/bold}`,
    `  {white-fg} Текущая скорость:{/white-fg}  {bold}${formatBlocksPerSecond(currentRate)}{/bold}`,
    `  {white-fg} За минуту:{/white-fg}  {bold}${formatBlocksPerMinute(currentRatePerMinute)}{/bold}`,
    `  {blue-fg} Ротация:{/blue-fg}  {bold}каждые ${Math.round(PERIODIC_REJOIN_MS / 60000)} РјРёРЅ{/bold}`,
    `  {${diggingPaused ? 'red' : 'green'}-fg} Копание:{/}  {bold}${diggingPaused ? 'ПАУЗА' : 'АКТИВНО'}{/bold}`
  ].join('\n'))
  return

  infoBox.setContent(`
  {cyan-fg}  Время работы:{/cyan-fg}  {bold}${hours}ч ${minutes}Рј ${seconds}с{/bold}
  {green-fg} Боты активны:{/green-fg}  {bold}${activeBots}/${totalBots}{/bold}
  {yellow-fg}  Добыто блоков:{/yellow-fg}  {bold}${monitorData.totalBlocks}{/bold}
  {magenta-fg} Средняя скорость:{/magenta-fg}  {bold}${avgRate} блоков/час{/bold}
  {white-fg} Текущая скорость:{/white-fg}  {bold}${formatBlocksPerSecond(currentRate)}{/bold}
  {blue-fg} Ротация:{/blue-fg}  {bold}каждые ${Math.round(PERIODIC_REJOIN_MS/60000)} РјРёРЅ{/bold}
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
  const uptime = Date.now() - monitorData.startTime
  const currentRatePerMinute = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.blocksLastMinute || 0), 0)
  const currentRatePerSecond = Object.values(monitorData.bots)
    .reduce((sum, bot) => sum + (bot.blocksPerSecond || 0), 0)

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
    bots: Object.fromEntries(
      Object.entries(monitorData.bots).map(([botName, botData]) => [
        botName,
        {
          status: diggingPaused && botData.status === 'копает' ? 'пауза' : botData.status,
          blocksTotal: botData.blocksTotal || 0,
          blocksLastMinute: botData.blocksLastMinute || 0,
          blocksPerSecond: botData.blocksPerSecond || 0,
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
  
  const cleanMessage = message
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[+✗⚠•⏸▶OKERR]/g, '')
    .trim()
  
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

function updateBotStatus(botName, status, data = {}) {
  if (!monitorData.bots[botName]) {
    monitorData.bots[botName] = {
      status, blocksTotal: 0, blocksLastMinute: 0, blocksPerSecond: 0,
      lastBlockTime: Date.now(), blockTimes: []
    }
  }
  const bot = monitorData.bots[botName]
  bot.status = status
  let eventTimestamp = Date.now()
  if (data.blockMined) {
    bot.blocksTotal++
    monitorData.totalBlocks++
    const now = Date.now()
    bot.blockTimes.push(now)
    bot.lastBlockTime = now
    eventTimestamp = now
  } else if (data.timestamp) {
    eventTimestamp = data.timestamp
  }
  refreshBotRates()

  emitRuntimeEvent('bot-status', {
    botName,
    status: diggingPaused && bot.status === 'копает' ? 'пауза' : bot.status,
    blocksTotal: bot.blocksTotal || 0,
    blocksLastMinute: bot.blocksLastMinute || 0,
    blocksPerSecond: bot.blocksPerSecond || 0,
    blockMined: Boolean(data.blockMined),
    timestamp: bot.lastBlockTime || eventTimestamp
  })
  requestUiRefresh()
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
// Р С’Р вЂ™Р СћР С›Р СљР С’Р СћР ВР В§Р вЂўР РЋР С™Р ВР в„ў Р СџР вЂўР В Р вЂўР вЂ”Р С’Р СџР Р€Р РЋР С™ Р вЂ”Р С’Р РЋР СћР В Р Р‡Р вЂ™Р РЃР ВР Тђ Р вЂР С›Р СћР С›Р вЂ™
// ============================================================================
function checkAndRestartStuckBots() {
  if (!runtimeEnabled || shuttingDown) return
  const now = Date.now()
  const STUCK_OFFLINE_THRESHOLD = 300000 // 5 Р СР С‘Р Р…РЎС“РЎвЂљ
  
  for (const botObj of activeBots) {
    if (!botObj.bot || !botObj.bot.entity || !botObj.isOnline) {
      const botData = monitorData.bots[botObj.username]
      if (botData) {
        const timeSinceLastBlock = now - botData.lastBlockTime
        
        if (timeSinceLastBlock > STUCK_OFFLINE_THRESHOLD && botData.status === 'оффлайн') {
          addLog('warning', 'SYSTEM', `Бот ${botObj.username} застрял офлайн (${Math.round(timeSinceLastBlock/60000)}мин) - перезапуск`)
          
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

setInterval(checkAndRestartStuckBots, 120000)

// ============================================================================
// Р вЂєР С›Р вЂњР ВР С™Р С’ Р вЂР С›Р СћР С›Р вЂ™
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
// Р Р€Р вЂєР Р€Р В§Р РЃР вЂўР СњР СњР С’Р Р‡ Р РЋР ВР РЋР СћР вЂўР СљР С’ Р В Р С›Р СћР С’Р В¦Р ВР В Р вЂР С›Р СћР С›Р вЂ™
// ============================================================================
async function rotateBots() {
  if (rotationInProgress || activeBots.length === 0) return
  rotationInProgress = true
  
  addLog('info', 'ROTATION', ` Начинаю плановую ротацию ботов (интервал: ${Math.round(PERIODIC_REJOIN_MS/60000)} РјРёРЅ)`)
  
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
// Р РЋР С›Р вЂ”Р вЂќР С’Р СњР ВР вЂў Р вЂР С›Р СћР С’
// ============================================================================
function createBot(cfg) {
  const username = cfg.username
  const blocksToMine = cfg.blocksToMine
  const miningTargets = blocksToMine.map(({ x, y, z }) => vec3(x, y, z))
  const standPosition = cfg.standPosition ? vec3(cfg.standPosition.x, cfg.standPosition.y, cfg.standPosition.z) : null
  const entryButtonPosition = cfg.entryButton?.enabled
    ? vec3(cfg.entryButton.x, cfg.entryButton.y, cfg.entryButton.z)
    : null
  const maxDistance = cfg.maxDistanceFromStand || 0.6
  
  let bot = null
  let menuTimer = null, reconnectTimer = null, reconnectGraceTimer = null
  let positionCheckTimer = null, positionCheckStartTimer = null, preventiveRestartTimer = null
  let fallCheckTimer = null, keepAliveTimer = null, fullServerRetryTimer = null
  let postJoinStartTimer = null, recreateRetryTimer = null
  let joinedSubserver = false, lastDigTime = 0
  let spawnGraceUntil = 0, backoff = RECONNECT_REGULAR
  let menuAttempts = 0, lastMenuAttempt = 0
  let isReturningToPosition = false
  let reconnectScheduled = false
  let waitingForFall = false
  let initialY = null
  let fallCheckPassed = false
  let authQuickLogin = false
  let retryingFullServer = false
  let isOnline = false
  let isRotating = false
  let lastKeepAlive = Date.now()
  let botHandle = null
  let sessionEpoch = 1
  let digLoopRunning = false
  let digLoopHeartbeatAt = 0
  let digLoopGraceUntil = 0

  // FIX 1: Р РЋРЎвЂЎРЎвЂРЎвЂљРЎвЂЎР С‘Р С” Р С—Р С•Р Р†РЎвЂљР С•РЎР‚Р Р…РЎвЂ№РЎвЂ¦ Р С”Р С‘Р С”Р С•Р Р† "Р С—Р С•Р Т‘Р С•Р В¶Р Т‘Р С‘РЎвЂљР Вµ" Р Т‘Р В»РЎРЏ Р В°Р Т‘Р В°Р С—РЎвЂљР С‘Р Р†Р Р…Р С•Р С–Р С• backoff
  let waitKickCount = 0
  // FIX 2: Р В¤Р В»Р В°Р С– Р С—Р С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р С‘РЎРЏ Р С—Р С•Р В·Р С‘РЎвЂ Р С‘Р С‘ РІР‚вЂќ Р С—Р С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ Р Р…Р В°Р Т‘РЎвЂР В¶Р Р…Р В° РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С—Р С•РЎРѓР В»Р Вµ Р С—Р ВµРЎР‚Р Р†Р С•Р С–Р С• Р В±Р В»Р С•Р С”Р В°
  let positionConfirmed = false
  let entryButtonPressed = false

  function getStandDelta() {
    if (!standPosition || !bot || !bot.entity) return null

    const dx = standPosition.x - bot.entity.position.x
    const dy = standPosition.y - bot.entity.position.y
    const dz = standPosition.z - bot.entity.position.z

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

  function touchDigLoop(timestamp = Date.now()) {
    digLoopHeartbeatAt = timestamp
    return timestamp
  }

  function getReconnectGraceDelay() {
    return Math.max(0, spawnGraceUntil - Date.now())
  }

  function invalidateSession() {
    sessionEpoch += 1
    digLoopRunning = false
    digLoopHeartbeatAt = 0
    digLoopGraceUntil = 0
  }

  function resetSessionState() {
    invalidateSession()
    joinedSubserver = false
    spawnGraceUntil = 0
    isReturningToPosition = false
    waitingForFall = false
    initialY = null
    fallCheckPassed = false
    positionConfirmed = false
    entryButtonPressed = false
    isOnline = false
  }

  function disposeBotInstance() {
    cleanupTimers()
    resetSessionState()
    reconnectScheduled = false
    try { if (bot) bot.removeAllListeners() } catch(e){}
    try { if (bot) bot.quit() } catch(e){}
    bot = null
  }


  function cleanupTimers() {
    try { if (menuTimer) clearTimeout(menuTimer) } catch(e){}
    try { if (reconnectTimer) clearTimeout(reconnectTimer) } catch(e){}
    try { if (reconnectGraceTimer) clearTimeout(reconnectGraceTimer) } catch(e){}
    try { if (positionCheckTimer) clearInterval(positionCheckTimer) } catch(e){}
    try { if (positionCheckStartTimer) clearTimeout(positionCheckStartTimer) } catch(e){}
    try { if (preventiveRestartTimer) clearTimeout(preventiveRestartTimer) } catch(e){}
    try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch(e){}
    try { if (keepAliveTimer) clearInterval(keepAliveTimer) } catch(e){}
    try { if (fullServerRetryTimer) clearTimeout(fullServerRetryTimer) } catch(e){}
    try { if (postJoinStartTimer) clearTimeout(postJoinStartTimer) } catch(e){}
    try { if (recreateRetryTimer) clearTimeout(recreateRetryTimer) } catch(e){}
    menuTimer = null
    reconnectTimer = null
    reconnectGraceTimer = null
    positionCheckTimer = null
    positionCheckStartTimer = null
    preventiveRestartTimer = null
    fallCheckTimer = null
    keepAliveTimer = null
    fullServerRetryTimer = null
    postJoinStartTimer = null
    recreateRetryTimer = null
    retryingFullServer = false
  }

  async function pressEntryButtonOnce() {
    if (!entryButtonPosition || entryButtonPressed || !bot || !bot.entity || !joinedSubserver) {
      return false
    }

    let lastError = 'unknown error'

    for (let attempt = 1; attempt <= 6; attempt++) {
      if (!bot || !bot.entity || !joinedSubserver) return false

      const buttonBlock = bot.blockAt(entryButtonPosition)
      if (!buttonBlock || buttonBlock.type === 0) {
        lastError = 'button block not found'
        await sleep(250)
        continue
      }

      const targetPosition = buttonBlock.position.offset(0.5, 0.5, 0.5)
      const distance = bot.entity.position.distanceTo(targetPosition)
      if (distance > 4.7) {
        addLog('warning', username, `Кнопка генератора слишком далеко: ${distance.toFixed(2)}Рј`)
        return false
      }

      try {
        addLog('info', username, `Нажимаю кнопку генератора (${entryButtonPosition.x}, ${entryButtonPosition.y}, ${entryButtonPosition.z})`)
        await bot.lookAt(targetPosition, true)
        await sleep(120 + Math.floor(Math.random() * 80))
        await bot.activateBlock(buttonBlock)
        await sleep(200)
        entryButtonPressed = true
        addLog('success', username, 'Кнопка генератора нажата')
        return true
      } catch (error) {
        lastError = error.message
        await sleep(200)
      }
    }

    addLog('warning', username, `Не удалось нажать кнопку генератора: ${lastError}`)
    return false
  }

  function schedulePostJoinFlow() {
    if (!joinedSubserver || !bot) return
    if (postJoinStartTimer || preventiveRestartTimer || digLoopRunning) return
    const flowSessionEpoch = sessionEpoch

    if (standPosition) {
      startPositionCheck()
    }

    preventiveRestartTimer = setTimeout(() => {
      if (!isCurrentSession(flowSessionEpoch) || !joinedSubserver) return
      addLog('info', username, 'Превентивный перезапуск (1 час)')
      updateBotStatus(username, 'ожидание')
      cleanupTimers()
      backoff = 5000 + Math.floor(Math.random() * 5000)
      scheduleReconnectLocal(backoff, true)
    }, PERIODIC_REJOIN_MS)

    postJoinStartTimer = setTimeout(async () => {
      postJoinStartTimer = null
      if (!isCurrentSession(flowSessionEpoch) || !joinedSubserver || !bot) return
      try {
        await pressEntryButtonOnce()
      } catch (error) {
        addLog('warning', username, `Ошибка автокнопки: ${error.message}`)
      }
      if (!isCurrentSession(flowSessionEpoch) || !joinedSubserver || !bot) return
      startDiggingLoop(flowSessionEpoch).catch(() => {})
    }, POST_JOIN_DIG_START_MS + Math.floor(Math.random() * 25))
  }

  // ============================================================================
  // KEEP-ALIVE Р СљР С›Р СњР ВР СћР С›Р В Р ВР СњР вЂњ
  // ============================================================================
  function startKeepAliveMonitor() {
    if (keepAliveTimer) clearInterval(keepAliveTimer)
    
    keepAliveTimer = setInterval(() => {
      if (!bot || !bot._client || !joinedSubserver) return
      const now = Date.now()
      
      if (digLoopRunning && digLoopHeartbeatAt > 0 && now > digLoopGraceUntil) {
        const digLoopStallFor = now - digLoopHeartbeatAt
        if (digLoopStallFor > DIG_LOOP_WATCHDOG_MS) {
          addLog('warning', username, `Цикл копания завис на ${Math.round(digLoopStallFor / 1000)}с -> переподключение`)
          cleanupTimers()
          updateBotStatus(username, 'ожидание')
          scheduleReconnectLocal(5000, true)
          return
        }
      }

      const timeSinceLastKeepAlive = now - lastKeepAlive
      
      if (timeSinceLastKeepAlive > 25000) {
        addLog('warning', username, `! Нет keep-alive ${Math.round(timeSinceLastKeepAlive/1000)}с`)
        
        if (timeSinceLastKeepAlive > 28000 && getReconnectGraceDelay() <= 0) {
          addLog('error', username, 'Keep-alive таймаут -> перезапуск')
          cleanupTimers()
          updateBotStatus(username, 'ожидание')
          scheduleReconnectLocal(5000)
        }
      }
    }, 5000)
  }

  // ============================================================================
  // Р СџР В Р С›Р вЂ™Р вЂўР В Р С™Р С’ Р В Р вЂ™Р С›Р вЂ”Р вЂ™Р В Р С’Р Сћ Р СњР С’ Р СџР С›Р вЂ”Р ВР В¦Р ВР В®
  // ============================================================================
  async function checkAndReturnToPosition() {
    // FIX 3: Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р В° Р С—Р С•Р В·Р С‘РЎвЂ Р С‘Р С‘ РЎвЂљРЎР‚Р ВµР В±РЎС“Р ВµРЎвЂљ positionConfirmed РІР‚вЂќ Р В±Р В»Р С•Р С”Р С‘РЎР‚РЎС“Р ВµР С Р В»Р С•Р В¶Р Р…РЎвЂ№Р Вµ РЎРѓРЎР‚Р В°Р В±Р В°РЎвЂљРЎвЂ№Р Р†Р В°Р Р…Р С‘РЎРЏ Р С—Р С•РЎРѓР В»Р Вµ auto-entry
    if (!standPosition || !bot || !bot.entity || !joinedSubserver || 
        isReturningToPosition || !positionConfirmed) return
    
    const standDelta = getStandDelta()
    if (!standDelta) return
    const distance = standDelta.distance3d
    
    if (distance > 500) {
      addLog('warning', username, `Телепорт на спавн (${distance.toFixed(0)}м) - перезаход`)
      updateBotStatus(username, 'ожидание')
      cleanupTimers()
      positionConfirmed = false
      scheduleReconnectLocal(3000, true)
      return
    }
    
    if (distance > maxDistance) {
      addLog('warning', username, `Отошёл на ${distance.toFixed(2)}м (лимит ${maxDistance}м), возвращаюсь...`)
      updateBotStatus(username, 'возврат')
      isReturningToPosition = true
      
      try {
        bot.clearControlStates()
        
        const timeout = Date.now() + POSITION_RETURN_TIMEOUT
        let stuck = 0
        
        while (bot && bot.entity) {
          const currentDelta = getStandDelta()
          if (!currentDelta || currentDelta.distance3d <= maxDistance) {
            break
          }
          if (Date.now() > timeout) {
            addLog('warning', username, 'Таймаут возврата')
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
        const finalDelta = getStandDelta()
        if (!finalDelta || finalDelta.distance3d > maxDistance) {
          addLog('warning', username, `Не смог точно вернуться (${finalDelta ? finalDelta.distance3d.toFixed(2) : '?'}Рј)`)
          return
        }
        addLog('success', username, 'Вернулся на позицию')
      } catch (e) {
        addLog('error', username, `Ошибка возврата: ${e.message}`)
      } finally {
        isReturningToPosition = false
        if (bot && bot.entity) {
          updateBotStatus(username, 'копает')
        }
      }
    }
  }

  function startPositionCheck() {
    if (!standPosition || !joinedSubserver || positionCheckTimer || positionCheckStartTimer) return

    // Р вЂ”Р В°Р Т‘Р ВµРЎР‚Р В¶Р С”Р В° 30РЎРѓ Р С—Р ВµРЎР‚Р ВµР Т‘ started Р С—Р С•Р В·Р С‘РЎвЂ Р С‘Р С•Р Р…Р Р…Р С•Р в„– Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р С‘
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
  // Р С›Р вЂР ТђР С›Р вЂќ LIMBOFILTER
  // ============================================================================
  function startActiveFallCheck() {
    if (!bot || !bot.entity) return
    const fallSessionEpoch = sessionEpoch
    
    addLog('info', username, ' LimboFilter - симуляция падения')
    initialY = bot.entity.position.y
    const startX = bot.entity.position.x
    const startZ = bot.entity.position.z
    
    let tick = 0
    let velocity = 0
    let currentY = initialY
    let hasFallen = false
    
    const GRAVITY = 0.08
    const DRAG = 0.02
    
    bot.clearControlStates()
    
    const fallInterval = setInterval(() => {
      if (!isCurrentSession(fallSessionEpoch) || !bot || !bot._client || joinedSubserver || hasFallen) {
        clearInterval(fallInterval)
        return
      }
      
      tick++
      
      velocity -= GRAVITY
      velocity *= 0.98
      currentY += velocity
      
      if (velocity < -3.92) {
        velocity = -3.92
      }
      
      try {
        bot._client.write('position', {
          x: startX,
          y: currentY,
          z: startZ,
          onGround: false
        })
        
        if (tick % 20 === 0 || tick === 1 || tick === 5 || tick === 10) {
          const fallen = initialY - currentY
          addLog('info', username, `[${tick}т] Упал ${fallen.toFixed(1)}Рј`)
        }
      } catch(e) {
        addLog('warning', username, `Ошибка пакета: ${e.message}`)
      }
      
      if (tick === 20 || tick === 60 || tick === 100) {
        try {
          const randomYaw = (Math.random() - 0.5) * 0.4
          const randomPitch = 0.5 + (Math.random() - 0.5) * 0.3
          bot.look(randomYaw, randomPitch).catch(() => {})
        } catch(e) {}
      }
      
      if (tick >= 128) {
        const totalFallen = initialY - currentY
        addLog('success', username, `OK 128 тиков! Упал ${totalFallen.toFixed(1)}Рј`)
        
        try {
          bot._client.write('position', {
            x: startX,
            y: currentY,
            z: startZ,
            onGround: true
          })
        } catch(e) {}
        
        hasFallen = true
        fallCheckPassed = true
        waitingForFall = false
        clearInterval(fallInterval)
        
        // Р СџР С•РЎРѓР В»Р Вµ РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•Р С–Р С• Р С—Р В°Р Т‘Р ВµР Р…Р С‘РЎРЏ РІР‚вЂќ Р С•Р В¶Р С‘Р Т‘Р В°Р ВµР С РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р Вµ "Р С•РЎвЂљРЎРѓР В»Р ВµР В¶Р С‘Р Р†Р В°Р ВµРЎвЂљРЎРѓРЎРЏ" 5 РЎРѓР ВµР С”РЎС“Р Р…Р Т‘
        // FIX 4: positionConfirmed = false, Р С—Р С•Р С”Р В° Р Р…Р Вµ Р С—Р С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р Т‘Р С‘Р С Р С—Р С•Р В·Р С‘РЎвЂ Р С‘РЎР‹ РЎвЂЎР ВµРЎР‚Р ВµР В· Р С—Р ВµРЎР‚Р Р†РЎвЂ№Р в„– Р В±Р В»Р С•Р С”
        setTimeout(() => {
          if (!isCurrentSession(fallSessionEpoch)) return
          if (!joinedSubserver && bot && bot.entity) {
            addLog('info', username, ' Автовход после LimboFilter')
            joinedSubserver = true
            positionConfirmed = false // Р СџР С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ Р СњР вЂў Р С—Р С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р В° РІР‚вЂќ Р В¶Р Т‘РЎвЂР С Р С—Р ВµРЎР‚Р Р†РЎвЂ№Р в„– Р В±Р В»Р С•Р С”
            updateBotStatus(username, 'копает')
            
            schedulePostJoinFlow()
          }
        }, 5000)
        return
      }
      
      if (tick >= 300) {
        addLog('warning', username, ` Таймаут ${tick}т`)
        hasFallen = true
        fallCheckPassed = true
        waitingForFall = false
        clearInterval(fallInterval)
      }
    }, 50)
    
    setTimeout(() => {
      if (!isCurrentSession(fallSessionEpoch)) return
      if (!hasFallen && !joinedSubserver) {
        addLog('error', username, 'ERR Критический таймаут!')
        hasFallen = true
        fallCheckPassed = true
        waitingForFall = false
        clearInterval(fallInterval)
      }
    }, 16000)
  }

  function startLimboFilterBypass() {
    if (fallCheckPassed || joinedSubserver) return
    const limboSessionEpoch = sessionEpoch

    addLog('info', username, ' Проверка наличия LimboFilter...')
    waitingForFall = true
    
    const humanDelay = 800 + Math.floor(Math.random() * 1200)
    
    setTimeout(() => {
      if (!isCurrentSession(limboSessionEpoch)) return
      if (fallCheckPassed || joinedSubserver) {
        waitingForFall = false
        return
      }
      
      if (!bot || !bot.entity) {
        waitingForFall = false
        fallCheckPassed = true
        return
      }
      
      initialY = bot.entity.position.y
      
      setTimeout(() => {
        if (!isCurrentSession(limboSessionEpoch)) return
        if (bot && bot.entity && !joinedSubserver) {
          const randomYaw = (Math.random() - 0.5) * 0.6
          const randomPitch = (Math.random() - 0.5) * 0.3
          bot.look(randomYaw, randomPitch).catch(() => {})
        }
      }, 300 + Math.floor(Math.random() * 400))
      
      setTimeout(() => {
        if (!isCurrentSession(limboSessionEpoch)) return
        if (bot && bot.entity && !joinedSubserver) {
          const randomYaw = (Math.random() - 0.5) * 0.8
          const randomPitch = (Math.random() - 0.5) * 0.4
          bot.look(randomYaw, randomPitch).catch(() => {})
        }
      }, 1200 + Math.floor(Math.random() * 800))
      
      const fallCheckDelay = 4000 + Math.floor(Math.random() * 1000)
      fallCheckTimer = setTimeout(() => {
        if (!isCurrentSession(limboSessionEpoch) || !bot || !bot.entity || joinedSubserver || fallCheckPassed) {
          waitingForFall = false
          return
        }
        
        const currentY = bot.entity.position.y
        const fallDistance = initialY - currentY
        
        if (fallDistance > 0.3 || bot.entity.onGround) {
          fallCheckPassed = true
          waitingForFall = false
          addLog('success', username, `+ Проверка пройдена (${fallDistance.toFixed(2)}Рј)`)
        } else {
          fallCheckPassed = true
          waitingForFall = false
        }
      }, fallCheckDelay)
    }, humanDelay)
    
    const totalTimeout = 12000 + Math.floor(Math.random() * 1000)
    setTimeout(() => {
      if (!isCurrentSession(limboSessionEpoch)) return
      if (waitingForFall && !joinedSubserver && !fallCheckPassed) {
        addLog('error', username, 'ERR ТАЙМАУТ LimboFilter')
        fallCheckPassed = true
        waitingForFall = false
      }
    }, totalTimeout)
  }

  function scheduleReconnectLocal(delay = backoff, forcedReconnect = false) {
    // FIX 5: Р СћР С‘РЎвЂ¦Р С• Р С—РЎР‚Р С•Р С—РЎС“РЎРѓР С”Р В°Р ВµР С Р Т‘РЎС“Р В±Р В»Р ВµР в„– РІР‚вЂќ РЎС“Р В±Р С‘РЎР‚Р В°Р ВµР С РЎРѓР С—Р В°Р С "РЎС“Р В¶Р Вµ Р Р† Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘"
    if (!bot && !joinedSubserver) {
      return
    }

    if (reconnectScheduled) {
      return
    }
    
    if (isRotating) {
      isRotating = false
      return
    }
    
    reconnectScheduled = true

    const graceDelay = getReconnectGraceDelay()
    if (graceDelay > 0 && !forcedReconnect) {
      reconnectScheduled = false
      
      if (!reconnectGraceTimer) {
        reconnectGraceTimer = setTimeout(() => {
          reconnectGraceTimer = null
          scheduleReconnectLocal(delay, true)
        }, Math.min(graceDelay, 30000))
      }
      return
    }

    const jitter = Math.floor(Math.random() * 3000)
    addLog('info', username, `Переподключение через ${Math.round((delay + jitter)/1000)}с`)
    updateBotStatus(username, 'ожидание')

    reconnectTimer = setTimeout(() => {
      reconnectScheduled = false
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

        /*
        activeBots[index] = newObj
          addLog('success', username, 'Р В­Р С”Р В·Р ВµР СР С—Р В»РЎРЏРЎР‚ Р В·Р В°Р СР ВµР Р…РЎвЂР Р…')
        } else {
          activeBots.push(newObj)
          addLog('success', username, 'Р В­Р С”Р В·Р ВµР СР С—Р В»РЎРЏРЎР‚ Р Т‘Р С•Р В±Р В°Р Р†Р В»Р ВµР Р…')
        }
        */
        activeBots[index] = newObj
        addLog('success', username, 'Bot instance replaced')
      } catch(e) {
        addLog('error', username, `Ошибка создания: ${e.message}`)
        reconnectScheduled = false
        recreateRetryTimer = setTimeout(() => scheduleReconnectLocal(5000, true), 5000)
      }
    }, delay + jitter)
  }


  function startClient() {
    const botOptions = {
      host: SERVER_HOST,
      username,
      auth: 'offline',
      version: MC_VERSION,
      keepAlive: true,
      keepAliveInterval: 15000
    }
    
    bot = mineflayer.createBot(botOptions)
    
    if (physicsPlugin) {
      try {
        bot.loadPlugin(physicsPlugin.plugin)
        addLog('success', username, 'OK Плагин физики загружен')
      } catch(e) {
        addLog('warning', username, `! Физика не загрузилась: ${e.message}`)
      }
    }
    
    if (bot._client) {
      bot._client.on('keep_alive', () => {
        lastKeepAlive = Date.now()
      })
      
      bot._client.on('error', (err) => {
        const msg = String(err && err.message ? err.message : err)
        if (msg.includes('connect ETIMEDOUT') || msg.includes('connect ECONNREFUSED')) {
          return
        }
      })
    }
    
    if (bot._client.socket) {
      bot._client.socket.on('error', () => {})
    }
    
    bot.once('spawn', async () => {
      const spawnSessionEpoch = sessionEpoch
      addLog('success', username, 'Подключен к серверу')
      updateBotStatus(username, 'подключается')
      isOnline = true
      lastKeepAlive = Date.now()
      spawnGraceUntil = Date.now() + GRACE_AFTER_SPAWN
      
      menuAttempts = 0
      
      if (bot._client && bot._client.socket) {
        bot._client.socket.on('error', () => {})
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
      
      try {
        bot.setQuickBarSlot(HOTBAR_SLOT)
        const thinkingDelay = 700 + Math.floor(Math.random() * 600)
        await sleep(thinkingDelay)
        if (!isCurrentSession(spawnSessionEpoch) || !bot) return
        bot.activateItem()
      } catch (e) {}
      backoff = RECONNECT_REGULAR
    })

    function safeClickWindow(slot, options = {}) {
      if (!bot || !bot.currentWindow) return false
      const { countAttempt = true, minIntervalMs = 900 } = options
      const now = Date.now()
      if (now - lastMenuAttempt < minIntervalMs) return false
      lastMenuAttempt = now
      if (countAttempt) {
        menuAttempts++
      }
      const windowId = bot.currentWindow.id
      const item = bot.currentWindow.slots[slot] || { itemId: -1 }
      try {
        bot._client.write('window_click', { windowId, slot, mouseButton: 0, action: 0, mode: 0, item })
        return true
      } catch (e) {
        noteGlobalError()
        return false
      }
    }

    async function tryOpenMenuOnce(ignoreAttemptLimit = false) {
      if (!bot || !bot.currentWindow || joinedSubserver) return
      if (!ignoreAttemptLimit && !retryingFullServer && menuAttempts >= 6) {
        backoff = 60000 + Math.floor(Math.random() * 120000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      safeClickWindow(MENU_SLOT_1, { countAttempt: !ignoreAttemptLimit })
      
      const humanClickDelay = 800 + Math.floor(Math.random() * 700)
      await sleep(humanClickDelay)
      
      safeClickWindow(MENU_SLOT_2, { countAttempt: !ignoreAttemptLimit })
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
      
      if (bot.currentWindow) {
        safeClickWindow(MENU_SLOT_2, { countAttempt: false, minIntervalMs: 900 })
        return
      }
      
      try {
        bot.setQuickBarSlot(HOTBAR_SLOT)
        bot.activateItem()
      } catch (e) {
        return
      }
      
      await sleep(350)
      
      if (!bot.currentWindow || joinedSubserver) return
      await tryOpenMenuOnce(true)
    }

    function startFullServerRetry() {
      if (joinedSubserver || retryingFullServer) return
      
      retryingFullServer = true
      menuAttempts = 0
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
      if (!joinedSubserver && !retryingFullServer) tryOpenMenuOnce().catch(()=>{})
      const nextAttempt = 3000 + Math.floor(Math.random()*2000)
      menuTimer = setTimeout(menuLoop, nextAttempt)
    })()

    bot.on('message', msg => {
      try {
        const text = msg.toString().toLowerCase()
        
        if (text.includes('/login') || text.includes('авторизация')) {
          try { bot.chat(`/login ${PASSWORD}`) } catch(e){}
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
        
        if ((text.includes('сканер') || text.includes('scanner')) && 
            (text.includes('дождитесь') || text.includes('не двигайтесь') || 
             text.includes('please wait') || text.includes('don\'t move'))) {
          addLog('warning', username, '! Обнаружен LimboFilter Сканер!')
          
          if (!waitingForFall || !initialY) {
            startActiveFallCheck()
          }
        }
        
        // FIX 6: Р СџРЎР‚Р С‘ Р Р…Р С•РЎР‚Р СР В°Р В»РЎРЉР Р…Р С•Р С Р Р†РЎвЂ¦Р С•Р Т‘Р Вµ РЎвЂЎР ВµРЎР‚Р ВµР В· Р СР ВµР Р…РЎР‹ РІР‚вЂќ Р С—Р С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ РЎРѓРЎР‚Р В°Р В·РЎС“ Р Р†Р В°Р В»Р С‘Р Т‘Р Р…Р В°
        if (!joinedSubserver && text.includes('отслеживается')) {
          stopFullServerRetry()
          joinedSubserver = true
          positionConfirmed = true   // Р СњР С•РЎР‚Р СР В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р Р†РЎвЂ¦Р С•Р Т‘ = Р С—Р С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ РЎРѓРЎР‚Р В°Р В·РЎС“ Р Р†Р В°Р В»Р С‘Р Т‘Р Р…Р В°
          waitKickCount = 0          // Р РЋР В±РЎР‚Р С•РЎРѓ РЎРѓРЎвЂЎРЎвЂРЎвЂљРЎвЂЎР С‘Р С”Р В° Р С”Р С‘Р С”Р С•Р Р† Р С—РЎР‚Р С‘ РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•Р С Р Р†РЎвЂ¦Р С•Р Т‘Р Вµ
          addLog('success', username, 'Зашёл на подсервер')
          updateBotStatus(username, 'копает')
          try { if (menuTimer) clearTimeout(menuTimer) } catch(e){}
          try { if (fallCheckTimer) clearTimeout(fallCheckTimer) } catch(e){}
          
          waitingForFall = false
          fallCheckPassed = true
          
          schedulePostJoinFlow()
        }
      } catch (e) {}
    })

    bot.on('kicked', reason => {
      isOnline = false
      // FIX 7: Р РЋР В±РЎР‚Р С•РЎРѓ positionConfirmed Р С—РЎР‚Р С‘ Р В»РЎР‹Р В±Р С•Р С Р С”Р С‘Р С”Р Вµ
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
      
      addLog('warning', username, `Кикнут: ${r.substring(0, 100)}`)
      
      updateBotStatus(username, 'оффлайн')
      cleanupTimers()
      
      const low = r.toLowerCase()
      
      // FIX 8: Р С’Р Т‘Р В°Р С—РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р в„– backoff Р Т‘Р В»РЎРЏ "Р С—Р С•Р Т‘Р С•Р В¶Р Т‘Р С‘РЎвЂљР Вµ" Р С”Р С‘Р С”Р С•Р Р†
      // Р С™Р В°Р В¶Р Т‘РЎвЂ№Р в„– Р С—Р С•Р Р†РЎвЂљР С•РЎР‚ РЎС“Р Р†Р ВµР В»Р С‘РЎвЂЎР С‘Р Р†Р В°Р ВµРЎвЂљ Р В·Р В°Р Т‘Р ВµРЎР‚Р В¶Р С”РЎС“ Р Р…Р В° 5 Р СР С‘Р Р…РЎС“РЎвЂљ, Р СР В°Р С”РЎРѓ 30 Р СР С‘Р Р…РЎС“РЎвЂљ
      if (low.includes('подождите') || low.includes('wait') || low.includes('перед повторным')) {
        waitKickCount++
        const baseDelay = Math.min(600000 + (waitKickCount - 1) * 300000, 1800000) // 10Р СР С‘Р Р… + 5Р СР С‘Р Р… * N, Р СР В°Р С”РЎРѓ 30Р СР С‘Р Р…
        const jitter = Math.floor(Math.random() * 60000)
        backoff = baseDelay + jitter
        addLog('warning', username, `! Подождите (попытка ${waitKickCount}) - ждём ${Math.round(backoff/60000)} РјРёРЅ`)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (low.includes('antibot') || low.includes('антибот')) {
        if (low.includes('превысили') || low.includes('превышение')) {
          addLog('error', username, 'ERR LimboFilter НЕ ПРОЙДЕН')
          backoff = 15000 + Math.floor(Math.random() * 15000)
        } else {
          backoff = 8000 + Math.floor(Math.random() * 12000)
        }
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (low.includes('you are logging in too fast') || low.includes('logging too')) {
        addLog('warning', username, '! Слишком быстрый вход - ждём 1-2 минуты')
        backoff = 60000 + Math.floor(Math.random() * 60000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      // FIX 9: "already connected" РІР‚вЂќ РЎС“Р Р†Р ВµР В»Р С‘РЎвЂЎР С‘Р Р†Р В°Р ВµР С Р Т‘Р С• 45-90 РЎРѓР ВµР С”РЎС“Р Р…Р Т‘
      if (low.includes('already connected')) {
        backoff = 45000 + Math.floor(Math.random() * 45000)
        addLog('warning', username, `Already connected - ждём ${Math.round(backoff/1000)}с`)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      backoff = 10000 + Math.floor(Math.random() * 10000)
      scheduleReconnectLocal(backoff, true)
    })

    bot.on('end', () => {
      isOnline = false
      positionConfirmed = false // FIX 7b: РЎРѓР В±РЎР‚Р С•РЎРѓ Р С—РЎР‚Р С‘ Р С•РЎвЂљР С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р С‘Р С‘
      resetSessionState()
      if (!reconnectScheduled && !isRotating) {
        addLog('warning', username, 'Отключен от сервера')
        updateBotStatus(username, 'оффлайн')
        cleanupTimers()
        backoff = 8000 + Math.floor(Math.random() * 12000)
        scheduleReconnectLocal(backoff, false)
      }
    })

    bot.on('error', err => {
      isOnline = false
      positionConfirmed = false // FIX 7c: РЎРѓР В±РЎР‚Р С•РЎРѓ Р С—РЎР‚Р С‘ Р С•РЎв‚¬Р С‘Р В±Р С”Р Вµ
      resetSessionState()
      const msg = String(err && err.message ? err.message : err)
      
      if (msg.includes('Ignoring block entities')) return
      if (msg.includes('chunk failed to load')) return
      if (msg.includes('entity.objectType')) return
      if (msg.includes('deprecated')) return
      
      addLog('error', username, msg.substring(0, 60))
      cleanupTimers()
      updateBotStatus(username, 'оффлайн')
      
      if (msg.includes('connect ETIMEDOUT') || err.syscall === 'connect') {
        backoff = 15000 + Math.floor(Math.random() * 15000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (msg.includes('client timed out after')) {
        addLog('warning', username, '! Клиент таймаут')
        backoff = 20000 + Math.floor(Math.random() * 20000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      if (msg.toLowerCase().includes('you are logging in too fast') || msg.toLowerCase().includes('logging too')) {
        backoff = 60000 + Math.floor(Math.random() * 60000)
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      const isNetworkError = ['ECONNRESET','ECONNABORTED','ENOTFOUND','ETIMEDOUT','EAI_AGAIN','EHOSTUNREACH']
        .some(c => (err.code||'').includes(c)) || msg.includes('socket hang up')
      
      if (isNetworkError) {
        const isConnectionIssue = (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' || err.code === 'EHOSTUNREACH')
        
        if (isConnectionIssue) {
          backoff = 20000 + Math.floor(Math.random() * 20000)
          noteNoInternetError()
        } else {
          backoff = 8000 + Math.floor(Math.random() * 12000)
        }
        
        scheduleReconnectLocal(backoff, true)
        return
      }
      
      backoff = 15000 + Math.floor(Math.random() * 15000)
      scheduleReconnectLocal(backoff, true)
    })
  }

  async function startDiggingLoop(expectedSessionEpoch = sessionEpoch) {
    if (digLoopRunning) return
    if (!miningTargets.length) {
      addLog('error', username, 'Нет блоков для копания')
      return
    }

    digLoopRunning = true
    try {
      const loopStartedAt = touchDigLoop()
      digLoopGraceUntil = loopStartedAt + 15000
      // Р С›Р В¶Р С‘Р Т‘Р В°Р ВµР С Р С—Р С•Р В»Р Р…Р С•Р в„– Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°Р В»Р С‘Р В·Р В°РЎвЂ Р С‘Р С‘
      for (let i=0;i<100;i++){
        if (!isCurrentSession(expectedSessionEpoch)) return
        if (bot && bot.entity && bot.world && bot.player) break
        await sleep(200)
        touchDigLoop()
      }

      if (!isCurrentSession(expectedSessionEpoch) || !bot || !bot.entity || !bot.world || !bot.player || !joinedSubserver) {
        return
      }
      
      if (waitingForFall) {
        addLog('info', username, 'Ожидание проверки LimboFilter...')
        
        for (let i=0; i<50; i++) {
          if (!isCurrentSession(expectedSessionEpoch)) return
          if (!waitingForFall || joinedSubserver || fallCheckPassed) break
          await sleep(200)
          touchDigLoop()
        }
      }
      
      if (waitingForFall) {
        addLog('warning', username, ' Таймаут LimboFilter - начинаю копать')
        waitingForFall = false
        fallCheckPassed = true
      }
      
      addLog('success', username, 'Начинаю копать')
      
      // FIX 10: lastDigTime Р С‘Р Р…Р С‘РЎвЂ Р С‘Р В°Р В»Р С‘Р В·Р С‘РЎР‚РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ Р вЂ”Р вЂќР вЂўР РЋР В¬, Р Р…Р Вµ Р С—РЎР‚Р С‘ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘Р С‘ Р В±Р С•РЎвЂљР В°
      const readyAt = touchDigLoop()
      lastDigTime = readyAt
      
      // FIX 11: Р вЂњРЎР‚Р ВµР в„–РЎРѓ-Р С—Р ВµРЎР‚Р С‘Р С•Р Т‘ 15 РЎРѓР ВµР С”РЎС“Р Р…Р Т‘ Р Р…Р В° Р С—Р ВµРЎР‚Р Р†РЎвЂ№Р в„– Р В±Р В»Р С•Р С” Р С—Р С•РЎРѓР В»Р Вµ РЎРѓРЎвЂљР В°РЎР‚РЎвЂљР В°
      digLoopGraceUntil = readyAt + 15000
      
      let currentBlockIndex = 0
      let emptyBlocksCounter = 0
      let checksCounter = 0
      let lastCheckTime = readyAt

      while (bot && bot.player && joinedSubserver && isCurrentSession(expectedSessionEpoch)) {
        touchDigLoop()
        if (diggingPaused) {
          // Р СџР В°РЎС“Р В·Р В° РІР‚вЂќ РЎРЊРЎвЂљР С• Р С•РЎРѓР С•Р В·Р Р…Р В°Р Р…Р Р…Р В°РЎРЏ Р С•РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С”Р В°, Р Р…Р Вµ РЎРѓРЎвЂЎР С‘РЎвЂљР В°Р ВµР С Р ВµРЎвЂ Р В·Р В° Р В·Р В°Р Р†Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ
          lastDigTime = Date.now()
          lastCheckTime = lastDigTime
          await sleep(500)
          touchDigLoop()
          continue
        }

        if (isReturningToPosition) {
          lastCheckTime = touchDigLoop()
          await sleep(500)
          touchDigLoop()
          continue
        }

        checksCounter++
        
        if (checksCounter % 50 === 0) {
          const now = Date.now()
          
          if (now - lastCheckTime > 5000) {
            // Р вЂ”Р В°РЎРѓРЎвЂљРЎР‚РЎРЏР В» РІР‚вЂќ Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С РЎвЂљР С•Р В»РЎРЉР С”Р С• Р СџР С›Р РЋР вЂєР вЂў Р С–РЎР‚Р ВµР в„–РЎРѓ-Р С—Р ВµРЎР‚Р С‘Р С•Р Т‘Р В°
            if (STUCK_THRESHOLD > 0 && now > digLoopGraceUntil && now - lastDigTime > STUCK_THRESHOLD) {
              addLog('warning', username, 'Застрял -> перезапуск')
              updateBotStatus(username, 'ожидание')
              scheduleReconnectLocal()
              break
            }
            if (RESTART_IF_IDLE_MS > 0 && now - lastDigTime > RESTART_IF_IDLE_MS) {
              addLog('warning', username, 'Долгий простой -> перезапуск')
              scheduleReconnectLocal()
              return
            }
            lastCheckTime = now
          }
        }
        
        const pos = miningTargets[currentBlockIndex]
        const block = bot.blockAt(pos)
        
        if (!block || block.type === 0) {
          currentBlockIndex = (currentBlockIndex + 1) % miningTargets.length
          emptyBlocksCounter++
          if (emptyBlocksCounter >= miningTargets.length) {
            if (EMPTY_SCAN_DELAY_MS > 0) {
              await sleep(EMPTY_SCAN_DELAY_MS)
              touchDigLoop()
            }
            emptyBlocksCounter = 0
          }
          continue
        }
        
        emptyBlocksCounter = 0
        
        try {
          await bot.dig(block, ENABLE_AGGRESSIVE_MINING ? true : false)

          if (!isCurrentSession(expectedSessionEpoch)) return
          const minedAt = Date.now()
          lastDigTime = minedAt
          touchDigLoop(minedAt)
          if (DIG_DELAY > 0) {
            await sleep(DIG_DELAY)
            touchDigLoop()
          }
          
          // FIX 12: Р СџР С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ Р С—Р С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р В° Р С—Р С•РЎРѓР В»Р Вµ Р С—Р ВµРЎР‚Р Р†Р С•Р С–Р С• РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•Р С–Р С• Р В±Р В»Р С•Р С”Р В°
          if (!positionConfirmed) {
            positionConfirmed = true
            addLog('info', username, 'Позиция подтверждена (первый блок)')
          }
          
          updateBotStatus(username, 'копает', { blockMined: true })
          currentBlockIndex = (currentBlockIndex + 1) % miningTargets.length
          
        } catch(e) {
          const errMsg = e && e.message ? e.message : String(e)
          if (!errMsg.includes('block is out of reach') && 
              !errMsg.includes('digging aborted') &&
              !errMsg.includes('No block has been dug') &&
              !errMsg.includes('block no longer exists')) {
            addLog('warning', username, errMsg.substring(0, 40))
          }
          currentBlockIndex = (currentBlockIndex + 1) % miningTargets.length
          emptyBlocksCounter++
          if (emptyBlocksCounter >= miningTargets.length) {
            if (EMPTY_SCAN_DELAY_MS > 0) {
              await sleep(EMPTY_SCAN_DELAY_MS)
              touchDigLoop()
            }
            emptyBlocksCounter = 0
          }

          if (false) {
            addLog('warning', username, 'Слишком много таймаутов копания -> переподключение')
            updateBotStatus(username, 'ожидание')
            scheduleReconnectLocal(5000, true)
            return
          }
        }
      }
    } catch(e) {
      addLog('error', username, `Ошибка в digging loop: ${e.message}`)
      scheduleReconnectLocal()
    } finally {
      digLoopRunning = false
    }
  }


  botHandle = {
    username,
    get bot() { return bot },
    get isOnline() { return isOnline },
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
// Р вЂњР С›Р В Р Р‡Р В§Р ВР вЂў Р С™Р вЂєР С’Р вЂ™Р ВР РЃР В
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
// Р вЂ”Р С’Р СџР Р€Р РЋР С™
// ============================================================================
addLog('info', 'SYSTEM', ' Менеджер ботов запущен')
addLog('info', 'SYSTEM', `Сервер: ${SERVER_HOST} (${MC_VERSION})`)
addLog('info', 'SYSTEM', `Config: ${CONFIG_FILE_PATH}`)
addLog('info', 'SYSTEM', `Log file: ${LOG_FILE_PATH}`)
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
  const currentRatePerMinuteLabel = formatBlocksPerMinute(currentRatePerMinute)
  
  writeToLogFile(`=== СТАТИСТИКА === Время: ${hours}ч ${minutes}м | Боты: ${activeBots}/${totalBots} | Добыто: ${monitorData.totalBlocks} блоков | Скорость: ${avgRate} бл/ч`)
  
  writeToLogFile(`RATE/MIN: ${currentRatePerMinuteLabel}`)
  for (const [botName, botData] of Object.entries(monitorData.bots)) {
    writeToLogFile(`  ${botName.padEnd(20)} | Статус: ${botData.status.padEnd(12)} | Добыто: ${botData.blocksTotal} | Скорость: ${formatBlocksPerSecond(botData.blocksPerSecond || 0)}`)
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

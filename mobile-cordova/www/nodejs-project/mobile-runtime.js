const cordova = require('cordova-bridge')
const fs = require('fs')
const path = require('path')

const DATA_DIR = cordova.app.datadir()
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const SETTINGS_PATH = path.join(DATA_DIR, 'desktop-settings.json')
const LOG_PATH = path.join(DATA_DIR, 'bot.log')
const CHAT_LOG_PATH = path.join(DATA_DIR, 'chat.log')
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config.json')
const BOT_ENTRY_PATH = path.join(__dirname, 'bot.js')
const MONITORING_PATH = path.join(__dirname, 'monitoring.js')
const SYSTEM_CHANNEL = '_SYSTEM_'
let nativeBridge = null

try {
  nativeBridge = typeof process._linkedBinding === 'function'
    ? process._linkedBinding('cordova_bridge')
    : null
} catch (error) {}

const DEFAULT_DESKTOP_SETTINGS = {
  launchOnStartup: false,
  autoStartBotsOnLaunch: false,
  startMinimized: false,
  minimizeToTray: false,
  closeToTray: false
}

const runtimeState = createEmptyRuntime()
const MAX_RUNTIME_LOGS = 120
const MAX_RUNTIME_CHAT_LOGS = 180
const ACTIVE_PUBLISH_INTERVAL_MS = 1500
const BACKGROUND_PUBLISH_INTERVAL_MS = 5000
const RUNTIME_HEALTH_CHECK_MS = 15000
const RUNTIME_STALE_EVENT_MS = 90000
const RUNTIME_SELF_RESTART_COOLDOWN_MS = 30000
let runtimeApi = null
let runtimeLoaded = false
let runtimeActive = false
let runtimeDesired = false
let needsReload = false
let keepAliveEnabled = false
let publishTimer = null
let lastPublishedAt = 0
let lastRuntimeEventAt = Date.now()
let lastRuntimeSelfRestartAt = 0
let appInBackground = false

global.__BOT_EVENT_EMITTER__ = handleBotEvent
global.__BOT_HOST__ = {
  register(api) {
    runtimeApi = api
  }
}

cordova.channel.on('bridge:request', request => {
  handleRequest(request || {})
})

cordova.app.on('pause', pauseLock => {
  try {
    appInBackground = true
    persistRuntimeLog('App moved to background.')
  } finally {
    pauseLock.release()
  }
})

cordova.app.on('resume', () => {
  appInBackground = false
  persistRuntimeLog('App resumed.')
  publishRuntimeState(true)
})

ensureRuntimeFiles()
persistRuntimeLog('Android Node runtime ready.')
startRuntimeHealthWatchdog()
publishRuntimeState(true)

function createEmptyRuntime() {
  return {
    status: 'stopped',
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
      bots: {}
    },
    logs: [],
    chatLogs: [],
    configPath: CONFIG_PATH,
    logPath: LOG_PATH,
    chatLogPath: CHAT_LOG_PATH,
    runtimeDir: DATA_DIR
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function ensureRuntimeFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true })

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(DEFAULT_CONFIG_PATH, CONFIG_PATH)
  }

  if (!fs.existsSync(SETTINGS_PATH)) {
    writeJson(SETTINGS_PATH, DEFAULT_DESKTOP_SETTINGS)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function getPauseFilePath(config = null) {
  const resolvedConfig = config || readConfig()
  return path.resolve(DATA_DIR, resolvedConfig.pause?.file || 'pause.txt')
}

function setPauseFile(nextPaused, config = null) {
  const pauseFilePath = getPauseFilePath(config)
  fs.mkdirSync(path.dirname(pauseFilePath), { recursive: true })

  if (nextPaused) {
    fs.writeFileSync(pauseFilePath, 'pause', 'utf8')
  } else if (fs.existsSync(pauseFilePath)) {
    fs.unlinkSync(pauseFilePath)
  }
}

function readConfig() {
  ensureRuntimeFiles()
  return readJson(CONFIG_PATH)
}

function readDesktopSettings() {
  ensureRuntimeFiles()
  return {
    ...DEFAULT_DESKTOP_SETTINGS,
    ...readJson(SETTINGS_PATH)
  }
}

function pushLog(entry) {
  runtimeState.logs = [...runtimeState.logs, entry].slice(-MAX_RUNTIME_LOGS)
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

  runtimeState.chatLogs = [...runtimeState.chatLogs, normalizedEntry].slice(-MAX_RUNTIME_CHAT_LOGS)
}

function setAndroidRuntimeKeepAlive(nextEnabled) {
  const normalizedEnabled = Boolean(nextEnabled)
  if (keepAliveEnabled === normalizedEnabled) return

  if (!nativeBridge || typeof nativeBridge.sendMessage !== 'function') {
    keepAliveEnabled = normalizedEnabled
    return
  }

  try {
    nativeBridge.sendMessage(SYSTEM_CHANNEL, `runtime-keepalive|${normalizedEnabled ? '1' : '0'}`)
    keepAliveEnabled = normalizedEnabled
  } catch (error) {
    persistRuntimeLog(`Background keep-alive error: ${error.message || String(error)}`, 'warning', 'ANDROID')
  }
}

function syncRuntimeKeepAlive() {
  setAndroidRuntimeKeepAlive(runtimeActive && !runtimeState.isPaused)
}

function persistRuntimeLog(message, level = 'info', botName = 'ANDROID') {
  const entry = {
    level,
    botName,
    message,
    rawMessage: message,
    time: new Date().toLocaleTimeString('ru-RU'),
    timestamp: new Date().toISOString()
  }

  pushLog(entry)
  publishRuntimeState()
}

function getPublishIntervalMs() {
  return appInBackground ? BACKGROUND_PUBLISH_INTERVAL_MS : ACTIVE_PUBLISH_INTERVAL_MS
}

function flushRuntimeStatePublish() {
  publishTimer = null
  lastPublishedAt = Date.now()
  cordova.channel.post('bridge:event', {
    type: 'runtime',
    payload: clone(runtimeState)
  })
}

function publishRuntimeState(force = false) {
  if (force) {
    if (publishTimer) {
      clearTimeout(publishTimer)
      publishTimer = null
    }
    flushRuntimeStatePublish()
    return
  }

  const intervalMs = getPublishIntervalMs()
  const elapsedMs = Date.now() - lastPublishedAt
  if (elapsedMs >= intervalMs && !publishTimer) {
    flushRuntimeStatePublish()
    return
  }

  if (publishTimer) return

  publishTimer = setTimeout(() => {
    flushRuntimeStatePublish()
  }, Math.max(0, intervalMs - elapsedMs))
}

function respond(requestId, payload = null, error = null) {
  cordova.channel.post('bridge:response', {
    requestId,
    payload,
    error
  })
}

function prepareBotEnvironment() {
  process.env.BOT_CONFIG_PATH = CONFIG_PATH
  process.env.BOT_LOG_PATH = LOG_PATH
  process.env.BOT_CHAT_LOG_PATH = CHAT_LOG_PATH
  process.env.BOT_AUTOSTART = '0'
  process.env.BOT_GUI_MODE = '0'
  process.env.BOT_MOBILE_RUNTIME = '1'
}

function unloadBotRuntime(reason = 'reload') {
  if (runtimeApi && typeof runtimeApi.shutdownForHost === 'function') {
    runtimeApi.shutdownForHost(reason)
  }

  runtimeApi = null
  runtimeLoaded = false

  delete require.cache[BOT_ENTRY_PATH]
  delete require.cache[MONITORING_PATH]
}

function ensureBotRuntime(forceReload = false) {
  if (forceReload || needsReload) {
    unloadBotRuntime(forceReload ? 'force-reload' : 'config-reload')
    needsReload = false
  }

  if (runtimeLoaded && runtimeApi) {
    return runtimeApi
  }

  prepareBotEnvironment()
  runtimeApi = require(BOT_ENTRY_PATH)
  runtimeLoaded = true
  return runtimeApi
}

function restartRuntimeFromWatchdog(reason = 'runtime-watchdog') {
  const now = Date.now()
  if (now - lastRuntimeSelfRestartAt < RUNTIME_SELF_RESTART_COOLDOWN_MS) {
    return
  }

  lastRuntimeSelfRestartAt = now
  persistRuntimeLog(`Runtime watchdog restart: ${reason}`, 'warning', 'ANDROID')

  try {
    unloadBotRuntime(reason)
    const botRuntime = ensureBotRuntime(true)
    if (botRuntime && typeof botRuntime.start === 'function') {
      botRuntime.start()
    }
    runtimeActive = true
    runtimeState.status = 'running'
    runtimeState.configPath = CONFIG_PATH
    runtimeState.logPath = LOG_PATH
    runtimeState.chatLogPath = CHAT_LOG_PATH
    runtimeState.runtimeDir = DATA_DIR
    lastRuntimeEventAt = Date.now()
    syncRuntimeKeepAlive()
    publishRuntimeState(true)
  } catch (error) {
    runtimeActive = false
    runtimeState.status = 'error'
    persistRuntimeLog(`Runtime watchdog failed: ${error.message || String(error)}`, 'error', 'ANDROID')
    syncRuntimeKeepAlive()
    publishRuntimeState(true)
  }
}

function checkRuntimeHealth() {
  if (!runtimeDesired) return

  const now = Date.now()
  if (!runtimeActive || !runtimeApi) {
    restartRuntimeFromWatchdog('runtime-not-active')
    return
  }

  if (now - lastRuntimeEventAt > RUNTIME_STALE_EVENT_MS) {
    restartRuntimeFromWatchdog(`runtime-silent-${Math.round((now - lastRuntimeEventAt) / 1000)}s`)
  }
}

function startRuntimeHealthWatchdog() {
  setInterval(checkRuntimeHealth, RUNTIME_HEALTH_CHECK_MS)
}

function buildBootstrap() {
  return {
    platform: 'android',
    capabilities: {
      runtimeControl: true,
      runtimeStreaming: true,
      fileImport: false,
      fileExport: false,
      openRuntimeDir: false
    },
    config: readConfig(),
    desktopSettings: readDesktopSettings(),
    runtime: clone(runtimeState)
  }
}

function handleBotEvent(type, payload = {}) {
  lastRuntimeEventAt = Date.now()

  if (type === 'log') {
    pushLog(payload)
  } else if (type === 'chat') {
    pushChatLog(payload)
  } else if (type === 'resources') {
    runtimeState.resources = {
      cpuPercent: payload.cpuPercent || 0,
      memoryMb: payload.memoryMb || 0
    }
  } else if (type === 'snapshot') {
    runtimeState.snapshot = payload
    runtimeState.isPaused = Boolean(payload.paused)
    runtimeState.status = runtimeActive ? 'running' : runtimeState.status
  } else if (type === 'host-shutdown') {
    runtimeActive = false
    runtimeState.status = 'stopped'
    if (runtimeDesired) {
      restartRuntimeFromWatchdog(payload?.signal || 'host-shutdown')
      return
    }
  }

  syncRuntimeKeepAlive()
  publishRuntimeState()
}

function handleRequest(request) {
  try {
    ensureRuntimeFiles()

    switch (request.action) {
      case 'getBootstrap':
        respond(request.requestId, buildBootstrap())
        return

      case 'saveDesktopSettings': {
        const nextSettings = {
          ...DEFAULT_DESKTOP_SETTINGS,
          ...(request.payload?.settings || {})
        }
        writeJson(SETTINGS_PATH, nextSettings)
        respond(request.requestId, nextSettings)
        return
      }

      case 'saveConfig': {
        writeJson(CONFIG_PATH, request.payload?.config || readConfig())
        needsReload = true
        respond(request.requestId, {
          config: readConfig(),
          runtime: clone(runtimeState)
        })
        return
      }

      case 'resetConfig': {
        fs.copyFileSync(DEFAULT_CONFIG_PATH, CONFIG_PATH)
        needsReload = true
        respond(request.requestId, {
          config: readConfig(),
          runtime: clone(runtimeState)
        })
        return
      }

      case 'startRuntime': {
        const botRuntime = ensureBotRuntime(needsReload)
        runtimeDesired = true
        botRuntime.start()
        runtimeActive = true
        lastRuntimeEventAt = Date.now()
        runtimeState.status = 'running'
        runtimeState.configPath = CONFIG_PATH
        runtimeState.logPath = LOG_PATH
        runtimeState.chatLogPath = CHAT_LOG_PATH
        runtimeState.runtimeDir = DATA_DIR
        syncRuntimeKeepAlive()
        publishRuntimeState(true)
        respond(request.requestId, clone(runtimeState))
        return
      }

      case 'stopRuntime': {
        runtimeDesired = false
        if (runtimeApi && typeof runtimeApi.stop === 'function') {
          runtimeApi.stop()
        }
        runtimeActive = false
        runtimeState.status = 'stopped'
        syncRuntimeKeepAlive()
        publishRuntimeState(true)
        respond(request.requestId, clone(runtimeState))
        return
      }

      case 'restartRuntime': {
        runtimeDesired = true
        unloadBotRuntime('manual-restart')
        needsReload = false
        const botRuntime = ensureBotRuntime(true)
        botRuntime.start()
        runtimeActive = true
        lastRuntimeEventAt = Date.now()
        runtimeState.status = 'running'
        syncRuntimeKeepAlive()
        publishRuntimeState(true)
        respond(request.requestId, clone(runtimeState))
        return
      }

      case 'setPaused': {
        const nextPaused = Boolean(request.payload?.nextPaused)
        const config = readConfig()
        setPauseFile(nextPaused, config)
        if (runtimeApi && typeof runtimeApi.setPaused === 'function') {
          runtimeApi.setPaused(nextPaused)
        }
        runtimeState.isPaused = nextPaused
        runtimeState.snapshot = {
          ...runtimeState.snapshot,
          paused: nextPaused
        }
        syncRuntimeKeepAlive()
        publishRuntimeState(true)
        respond(request.requestId, clone(runtimeState))
        return
      }

      default:
        respond(request.requestId, null, `Unknown action: ${request.action}`)
    }
  } catch (error) {
    persistRuntimeLog(error.message || String(error), 'error', 'ANDROID')
    respond(request.requestId, null, error.message || String(error))
  }
}

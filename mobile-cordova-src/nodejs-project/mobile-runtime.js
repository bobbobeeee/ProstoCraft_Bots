const cordova = require('cordova-bridge')
const fs = require('fs')
const path = require('path')
const {
  DEFAULT_UPDATE_SOURCES,
  checkForUpdates,
  compareVersions,
  downloadUpdate
} = require('./update-service')
const {
  createHealthState,
  getRuntimeRecoveryDecision,
  updateHealthState
} = require('./stability-center')
const packageMetadata = require('./package.json')

const DATA_DIR = cordova.app.datadir()
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const SETTINGS_PATH = path.join(DATA_DIR, 'desktop-settings.json')
const LOG_PATH = path.join(DATA_DIR, 'bot.log')
const CHAT_LOG_PATH = path.join(DATA_DIR, 'chat.log')
const UPDATES_DIR = path.join(DATA_DIR, 'updates')
const PENDING_UPDATE_PATH = path.join(UPDATES_DIR, 'pending-update.json')
const UPDATE_CACHE_PATH = path.join(UPDATES_DIR, 'latest-update-cache.json')
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config.json')
const BOT_ENTRY_PATH = path.join(__dirname, 'bot.js')
const MONITORING_PATH = path.join(__dirname, 'monitoring.js')
const STABILITY_CENTER_PATH = path.join(__dirname, 'stability-center.js')
const SYSTEM_CHANNEL = '_SYSTEM_'
const APP_VERSION = packageMetadata.version || '0.0.0'
const UPDATE_SOURCE = DEFAULT_UPDATE_SOURCES[0]
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
let latestUpdateInfo = null
let updateState = createEmptyUpdateState()
const MAX_RUNTIME_LOGS = 120
const MAX_RUNTIME_CHAT_LOGS = 180
const ACTIVE_PUBLISH_INTERVAL_MS = 1500
const BACKGROUND_PUBLISH_INTERVAL_MS = 5000
const RUNTIME_HEALTH_CHECK_MS = 15000
const RUNTIME_STALE_EVENT_MS = 90000
const RUNTIME_SELF_RESTART_COOLDOWN_MS = 30000
const INSTALL_RESUME_RETRY_DELAY_MS = 900
const INSTALL_RESUME_RETRY_COOLDOWN_MS = 3000
const MAX_INSTALL_RESUME_RETRIES = 3
let runtimeApi = null
let runtimeLoaded = false
let runtimeActive = false
let runtimeDesired = false
let needsReload = false
let keepAliveEnabled = false
let updateKeepAliveEnabled = false
let publishTimer = null
let lastPublishedAt = 0
let lastRuntimeEventAt = Date.now()
let lastRuntimeSelfRestartAt = 0
let lastInstallRequestAt = 0
let installResumeRetryCount = 0
let installResumeTimer = null
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
  schedulePendingInstallResume('android-resume')
  publishRuntimeState(true)
})

ensureRuntimeFiles()
restorePendingUpdateState()
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
      bots: {},
      health: createHealthState(Date.now())
    },
    health: createHealthState(Date.now()),
    logs: [],
    chatLogs: [],
    configPath: CONFIG_PATH,
    logPath: LOG_PATH,
    chatLogPath: CHAT_LOG_PATH,
    runtimeDir: DATA_DIR
  }
}

function createEmptyUpdateState() {
  return {
    status: 'idle',
    currentVersion: APP_VERSION,
    latestVersion: '',
    updateAvailable: false,
    checkedAt: '',
    publishedAt: '',
    releaseName: '',
    releaseUrl: UPDATE_SOURCE.releaseUrl,
    body: '',
    asset: null,
    checksum: null,
    sourceMode: 'idle',
    signatureStatus: '',
    installResumeState: '',
    progress: null,
    downloadedFilePath: '',
    downloadedFileName: '',
    downloadedSize: 0,
    error: ''
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function ensureRuntimeFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(UPDATES_DIR, { recursive: true })

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
  setAndroidRuntimeKeepAlive((runtimeDesired && !runtimeState.isPaused) || updateKeepAliveEnabled)
}

function setRuntimeHealth(reason, details = {}) {
  runtimeState.health = updateHealthState(runtimeState.health, { reason, ...details }, Date.now())
  runtimeState.snapshot = {
    ...runtimeState.snapshot,
    health: runtimeState.health
  }
  return runtimeState.health
}

function setAndroidUpdateKeepAlive(nextEnabled) {
  updateKeepAliveEnabled = Boolean(nextEnabled)
  syncRuntimeKeepAlive()
}

function sendAndroidSystemMessage(message) {
  if (!nativeBridge || typeof nativeBridge.sendMessage !== 'function') return false

  try {
    nativeBridge.sendMessage(SYSTEM_CHANNEL, message)
    return true
  } catch (error) {
    persistRuntimeLog(`Android native message error: ${error.message || String(error)}`, 'warning', 'ANDROID')
    return false
  }
}

function notifyAndroidUpdateProgress({ percent, receivedBytes, totalBytes, fileName }) {
  sendAndroidSystemMessage([
    'update-download-progress',
    Math.max(0, Math.min(100, Number(percent) || 0)),
    Math.max(0, Number(receivedBytes) || 0),
    Math.max(0, Number(totalBytes) || 0),
    encodeURIComponent(fileName || latestUpdateInfo?.asset?.name || 'update.apk')
  ].join('|'))
}

function notifyAndroidUpdateReady(downloaded) {
  sendAndroidSystemMessage([
    'update-ready',
    encodeURIComponent(downloaded.filePath || ''),
    encodeURIComponent(downloaded.fileName || '')
  ].join('|'))
}

function notifyAndroidUpdateInstalling(apkPath) {
  sendAndroidSystemMessage(['update-installing', encodeURIComponent(apkPath || '')].join('|'))
}

function notifyAndroidUpdateClear() {
  sendAndroidSystemMessage('update-clear')
}

function sendAndroidInstallRequest(apkPath, source = 'install-button') {
  if (!apkPath || !fs.existsSync(apkPath)) {
    return false
  }

  lastInstallRequestAt = Date.now()
  notifyAndroidUpdateInstalling(apkPath)
  updateState = {
    ...buildUpdatePayload(),
    status: 'installing',
    installResumeState: source === 'android-resume'
      ? `resume-retry-${installResumeRetryCount + 1}`
      : 'install-requested',
    error: ''
  }
  publishUpdateState()
  persistRuntimeLog(
    source === 'android-resume'
      ? 'Повторно открываю установку APK после возврата из настроек Android.'
      : 'Открываю установку APK. Если Android попросит разрешение, включите установку из этого источника.',
    'info',
    'UPDATE'
  )
  nativeBridge.sendMessage(SYSTEM_CHANNEL, `install-apk|${apkPath}`)
  return true
}

function schedulePendingInstallResume(source = 'android-resume') {
  if (updateState.status !== 'installing') return
  if (!updateState.downloadedFilePath || !fs.existsSync(updateState.downloadedFilePath)) return
  if (installResumeRetryCount >= MAX_INSTALL_RESUME_RETRIES) return

  const elapsedMs = Date.now() - lastInstallRequestAt
  const delayMs = Math.max(
    INSTALL_RESUME_RETRY_DELAY_MS,
    INSTALL_RESUME_RETRY_COOLDOWN_MS - elapsedMs
  )

  if (installResumeTimer) {
    clearTimeout(installResumeTimer)
  }

  installResumeTimer = setTimeout(() => {
    installResumeTimer = null
    if (updateState.status !== 'installing') return
    installResumeRetryCount += 1
    sendAndroidInstallRequest(updateState.downloadedFilePath, source)
  }, delayMs)
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

function buildUpdatePayload() {
  return {
    ...createEmptyUpdateState(),
    ...updateState,
    currentVersion: APP_VERSION,
    releaseUrl: updateState.releaseUrl || UPDATE_SOURCE.releaseUrl
  }
}

function publishUpdateState() {
  cordova.channel.post('bridge:event', {
    type: 'updates',
    payload: clone(buildUpdatePayload())
  })
}

function clearPendingUpdateState() {
  try {
    fs.rmSync(PENDING_UPDATE_PATH, { force: true })
  } catch (error) {}

  if (installResumeTimer) {
    clearTimeout(installResumeTimer)
    installResumeTimer = null
  }
  installResumeRetryCount = 0
  notifyAndroidUpdateClear()
  setAndroidUpdateKeepAlive(false)
}

function writePendingUpdateState(downloaded) {
  const payload = {
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    updateInfo: latestUpdateInfo,
    downloaded: {
      filePath: downloaded.filePath,
      fileName: downloaded.fileName,
      size: downloaded.size,
      sha256: downloaded.sha256
    }
  }

  writeJson(PENDING_UPDATE_PATH, payload)
}

function restorePendingUpdateState() {
  let pending = null

  try {
    if (!fs.existsSync(PENDING_UPDATE_PATH)) return false
    pending = readJson(PENDING_UPDATE_PATH)
  } catch (error) {
    clearPendingUpdateState()
    return false
  }

  const downloaded = pending?.downloaded || {}
  if (!downloaded.filePath || !fs.existsSync(downloaded.filePath)) {
    clearPendingUpdateState()
    return false
  }

  const updateInfo = pending.updateInfo || {}
  if (!updateInfo.updateAvailable || compareVersions(updateInfo.latestVersion, APP_VERSION) <= 0) {
    clearPendingUpdateState()
    return false
  }

  latestUpdateInfo = updateInfo
  updateState = {
    ...createEmptyUpdateState(),
    ...updateInfo,
    currentVersion: APP_VERSION,
    status: 'ready',
    updateAvailable: true,
    checkedAt: pending.savedAt || new Date().toISOString(),
    progress: {
      receivedBytes: downloaded.size || fs.statSync(downloaded.filePath).size,
      totalBytes: downloaded.size || fs.statSync(downloaded.filePath).size,
      percent: 100
    },
    downloadedFilePath: downloaded.filePath,
    downloadedFileName: downloaded.fileName,
    downloadedSize: downloaded.size || fs.statSync(downloaded.filePath).size,
    error: ''
  }
  setAndroidUpdateKeepAlive(true)
  notifyAndroidUpdateReady(downloaded)
  return true
}

function applyUpdateInfo(updateInfo) {
  latestUpdateInfo = updateInfo
  updateState = {
    ...createEmptyUpdateState(),
    ...updateInfo,
    checkedAt: new Date().toISOString(),
    error: updateInfo?.error || '',
    progress: null,
    downloadedFilePath: '',
    downloadedFileName: '',
    downloadedSize: 0
  }
  return buildUpdatePayload()
}

async function checkMobileUpdates() {
  if (restorePendingUpdateState()) {
    publishUpdateState()
    return buildUpdatePayload()
  }

  updateState = {
    ...buildUpdatePayload(),
    status: 'checking',
    error: '',
    progress: null
  }
  publishUpdateState()

  const updateInfo = await checkForUpdates({
    platform: 'android',
    currentVersion: APP_VERSION,
    cachePath: UPDATE_CACHE_PATH
  })
  const payload = applyUpdateInfo(updateInfo)
  if (!payload.updateAvailable) {
    clearPendingUpdateState()
  }
  publishUpdateState()
  return payload
}

async function downloadMobileUpdate() {
  if (!latestUpdateInfo?.asset) {
    await checkMobileUpdates()
  }

  if (!latestUpdateInfo?.updateAvailable) {
    throw new Error('Доступного обновления нет.')
  }

  setAndroidUpdateKeepAlive(true)
  notifyAndroidUpdateProgress({
    percent: 0,
    receivedBytes: 0,
    totalBytes: latestUpdateInfo.asset.size || 0,
    fileName: latestUpdateInfo.asset.name
  })
  updateState = {
    ...buildUpdatePayload(),
    status: 'downloading',
    error: '',
    progress: {
      receivedBytes: 0,
      totalBytes: latestUpdateInfo.asset.size || 0,
      percent: 0
    }
  }
  publishUpdateState()

  try {
    const downloaded = await downloadUpdate(latestUpdateInfo, {
      outputDir: UPDATES_DIR,
      onProgress(progress) {
        const totalBytes = progress.totalBytes || latestUpdateInfo.asset.size || 0
        const percent = totalBytes > 0
          ? Math.min(100, Math.round((progress.receivedBytes / totalBytes) * 100))
          : 0
        updateState = {
          ...buildUpdatePayload(),
          status: 'downloading',
          progress: {
            receivedBytes: progress.receivedBytes,
            totalBytes,
            percent
          }
        }
        notifyAndroidUpdateProgress({
          percent,
          receivedBytes: progress.receivedBytes,
          totalBytes,
          fileName: latestUpdateInfo.asset.name
        })
        publishUpdateState()
      }
    })

    writePendingUpdateState(downloaded)
    updateState = {
      ...buildUpdatePayload(),
      status: 'ready',
      progress: {
        receivedBytes: downloaded.size,
        totalBytes: downloaded.size,
        percent: 100
      },
      downloadedFilePath: downloaded.filePath,
      downloadedFileName: downloaded.fileName,
      downloadedSize: downloaded.size,
      error: ''
    }
    setAndroidUpdateKeepAlive(true)
    notifyAndroidUpdateReady(downloaded)
    publishUpdateState()
    return buildUpdatePayload()
  } catch (error) {
    updateState = {
      ...buildUpdatePayload(),
      status: 'error',
      error: error.message || String(error)
    }
    clearPendingUpdateState()
    publishUpdateState()
    throw error
  }
}

function installMobileUpdate() {
  const apkPath = updateState.downloadedFilePath
  if (!apkPath || !fs.existsSync(apkPath)) {
    throw new Error('Сначала скачайте APK обновления.')
  }

  if (!nativeBridge || typeof nativeBridge.sendMessage !== 'function') {
    throw new Error('Android installer bridge is unavailable.')
  }

  setAndroidUpdateKeepAlive(true)
  installResumeRetryCount = 0
  if (installResumeTimer) {
    clearTimeout(installResumeTimer)
    installResumeTimer = null
  }
  updateState = {
    ...buildUpdatePayload(),
    status: 'installing',
    installResumeState: 'install-requested',
    error: ''
  }
  publishUpdateState()
  sendAndroidInstallRequest(apkPath, 'install-button')
  return buildUpdatePayload()
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
  delete require.cache[STABILITY_CENTER_PATH]
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
  setRuntimeHealth('runtime-stale', {
    lastRecoveryAction: 'android watchdog restart',
    diagnosis: `Android runtime восстановил backend: ${reason}.`
  })
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

  const decision = getRuntimeRecoveryDecision({
    now,
    running: runtimeActive,
    desired: runtimeDesired,
    lastEventAt: lastRuntimeEventAt,
    staleAfterMs: RUNTIME_STALE_EVENT_MS
  })

  if (decision.action === 'restart-runtime') {
    restartRuntimeFromWatchdog(`runtime-silent-${Math.round((decision.staleForMs || 0) / 1000)}s`)
  }
}

function startRuntimeHealthWatchdog() {
  setInterval(checkRuntimeHealth, RUNTIME_HEALTH_CHECK_MS)
}

function buildBootstrap() {
  return {
    platform: 'android',
    appVersion: APP_VERSION,
    updateSource: UPDATE_SOURCE,
    capabilities: {
      runtimeControl: true,
      runtimeStreaming: true,
      fileImport: false,
      fileExport: false,
      openRuntimeDir: false,
      updates: true
    },
    config: readConfig(),
    desktopSettings: readDesktopSettings(),
    runtime: clone(runtimeState),
    updates: clone(buildUpdatePayload())
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
    runtimeState.health = payload.health || runtimeState.health
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

async function handleRequest(request) {
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

      case 'checkUpdates':
        respond(request.requestId, await checkMobileUpdates())
        return

      case 'downloadUpdate':
        respond(request.requestId, await downloadMobileUpdate())
        return

      case 'installUpdate':
        respond(request.requestId, installMobileUpdate())
        return

      default:
        respond(request.requestId, null, `Unknown action: ${request.action}`)
    }
  } catch (error) {
    persistRuntimeLog(error.message || String(error), 'error', 'ANDROID')
    respond(request.requestId, null, error.message || String(error))
  }
}

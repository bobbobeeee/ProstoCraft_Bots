const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { applyLegacyConfigMigrations } = require('../config-migrations')
const {
  DEFAULT_UPDATE_SOURCES,
  checkForUpdates,
  downloadUpdate
} = require('../update-service')
const {
  createHealthState,
  getRuntimeRecoveryDecision,
  updateHealthState
} = require('../stability-center')
const packageMetadata = require('../package.json')

const PRODUCT_NAME = 'ProstoCraft Bot Studio'
const RUNTIME_DIRNAME = 'runtime'
const APP_VERSION = packageMetadata.version || '0.0.0'
const UPDATE_SOURCE = DEFAULT_UPDATE_SOURCES[0]
const MAX_RECENT_LOGS = 300
const MAX_RECENT_CHAT_LOGS = 500
const BOT_EVENT_PREFIX = '@@BOT_EVENT@@'
const DESKTOP_SETTINGS_FILE = 'desktop-settings.json'
const RUNTIME_STALE_CHECK_MS = 30000
const RUNTIME_STALE_AFTER_MS = 10 * 60 * 1000
const RUNTIME_STALE_RESTART_COOLDOWN_MS = 5 * 60 * 1000
const DEFAULT_DESKTOP_SETTINGS = {
  launchOnStartup: false,
  autoStartBotsOnLaunch: false,
  startMinimized: false,
  minimizeToTray: false,
  closeToTray: false
}

let mainWindow = null
let runtimeChild = null
let restartAfterStop = false
let stdoutBuffer = ''
let stderrBuffer = ''
let tray = null
let isQuitting = false
let latestUpdateInfo = null
let lastRuntimeStaleRestartAt = 0

let updateState = createEmptyUpdateState()

const runtimeState = {
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
    bots: {}
  },
  health: createHealthState(Date.now()),
  logs: [],
  chatLogs: []
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
    progress: null,
    downloadedFilePath: '',
    downloadedFileName: '',
    downloadedSize: 0,
    error: ''
  }
}

function getAppRoot() {
  return app.getAppPath()
}

function getRuntimeCwd() {
  return app.isPackaged ? path.dirname(process.execPath) : getAppRoot()
}

function getRuntimeDir() {
  return path.join(app.getPath('userData'), RUNTIME_DIRNAME)
}

function getDesktopSettingsPath() {
  return path.join(app.getPath('userData'), DESKTOP_SETTINGS_FILE)
}

function getDefaultConfigPath() {
  return path.join(getAppRoot(), 'config.json')
}

function getRuntimeConfigPath() {
  return path.join(getRuntimeDir(), 'config.json')
}

function getRuntimeLogPath() {
  return path.join(getRuntimeDir(), 'bot.log')
}

function getRuntimeChatLogPath() {
  return path.join(getRuntimeDir(), 'chat.log')
}

function getBackendEntryPath() {
  return path.join(getAppRoot(), 'bot.js')
}

function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'build', 'icon.ico')
  }

  return path.join(getAppRoot(), 'build', 'icon.ico')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function mergeDefaults(defaultValue, currentValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(currentValue) ? currentValue : [...defaultValue]
  }

  if (defaultValue && typeof defaultValue === 'object') {
    const currentObject = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? currentValue
      : {}
    const merged = { ...currentObject }

    for (const [key, nestedDefault] of Object.entries(defaultValue)) {
      merged[key] = mergeDefaults(nestedDefault, currentObject[key])
    }

    return merged
  }

  return currentValue === undefined ? defaultValue : currentValue
}

function normalizeRuntimeConfig(config) {
  const defaults = readJson(getDefaultConfigPath())
  const merged = mergeDefaults(defaults, config || {})

  return applyLegacyConfigMigrations(merged, defaults)
}

function readDesktopSettings() {
  const settingsPath = getDesktopSettingsPath()
  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_DESKTOP_SETTINGS }
  }

  try {
    const rawSettings = readJson(settingsPath)
    return {
      ...DEFAULT_DESKTOP_SETTINGS,
      ...rawSettings
    }
  } catch (error) {
    return { ...DEFAULT_DESKTOP_SETTINGS }
  }
}

function saveDesktopSettings(nextSettings) {
  const mergedSettings = {
    ...DEFAULT_DESKTOP_SETTINGS,
    ...nextSettings
  }

  writeJson(getDesktopSettingsPath(), mergedSettings)
  applyDesktopSettings(mergedSettings)
  return mergedSettings
}

function applyDesktopSettings(settings = readDesktopSettings()) {
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: Boolean(settings.launchOnStartup),
      path: process.execPath,
      args: settings.startMinimized ? ['--start-minimized'] : []
    })
  }

  if (settings.closeToTray || settings.minimizeToTray || settings.startMinimized) {
    ensureTray(settings)
  } else if (tray) {
    tray.destroy()
    tray = null
  }
}

function createTrayIcon() {
  const icon = nativeImage.createFromPath(getAppIconPath())
  return icon.isEmpty() ? nativeImage.createEmpty() : icon
}

function ensureTray(settings = readDesktopSettings()) {
  if (tray) {
    updateTrayMenu(settings)
    return tray
  }

  tray = new Tray(createTrayIcon())
  tray.setToolTip(PRODUCT_NAME)
  tray.on('double-click', () => {
    showMainWindow()
  })
  tray.on('click', () => {
    showMainWindow()
  })
  updateTrayMenu(settings)
  return tray
}

function updateTrayMenu(settings = readDesktopSettings()) {
  if (!tray) return

  const menu = Menu.buildFromTemplate([
    {
      label: 'Открыть',
      click: () => showMainWindow()
    },
    {
      label: runtimeChild ? 'Остановить ботов' : 'Запустить ботов',
      click: () => {
        if (runtimeChild) {
          stopRuntime()
        } else {
          startRuntime()
        }
      }
    },
    { type: 'separator' },
    {
      label: settings.closeToTray || settings.minimizeToTray ? 'Трей активен' : 'Трей отключён',
      enabled: false
    },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true
        if (tray) {
          tray.destroy()
          tray = null
        }
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function ensureRuntimeFiles() {
  const runtimeDir = getRuntimeDir()
  const runtimeConfigPath = getRuntimeConfigPath()
  const defaultConfigPath = getDefaultConfigPath()

  fs.mkdirSync(runtimeDir, { recursive: true })

  if (!fs.existsSync(runtimeConfigPath)) {
    if (!fs.existsSync(defaultConfigPath)) {
      throw new Error(`Не найден базовый config.json: ${defaultConfigPath}`)
    }
    fs.copyFileSync(defaultConfigPath, runtimeConfigPath)
  }
}

function readConfig() {
  ensureRuntimeFiles()
  const runtimeConfigPath = getRuntimeConfigPath()
  const rawConfig = readJson(runtimeConfigPath)
  const normalizedConfig = normalizeRuntimeConfig(rawConfig)

  if (JSON.stringify(rawConfig) !== JSON.stringify(normalizedConfig)) {
    writeJson(runtimeConfigPath, normalizedConfig)
  }

  return normalizedConfig
}

function saveConfig(config) {
  writeJson(getRuntimeConfigPath(), config)
  return config
}

function resetConfig() {
  const defaultConfigPath = getDefaultConfigPath()
  const runtimeConfigPath = getRuntimeConfigPath()
  fs.copyFileSync(defaultConfigPath, runtimeConfigPath)
  return readConfig()
}

function getPauseFilePath(config = null) {
  const resolvedConfig = config || readConfig()
  return path.resolve(
    path.dirname(getRuntimeConfigPath()),
    resolvedConfig.pause?.file || 'pause.txt'
  )
}

function setPauseFile(nextPaused) {
  const pauseFilePath = getPauseFilePath()
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
  publishRuntimeState()
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

  runtimeState.chatLogs = [...(runtimeState.chatLogs || []), normalizedEntry].slice(-MAX_RECENT_CHAT_LOGS)
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
  const health = runtimeState.snapshot?.health || runtimeState.health || createHealthState(Date.now())
  return {
    ...runtimeState,
    health,
    snapshot: {
      ...runtimeState.snapshot,
      health
    },
    configPath: getRuntimeConfigPath(),
    defaultConfigPath: getDefaultConfigPath(),
    logPath: getRuntimeLogPath(),
    chatLogPath: getRuntimeChatLogPath(),
    runtimeDir: getRuntimeDir()
  }
}

function publishRuntimeState() {
  updateTrayMenu()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('runtime:state', buildRuntimePayload())
}

function getUpdatesDir() {
  return path.join(getRuntimeDir(), 'updates')
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
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('updates:state', buildUpdatePayload())
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

async function checkAppUpdates() {
  updateState = {
    ...buildUpdatePayload(),
    status: 'checking',
    error: '',
    progress: null
  }
  publishUpdateState()

  const updateInfo = await checkForUpdates({
    platform: 'desktop',
    currentVersion: APP_VERSION
  })
  const payload = applyUpdateInfo(updateInfo)
  publishUpdateState()
  return payload
}

async function downloadAppUpdate() {
  if (!latestUpdateInfo?.asset) {
    await checkAppUpdates()
  }

  if (!latestUpdateInfo?.updateAvailable) {
    throw new Error('Доступного обновления нет.')
  }

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
      outputDir: getUpdatesDir(),
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
        publishUpdateState()
      }
    })

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
    publishUpdateState()
    return buildUpdatePayload()
  } catch (error) {
    updateState = {
      ...buildUpdatePayload(),
      status: 'error',
      error: error.message || String(error)
    }
    publishUpdateState()
    throw error
  }
}

function installDownloadedUpdate() {
  const installerPath = updateState.downloadedFilePath
  if (!installerPath || !fs.existsSync(installerPath)) {
    throw new Error('Сначала скачайте обновление.')
  }

  updateState = {
    ...buildUpdatePayload(),
    status: 'installing',
    error: ''
  }
  publishUpdateState()

  stopRuntime()
  const child = spawn(installerPath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })
  child.unref()

  setTimeout(() => {
    isQuitting = true
    app.quit()
  }, 800)

  return buildUpdatePayload()
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
  publishRuntimeState()
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

  publishRuntimeState()
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
        appendRawProcessOutput('stderr', `Не удалось разобрать событие рантайма: ${error.message}`)
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
    publishRuntimeState()
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
    publishRuntimeState()

    if (restartAfterStop) {
      restartAfterStop = false
      startRuntime()
    }
  })
}

function startRuntime() {
  ensureRuntimeFiles()

  if (runtimeChild) {
    publishRuntimeState()
    return buildRuntimePayload()
  }

  runtimeState.status = 'starting'
  runtimeState.logs = []
  runtimeState.chatLogs = []
  runtimeState.health = updateHealthState(runtimeState.health, {
    reason: 'mining-ok',
    lastRecoveryAction: 'runtime starting'
  }, Date.now())
  stdoutBuffer = ''
  stderrBuffer = ''
  publishRuntimeState()

  const child = spawn(
    process.execPath,
    [getBackendEntryPath(), '--headless', '--emit-json'],
    {
      cwd: getRuntimeCwd(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        BOT_GUI_MODE: '1',
        BOT_CONFIG_PATH: getRuntimeConfigPath(),
        BOT_LOG_PATH: getRuntimeLogPath(),
        BOT_CHAT_LOG_PATH: getRuntimeChatLogPath()
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
    publishRuntimeState()
    return buildRuntimePayload()
  }

  const childToStop = runtimeChild

  runtimeState.status = 'stopping'
  publishRuntimeState()
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

function checkRuntimeStaleness() {
  if (isQuitting || !runtimeChild) return
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
  publishRuntimeState()
  restartRuntime()
}

function scheduleAutoStartRuntime(desktopSettings) {
  if (!desktopSettings?.autoStartBotsOnLaunch) return

  setTimeout(() => {
    if (runtimeChild || isQuitting) return
    pushLog({
      level: 'info',
      botName: 'SYSTEM',
      message: 'Автозапуск ботов при входе в программу',
      rawMessage: 'Автозапуск ботов при входе в программу'
    })
    startRuntime()
  }, 1200)
}

async function importConfigFromDialog() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Импорт конфигурации',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }

  const imported = readJson(result.filePaths[0])
  saveConfig(imported)

  return {
    canceled: false,
    config: imported,
    importedFrom: result.filePaths[0]
  }
}

async function exportConfigToDialog(config) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Экспорт конфигурации',
    defaultPath: path.join(app.getPath('documents'), 'prostocraft-bot-config.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  writeJson(result.filePath, config)
  return {
    canceled: false,
    exportedTo: result.filePath
  }
}

function createWindow() {
  const desktopSettings = readDesktopSettings()
  const shouldStartMinimized = desktopSettings.startMinimized || process.argv.includes('--start-minimized')
  const display = screen.getPrimaryDisplay()
  const maxWidth = display.workAreaSize.width
  const maxHeight = display.workAreaSize.height
  const minWidth = Math.min(920, maxWidth)
  const minHeight = Math.min(620, maxHeight)
  const initialWidth = Math.min(1540, Math.max(minWidth, maxWidth - 32))
  const initialHeight = Math.min(980, Math.max(minHeight, maxHeight - 32))

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth,
    minHeight,
    title: PRODUCT_NAME,
    icon: getAppIconPath(),
    backgroundColor: '#07101a',
    autoHideMenuBar: true,
    show: !shouldStartMinimized,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a1422',
      symbolColor: '#f7fafc',
      height: 42
    },
    webPreferences: {
      preload: path.join(getAppRoot(), 'desktop', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.loadFile(path.join(getAppRoot(), 'desktop', 'renderer', 'index.html'))
  mainWindow.once('ready-to-show', () => {
    if (shouldStartMinimized) {
      if (desktopSettings.minimizeToTray || desktopSettings.closeToTray || desktopSettings.startMinimized) {
        ensureTray(desktopSettings)
      }
      mainWindow.hide()
      return
    }

    mainWindow.show()
  })

  mainWindow.on('minimize', event => {
    const nextSettings = readDesktopSettings()
    if (!nextSettings.minimizeToTray) return
    event.preventDefault()
    ensureTray(nextSettings)
    mainWindow.hide()
  })

  mainWindow.on('close', event => {
    const nextSettings = readDesktopSettings()
    if (isQuitting || !nextSettings.closeToTray) return
    event.preventDefault()
    ensureTray(nextSettings)
    mainWindow.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-bootstrap', () => {
    const config = readConfig()
    const desktopSettings = readDesktopSettings()
    runtimeState.isPaused = fs.existsSync(getPauseFilePath(config))
    runtimeState.snapshot = {
      ...runtimeState.snapshot,
      paused: runtimeState.isPaused
    }

    return {
      platform: 'desktop',
      appVersion: APP_VERSION,
      updateSource: UPDATE_SOURCE,
      capabilities: {
        runtimeControl: true,
        runtimeStreaming: true,
        fileImport: true,
        fileExport: true,
        openRuntimeDir: true,
        updates: true
      },
      config,
      desktopSettings,
      runtime: buildRuntimePayload(),
      updates: buildUpdatePayload()
    }
  })

  ipcMain.handle('desktop-settings:save', (_, nextSettings) => saveDesktopSettings(nextSettings))

  ipcMain.handle('config:save', (_, nextConfig) => ({
    config: saveConfig(nextConfig),
    runtime: buildRuntimePayload()
  }))

  ipcMain.handle('config:reset', () => ({
    config: resetConfig(),
    runtime: buildRuntimePayload()
  }))

  ipcMain.handle('config:import', async () => importConfigFromDialog())
  ipcMain.handle('config:export', async (_, config) => exportConfigToDialog(config))

  ipcMain.handle('runtime:start', () => startRuntime())
  ipcMain.handle('runtime:stop', () => stopRuntime())
  ipcMain.handle('runtime:restart', () => restartRuntime())
  ipcMain.handle('runtime:set-paused', (_, nextPaused) => {
    setPauseFile(Boolean(nextPaused))
    return buildRuntimePayload()
  })

  ipcMain.handle('updates:check', () => checkAppUpdates())
  ipcMain.handle('updates:download', () => downloadAppUpdate())
  ipcMain.handle('updates:install', () => installDownloadedUpdate())

  ipcMain.handle('shell:open-runtime-dir', async () => {
    await shell.openPath(getRuntimeDir())
    return buildRuntimePayload()
  })
}

app.whenReady().then(() => {
  app.setName(PRODUCT_NAME)
  ensureRuntimeFiles()
  applyDesktopSettings()
  registerIpcHandlers()
  createWindow()
  scheduleAutoStartRuntime(readDesktopSettings())
  setInterval(checkRuntimeStaleness, RUNTIME_STALE_CHECK_MS)
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (runtimeChild) {
    runtimeChild.kill('SIGTERM')
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    showMainWindow()
  }
})

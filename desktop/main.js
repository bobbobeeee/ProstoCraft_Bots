const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const PRODUCT_NAME = 'ProstoCraft Bot Studio'
const RUNTIME_DIRNAME = 'runtime'
const MAX_RECENT_LOGS = 300
const BOT_EVENT_PREFIX = '@@BOT_EVENT@@'
const DESKTOP_SETTINGS_FILE = 'desktop-settings.json'
const DEFAULT_DESKTOP_SETTINGS = {
  launchOnStartup: false,
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
  logs: []
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

function getBackendEntryPath() {
  return path.join(getAppRoot(), 'bot.js')
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

  if (merged.timing?.startStagger === 30000) {
    merged.timing.startStagger = defaults.timing?.startStagger ?? 1000
  }

  if (merged.timing?.startStaggerJitter === 15000) {
    merged.timing.startStaggerJitter = defaults.timing?.startStaggerJitter ?? 500
  }

  if ([250, 40, 10].includes(merged.timing?.emptyTargetRecheckMs)) {
    merged.timing.emptyTargetRecheckMs = defaults.timing?.emptyTargetRecheckMs ?? 5
  }

  if (merged.timing && Object.prototype.hasOwnProperty.call(merged.timing, 'emptyTargetButtonCooldownMs')) {
    delete merged.timing.emptyTargetButtonCooldownMs
  }

  if (merged.timing?.entryButtonAfterPressWaitMs === 1200) {
    merged.timing.entryButtonAfterPressWaitMs = defaults.timing?.entryButtonAfterPressWaitMs ?? 0
  }

  if ([25, 10, 5].includes(merged.timing?.miningLoopIdleMs)) {
    merged.timing.miningLoopIdleMs = defaults.timing?.miningLoopIdleMs ?? 2
  }

  if ([8, 32, 64].includes(merged.timing?.miningBatchSize)) {
    merged.timing.miningBatchSize = defaults.timing?.miningBatchSize ?? 96
  }

  if ([700, 1200].includes(merged.timing?.burstBreakWindowMs)) {
    merged.timing.burstBreakWindowMs = defaults.timing?.burstBreakWindowMs ?? 1500
  }

  if ([20, 5].includes(merged.timing?.burstBreakIntervalMs)) {
    merged.timing.burstBreakIntervalMs = defaults.timing?.burstBreakIntervalMs ?? 1
  }

  if (merged.timing?.burstBreakRepeats === 3) {
    merged.timing.burstBreakRepeats = defaults.timing?.burstBreakRepeats ?? 2
  }

  if ([25, 12, 10].includes(merged.timing?.breakPacketTargetCooldownMs)) {
    merged.timing.breakPacketTargetCooldownMs = defaults.timing?.breakPacketTargetCooldownMs ?? 8
  }

  if (merged.timing?.breakPacketPendingRetryMs === 32) {
    merged.timing.breakPacketPendingRetryMs = defaults.timing?.breakPacketPendingRetryMs ?? 16
  }

  if ([75, 45, 20, 8].includes(merged.timing?.breakPacketMinTargetCooldownMs)) {
    merged.timing.breakPacketMinTargetCooldownMs = defaults.timing?.breakPacketMinTargetCooldownMs ?? 6
  }

  if ([72, 108, 160, 240, 300].includes(merged.timing?.breakPacketMaxPerSecond)) {
    merged.timing.breakPacketMaxPerSecond = defaults.timing?.breakPacketMaxPerSecond ?? 360
  }

  if ([18, 28, 42, 64, 84].includes(merged.timing?.breakPacketBurstLimit)) {
    merged.timing.breakPacketBurstLimit = defaults.timing?.breakPacketBurstLimit ?? 108
  }

  if ([42, 60, 96, 120].includes(merged.timing?.breakPacketSafeMaxPerSecond)) {
    merged.timing.breakPacketSafeMaxPerSecond = defaults.timing?.breakPacketSafeMaxPerSecond ?? 150
  }

  if ([10, 15, 24, 32].includes(merged.timing?.breakPacketSafeBurstLimit)) {
    merged.timing.breakPacketSafeBurstLimit = defaults.timing?.breakPacketSafeBurstLimit ?? 40
  }

  if (merged.timing?.reactiveBreakRepeats === 2) {
    merged.timing.reactiveBreakRepeats = defaults.timing?.reactiveBreakRepeats ?? 1
  }

  if (merged.timing?.transientBreakRepeats === 2) {
    merged.timing.transientBreakRepeats = defaults.timing?.transientBreakRepeats ?? 1
  }

  if (merged.timing?.preemptiveBreakTargets === true) {
    merged.timing.preemptiveBreakTargets = defaults.timing?.preemptiveBreakTargets ?? false
  }

  if ([120, 60, 25].includes(merged.timing?.fastDigConfirmMs)) {
    merged.timing.fastDigConfirmMs = defaults.timing?.fastDigConfirmMs ?? 15
  }

  if (merged.timing?.fastDigRetryMs === 25 || merged.timing?.fastDigRetryMs === 10) {
    merged.timing.fastDigRetryMs = defaults.timing?.fastDigRetryMs ?? 5
  }

  if (merged.timing?.fastDigRetryMs === 5) {
    merged.timing.fastDigRetryMs = defaults.timing?.fastDigRetryMs ?? 1
  }

  if (merged.timing?.fastDigMinVanillaTimeMs === 250) {
    merged.timing.fastDigMinVanillaTimeMs = defaults.timing?.fastDigMinVanillaTimeMs ?? 0
  }

  if ([600000, 900000].includes(merged.timing?.stabilityCooldownMaxMs)) {
    merged.timing.stabilityCooldownMaxMs = defaults.timing?.stabilityCooldownMaxMs ?? 3600000
  }

  if (merged.timing?.stabilityCooldownMs === 300000) {
    merged.timing.stabilityCooldownMs = defaults.timing?.stabilityCooldownMs ?? 0
  }

  if (merged.timing?.connectionStabilityCooldownMs === 1800000) {
    merged.timing.connectionStabilityCooldownMs = defaults.timing?.connectionStabilityCooldownMs ?? 0
  }

  if (merged.timing?.stabilityCooldownMaxMs === 3600000) {
    merged.timing.stabilityCooldownMaxMs = defaults.timing?.stabilityCooldownMaxMs ?? 0
  }

  if (merged.timing?.movingPistonWaitMs === 25 || merged.timing?.movingPistonWaitMs === 5) {
    merged.timing.movingPistonWaitMs = defaults.timing?.movingPistonWaitMs ?? 1
  }

  if (merged.log?.maxSizeBytes === 10485760) {
    merged.log.maxSizeBytes = defaults.log?.maxSizeBytes ?? 52428800
  }

  if (merged.antibot?.limboFallTicks === 96) {
    merged.antibot.limboFallTicks = defaults.antibot?.limboFallTicks ?? 128
  }

  if (merged.antibot?.limboFallPacketMs === 25) {
    merged.antibot.limboFallPacketMs = defaults.antibot?.limboFallPacketMs ?? 50
  }

  if (merged.antibot?.limboPostFallJoinMs === 1200) {
    merged.antibot.limboPostFallJoinMs = defaults.antibot?.limboPostFallJoinMs ?? 900
  }

  if (merged.antibot?.limboMenuWaitMs === 6500) {
    merged.antibot.limboMenuWaitMs = defaults.antibot?.limboMenuWaitMs ?? 12000
  }

  if (!merged.logging || typeof merged.logging !== 'object') {
    merged.logging = {}
  }

  merged.logging.debugMode = merged.logging.debugMode === true
  merged.logging.detailedEvents = merged.logging.debugMode
  merged.logging.logServerMessages = merged.logging.debugMode

  return merged
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
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="6" y="6" width="52" height="52" rx="16" fill="#0f1c2b"/>
      <rect x="12" y="12" width="40" height="40" rx="12" fill="#ff8859"/>
      <path d="M21 21h12c7 0 11 3 11 9 0 3-2 6-5 7 4 1 6 4 6 8 0 7-5 10-13 10H21V21zm10 13c3 0 5-1 5-4s-2-4-5-4h-3v8h3zm1 15c4 0 6-2 6-5s-2-5-6-5h-4v10h4z" fill="#09111b"/>
    </svg>
  `

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
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

function buildRuntimePayload() {
  return {
    ...runtimeState,
    configPath: getRuntimeConfigPath(),
    defaultConfigPath: getDefaultConfigPath(),
    logPath: getRuntimeLogPath(),
    runtimeDir: getRuntimeDir()
  }
}

function publishRuntimeState() {
  updateTrayMenu()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('runtime:state', buildRuntimePayload())
}

function appendRawProcessOutput(source, line) {
  const trimmed = line.trim()
  if (!trimmed) return

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
  } else if (eventType === 'resources') {
    runtimeState.resources = {
      cpuPercent: payload.cpuPercent || 0,
      memoryMb: payload.memoryMb || 0
    }
  } else if (eventType === 'snapshot') {
    runtimeState.snapshot = payload
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
    runtimeState.status = 'running'
    runtimeState.startedAt = Date.now()
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
        BOT_LOG_PATH: getRuntimeLogPath()
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
      capabilities: {
        runtimeControl: true,
        runtimeStreaming: true,
        fileImport: true,
        fileExport: true,
        openRuntimeDir: true
      },
      config,
      desktopSettings,
      runtime: buildRuntimePayload()
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

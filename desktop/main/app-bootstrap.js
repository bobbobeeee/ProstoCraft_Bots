const {
  app,
  BrowserWindow,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  shell
} = require('electron')
const { PRODUCT_NAME, RUNTIME_STALE_CHECK_MS } = require('./constants')
const { createDesktopPaths } = require('./paths')
const { createConfigStore } = require('./config-store')
const { createDesktopSettingsStore } = require('./desktop-settings')
const { createDialogActions } = require('./dialog-actions')
const { registerIpcHandlers } = require('./ipc-handlers')
const { createRuntimeController } = require('./runtime-controller')
const { createTrayController } = require('./tray-controller')
const { createUpdateController } = require('./update-controller')
const { createWindowController } = require('./window-controller')

function createDesktopApp({
  electronApp = app,
  browserWindow = BrowserWindow,
  trayFactory = Tray,
  electronDialog = dialog,
  electronIpcMain = ipcMain,
  electronNativeImage = nativeImage,
  electronScreen = screen,
  electronShell = shell,
  processRef = process
} = {}) {
  let isQuitting = false
  const paths = createDesktopPaths({ app: electronApp, processRef })
  let runtimeController = null
  let updateController = null
  let desktopSettingsStore = null
  let windowController = null

  function getIsQuitting() {
    return isQuitting
  }

  function setIsQuitting(nextValue) {
    isQuitting = Boolean(nextValue)
  }

  function publishRuntimeState(payload) {
    const mainWindow = windowController?.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('runtime:state', payload)
  }

  function publishUpdateState(payload) {
    const mainWindow = windowController?.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('updates:state', payload)
  }

  const configStore = createConfigStore({ paths })
  const trayController = createTrayController({
    nativeImage: electronNativeImage,
    paths,
    trayFactory,
    getRuntimeChild: () => runtimeController?.getRuntimeChild(),
    onStartRuntime: () => runtimeController.startRuntime(),
    onStopRuntime: () => runtimeController.stopRuntime(),
    onQuit: () => {
      setIsQuitting(true)
      trayController.destroyTray()
      electronApp.quit()
    },
    showMainWindow: () => windowController.showMainWindow()
  })

  desktopSettingsStore = createDesktopSettingsStore({
    app: electronApp,
    paths,
    processRef,
    trayController
  })
  trayController.setDesktopSettingsReader(desktopSettingsStore.readDesktopSettings)

  runtimeController = createRuntimeController({
    configStore,
    paths,
    processRef,
    getIsQuitting,
    publishRuntimeState,
    updateTrayMenu: () => trayController.updateTrayMenu()
  })
  updateController = createUpdateController({
    app: electronApp,
    paths,
    runtimeController,
    publishUpdateState,
    setIsQuitting
  })

  windowController = createWindowController({
    paths,
    screen: electronScreen,
    shell: electronShell,
    trayController,
    desktopSettingsStore,
    getIsQuitting,
    processRef,
    browserWindowFactory: browserWindow
  })

  const dialogActions = createDialogActions({
    app: electronApp,
    dialog: electronDialog,
    getMainWindow: windowController.getMainWindow,
    configStore
  })

  function registerHandlers() {
    return registerIpcHandlers({
      ipcMain: electronIpcMain,
      shell: electronShell,
      paths,
      configStore,
      desktopSettingsStore,
      runtimeController,
      updateController,
      dialogActions
    })
  }

  function start() {
    electronApp.whenReady().then(() => {
      electronApp.setName(PRODUCT_NAME)
      configStore.ensureRuntimeFiles()
      desktopSettingsStore.applyDesktopSettings()
      registerHandlers()
      windowController.createWindow()
      runtimeController.scheduleAutoStartRuntime(desktopSettingsStore.readDesktopSettings())
      setInterval(runtimeController.checkRuntimeStaleness, RUNTIME_STALE_CHECK_MS)
    })

    electronApp.on('before-quit', () => {
      setIsQuitting(true)
    })

    electronApp.on('window-all-closed', () => {
      runtimeController.killRuntimeChild('SIGTERM')

      if (processRef.platform !== 'darwin') {
        electronApp.quit()
      }
    })

    electronApp.on('activate', () => {
      if (browserWindow.getAllWindows().length === 0) {
        windowController.createWindow()
      } else {
        windowController.showMainWindow()
      }
    })
  }

  return {
    configStore,
    desktopSettingsStore,
    dialogActions,
    getIsQuitting,
    paths,
    registerHandlers,
    runtimeController,
    setIsQuitting,
    start,
    trayController,
    updateController,
    windowController
  }
}

module.exports = {
  createDesktopApp
}

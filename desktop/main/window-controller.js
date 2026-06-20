const { pathToFileURL } = require('url')
const { PRODUCT_NAME } = require('./constants')

function isExternalHttpUrl(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch (_error) {
    return false
  }
}

function createWindowController({
  paths,
  screen,
  shell,
  trayController,
  desktopSettingsStore,
  getIsQuitting,
  processRef = process,
  browserWindowFactory = null
}) {
  let mainWindow = null

  function getMainWindow() {
    return mainWindow
  }

  function setMainWindow(nextWindow) {
    mainWindow = nextWindow
  }

  function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }

  function installNavigationGuards(windowRef) {
    const allowedIndexUrl = pathToFileURL(paths.getRendererIndexPath()).href

    windowRef.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalHttpUrl(url)) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    windowRef.webContents.on('will-navigate', event => {
      const nextUrl = event.url || ''
      if (nextUrl === allowedIndexUrl || nextUrl.startsWith(`${allowedIndexUrl}?`)) return
      event.preventDefault()
    })
  }

  function createWindow() {
    const WindowFactory = browserWindowFactory || require('electron').BrowserWindow
    const desktopSettings = desktopSettingsStore.readDesktopSettings()
    const shouldStartMinimized =
      desktopSettings.startMinimized || processRef.argv.includes('--start-minimized')
    const display = screen.getPrimaryDisplay()
    const maxWidth = display.workAreaSize.width
    const maxHeight = display.workAreaSize.height
    const minWidth = Math.min(920, maxWidth)
    const minHeight = Math.min(620, maxHeight)
    const initialWidth = Math.min(1540, Math.max(minWidth, maxWidth - 32))
    const initialHeight = Math.min(980, Math.max(minHeight, maxHeight - 32))

    mainWindow = new WindowFactory({
      width: initialWidth,
      height: initialHeight,
      minWidth,
      minHeight,
      title: PRODUCT_NAME,
      icon: paths.getAppIconPath(),
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
        preload: paths.getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    installNavigationGuards(mainWindow)
    mainWindow.loadFile(paths.getRendererIndexPath())
    mainWindow.once('ready-to-show', () => {
      if (shouldStartMinimized) {
        if (
          desktopSettings.minimizeToTray ||
          desktopSettings.closeToTray ||
          desktopSettings.startMinimized
        ) {
          trayController.ensureTray(desktopSettings)
        }
        mainWindow.hide()
        return
      }

      mainWindow.show()
    })

    mainWindow.on('minimize', event => {
      const nextSettings = desktopSettingsStore.readDesktopSettings()
      if (!nextSettings.minimizeToTray) return
      event.preventDefault()
      trayController.ensureTray(nextSettings)
      mainWindow.hide()
    })

    mainWindow.on('close', event => {
      const nextSettings = desktopSettingsStore.readDesktopSettings()
      if (getIsQuitting() || !nextSettings.closeToTray) return
      event.preventDefault()
      trayController.ensureTray(nextSettings)
      mainWindow.hide()
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    return mainWindow
  }

  return {
    createWindow,
    getMainWindow,
    installNavigationGuards,
    setMainWindow,
    showMainWindow
  }
}

module.exports = {
  createWindowController,
  isExternalHttpUrl
}

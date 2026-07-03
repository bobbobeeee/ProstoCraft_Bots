const { PRODUCT_NAME } = require('./constants')

function createTrayController({
  nativeImage,
  paths,
  trayFactory,
  menuBuilder = null,
  getRuntimeChild,
  onStartRuntime,
  onStopRuntime,
  onQuit,
  showMainWindow
}) {
  let tray = null
  let readDesktopSettings = () => ({})

  function setDesktopSettingsReader(reader) {
    readDesktopSettings = reader
  }

  function createTrayIcon() {
    const icon = nativeImage.createFromPath(paths.getAppIconPath())
    return icon.isEmpty() ? nativeImage.createEmpty() : icon
  }

  function updateTrayMenu(settings = readDesktopSettings()) {
    if (!tray) return

    const MenuRef = menuBuilder || require('electron').Menu
    const menu = MenuRef.buildFromTemplate([
      {
        label: 'Открыть',
        click: () => showMainWindow()
      },
      {
        label: getRuntimeChild() ? 'Остановить ботов' : 'Запустить ботов',
        click: () => {
          if (getRuntimeChild()) {
            onStopRuntime()
          } else {
            onStartRuntime()
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
        click: () => onQuit()
      }
    ])

    tray.setContextMenu(menu)
  }

  function ensureTray(settings = readDesktopSettings()) {
    if (tray) {
      updateTrayMenu(settings)
      return tray
    }

    tray = new trayFactory(createTrayIcon())
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

  function destroyTray() {
    if (!tray) return
    tray.destroy()
    tray = null
  }

  function getTray() {
    return tray
  }

  return {
    destroyTray,
    ensureTray,
    getTray,
    setDesktopSettingsReader,
    updateTrayMenu
  }
}

module.exports = {
  createTrayController
}

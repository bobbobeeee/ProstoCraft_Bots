const fs = require('fs')
const { DEFAULT_DESKTOP_SETTINGS } = require('./constants')
const { readJson, writeJson } = require('./json-store')

function createDesktopSettingsStore({ app, paths, trayController, processRef = process }) {
  function readDesktopSettings() {
    const settingsPath = paths.getDesktopSettingsPath()
    if (!fs.existsSync(settingsPath)) {
      return { ...DEFAULT_DESKTOP_SETTINGS }
    }

    try {
      const rawSettings = readJson(settingsPath)
      return {
        ...DEFAULT_DESKTOP_SETTINGS,
        ...rawSettings
      }
    } catch (_error) {
      return { ...DEFAULT_DESKTOP_SETTINGS }
    }
  }

  function applyDesktopSettings(settings = readDesktopSettings()) {
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: Boolean(settings.launchOnStartup),
        path: processRef.execPath,
        args: settings.startMinimized ? ['--start-minimized'] : []
      })
    }

    if (settings.closeToTray || settings.minimizeToTray || settings.startMinimized) {
      trayController.ensureTray(settings)
    } else {
      trayController.destroyTray()
    }
  }

  function saveDesktopSettings(nextSettings) {
    const mergedSettings = {
      ...DEFAULT_DESKTOP_SETTINGS,
      ...nextSettings
    }

    writeJson(paths.getDesktopSettingsPath(), mergedSettings)
    applyDesktopSettings(mergedSettings)
    return mergedSettings
  }

  return {
    applyDesktopSettings,
    readDesktopSettings,
    saveDesktopSettings
  }
}

module.exports = {
  createDesktopSettingsStore
}

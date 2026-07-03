const path = require('path')
const { DESKTOP_SETTINGS_FILE, RUNTIME_DIRNAME } = require('./constants')

function createDesktopPaths({ app, processRef = process }) {
  function getAppRoot() {
    return app.getAppPath()
  }

  function getRuntimeCwd() {
    return app.isPackaged ? path.dirname(processRef.execPath) : getAppRoot()
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
      return path.join(processRef.resourcesPath, 'build', 'icon.ico')
    }

    return path.join(getAppRoot(), 'build', 'icon.ico')
  }

  function getUpdatesDir() {
    return path.join(getRuntimeDir(), 'updates')
  }

  function getUpdateCachePath() {
    return path.join(getUpdatesDir(), 'latest-update-cache.json')
  }

  function getPreloadPath() {
    return path.join(getAppRoot(), 'desktop', 'preload.js')
  }

  function getRendererIndexPath() {
    return path.join(getAppRoot(), 'desktop', 'renderer', 'index.html')
  }

  return {
    getAppIconPath,
    getAppRoot,
    getBackendEntryPath,
    getDefaultConfigPath,
    getDesktopSettingsPath,
    getPreloadPath,
    getRendererIndexPath,
    getRuntimeChatLogPath,
    getRuntimeConfigPath,
    getRuntimeCwd,
    getRuntimeDir,
    getRuntimeLogPath,
    getUpdateCachePath,
    getUpdatesDir
  }
}

module.exports = {
  createDesktopPaths
}

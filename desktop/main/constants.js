const packageMetadata = require('../../package.json')
const { DEFAULT_UPDATE_SOURCES } = require('../../update-service')

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

module.exports = {
  APP_VERSION,
  BOT_EVENT_PREFIX,
  DEFAULT_DESKTOP_SETTINGS,
  DESKTOP_SETTINGS_FILE,
  MAX_RECENT_CHAT_LOGS,
  MAX_RECENT_LOGS,
  PRODUCT_NAME,
  RUNTIME_DIRNAME,
  RUNTIME_STALE_AFTER_MS,
  RUNTIME_STALE_CHECK_MS,
  RUNTIME_STALE_RESTART_COOLDOWN_MS,
  UPDATE_SOURCE
}

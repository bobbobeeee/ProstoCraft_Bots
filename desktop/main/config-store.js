const fs = require('fs')
const path = require('path')
const { normalizeRuntimeConfig } = require('../../runtime-core/config-schema')
const { readJson, writeJson } = require('./json-store')

function createConfigStore({ paths }) {
  function normalizeDesktopRuntimeConfig(config) {
    const defaults = readJson(paths.getDefaultConfigPath())
    return normalizeRuntimeConfig(config, defaults)
  }

  function ensureRuntimeFiles() {
    const runtimeDir = paths.getRuntimeDir()
    const runtimeConfigPath = paths.getRuntimeConfigPath()
    const defaultConfigPath = paths.getDefaultConfigPath()

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
    const runtimeConfigPath = paths.getRuntimeConfigPath()
    const rawConfig = readJson(runtimeConfigPath)
    const normalizedConfig = normalizeDesktopRuntimeConfig(rawConfig)

    if (JSON.stringify(rawConfig) !== JSON.stringify(normalizedConfig)) {
      writeJson(runtimeConfigPath, normalizedConfig)
    }

    return normalizedConfig
  }

  function saveConfig(config) {
    writeJson(paths.getRuntimeConfigPath(), config)
    return config
  }

  function resetConfig() {
    const defaultConfigPath = paths.getDefaultConfigPath()
    const runtimeConfigPath = paths.getRuntimeConfigPath()
    fs.copyFileSync(defaultConfigPath, runtimeConfigPath)
    return readConfig()
  }

  function getPauseFilePath(config = null) {
    const resolvedConfig = config || readConfig()
    return path.resolve(
      path.dirname(paths.getRuntimeConfigPath()),
      resolvedConfig.pause?.file || 'pause.txt'
    )
  }

  return {
    ensureRuntimeFiles,
    getPauseFilePath,
    normalizeDesktopRuntimeConfig,
    readConfig,
    resetConfig,
    saveConfig
  }
}

module.exports = {
  createConfigStore
}

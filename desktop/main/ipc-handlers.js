const { APP_VERSION, UPDATE_SOURCE } = require('./constants')
const { createSecureIpcRegistry, ipcValidators } = require('./ipc-security')

function registerIpcHandlers({
  ipcMain,
  shell,
  paths,
  configStore,
  desktopSettingsStore,
  runtimeController,
  updateController,
  dialogActions
}) {
  const registry = createSecureIpcRegistry(ipcMain)

  registry.handle('app:get-bootstrap', ipcValidators.noPayload, () => {
    const config = configStore.readConfig()
    const desktopSettings = desktopSettingsStore.readDesktopSettings()
    runtimeController.syncPauseState(config)

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
      runtime: runtimeController.buildRuntimePayload(),
      updates: updateController.buildUpdatePayload()
    }
  })

  registry.handle('desktop-settings:save', ipcValidators.plainObject, (_event, nextSettings) =>
    desktopSettingsStore.saveDesktopSettings(nextSettings)
  )

  registry.handle('config:save', ipcValidators.plainObject, (_event, nextConfig) => ({
    config: configStore.saveConfig(nextConfig),
    runtime: runtimeController.buildRuntimePayload()
  }))

  registry.handle('config:reset', ipcValidators.noPayload, () => ({
    config: configStore.resetConfig(),
    runtime: runtimeController.buildRuntimePayload()
  }))

  registry.handle('config:import', ipcValidators.noPayload, async () =>
    dialogActions.importConfigFromDialog()
  )
  registry.handle('config:export', ipcValidators.plainObject, async (_event, config) =>
    dialogActions.exportConfigToDialog(config)
  )

  registry.handle('runtime:start', ipcValidators.noPayload, () => runtimeController.startRuntime())
  registry.handle('runtime:stop', ipcValidators.noPayload, () => runtimeController.stopRuntime())
  registry.handle('runtime:restart', ipcValidators.noPayload, () =>
    runtimeController.restartRuntime()
  )
  registry.handle('runtime:set-paused', ipcValidators.boolean, (_event, nextPaused) => {
    runtimeController.setPauseFile(Boolean(nextPaused))
    return runtimeController.buildRuntimePayload()
  })

  registry.handle('updates:check', ipcValidators.noPayload, () =>
    updateController.checkAppUpdates()
  )
  registry.handle('updates:download', ipcValidators.noPayload, () =>
    updateController.downloadAppUpdate()
  )
  registry.handle('updates:install', ipcValidators.noPayload, () =>
    updateController.installDownloadedUpdate()
  )

  registry.handle('shell:open-runtime-dir', ipcValidators.noPayload, async () => {
    await shell.openPath(paths.getRuntimeDir())
    return runtimeController.buildRuntimePayload()
  })

  return registry
}

module.exports = {
  registerIpcHandlers
}

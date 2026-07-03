const path = require('path')
const { readJson, writeJson } = require('./json-store')

function createDialogActions({ app, dialog, getMainWindow, configStore }) {
  async function importConfigFromDialog() {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Импорт конфигурации',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    const imported = readJson(result.filePaths[0])
    configStore.saveConfig(imported)

    return {
      canceled: false,
      config: imported,
      importedFrom: result.filePaths[0]
    }
  }

  async function exportConfigToDialog(config) {
    const result = await dialog.showSaveDialog(getMainWindow(), {
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

  return {
    exportConfigToDialog,
    importConfigFromDialog
  }
}

module.exports = {
  createDialogActions
}

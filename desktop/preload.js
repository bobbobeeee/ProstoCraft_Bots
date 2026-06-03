const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('botStudio', {
  getBootstrap: () => ipcRenderer.invoke('app:get-bootstrap'),
  saveDesktopSettings: settings => ipcRenderer.invoke('desktop-settings:save', settings),
  saveConfig: config => ipcRenderer.invoke('config:save', config),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  exportConfig: config => ipcRenderer.invoke('config:export', config),
  startRuntime: () => ipcRenderer.invoke('runtime:start'),
  stopRuntime: () => ipcRenderer.invoke('runtime:stop'),
  restartRuntime: () => ipcRenderer.invoke('runtime:restart'),
  setPaused: nextPaused => ipcRenderer.invoke('runtime:set-paused', nextPaused),
  openRuntimeDir: () => ipcRenderer.invoke('shell:open-runtime-dir'),
  onRuntimeState: callback => {
    const listener = (_, payload) => callback(payload)
    ipcRenderer.on('runtime:state', listener)
    return () => ipcRenderer.removeListener('runtime:state', listener)
  }
})

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const {
  IPC_CHANNELS,
  createSecureIpcRegistry,
  ipcValidators
} = require('./desktop/main/ipc-security')
const { isExternalHttpUrl } = require('./desktop/main/window-controller')

const preloadPath = path.join(__dirname, 'desktop', 'preload.js')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')

const invokedChannels = []
const subscribedChannels = []
const removedChannels = []
const sandbox = {
  require(name) {
    assert.strictEqual(name, 'electron')
    return {
      contextBridge: {
        exposeInMainWorld(name, api) {
          sandbox.window[name] = api
        }
      },
      ipcRenderer: {
        invoke(channel, ...args) {
          invokedChannels.push({ channel, args })
          return Promise.resolve({ channel, args })
        },
        on(channel, listener) {
          subscribedChannels.push({ channel, listener })
        },
        removeListener(channel, listener) {
          removedChannels.push({ channel, listener })
        }
      }
    }
  },
  window: {}
}

vm.runInNewContext(preloadSource, sandbox, { filename: preloadPath })

const api = sandbox.window.botStudio
assert.strictEqual(typeof api, 'object')

api.getBootstrap()
api.saveDesktopSettings({ closeToTray: true })
api.saveConfig({ bots: [] })
api.resetConfig()
api.importConfig()
api.exportConfig({ bots: [] })
api.startRuntime()
api.stopRuntime()
api.restartRuntime()
api.setPaused(true)
api.checkUpdates()
api.downloadUpdate()
api.installUpdate()
api.openRuntimeDir()

assert.deepStrictEqual(
  invokedChannels.map(entry => entry.channel),
  IPC_CHANNELS.invoke
)

const unsubscribeRuntime = api.onRuntimeState(() => {})
const unsubscribeUpdates = api.onUpdateState(() => {})
unsubscribeRuntime()
unsubscribeUpdates()

assert.deepStrictEqual(
  subscribedChannels.map(entry => entry.channel),
  IPC_CHANNELS.send
)
assert.deepStrictEqual(
  removedChannels.map(entry => entry.channel),
  IPC_CHANNELS.send
)

assert.throws(
  () =>
    createSecureIpcRegistry({ handle() {} }).handle(
      'unknown:channel',
      ipcValidators.noPayload,
      () => {}
    ),
  /not allowlisted/
)

const registered = []
const ipcMainStub = {
  handle(channel, handler) {
    registered.push({ channel, handler })
  }
}
const registry = createSecureIpcRegistry(ipcMainStub)
registry.handle('runtime:set-paused', ipcValidators.boolean, (_event, nextPaused) => nextPaused)

assert.deepStrictEqual(registry.getRegisteredHandlers(), ['runtime:set-paused'])
assert.strictEqual(registered.length, 1)
assert.throws(() => ipcValidators.boolean(['yes'], 'runtime:set-paused'), /boolean payload/)
assert.throws(() => ipcValidators.noPayload([true], 'runtime:start'), /does not accept/)
assert.throws(() => ipcValidators.plainObject([null], 'config:save'), /plain object/)

assert.strictEqual(isExternalHttpUrl('https://github.com/example/release'), true)
assert.strictEqual(isExternalHttpUrl('http://localhost:3000'), true)
assert.strictEqual(isExternalHttpUrl('file:///C:/unsafe.html'), false)
assert.strictEqual(isExternalHttpUrl('javascript:alert(1)'), false)
assert.strictEqual(isExternalHttpUrl('not a url'), false)

console.log('desktop main tests passed')

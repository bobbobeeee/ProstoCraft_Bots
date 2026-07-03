const IPC_INVOKE_CHANNELS = Object.freeze([
  'app:get-bootstrap',
  'desktop-settings:save',
  'config:save',
  'config:reset',
  'config:import',
  'config:export',
  'runtime:start',
  'runtime:stop',
  'runtime:restart',
  'runtime:set-paused',
  'updates:check',
  'updates:download',
  'updates:install',
  'shell:open-runtime-dir'
])

const IPC_SEND_CHANNELS = Object.freeze(['runtime:state', 'updates:state'])

const IPC_CHANNELS = Object.freeze({
  invoke: IPC_INVOKE_CHANNELS,
  send: IPC_SEND_CHANNELS
})

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertPlainObject(value, channel) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${channel} expects a plain object payload`)
  }
}

function assertBoolean(value, channel) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${channel} expects a boolean payload`)
  }
}

function assertNoPayload(args, channel) {
  if (args.length > 0) {
    throw new TypeError(`${channel} does not accept a payload`)
  }
}

function createSecureIpcRegistry(ipcMain) {
  const registeredHandlers = new Set()

  function handle(channel, validator, handler) {
    if (!IPC_INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel is not allowlisted: ${channel}`)
    }
    if (registeredHandlers.has(channel)) {
      throw new Error(`IPC channel already registered: ${channel}`)
    }

    registeredHandlers.add(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      validator(args, channel)
      return handler(event, ...args)
    })
  }

  return {
    getRegisteredHandlers: () => [...registeredHandlers],
    handle
  }
}

const ipcValidators = {
  noPayload: assertNoPayload,
  plainObject(args, channel) {
    assertPlainObject(args[0], channel)
  },
  boolean(args, channel) {
    assertBoolean(args[0], channel)
  }
}

module.exports = {
  IPC_CHANNELS,
  assertBoolean,
  assertNoPayload,
  assertPlainObject,
  createSecureIpcRegistry,
  ipcValidators,
  isPlainObject
}

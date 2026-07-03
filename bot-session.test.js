const assert = require('assert')
const { EventEmitter } = require('events')
const { createRuntimeSettings, loadRuntimeConfig } = require('./runtime-core/config-schema')
const { createBotSessionFactory } = require('./runtime-core/bot-session')

class FakeBot extends EventEmitter {
  constructor() {
    super()
    this.entity = null
    this._client = {
      on() {},
      socket: {
        on() {}
      }
    }
  }

  removeAllListeners(...args) {
    return super.removeAllListeners(...args)
  }

  quit() {
    this.quitCalled = true
  }
}

const settings = createRuntimeSettings(loadRuntimeConfig('config.json', 'config.json'), {})
const createdOptions = []
const fakeBot = new FakeBot()
const activeBots = []
const logs = []

const createBot = createBotSessionFactory({
  settings,
  context: {
    mineflayer: {
      createBot(options) {
        createdOptions.push(options)
        return fakeBot
      }
    },
    setTimeout(fn) {
      return { fn }
    },
    clearTimeout() {},
    setInterval(fn) {
      return { fn }
    },
    clearInterval() {},
    sleep: () => Promise.resolve(),
    getActiveBots: () => activeBots,
    isRuntimeEnabled: () => true,
    isShuttingDown: () => false,
    isDiggingPaused: () => false,
    addLog: (level, botName, message) => logs.push({ level, botName, message }),
    addChatLog() {},
    addDiagnosticLog() {},
    updateBotStatus() {},
    setRuntimeHealth() {},
    recordTimelineEvent() {},
    refreshBotRates() {},
    noteGlobalError() {},
    noteNoInternetError() {},
    summarizeDiagnosticDetails: (_eventName, details) => details,
    getPacketGovernorBaseLimits: () => ({
      perSecond: 1,
      burst: 1,
      burstWindowMs: 1,
      targetCooldownMs: 0,
      pendingRetryMs: 0
    }),
    monitorData: { bots: {}, startTime: Date.now() },
    stabilityCooldowns: new Map(),
    botFilterRetryStates: new Map()
  }
})

const handle = createBot({
  username: 'Bot',
  blocksToMine: [{ x: 1, y: 2, z: 3 }],
  maxDistanceFromStand: 0.6
})

assert.strictEqual(handle.username, 'Bot')
assert.strictEqual(handle.bot, fakeBot)
assert.strictEqual(handle.isOnline, false)
assert.strictEqual(handle.hasReconnectPending, false)
assert.strictEqual(handle.isBotFilterBusy, false)
assert.deepStrictEqual(createdOptions[0], {
  host: settings.SERVER_HOST,
  port: settings.SERVER_PORT,
  username: 'Bot',
  auth: 'offline',
  version: settings.MC_VERSION,
  keepAlive: true,
  keepAliveInterval: 15000
})

handle.cleanup()
assert.strictEqual(fakeBot.quitCalled, true)
assert(logs.length >= 0)

console.log('bot-session tests passed')

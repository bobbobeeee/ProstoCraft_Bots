const assert = require('assert')
const { createRuntimeManager } = require('./runtime-core/runtime-manager')

const logs = []
const timers = []
const cleared = []
const createdBots = []
const monitorData = {
  startTime: 1000,
  bots: {
    Bot: {
      status: 'копает',
      blocksLastMinute: 10,
      blocksPerSecond: 1,
      effectiveBlocksLastMinute: 10,
      effectiveBlocksPerSecond: 1,
      rateActiveSince: 1000,
      rateStatusChangedAt: 1000
    }
  }
}

const manager = createRuntimeManager({
  settings: {
    botsConfigs: [{ username: 'Bot' }],
    START_STAGGER: 100,
    START_STAGGER_JITTER: 0,
    PERIODIC_REJOIN_MS: 60000,
    PAUSE_FILE_PATH: '__missing_pause_file__',
    PAUSE_CHECK_INTERVAL: 1000,
    OFFLINE_WATCHDOG_INTERVAL_MS: 5000
  },
  setTimeout(fn, delay) {
    const timer = { fn, delay, type: 'timeout' }
    timers.push(timer)
    return timer
  },
  clearTimeout(timer) {
    cleared.push(timer)
  },
  setInterval(fn, delay) {
    const timer = { fn, delay, type: 'interval' }
    timers.push(timer)
    return timer
  },
  sleep: () => Promise.resolve(),
  addLog: (level, botName, message) => logs.push({ level, botName, message }),
  updateBotStatus() {},
  setRuntimeHealth() {},
  updateUI() {},
  monitorData
})

manager.setCreateBot(cfg => {
  const bot = {
    username: cfg.username,
    cleanupCalled: false,
    cleanup() {
      this.cleanupCalled = true
    }
  }
  createdBots.push(bot)
  return bot
})

assert.strictEqual(manager.isRuntimeEnabled(), true)
manager.toggleManualPause()
assert.strictEqual(manager.isDiggingPaused(), true)
assert.strictEqual(monitorData.bots.Bot.status, 'пауза')
manager.toggleManualPause()
assert.strictEqual(manager.isDiggingPaused(), false)
assert.strictEqual(monitorData.bots.Bot.status, 'копает')

manager.startRuntimeManager()
assert(timers.some(timer => timer.type === 'timeout' && timer.delay === 0))
timers.find(timer => timer.type === 'timeout').fn()
assert.strictEqual(createdBots.length, 1)
assert.strictEqual(manager.getActiveBots()[0], createdBots[0])

manager.stopRuntimeManager()
assert.strictEqual(createdBots[0].cleanupCalled, true)
assert.strictEqual(manager.getActiveBots().length, 0)
assert(logs.some(entry => entry.message.includes('Остановка всех ботов')))

console.log('runtime-manager tests passed')

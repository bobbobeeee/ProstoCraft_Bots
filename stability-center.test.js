const assert = require('assert')
const {
  classifyHealthEvent,
  computeSmartRateStats,
  createHealthState,
  getRuntimeRecoveryDecision,
  updateHealthState
} = require('./stability-center')

{
  assert.strictEqual(classifyHealthEvent({ message: 'read ECONNRESET' }), 'network-reset')
  assert.strictEqual(classifyHealthEvent({ message: 'getaddrinfo ENOTFOUND mc.prostocraft.com' }), 'dns-failure')
  assert.strictEqual(classifyHealthEvent({ message: 'connect ETIMEDOUT 10.0.0.1:25565' }), 'connect-timeout')
  assert.strictEqual(classifyHealthEvent({ message: 'mining-confirmation ratio dropped' }), 'mining-confirmation')
  assert.strictEqual(classifyHealthEvent({ message: 'packet budget reduced' }), 'packet-budget')
  assert.strictEqual(classifyHealthEvent({ message: 'fallback dig activated' }), 'fallback-dig')
}

{
  const now = 240000
  const beforeDisconnectBlocks = Array.from({ length: 75 }, (_, index) => 1000 + index * 80)
  const stats = computeSmartRateStats({
    blockTimes: beforeDisconnectBlocks,
    now,
    rawWindowMs: 60000,
    speedWindowMs: 10000,
    status: 'ожидание',
    activeSince: 0
  })

  assert.strictEqual(stats.rawRatePerMinute, 0)
  assert.strictEqual(stats.effectiveRatePerMinute, 0)
  assert.strictEqual(stats.recovering, true)
}

{
  const now = 250000
  const activeSince = now - 10000
  const oldBlocks = Array.from({ length: 75 }, (_, index) => 1000 + index * 80)
  const freshBlocks = Array.from({ length: 125 }, (_, index) => activeSince + index * 80)
  const stats = computeSmartRateStats({
    blockTimes: [...oldBlocks, ...freshBlocks],
    now,
    rawWindowMs: 60000,
    speedWindowMs: 10000,
    status: 'копает',
    activeSince
  })

  assert.strictEqual(stats.rawRatePerMinute, 125)
  assert.strictEqual(Math.round(stats.effectiveRatePerMinute), 750)
  assert.strictEqual(Math.round(stats.effectiveBlocksPerSecond * 60), 750)
}

{
  const now = 100000
  const state = createHealthState(now)
  const failed = updateHealthState(state, {
    message: 'getaddrinfo ENOTFOUND mc.prostocraft.com',
    lastRecoveryAction: 'reconnect scheduled'
  }, now + 1000)
  const tick = updateHealthState(failed, {}, now + 11000)

  assert.strictEqual(tick.reason, 'dns-failure')
  assert.strictEqual(tick.downtimeMs, 10000)
  assert.strictEqual(tick.lastRecoveryAction, 'reconnect scheduled')
}

{
  const state = createHealthState(100000)
  const joining = updateHealthState(state, {
    reason: 'joining',
    lastRecoveryAction: 'limbo passed'
  }, 101000)

  assert.strictEqual(joining.reason, 'joining')
  assert.strictEqual(joining.state, 'recovering')
  assert.strictEqual(joining.lastRecoveryAction, 'limbo passed')
}

{
  const decision = getRuntimeRecoveryDecision({
    now: 700000,
    running: true,
    desired: true,
    lastEventAt: 99999,
    staleAfterMs: 600000
  })

  assert.strictEqual(decision.action, 'restart-runtime')
  assert.strictEqual(decision.reason, 'runtime-stale')
}

console.log('stability-center tests passed')

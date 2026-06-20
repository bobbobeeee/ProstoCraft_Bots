const assert = require('assert')
const { createPacketBreakTracker, getPositionKey } = require('./runtime-core/packet-break-tracker')

{
  assert.strictEqual(getPositionKey({ x: 1.9, y: 70.1, z: -2.2 }), '1,70,-3')
}

{
  const throttles = []
  const tracker = createPacketBreakTracker({
    getBreakPacketLimits: () => ({
      perSecond: 2,
      burst: 2,
      burstWindowMs: 250
    }),
    onThrottle: event => throttles.push(event)
  })

  assert.strictEqual(tracker.reserveBreakPacketBudget(2, 1000), true)
  assert.strictEqual(tracker.reserveBreakPacketBudget(2, 1100), false)
  assert.strictEqual(throttles.length, 0)
  assert.strictEqual(tracker.reserveBreakPacketBudget(2, 2100), true)
  assert.strictEqual(tracker.reserveBreakPacketBudget(2, 6100), true)
  assert.strictEqual(tracker.reserveBreakPacketBudget(2, 6200), false)
  assert.strictEqual(throttles.length, 1)
}

{
  const tracker = createPacketBreakTracker({
    getBreakPacketLimits: () => ({ perSecond: 10, burst: 10, burstWindowMs: 250 })
  })
  const position = { x: 10, y: 64, z: 10 }
  tracker.markBreakPacketTargetSent(position, 1000)
  assert.strictEqual(tracker.canSendBreakPacketForTarget(position, 12, 1005), false)
  assert.strictEqual(tracker.canSendBreakPacketForTarget(position, 12, 1012), true)

  tracker.markPacketBreakAttempt(position, 2000)
  assert.strictEqual(tracker.canRetryPendingBreak(position, 32, 2010), false)
  assert.strictEqual(tracker.canRetryPendingBreak(position, 32, 2032), true)
  assert.strictEqual(tracker.hasRecentPacketBreak(position, 2100, 1500), true)
  tracker.deletePending(position)
  assert.strictEqual(tracker.hasRecentPacketBreak(position, 2100, 1500), false)
}

{
  const pruneCalls = []
  const tracker = createPacketBreakTracker({
    getBreakPacketLimits: () => ({ perSecond: 10, burst: 10, burstWindowMs: 250 }),
    pruneMiningControllerPending: options => {
      pruneCalls.push(options)
      return 2
    }
  })
  tracker.markPacketBreakAttempt({ x: 1, y: 2, z: 3 }, 1000)
  assert.strictEqual(tracker.shouldCountBlock('1,2,3', 1100, 75), true)
  assert.strictEqual(tracker.shouldCountBlock('1,2,3', 1120, 75), false)
  const result = tracker.prune(4000, {
    packetTtl: 1500,
    countTtl: 1000,
    miningControllerStalePendingMs: 3000
  })
  assert.deepStrictEqual(result, {
    stalePackets: 1,
    controllerStale: 2,
    packetTtl: 1500,
    pendingBreaks: 0
  })
  assert.strictEqual(pruneCalls[0].stalePendingMs, 1500)
}

console.log('packet-break-tracker tests passed')

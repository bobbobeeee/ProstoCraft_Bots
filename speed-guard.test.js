const assert = require('assert')
const {
  createSpeedGuardProfile,
  getAdaptiveRateWindowMs,
  getAdaptiveWaitMs,
  getRobustPeakRate,
  getSpeedGuardTargetRate,
  getSpeedGuardTargetRatioFromDropPercent,
  recordSpeedGuardProgress,
  rememberSpeedGuardPeak,
  shouldEscalateSpeedDrop
} = require('./speed-guard')

{
  const profile = createSpeedGuardProfile()
  assert.strictEqual(getSpeedGuardTargetRate(profile, 0.9), 0)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 12), 12)
  assert.strictEqual(getSpeedGuardTargetRate(profile, 0.9), 10.8)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 4), 12)
}

{
  const profile = createSpeedGuardProfile()
  assert.strictEqual(rememberSpeedGuardPeak(profile, 100, 1000, 10000, { stickyPeakMemoryMs: 10000 }), 100)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 50, 5000, 10000, { stickyPeakMemoryMs: 10000 }), 100)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 50, 12000, 10000, { stickyPeakMemoryMs: 10000 }), 50)
  assert.strictEqual(getSpeedGuardTargetRate(profile, 0.9), 45)
}

{
  const profile = createSpeedGuardProfile()
  assert.strictEqual(rememberSpeedGuardPeak(profile, 750, 1000, 10000, { stickyPeakMemoryMs: 600000 }), 750)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 580, 20000, 10000, { stickyPeakMemoryMs: 600000 }), 750)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 580, 120000, 10000, { stickyPeakMemoryMs: 600000 }), 750)
  assert.strictEqual(getSpeedGuardTargetRate(profile, 0.95), 712.5)
}

{
  const profile = createSpeedGuardProfile()
  assert.strictEqual(rememberSpeedGuardPeak(profile, 750, 1000, 10000, { stickyPeakMemoryMs: 60000 }), 750)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 580, 90000, 10000, { stickyPeakMemoryMs: 60000 }), 580)
}

{
  assert.strictEqual(getSpeedGuardTargetRatioFromDropPercent(10), 0.9)
  assert.strictEqual(getSpeedGuardTargetRatioFromDropPercent(7), 0.9299999999999999)
  assert.strictEqual(getSpeedGuardTargetRatioFromDropPercent(undefined, 0.88), 0.88)
}

{
  assert.strictEqual(getRobustPeakRate([
    { ratePerMinute: 700 },
    { ratePerMinute: 710 },
    { ratePerMinute: 720 },
    { ratePerMinute: 1000 },
    { ratePerMinute: 715 }
  ]), 720)
}

{
  const profile = createSpeedGuardProfile()
  recordSpeedGuardProgress(profile, 1000)
  recordSpeedGuardProgress(profile, 46000)
  assert.strictEqual(profile.averageProgressIntervalMs, 45000)
  assert.strictEqual(getAdaptiveRateWindowMs(profile, 30000), 135000)
  assert.strictEqual(getAdaptiveWaitMs(profile, 20000, 4), 180000)
}

{
  assert.strictEqual(shouldEscalateSpeedDrop({
    currentRate: 690,
    targetRate: 713,
    recoveries: 1,
    reconnectAfterRecoveries: 2,
    sustainedLowMs: 15000,
    sustainedDropReconnectMs: 45000,
    idleFor: 0,
    noProgressReconnectMs: 20000
  }), false)

  assert.strictEqual(shouldEscalateSpeedDrop({
    currentRate: 476,
    targetRate: 713,
    recoveries: 2,
    reconnectAfterRecoveries: 2,
    sustainedLowMs: 15000,
    sustainedDropReconnectMs: 45000,
    idleFor: 0,
    noProgressReconnectMs: 20000
  }), true)

  assert.strictEqual(shouldEscalateSpeedDrop({
    currentRate: 690,
    targetRate: 713,
    recoveries: 2,
    reconnectAfterRecoveries: 2,
    sustainedLowMs: 46000,
    sustainedDropReconnectMs: 45000,
    idleFor: 0,
    noProgressReconnectMs: 20000
  }), true)

  assert.strictEqual(shouldEscalateSpeedDrop({
    currentRate: 713,
    targetRate: 713,
    recoveries: 5,
    reconnectAfterRecoveries: 2,
    sustainedLowMs: 60000,
    sustainedDropReconnectMs: 45000,
    idleFor: 60000,
    noProgressReconnectMs: 20000
  }), false)
}

console.log('speed-guard tests passed')

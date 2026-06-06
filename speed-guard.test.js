const assert = require('assert')
const {
  createSpeedGuardProfile,
  getAdaptiveRateWindowMs,
  getAdaptiveWaitMs,
  getSpeedGuardTargetRate,
  recordSpeedGuardProgress,
  rememberSpeedGuardPeak
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
  assert.strictEqual(rememberSpeedGuardPeak(profile, 100, 1000, 10000), 100)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 50, 5000, 10000), 100)
  assert.strictEqual(rememberSpeedGuardPeak(profile, 50, 12000, 10000), 50)
  assert.strictEqual(getSpeedGuardTargetRate(profile, 0.9), 45)
}

{
  const profile = createSpeedGuardProfile()
  recordSpeedGuardProgress(profile, 1000)
  recordSpeedGuardProgress(profile, 46000)
  assert.strictEqual(profile.averageProgressIntervalMs, 45000)
  assert.strictEqual(getAdaptiveRateWindowMs(profile, 30000), 135000)
  assert.strictEqual(getAdaptiveWaitMs(profile, 20000, 4), 180000)
}

console.log('speed-guard tests passed')

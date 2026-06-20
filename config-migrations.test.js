const assert = require('assert')
const { applyLegacyConfigMigrations } = require('./config-migrations')

const defaults = {
  timing: {
    breakPacketSafeMaxPerSecond: 160,
    breakPacketSafeBurstLimit: 42,
    speedGuardTargetRatio: 0.9,
    speedGuardRateWindowMs: 30000,
    miningControllerMinBudgetScale: 0.85
  },
  logging: {
    diagnosticMaxValueLength: 1400,
    diagnosticRepeatSummaryMs: 30000
  },
  features: {
    enableSpeedGuard: true
  }
}

const config = {
  timing: {
    breakPacketSafeMaxPerSecond: 150,
    breakPacketSafeBurstLimit: 40,
    minBlocksPerMin: 350,
    speedGuardMinBlocksPerMin: 350,
    speedGuardMinLearnRate: 450,
    speedGuardTargetRatio: 0.5,
    speedGuardRateWindowMs: 1000,
    speedGuardReconnectAfterRecoveries: 2,
    miningControllerMinBudgetScale: 0.55,
    emptyTargetButtonCooldownMs: 123
  },
  logging: {
    debugMode: true,
    diagnosticMaxValueLength: 3000
  },
  antibot: {
    limboScannerActiveFallDelayMs: 250,
    limboFallbackY: 512
  },
  features: {}
}

const migrated = applyLegacyConfigMigrations(config, defaults)

assert.strictEqual(migrated.timing.breakPacketSafeMaxPerSecond, 160)
assert.strictEqual(migrated.timing.breakPacketSafeBurstLimit, 42)
assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated.timing, 'minBlocksPerMin'), false)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, 'speedGuardMinBlocksPerMin'),
  false
)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, 'speedGuardMinLearnRate'),
  false
)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.antibot, 'limboScannerActiveFallDelayMs'),
  false
)
assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated.antibot, 'limboFallbackY'), false)
assert.strictEqual(migrated.timing.speedGuardTargetRatio, 0.9)
assert.strictEqual(migrated.timing.speedGuardRateWindowMs, 30000)
assert.strictEqual(migrated.timing.speedGuardReconnectAfterRecoveries, 3)
assert.strictEqual(migrated.timing.miningControllerMinBudgetScale, 0.85)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, 'emptyTargetButtonCooldownMs'),
  false
)
assert.strictEqual(migrated.logging.detailedEvents, true)
assert.strictEqual(migrated.logging.logServerMessages, true)
assert.strictEqual(migrated.features.enableSpeedGuard, true)

console.log('config-migrations tests passed')

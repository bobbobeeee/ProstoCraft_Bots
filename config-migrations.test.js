const assert = require('assert')
const { applyLegacyConfigMigrations } = require('./config-migrations')

const removedPrefix = ['speed', 'Guard'].join('')
const removedFeatureKey = ['enable', 'Speed', 'Guard'].join('')

const defaults = {
  logging: {
    diagnosticMaxValueLength: 1400,
    diagnosticRepeatSummaryMs: 30000
  }
}

const config = {
  timing: {
    breakPacketSafeMaxPerSecond: 150,
    breakPacketSafeBurstLimit: 40,
    minBlocksPerMin: 350,
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
  features: {
    [removedFeatureKey]: true
  }
}

config.timing[`${removedPrefix}MinBlocksPerMin`] = 350
config.timing[`${removedPrefix}MinLearnRate`] = 450
config.timing[`${removedPrefix}TargetRatio`] = 0.5
config.timing[`${removedPrefix}RateWindowMs`] = 1000
config.timing[`${removedPrefix}ReconnectAfterRecoveries`] = 2
config.timing[`${removedPrefix}AllowedDropPercent`] = 10

const migrated = applyLegacyConfigMigrations(config, defaults)

assert.strictEqual(migrated.timing.breakPacketSafeMaxPerSecond, 150)
assert.strictEqual(migrated.timing.breakPacketSafeBurstLimit, 40)
assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated.timing, 'minBlocksPerMin'), false)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, `${removedPrefix}MinBlocksPerMin`),
  false
)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, `${removedPrefix}MinLearnRate`),
  false
)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, `${removedPrefix}AllowedDropPercent`),
  false
)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.antibot, 'limboScannerActiveFallDelayMs'),
  false
)
assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated.antibot, 'limboFallbackY'), false)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, `${removedPrefix}TargetRatio`),
  false
)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, `${removedPrefix}RateWindowMs`),
  false
)
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, `${removedPrefix}ReconnectAfterRecoveries`),
  false
)
// mining controller migration removed
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migrated.timing, 'emptyTargetButtonCooldownMs'),
  false
)
assert.strictEqual(migrated.logging.detailedEvents, true)
assert.strictEqual(migrated.logging.logServerMessages, true)
assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated.features, removedFeatureKey), false)

console.log('config-migrations tests passed')

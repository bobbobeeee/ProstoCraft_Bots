function getValueByPath(target, keyPath) {
  return keyPath.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return current[key]
  }, target)
}

function setValueByPath(target, keyPath, value) {
  const keys = keyPath.split('.')
  const leaf = keys.pop()
  const parent = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    return current[key]
  }, target)
  parent[leaf] = value
}

function deleteValueByPath(target, keyPath) {
  const keys = keyPath.split('.')
  const leaf = keys.pop()
  const parent = keys.reduce((current, key) => {
    if (!current || typeof current !== 'object') return null
    return current[key]
  }, target)

  if (parent && Object.prototype.hasOwnProperty.call(parent, leaf)) {
    delete parent[leaf]
  }
}

function deleteKeysByPrefix(target, keyPath, prefixParts) {
  const section = getValueByPath(target, keyPath)
  if (!section || typeof section !== 'object') return

  const prefix = prefixParts.join('').toLowerCase()
  for (const key of Object.keys(section)) {
    if (key.toLowerCase().startsWith(prefix)) {
      delete section[key]
    }
  }
}

function defaultValue(defaults, keyPath, fallback) {
  const value = getValueByPath(defaults, keyPath)
  return value === undefined ? fallback : value
}

function valueMatches(value, rule) {
  if (typeof rule.when === 'function') return rule.when(value)
  if (Array.isArray(rule.legacyValues)) return rule.legacyValues.includes(value)
  return value === rule.legacyValue
}

function applyRule(merged, defaults, rule) {
  const currentValue = getValueByPath(merged, rule.path)
  if (!valueMatches(currentValue, rule)) return

  setValueByPath(merged, rule.path, defaultValue(defaults, rule.path, rule.fallback))
}

const LEGACY_CONFIG_RULES = [
  { path: 'timing.startStagger', legacyValue: 30000, fallback: 1000 },
  { path: 'timing.startStaggerJitter', legacyValue: 15000, fallback: 500 },
  { path: 'timing.emptyTargetRecheckMs', legacyValues: [250, 40, 10], fallback: 5 },
  { path: 'timing.entryButtonAfterPressWaitMs', legacyValue: 1200, fallback: 0 },
  { path: 'timing.miningLoopIdleMs', legacyValues: [25, 10, 5], fallback: 2 },
  { path: 'timing.miningBatchSize', legacyValues: [8, 32, 64], fallback: 96 },
  { path: 'timing.burstBreakWindowMs', legacyValues: [700, 1200], fallback: 1500 },
  { path: 'timing.burstBreakIntervalMs', legacyValues: [20, 5], fallback: 1 },
  { path: 'timing.burstBreakRepeats', legacyValue: 3, fallback: 2 },
  { path: 'timing.breakPacketTargetCooldownMs', legacyValues: [25, 10], fallback: 12 },
  { path: 'timing.breakPacketMinTargetCooldownMs', legacyValues: [75, 45, 20], fallback: 8 },
  { path: 'timing.breakPacketMaxPerSecond', legacyValues: [72, 108, 160, 240], fallback: 300 },
  { path: 'timing.breakPacketBurstLimit', legacyValues: [18, 28, 42, 64], fallback: 84 },
  { path: 'timing.reactiveBreakRepeats', legacyValue: 2, fallback: 1 },
  { path: 'timing.transientBreakRepeats', legacyValue: 2, fallback: 1 },
  { path: 'timing.preemptiveBreakTargets', legacyValue: true, fallback: false },
  { path: 'timing.fastDigConfirmMs', legacyValues: [120, 60, 25], fallback: 15 },
  { path: 'timing.fastDigRetryMs', legacyValues: [25, 10, 5], fallback: 1 },
  { path: 'timing.fastDigMinVanillaTimeMs', legacyValue: 250, fallback: 0 },
  { path: 'timing.stabilityCooldownMaxMs', legacyValues: [600000, 900000, 3600000], fallback: 0 },
  { path: 'timing.stabilityCooldownMs', legacyValue: 300000, fallback: 0 },
  { path: 'timing.connectionStabilityCooldownMs', legacyValue: 1800000, fallback: 0 },
  { path: 'timing.movingPistonWaitMs', legacyValues: [25, 5], fallback: 1 },
  { path: 'log.maxSizeBytes', legacyValue: 10485760, fallback: 52428800 },
  { path: 'antibot.limboFallTicks', legacyValue: 96, fallback: 128 },
  { path: 'antibot.limboFallPacketMs', legacyValue: 25, fallback: 50 },
  { path: 'antibot.limboPostFallJoinMs', legacyValue: 1200, fallback: 900 },
  { path: 'antibot.limboMenuWaitMs', legacyValue: 6500, fallback: 12000 },
  { path: 'logging.diagnosticMaxValueLength', legacyValue: 3000, fallback: 1400 },
  {
    path: 'logging.diagnosticRepeatSummaryMs',
    when: value => !Number.isFinite(Number(value)),
    fallback: 30000
  }
]

const OBSOLETE_CONFIG_PATHS = [
  'timing.minBlocksPerMin',
  'antibot.limboScannerActiveFallDelayMs',
  'antibot.limboFallbackY',
  'antibot.limboRecentPositionMs'
]

function applyLegacyConfigMigrations(merged, defaults) {
  if (
    merged.timing &&
    Object.prototype.hasOwnProperty.call(merged.timing, 'emptyTargetButtonCooldownMs')
  ) {
    deleteValueByPath(merged, 'timing.emptyTargetButtonCooldownMs')
  }

  for (const keyPath of OBSOLETE_CONFIG_PATHS) {
    deleteValueByPath(merged, keyPath)
  }
  deleteKeysByPrefix(merged, 'timing', ['speed', 'Guard'])
  deleteValueByPath(merged, ['features', ['enable', 'Speed', 'Guard'].join('')].join('.'))

  for (const rule of LEGACY_CONFIG_RULES) {
    applyRule(merged, defaults, rule)
  }

  if (!merged.logging || typeof merged.logging !== 'object') {
    merged.logging = {}
  }

  if (!merged.features || typeof merged.features !== 'object') {
    merged.features = {}
  }

  merged.logging.debugMode = merged.logging.debugMode === true
  merged.logging.detailedEvents = merged.logging.debugMode
  merged.logging.logServerMessages = merged.logging.debugMode
  merged.logging.diagnosticFullPacketDetails = merged.logging.diagnosticFullPacketDetails === true

  return merged
}

module.exports = {
  LEGACY_CONFIG_RULES,
  applyLegacyConfigMigrations,
  getValueByPath
}

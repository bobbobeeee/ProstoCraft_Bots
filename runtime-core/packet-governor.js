function normalizeBaseLimits(baseLimits = {}) {
  const fastPerSecond = Math.max(1, Number(baseLimits.fastPerSecond ?? baseLimits.perSecond) || 1)
  const fastBurst = Math.max(1, Number(baseLimits.fastBurst ?? baseLimits.burst) || 1)

  return {
    fastPerSecond,
    fastBurst,
    perSecond: fastPerSecond,
    burst: fastBurst,
    burstWindowMs: Math.max(1, Number(baseLimits.burstWindowMs) || 1),
    targetCooldownMs: Math.max(0, Number(baseLimits.targetCooldownMs) || 0),
    pendingRetryMs: Math.max(0, Number(baseLimits.pendingRetryMs) || 0)
  }
}

function getPacketGovernorLimits(baseLimits = {}) {
  return {
    ...normalizeBaseLimits(baseLimits),
    mode: 'fast'
  }
}

module.exports = {
  getPacketGovernorLimits,
  normalizeBaseLimits
}

function createSpeedGuardProfile() {
  return {
    peakRatePerMinute: 0,
    stickyPeakRatePerMinute: 0,
    stickyPeakAt: 0,
    averageProgressIntervalMs: 0,
    lastProgressAt: 0,
    rateSamples: []
  }
}

function normalizeProfile(profile) {
  const target = profile && typeof profile === 'object'
    ? profile
    : createSpeedGuardProfile()

  if (!Array.isArray(target.rateSamples)) target.rateSamples = []
  if (!Number.isFinite(Number(target.peakRatePerMinute))) target.peakRatePerMinute = 0
  if (!Number.isFinite(Number(target.stickyPeakRatePerMinute))) target.stickyPeakRatePerMinute = 0
  if (!Number.isFinite(Number(target.stickyPeakAt))) target.stickyPeakAt = 0
  if (!Number.isFinite(Number(target.averageProgressIntervalMs))) target.averageProgressIntervalMs = 0
  if (!Number.isFinite(Number(target.lastProgressAt))) target.lastProgressAt = 0

  return target
}

function recordSpeedGuardProgress(profile, now = Date.now()) {
  const target = normalizeProfile(profile)
  const timestamp = Number(now)
  if (!Number.isFinite(timestamp)) return target

  if (target.lastProgressAt > 0 && timestamp > target.lastProgressAt) {
    const interval = timestamp - target.lastProgressAt
    target.averageProgressIntervalMs = target.averageProgressIntervalMs > 0
      ? (target.averageProgressIntervalMs * 0.75) + (interval * 0.25)
      : interval
  }

  target.lastProgressAt = timestamp
  return target
}

function getRobustPeakRate(samples) {
  const rates = samples
    .map(sample => Number(sample.ratePerMinute) || 0)
    .filter(rate => Number.isFinite(rate) && rate > 0)
    .sort((a, b) => a - b)

  if (rates.length === 0) return 0
  if (rates.length <= 3) return rates[rates.length - 1]

  const index = Math.floor((rates.length - 1) * 0.8)
  return rates[index]
}

function pruneRateSamples(profile, now, memoryMs) {
  const target = normalizeProfile(profile)
  const cutoff = Number(now) - Math.max(1000, Number(memoryMs) || 1000)
  target.rateSamples = target.rateSamples.filter(sample => (
    sample &&
    Number.isFinite(Number(sample.ratePerMinute)) &&
    Number.isFinite(Number(sample.at)) &&
    Number(sample.at) >= cutoff
  ))
  target.peakRatePerMinute = Math.max(target.peakRatePerMinute || 0, getRobustPeakRate(target.rateSamples))
  return target
}

function rememberSpeedGuardPeak(profile, ratePerMinute, now = Date.now(), memoryMs = 120000, options = {}) {
  const target = normalizeProfile(profile)
  const rate = Number(ratePerMinute)
  const timestamp = Number(now)
  const sampleMemoryMs = Math.max(1000, Number(memoryMs) || 1000)
  const stickyPeakMemoryMs = Math.max(
    sampleMemoryMs,
    Number(options.stickyPeakMemoryMs ?? options.stickyMemoryMs ?? (30 * 60 * 1000)) || (30 * 60 * 1000)
  )

  if (Number.isFinite(timestamp)) {
    pruneRateSamples(target, timestamp, sampleMemoryMs)
  }

  if (Number.isFinite(rate) && rate > 0) {
    target.rateSamples.push({ at: Number.isFinite(timestamp) ? timestamp : Date.now(), ratePerMinute: rate })
    pruneRateSamples(target, Number.isFinite(timestamp) ? timestamp : Date.now(), sampleMemoryMs)
  }

  const effectiveNow = Number.isFinite(timestamp) ? timestamp : Date.now()
  const robustRecentPeak = getRobustPeakRate(target.rateSamples)
  if (robustRecentPeak > target.stickyPeakRatePerMinute) {
    target.stickyPeakRatePerMinute = robustRecentPeak
    target.stickyPeakAt = effectiveNow
  }

  if (
    target.stickyPeakRatePerMinute > 0 &&
    target.stickyPeakAt > 0 &&
    effectiveNow - target.stickyPeakAt > stickyPeakMemoryMs &&
    robustRecentPeak > 0
  ) {
    target.stickyPeakRatePerMinute = robustRecentPeak
    target.stickyPeakAt = effectiveNow
  }

  target.peakRatePerMinute = Math.max(robustRecentPeak, target.stickyPeakRatePerMinute || 0)
  return target.peakRatePerMinute
}

function getSpeedGuardTargetRate(profile, targetRatio) {
  const target = normalizeProfile(profile)
  const ratio = Math.min(0.99, Math.max(0.1, Number(targetRatio) || 0.9))

  return target.peakRatePerMinute > 0
    ? target.peakRatePerMinute * ratio
    : 0
}

function getSpeedGuardTargetRatioFromDropPercent(dropPercent, fallbackRatio = 0.9) {
  const percent = Number(dropPercent)
  if (Number.isFinite(percent)) {
    const clampedPercent = Math.min(50, Math.max(1, percent))
    return 1 - (clampedPercent / 100)
  }

  const ratio = Number(fallbackRatio)
  return Math.min(0.99, Math.max(0.5, Number.isFinite(ratio) ? ratio : 0.9))
}

function getAdaptiveRateWindowMs(profile, baseWindowMs) {
  const target = normalizeProfile(profile)
  const base = Math.max(1000, Number(baseWindowMs) || 1000)

  return target.averageProgressIntervalMs > 0
    ? Math.max(base, Math.ceil(target.averageProgressIntervalMs * 3))
    : base
}

function getAdaptiveWaitMs(profile, baseWaitMs, intervalMultiplier = 3) {
  const target = normalizeProfile(profile)
  const base = Math.max(0, Number(baseWaitMs) || 0)
  const multiplier = Math.max(1, Number(intervalMultiplier) || 1)

  return target.averageProgressIntervalMs > 0
    ? Math.max(base, Math.ceil(target.averageProgressIntervalMs * multiplier))
    : base
}

function shouldEscalateSpeedDrop(options = {}) {
  const currentRate = Number(options.currentRate)
  const targetRate = Number(options.targetRate)
  if (!Number.isFinite(currentRate) || !Number.isFinite(targetRate) || targetRate <= 0 || currentRate >= targetRate) {
    return false
  }

  const recoveries = Math.max(0, Number(options.recoveries) || 0)
  const reconnectAfterRecoveries = Math.max(1, Number(options.reconnectAfterRecoveries) || 1)
  const sustainedLowMs = Math.max(0, Number(options.sustainedLowMs) || 0)
  const sustainedDropReconnectMs = Math.max(0, Number(options.sustainedDropReconnectMs) || 0)
  const idleFor = Number(options.idleFor)
  const noProgressReconnectMs = Math.max(0, Number(options.noProgressReconnectMs) || 0)
  const severeDropRatio = Math.min(0.99, Math.max(0.1, Number(options.severeDropRatio ?? 0.85) || 0.85))

  if (Number.isFinite(idleFor) && noProgressReconnectMs > 0 && idleFor >= noProgressReconnectMs) {
    return true
  }

  if (sustainedDropReconnectMs > 0 && sustainedLowMs >= sustainedDropReconnectMs) {
    return true
  }

  if (recoveries >= reconnectAfterRecoveries) {
    const currentRatio = currentRate / targetRate
    if (currentRatio <= severeDropRatio) return true
    if (sustainedDropReconnectMs <= 0) return true
    if (sustainedLowMs >= Math.ceil(sustainedDropReconnectMs / 2)) return true
  }

  return false
}

module.exports = {
  createSpeedGuardProfile,
  getAdaptiveRateWindowMs,
  getAdaptiveWaitMs,
  getRobustPeakRate,
  getSpeedGuardTargetRate,
  getSpeedGuardTargetRatioFromDropPercent,
  pruneRateSamples,
  recordSpeedGuardProgress,
  rememberSpeedGuardPeak,
  shouldEscalateSpeedDrop
}

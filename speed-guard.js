function createSpeedGuardProfile() {
  return {
    peakRatePerMinute: 0,
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

function pruneRateSamples(profile, now, memoryMs) {
  const target = normalizeProfile(profile)
  const cutoff = Number(now) - Math.max(1000, Number(memoryMs) || 1000)
  target.rateSamples = target.rateSamples.filter(sample => (
    sample &&
    Number.isFinite(Number(sample.ratePerMinute)) &&
    Number.isFinite(Number(sample.at)) &&
    Number(sample.at) >= cutoff
  ))
  target.peakRatePerMinute = target.rateSamples.reduce(
    (peak, sample) => Math.max(peak, Number(sample.ratePerMinute) || 0),
    0
  )
  return target
}

function rememberSpeedGuardPeak(profile, ratePerMinute, now = Date.now(), memoryMs = 120000) {
  const target = normalizeProfile(profile)
  const rate = Number(ratePerMinute)
  const timestamp = Number(now)

  if (Number.isFinite(timestamp)) {
    pruneRateSamples(target, timestamp, memoryMs)
  }

  if (Number.isFinite(rate) && rate > 0 && rate > target.peakRatePerMinute) {
    target.rateSamples.push({ at: Number.isFinite(timestamp) ? timestamp : Date.now(), ratePerMinute: rate })
    pruneRateSamples(target, Number.isFinite(timestamp) ? timestamp : Date.now(), memoryMs)
  }

  return target.peakRatePerMinute
}

function getSpeedGuardTargetRate(profile, targetRatio) {
  const target = normalizeProfile(profile)
  const ratio = Math.min(0.99, Math.max(0.1, Number(targetRatio) || 0.9))

  return target.peakRatePerMinute > 0
    ? target.peakRatePerMinute * ratio
    : 0
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

module.exports = {
  createSpeedGuardProfile,
  getAdaptiveRateWindowMs,
  getAdaptiveWaitMs,
  getSpeedGuardTargetRate,
  pruneRateSamples,
  recordSpeedGuardProgress,
  rememberSpeedGuardPeak
}

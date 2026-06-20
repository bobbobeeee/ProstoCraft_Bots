const DEFAULT_RECOVERY_MS = 5 * 60 * 1000

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function createPacketGovernor(options = {}) {
  return {
    enabled: options.enabled !== false,
    safeUntil: 0,
    lastIncidentAt: 0,
    lastRecoveryAt: 0,
    lastReason: '',
    incidentCount: 0,
    recoveryMs: Math.max(1000, Number(options.recoveryMs) || DEFAULT_RECOVERY_MS)
  }
}

function normalizeGovernor(governor, options = {}) {
  const target = governor && typeof governor === 'object' ? governor : createPacketGovernor(options)

  if (typeof target.enabled !== 'boolean') target.enabled = options.enabled !== false
  if (!Number.isFinite(Number(target.safeUntil))) target.safeUntil = 0
  if (!Number.isFinite(Number(target.lastIncidentAt))) target.lastIncidentAt = 0
  if (!Number.isFinite(Number(target.lastRecoveryAt))) target.lastRecoveryAt = 0
  if (!Number.isFinite(Number(target.incidentCount))) target.incidentCount = 0
  if (!Number.isFinite(Number(target.recoveryMs)))
    target.recoveryMs = Math.max(1000, Number(options.recoveryMs) || DEFAULT_RECOVERY_MS)
  if (typeof target.lastReason !== 'string') target.lastReason = String(target.lastReason || '')

  return target
}

function normalizeBaseLimits(baseLimits = {}) {
  const fastPerSecond = Math.max(1, Number(baseLimits.fastPerSecond ?? baseLimits.perSecond) || 1)
  const fastBurst = Math.max(1, Number(baseLimits.fastBurst ?? baseLimits.burst) || 1)
  const safePerSecond = Math.max(
    1,
    Number(baseLimits.safePerSecond ?? fastPerSecond) || fastPerSecond
  )
  const safeBurst = Math.max(1, Number(baseLimits.safeBurst ?? fastBurst) || fastBurst)

  return {
    fastPerSecond,
    fastBurst,
    safePerSecond: Math.min(fastPerSecond, safePerSecond),
    safeBurst: Math.min(fastBurst, safeBurst),
    burstWindowMs: Math.max(1, Number(baseLimits.burstWindowMs) || 1),
    targetCooldownMs: Math.max(0, Number(baseLimits.targetCooldownMs) || 0),
    pendingRetryMs: Math.max(0, Number(baseLimits.pendingRetryMs) || 0),
    safeRepeats: Math.max(1, Number(baseLimits.safeRepeats) || 1)
  }
}

function interpolateInteger(from, to, progress) {
  return Math.max(1, Math.round(from + (to - from) * clamp(progress, 0, 1)))
}

function getPacketGovernorSnapshot(governor, now = Date.now()) {
  const target = normalizeGovernor(governor)
  const timestamp = Number(now) || Date.now()
  const safeRemainingMs = Math.max(0, target.safeUntil - timestamp)
  const recoveryElapsedMs = Math.max(0, timestamp - target.safeUntil)
  const recovering =
    target.enabled &&
    safeRemainingMs <= 0 &&
    target.lastIncidentAt > 0 &&
    recoveryElapsedMs < target.recoveryMs

  return {
    enabled: target.enabled,
    mode: !target.enabled
      ? 'fixed'
      : safeRemainingMs > 0
        ? 'safe'
        : recovering
          ? 'recovering'
          : 'fast',
    safeRemainingMs,
    recoveryElapsedMs: recovering ? recoveryElapsedMs : 0,
    recoveryProgress: recovering ? clamp(recoveryElapsedMs / target.recoveryMs, 0, 1) : 1,
    lastIncidentAt: target.lastIncidentAt || 0,
    lastRecoveryAt: target.lastRecoveryAt || 0,
    lastReason: target.lastReason || '',
    incidentCount: Number(target.incidentCount) || 0
  }
}

function getPacketGovernorLimits(governor, baseLimits = {}, now = Date.now()) {
  const target = normalizeGovernor(governor)
  const limits = normalizeBaseLimits(baseLimits)
  const snapshot = getPacketGovernorSnapshot(target, now)

  if (!target.enabled || snapshot.mode === 'fast') {
    return {
      ...snapshot,
      perSecond: limits.fastPerSecond,
      burst: limits.fastBurst,
      burstWindowMs: limits.burstWindowMs,
      targetCooldownMs: limits.targetCooldownMs,
      pendingRetryMs: limits.pendingRetryMs,
      repeatsLimit: Infinity
    }
  }

  if (snapshot.mode === 'safe') {
    return {
      ...snapshot,
      perSecond: limits.safePerSecond,
      burst: limits.safeBurst,
      burstWindowMs: limits.burstWindowMs,
      targetCooldownMs: limits.targetCooldownMs,
      pendingRetryMs: limits.pendingRetryMs,
      repeatsLimit: limits.safeRepeats
    }
  }

  return {
    ...snapshot,
    perSecond: interpolateInteger(
      limits.safePerSecond,
      limits.fastPerSecond,
      snapshot.recoveryProgress
    ),
    burst: interpolateInteger(limits.safeBurst, limits.fastBurst, snapshot.recoveryProgress),
    burstWindowMs: limits.burstWindowMs,
    targetCooldownMs: limits.targetCooldownMs,
    pendingRetryMs: limits.pendingRetryMs,
    repeatsLimit: snapshot.recoveryProgress < 0.5 ? limits.safeRepeats : Infinity
  }
}

function recordPacketIncident(governor, reason = 'too many packets', options = {}) {
  const target = normalizeGovernor(governor, options)
  const now = Number(options.now) || Date.now()
  const safeModeMs = Math.max(1000, Number(options.safeModeMs) || 120000)

  target.lastIncidentAt = now
  target.lastReason = String(reason || 'packet incident')
  target.incidentCount = (Number(target.incidentCount) || 0) + 1
  target.safeUntil = Math.max(Number(target.safeUntil) || 0, now + safeModeMs)
  return target
}

function recordPacketRecovery(governor, options = {}) {
  const target = normalizeGovernor(governor, options)
  const now = Number(options.now) || Date.now()

  target.lastRecoveryAt = now
  if (options.clearIncident === true) {
    target.lastIncidentAt = 0
    target.lastReason = ''
    target.incidentCount = 0
    target.safeUntil = 0
  }
  return target
}

module.exports = {
  createPacketGovernor,
  getPacketGovernorLimits,
  getPacketGovernorSnapshot,
  recordPacketIncident,
  recordPacketRecovery
}

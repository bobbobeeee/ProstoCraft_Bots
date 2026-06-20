const DEFAULT_ADJUST_INTERVAL_MS = 12000

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function average(values) {
  const numbers = values
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value >= 0)
  if (!numbers.length) return 0
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function createWindow(now = Date.now()) {
  return {
    startedAt: Number(now) || Date.now(),
    sentBreakPackets: 0,
    sentBreakAttempts: 0,
    confirmedPacketBreaks: 0,
    fallbackDigCount: 0,
    stalePendingCleared: 0,
    confirmLatencies: []
  }
}

function normalizeOptions(options = {}) {
  return {
    enabled: options.enabled !== false,
    adjustIntervalMs: Math.max(
      1000,
      Number(options.adjustIntervalMs ?? DEFAULT_ADJUST_INTERVAL_MS) || DEFAULT_ADJUST_INTERVAL_MS
    ),
    minBudgetScale: clamp(options.minBudgetScale ?? 0.85, 0.1, 1),
    maxBudgetScale: clamp(options.maxBudgetScale ?? 1, 0.1, 1),
    increaseStep: clamp(options.increaseStep ?? 0.04, 0.01, 0.5),
    decreaseStep: clamp(options.decreaseStep ?? 0.1, 0.01, 0.6),
    goodConfirmationRatio: clamp(options.goodConfirmationRatio ?? 0.86, 0.1, 1),
    warnConfirmationRatio: clamp(options.warnConfirmationRatio ?? 0.72, 0.1, 1),
    badConfirmationRatio: clamp(options.badConfirmationRatio ?? 0.55, 0.1, 1),
    minSamples: Math.max(1, Number(options.minSamples ?? 20) || 20),
    stalePendingMs: Math.max(100, Number(options.stalePendingMs ?? 1500) || 1500),
    stalePendingWarn: Math.max(1, Number(options.stalePendingWarn ?? 16) || 16),
    pendingWarn: Math.max(1, Number(options.pendingWarn ?? 12) || 12),
    pendingHealthy: Math.max(0, Number(options.pendingHealthy ?? 2) || 2),
    latencyWarnMs: Math.max(100, Number(options.latencyWarnMs ?? 900) || 900),
    softRecoveryLimit: Math.max(1, Number(options.softRecoveryLimit ?? 3) || 3),
    softRecoveryCooldownMs: Math.max(0, Number(options.softRecoveryCooldownMs ?? 150) || 150)
  }
}

function createMiningController(options = {}) {
  const normalizedOptions = normalizeOptions(options)
  const now = Number(options.now) || Date.now()

  return {
    options: normalizedOptions,
    budgetScale: normalizedOptions.maxBudgetScale,
    sustainableRate: 0,
    lastAdjustAt: now,
    lastBottleneck: 'learning',
    lastBottleneckAt: 0,
    sentBreakPackets: 0,
    sentBreakAttempts: 0,
    confirmedPacketBreaks: 0,
    fallbackDigCount: 0,
    stalePendingCleared: 0,
    packetOnlySoftRecoveries: 0,
    lastPacketOnlySoftRecoveryAt: 0,
    pending: new Map(),
    window: createWindow(now)
  }
}

function normalizeController(controller, options = {}) {
  const target =
    controller && typeof controller === 'object' ? controller : createMiningController(options)
  target.options = normalizeOptions({ ...target.options, ...options })
  if (!Number.isFinite(Number(target.budgetScale)))
    target.budgetScale = target.options.maxBudgetScale
  if (!Number.isFinite(Number(target.sustainableRate))) target.sustainableRate = 0
  if (!Number.isFinite(Number(target.lastAdjustAt))) target.lastAdjustAt = 0
  if (!Number.isFinite(Number(target.lastBottleneckAt))) target.lastBottleneckAt = 0
  if (!Number.isFinite(Number(target.sentBreakPackets))) target.sentBreakPackets = 0
  if (!Number.isFinite(Number(target.sentBreakAttempts))) target.sentBreakAttempts = 0
  if (!Number.isFinite(Number(target.confirmedPacketBreaks))) target.confirmedPacketBreaks = 0
  if (!Number.isFinite(Number(target.fallbackDigCount))) target.fallbackDigCount = 0
  if (!Number.isFinite(Number(target.stalePendingCleared))) target.stalePendingCleared = 0
  if (!Number.isFinite(Number(target.packetOnlySoftRecoveries))) target.packetOnlySoftRecoveries = 0
  if (!Number.isFinite(Number(target.lastPacketOnlySoftRecoveryAt)))
    target.lastPacketOnlySoftRecoveryAt = 0
  if (!(target.pending instanceof Map)) target.pending = new Map()
  if (!target.window || typeof target.window !== 'object') target.window = createWindow()
  if (typeof target.lastBottleneck !== 'string') target.lastBottleneck = 'learning'
  return target
}

function setBottleneck(controller, bottleneck, now = Date.now()) {
  const target = normalizeController(controller)
  if (bottleneck && target.lastBottleneck !== bottleneck) {
    target.lastBottleneck = bottleneck
    target.lastBottleneckAt = Number(now) || Date.now()
  } else if (bottleneck) {
    target.lastBottleneck = bottleneck
  }
  return target
}

function recordBreakPacketsSent(controller, event = {}) {
  const target = normalizeController(controller)
  if (!target.options.enabled) return target
  const now = Number(event.now) || Date.now()
  const packetCount = Math.max(0, Number(event.packetCount) || 0)
  const attempts = Math.max(1, Number(event.attempts ?? event.sentPairs ?? 1) || 1)
  const positionKey = event.positionKey ? String(event.positionKey) : ''

  target.sentBreakPackets += packetCount
  target.sentBreakAttempts += attempts
  target.window.sentBreakPackets += packetCount
  target.window.sentBreakAttempts += attempts

  if (positionKey) {
    target.pending.set(positionKey, now)
  }

  return target
}

function recordBreakPacketConfirmed(controller, event = {}) {
  const target = normalizeController(controller)
  if (!target.options.enabled) return target
  const now = Number(event.now) || Date.now()
  const positionKey = event.positionKey ? String(event.positionKey) : ''
  const sentAt = positionKey ? target.pending.get(positionKey) : 0

  target.confirmedPacketBreaks += 1
  target.window.confirmedPacketBreaks += 1
  target.packetOnlySoftRecoveries = 0

  if (positionKey && sentAt) {
    target.pending.delete(positionKey)
    const latency = Math.max(0, now - sentAt)
    target.window.confirmLatencies.push(latency)
    if (latency > target.options.latencyWarnMs) {
      setBottleneck(target, 'mining-confirmation-latency', now)
    }
  }

  return target
}

function recordFallbackDig(controller, event = {}) {
  const target = normalizeController(controller)
  if (!target.options.enabled) return target
  const now = Number(event.now) || Date.now()
  target.fallbackDigCount += 1
  target.window.fallbackDigCount += 1
  setBottleneck(target, 'fallback-dig', now)
  return target
}

function pruneMiningControllerPending(controller, options = {}) {
  const target = normalizeController(controller)
  const now = Number(options.now) || Date.now()
  const stalePendingMs = Math.max(
    100,
    Number(options.stalePendingMs ?? target.options.stalePendingMs) || target.options.stalePendingMs
  )
  let stale = 0

  for (const [key, sentAt] of target.pending.entries()) {
    if (now - sentAt >= stalePendingMs) {
      target.pending.delete(key)
      stale += 1
    }
  }

  if (stale > 0) {
    target.stalePendingCleared += stale
    target.window.stalePendingCleared += stale
    setBottleneck(target, 'pending-packets', now)
  }

  return stale
}

function recordPacketOnlySoftRecovery(controller, event = {}) {
  const target = normalizeController(controller)
  const now = Number(event.now) || Date.now()
  target.packetOnlySoftRecoveries += 1
  target.lastPacketOnlySoftRecoveryAt = now
  setBottleneck(target, event.reason || 'packet-only-soft-recovery', now)
  return target
}

function resetMiningControllerRecovery(controller) {
  const target = normalizeController(controller)
  target.packetOnlySoftRecoveries = 0
  target.lastPacketOnlySoftRecoveryAt = 0
  return target
}

function getPacketOnlyRecoveryDecision(controller, options = {}) {
  const target = normalizeController(controller)
  const now = Number(options.now) || Date.now()
  const idleMs = Math.max(0, Number(options.idleMs) || 0)
  const fallbackMs = Math.max(1, Number(options.fallbackMs) || 1)

  if (idleMs < fallbackMs) {
    return { action: 'wait', reason: 'packet-confirmation-window' }
  }

  const cooldownReady =
    now - target.lastPacketOnlySoftRecoveryAt >= target.options.softRecoveryCooldownMs
  const canSoftRecover =
    target.packetOnlySoftRecoveries < target.options.softRecoveryLimit && cooldownReady

  if (canSoftRecover) {
    return {
      action: 'soft-recovery',
      reason: target.pending.size > 0 ? 'pending-packets' : 'packet-only-idle',
      attempts: target.packetOnlySoftRecoveries,
      pendingCount: target.pending.size
    }
  }

  return {
    action: 'fallback-dig',
    reason:
      target.packetOnlySoftRecoveries >= target.options.softRecoveryLimit
        ? 'soft-recovery-limit'
        : 'soft-recovery-cooldown',
    attempts: target.packetOnlySoftRecoveries,
    pendingCount: target.pending.size
  }
}

function getMiningControllerSnapshot(controller, now = Date.now()) {
  const target = normalizeController(controller)
  const timestamp = Number(now) || Date.now()
  const elapsedMs = Math.max(1, timestamp - (Number(target.window.startedAt) || timestamp))
  const attempts = Number(target.window.sentBreakAttempts) || 0
  const confirmed = Number(target.window.confirmedPacketBreaks) || 0
  const confirmationRatio = attempts > 0 ? confirmed / attempts : 1
  const confirmLatencyMs = average(target.window.confirmLatencies)
  const windowRate = confirmed / (elapsedMs / 60000)

  return {
    enabled: target.options.enabled,
    budgetScale: target.budgetScale,
    sustainableRate: target.sustainableRate || windowRate || 0,
    sentBreakPackets: target.sentBreakPackets,
    sentBreakAttempts: target.sentBreakAttempts,
    confirmedPacketBreaks: target.confirmedPacketBreaks,
    confirmationRatio,
    confirmLatencyMs,
    pendingCount: target.pending.size,
    fallbackDigCount: target.fallbackDigCount,
    stalePendingCleared: target.stalePendingCleared,
    packetOnlySoftRecoveries: target.packetOnlySoftRecoveries,
    lastMiningBottleneck: target.lastBottleneck || 'learning',
    lastBottleneckAt: target.lastBottleneckAt || 0,
    window: {
      elapsedMs,
      sentBreakPackets: target.window.sentBreakPackets,
      sentBreakAttempts: attempts,
      confirmedPacketBreaks: confirmed,
      fallbackDigCount: target.window.fallbackDigCount,
      stalePendingCleared: target.window.stalePendingCleared,
      ratePerMinute: windowRate
    }
  }
}

function evaluateMiningController(controller, options = {}) {
  const target = normalizeController(controller)
  const now = Number(options.now) || Date.now()
  const force = options.force === true
  const elapsedSinceAdjust = now - (Number(target.lastAdjustAt) || 0)

  if (!force && elapsedSinceAdjust < target.options.adjustIntervalMs) {
    return { changed: false, snapshot: getMiningControllerSnapshot(target, now) }
  }

  const snapshot = getMiningControllerSnapshot(target, now)
  const attempts = snapshot.window.sentBreakAttempts
  const ratio = snapshot.confirmationRatio
  const latency = snapshot.confirmLatencyMs
  const pendingCount = snapshot.pendingCount
  const stale = snapshot.window.stalePendingCleared
  const fallbackDigCount = snapshot.window.fallbackDigCount
  const previousScale = target.budgetScale
  let nextScale = previousScale
  let bottleneck = 'stable'
  const goodFlow = ratio >= target.options.goodConfirmationRatio && fallbackDigCount === 0
  const stalePressure =
    stale >= target.options.stalePendingWarn && ratio < target.options.warnConfirmationRatio
  const pendingPressure =
    pendingCount >= target.options.pendingWarn && ratio < target.options.goodConfirmationRatio

  if (attempts < target.options.minSamples) {
    bottleneck = 'learning'
  } else if (ratio < target.options.badConfirmationRatio || stalePressure) {
    bottleneck = stalePressure ? 'pending-packets' : 'mining-confirmation'
    nextScale -= target.options.decreaseStep
  } else if (
    pendingPressure ||
    (latency >= target.options.latencyWarnMs && ratio < target.options.goodConfirmationRatio)
  ) {
    bottleneck = pendingPressure ? 'pending-packets' : 'mining-confirmation-latency'
    nextScale -= target.options.decreaseStep / 2
  } else if (fallbackDigCount > 0 && ratio < target.options.warnConfirmationRatio) {
    bottleneck = 'fallback-dig'
    nextScale -= target.options.decreaseStep / 2
  } else if (goodFlow && pendingCount <= target.options.pendingWarn) {
    bottleneck = 'stable'
    nextScale += target.options.increaseStep
  } else if (ratio < target.options.warnConfirmationRatio) {
    bottleneck = 'mining-confirmation'
  }

  target.budgetScale = clamp(
    nextScale,
    target.options.minBudgetScale,
    target.options.maxBudgetScale
  )
  target.lastAdjustAt = now
  setBottleneck(target, bottleneck, now)

  if (snapshot.window.ratePerMinute > 0) {
    target.sustainableRate =
      target.sustainableRate > 0
        ? target.sustainableRate * 0.7 + snapshot.window.ratePerMinute * 0.3
        : snapshot.window.ratePerMinute
  }

  const decisionSnapshot = {
    ...snapshot,
    budgetScale: target.budgetScale,
    sustainableRate: target.sustainableRate || snapshot.sustainableRate,
    lastMiningBottleneck: bottleneck,
    window: { ...snapshot.window }
  }
  target.window = createWindow(now)

  return {
    changed:
      Math.abs(target.budgetScale - previousScale) >= 0.001 ||
      bottleneck !== snapshot.lastMiningBottleneck,
    previousScale,
    nextScale: target.budgetScale,
    bottleneck,
    decisionSnapshot,
    snapshot: getMiningControllerSnapshot(target, now)
  }
}

function recordMiningPacketIncident(controller, reason = 'too many packets', options = {}) {
  const target = normalizeController(controller)
  const now = Number(options.now) || Date.now()
  const step = Math.max(target.options.decreaseStep, Number(options.decreaseStep) || 0)
  target.budgetScale = clamp(
    target.budgetScale - step,
    target.options.minBudgetScale,
    target.options.maxBudgetScale
  )
  target.lastAdjustAt = now
  setBottleneck(target, reason || 'packet-budget', now)
  return target
}

function getMiningControllerLimits(controller, baseLimits = {}) {
  const target = normalizeController(controller)
  if (!target.options.enabled) return { ...baseLimits }
  const scale = clamp(
    target.budgetScale,
    target.options.minBudgetScale,
    target.options.maxBudgetScale
  )

  const scaleLimit = (value, min = 1) => Math.max(min, Math.round((Number(value) || min) * scale))
  return {
    ...baseLimits,
    fastPerSecond: scaleLimit(baseLimits.fastPerSecond ?? baseLimits.perSecond, 1),
    fastBurst: scaleLimit(baseLimits.fastBurst ?? baseLimits.burst, 1),
    safePerSecond: scaleLimit(
      baseLimits.safePerSecond ?? baseLimits.fastPerSecond ?? baseLimits.perSecond,
      1
    ),
    safeBurst: scaleLimit(baseLimits.safeBurst ?? baseLimits.fastBurst ?? baseLimits.burst, 1)
  }
}

module.exports = {
  createMiningController,
  evaluateMiningController,
  getMiningControllerLimits,
  getMiningControllerSnapshot,
  getPacketOnlyRecoveryDecision,
  pruneMiningControllerPending,
  recordBreakPacketConfirmed,
  recordBreakPacketsSent,
  recordFallbackDig,
  recordMiningPacketIncident,
  recordPacketOnlySoftRecovery,
  resetMiningControllerRecovery
}

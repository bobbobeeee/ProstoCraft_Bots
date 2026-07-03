function getPositionKey(position) {
  return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`
}

function createPacketBreakTracker(options = {}) {
  const state = {
    secondWindowStartedAt: 0,
    secondWindowCount: 0,
    burstWindowStartedAt: 0,
    burstWindowCount: 0,
    lastThrottleLogAt: 0,
    lastBreakPacketByTarget: new Map(),
    pendingPacketBreaks: new Map(),
    lastCountedBlockByTarget: new Map()
  }
  const getBreakPacketLimits = options.getBreakPacketLimits
  const onThrottle = options.onThrottle

  function resetBudgetWindows() {
    state.secondWindowStartedAt = 0
    state.secondWindowCount = 0
    state.burstWindowStartedAt = 0
    state.burstWindowCount = 0
  }

  function clear() {
    resetBudgetWindows()
    state.lastBreakPacketByTarget.clear()
    state.pendingPacketBreaks.clear()
    state.lastCountedBlockByTarget.clear()
  }

  function clearPending() {
    state.pendingPacketBreaks.clear()
  }

  function clearTargetCooldowns() {
    state.lastBreakPacketByTarget.clear()
  }

  function reserveBreakPacketBudget(packetCount = 2, now = Date.now()) {
    const limits = getBreakPacketLimits()

    if (!state.secondWindowStartedAt || now - state.secondWindowStartedAt >= 1000) {
      state.secondWindowStartedAt = now
      state.secondWindowCount = 0
    }
    if (!state.burstWindowStartedAt || now - state.burstWindowStartedAt >= limits.burstWindowMs) {
      state.burstWindowStartedAt = now
      state.burstWindowCount = 0
    }

    if (
      state.secondWindowCount + packetCount > limits.perSecond ||
      state.burstWindowCount + packetCount > limits.burst
    ) {
      if (now - state.lastThrottleLogAt > 5000) {
        state.lastThrottleLogAt = now
        if (typeof onThrottle === 'function') {
          onThrottle({
            requestedPackets: packetCount,
            secondWindowCount: state.secondWindowCount,
            burstWindowCount: state.burstWindowCount,
            limits
          })
        }
      }
      return false
    }

    state.secondWindowCount += packetCount
    state.burstWindowCount += packetCount
    return true
  }

  function canSendBreakPacketForTarget(position, cooldownMs, now = Date.now()) {
    const key = getPositionKey(position)
    const lastSentAt = state.lastBreakPacketByTarget.get(key) || 0
    return !lastSentAt || now - lastSentAt >= cooldownMs
  }

  function canRetryPendingBreak(position, retryMs, now = Date.now()) {
    const key = getPositionKey(position)
    const sentAt = state.pendingPacketBreaks.get(key) || 0
    return !sentAt || now - sentAt >= retryMs
  }

  function markBreakPacketTargetSent(position, now = Date.now()) {
    state.lastBreakPacketByTarget.set(getPositionKey(position), now)
  }

  function markPacketBreakAttempt(position, now = Date.now()) {
    state.pendingPacketBreaks.set(getPositionKey(position), now)
  }

  function deletePending(position) {
    state.pendingPacketBreaks.delete(getPositionKey(position))
  }

  function deletePendingKey(key) {
    state.pendingPacketBreaks.delete(key)
  }

  function hasRecentPacketBreak(position, now = Date.now(), confirmWindowMs = 1500) {
    const sentAt = state.pendingPacketBreaks.get(getPositionKey(position)) || 0
    return Boolean(sentAt && now - sentAt <= confirmWindowMs)
  }

  function shouldCountBlock(key, now = Date.now(), dedupeMs = 75) {
    const lastCountedAt = state.lastCountedBlockByTarget.get(key) || 0
    if (lastCountedAt && now - lastCountedAt < dedupeMs) return false
    state.lastCountedBlockByTarget.set(key, now)
    return true
  }

  function prune(now = Date.now(), options = {}) {
    const packetTtl = Math.max(
      100,
      Number(options.packetTtl ?? options.packetBreakConfirmWindowMs * 2) ||
        Math.max(100, Number(options.packetBreakConfirmWindowMs) || 1500) * 2
    )
    const countTtl = Math.max(1000, Number(options.countTtl ?? 10000) || 10000)
    let stalePackets = 0

    for (const [key, sentAt] of state.pendingPacketBreaks) {
      if (now - sentAt > packetTtl) {
        state.pendingPacketBreaks.delete(key)
        stalePackets += 1
      }
    }

    for (const [key, countedAt] of state.lastCountedBlockByTarget) {
      if (now - countedAt > countTtl) state.lastCountedBlockByTarget.delete(key)
    }

    return {
      stalePackets,
      packetTtl,
      pendingBreaks: state.pendingPacketBreaks.size
    }
  }

  return {
    canRetryPendingBreak,
    canSendBreakPacketForTarget,
    clear,
    clearPending,
    clearTargetCooldowns,
    deletePending,
    deletePendingKey,
    getPositionKey,
    getState: () => state,
    hasRecentPacketBreak,
    markBreakPacketTargetSent,
    markPacketBreakAttempt,
    prune,
    reserveBreakPacketBudget,
    resetBudgetWindows,
    shouldCountBlock
  }
}

module.exports = {
  createPacketBreakTracker,
  getPositionKey
}

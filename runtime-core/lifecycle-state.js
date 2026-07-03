const LIFECYCLE_STATES = new Set([
  'connecting',
  'botfilter',
  'joining',
  'mining',
  'recovering',
  'waiting-reconnect',
  'held'
])

function normalizeLifecycleState(state) {
  const normalized = String(state || '').trim()
  return LIFECYCLE_STATES.has(normalized) ? normalized : 'connecting'
}

function createLifecycleState(initialState = 'connecting', now = Date.now()) {
  const state = normalizeLifecycleState(initialState)
  return {
    state,
    previousState: '',
    changedAt: Number(now) || Date.now(),
    source: 'init',
    details: {}
  }
}

function transitionLifecycle(
  lifecycle,
  nextState,
  source = 'runtime',
  details = {},
  now = Date.now()
) {
  const target =
    lifecycle && typeof lifecycle === 'object' ? lifecycle : createLifecycleState('connecting', now)
  const normalized = normalizeLifecycleState(nextState)
  const timestamp = Number(now) || Date.now()

  if (target.state === normalized) {
    target.source = source || target.source || 'runtime'
    target.details = details && typeof details === 'object' ? { ...details } : {}
    return { lifecycle: target, changed: false }
  }

  target.previousState = target.state || ''
  target.state = normalized
  target.changedAt = timestamp
  target.source = source || 'runtime'
  target.details = details && typeof details === 'object' ? { ...details } : {}
  return { lifecycle: target, changed: true }
}

function getLifecycleSnapshot(lifecycle, now = Date.now()) {
  const target =
    lifecycle && typeof lifecycle === 'object' ? lifecycle : createLifecycleState('connecting', now)
  const timestamp = Number(now) || Date.now()

  return {
    state: normalizeLifecycleState(target.state),
    previousState: target.previousState || '',
    source: target.source || '',
    changedAt: target.changedAt || timestamp,
    ageMs: Math.max(0, timestamp - (Number(target.changedAt) || timestamp)),
    details: target.details && typeof target.details === 'object' ? { ...target.details } : {}
  }
}

module.exports = {
  LIFECYCLE_STATES,
  createLifecycleState,
  getLifecycleSnapshot,
  normalizeLifecycleState,
  transitionLifecycle
}

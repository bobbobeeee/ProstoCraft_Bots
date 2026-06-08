const HEALTH_REASONS = new Set([
  'mining-ok',
  'network-reset',
  'dns-failure',
  'connect-timeout',
  'server-world-reset',
  'runtime-stale',
  'speed-drop',
  'mining-confirmation',
  'packet-budget',
  'fallback-dig',
  'joining',
  'botfilter-hold',
  'chat-captcha-hold'
])

const HEALTH_DEFINITIONS = {
  'mining-ok': {
    state: 'healthy',
    severity: 'ok',
    diagnosis: 'Скорость нормальная, копание активно.'
  },
  'network-reset': {
    state: 'recovering',
    severity: 'warning',
    diagnosis: 'Причина просадки: сеть сбросила соединение, бот переподключается.'
  },
  'dns-failure': {
    state: 'recovering',
    severity: 'error',
    diagnosis: 'Причина просадки: DNS не смог найти сервер, проверь сеть/роутер.'
  },
  'connect-timeout': {
    state: 'recovering',
    severity: 'warning',
    diagnosis: 'Причина просадки: таймаут подключения к серверу.'
  },
  'server-world-reset': {
    state: 'recovering',
    severity: 'warning',
    diagnosis: 'Причина просадки: сервер сбросил мир, бот делает быстрый перезаход.'
  },
  'runtime-stale': {
    state: 'recovering',
    severity: 'error',
    diagnosis: 'Причина просадки: runtime перестал отдавать события, нужен перезапуск.'
  },
  'speed-drop': {
    state: 'degraded',
    severity: 'warning',
    diagnosis: 'Причина просадки: скорость добычи ниже адаптивной нормы.'
  },
  'mining-confirmation': {
    state: 'degraded',
    severity: 'warning',
    diagnosis: 'Причина просадки: сервер хуже подтверждает packet-break.'
  },
  'packet-budget': {
    state: 'recovering',
    severity: 'warning',
    diagnosis: 'Packet budget адаптируется к устойчивому лимиту сервера.'
  },
  'fallback-dig': {
    state: 'degraded',
    severity: 'warning',
    diagnosis: 'Packet-only копание ушло в аварийный dig fallback.'
  },
  'joining': {
    state: 'recovering',
    severity: 'ok',
    diagnosis: 'LimboFilter пройден, бот входит на подсервер.'
  },
  'botfilter-hold': {
    state: 'blocked',
    severity: 'warning',
    diagnosis: 'Бот ожидает повтор после BotFilter/LimboFilter.'
  },
  'chat-captcha-hold': {
    state: 'blocked',
    severity: 'error',
    diagnosis: 'Бот на паузе из-за чат-капчи.'
  }
}

function normalizeHealthReason(reason) {
  const normalized = String(reason || '').trim()
  return HEALTH_REASONS.has(normalized) ? normalized : 'mining-ok'
}

function createHealthState(now = Date.now()) {
  const definition = HEALTH_DEFINITIONS['mining-ok']
  return {
    state: definition.state,
    reason: 'mining-ok',
    severity: definition.severity,
    since: new Date(now).toISOString(),
    sinceMs: now,
    downtimeMs: 0,
    diagnosis: definition.diagnosis,
    lastNetworkError: '',
    lastReconnectReason: '',
    lastRecoveryAction: ''
  }
}

function classifyHealthEvent(event = {}) {
  const message = String(event.message || event.reason || event.error?.message || event.error || '')
  const code = String(event.code || event.error?.code || '')
  const text = `${message} ${code}`.toLowerCase()

  if (text.includes('введите капчу') || text.includes('chat-captcha')) return 'chat-captcha-hold'
  if (text.includes('limbofilter') || text.includes('botfilter') || text.includes('fall-провер')) return 'botfilter-hold'
  if (text.includes('mining-confirmation') || text.includes('confirmation')) return 'mining-confirmation'
  if (text.includes('packet-budget') || text.includes('packet budget')) return 'packet-budget'
  if (text.includes('fallback-dig') || text.includes('fallback dig')) return 'fallback-dig'
  if (text.includes('speed-guard') || text.includes('speed guard') || text.includes('просадка')) return 'speed-drop'
  if (text.includes('runtime-stale') || text.includes('runtime-silent') || text.includes('runtime watchdog')) return 'runtime-stale'
  if (text.includes('сбросил мир') || text.includes('server closed') || text.includes('world reset')) return 'server-world-reset'
  if (text.includes('enotfound') || text.includes('eai_again')) return 'dns-failure'
  if (text.includes('etimedout') || text.includes('connect timeout') || text.includes('connect timed out') || text.includes('keepalive-timeout') || text.includes('keep-alive таймаут')) return 'connect-timeout'
  if (text.includes('econnreset') || text.includes('econnaborted') || text.includes('socket hang up')) return 'network-reset'

  return event.reason && HEALTH_REASONS.has(event.reason) ? event.reason : 'mining-ok'
}

function updateHealthState(current, event = {}, now = Date.now()) {
  const previous = current && typeof current === 'object' ? current : createHealthState(now)
  const hasEventSignal = Boolean(
    event.reason ||
    event.message ||
    event.error ||
    event.code ||
    event.diagnosis ||
    event.lastNetworkError ||
    event.lastReconnectReason ||
    event.reconnectReason ||
    event.lastRecoveryAction
  )
  const reason = normalizeHealthReason(hasEventSignal ? (event.reason || classifyHealthEvent(event)) : previous.reason)
  const definition = HEALTH_DEFINITIONS[reason] || HEALTH_DEFINITIONS['mining-ok']
  const sameReason = previous.reason === reason
  const sinceMs = sameReason ? Number(previous.sinceMs || now) : now

  return {
    ...previous,
    state: definition.state,
    reason,
    severity: definition.severity,
    since: sameReason && previous.since ? previous.since : new Date(now).toISOString(),
    sinceMs,
    downtimeMs: reason === 'mining-ok' ? 0 : Math.max(0, now - sinceMs),
    diagnosis: event.diagnosis || definition.diagnosis,
    lastNetworkError: event.lastNetworkError || (
      ['network-reset', 'dns-failure', 'connect-timeout'].includes(reason)
        ? String(event.message || event.error?.message || event.error || reason)
        : previous.lastNetworkError || ''
    ),
    lastReconnectReason: event.lastReconnectReason || event.reconnectReason || previous.lastReconnectReason || '',
    lastRecoveryAction: event.lastRecoveryAction || previous.lastRecoveryAction || ''
  }
}

function computeSmartRateStats(options = {}) {
  const now = Number(options.now) || Date.now()
  const blockTimes = Array.isArray(options.blockTimes) ? options.blockTimes : []
  const rawWindowMs = Math.max(1000, Number(options.rawWindowMs) || 60000)
  const speedWindowMs = Math.max(1000, Number(options.speedWindowMs) || 10000)
  const maxHistoryMs = Math.max(rawWindowMs, speedWindowMs, 60000)
  const status = String(options.status || '')
  const activeSince = Number(options.activeSince) || 0
  const active = status === 'копает' && activeSince > 0 && now >= activeSince
  const filteredTimes = []
  let rawBlocksLastMinute = 0
  let rawRecentBlocks = 0

  for (const timestamp of blockTimes) {
    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) continue
    const age = now - ts
    if (age >= maxHistoryMs) continue

    filteredTimes.push(ts)
    if (age < 60000) rawBlocksLastMinute += 1
    if (age < speedWindowMs) rawRecentBlocks += 1
  }

  const effectiveWindowMs = active
    ? Math.min(rawWindowMs, Math.max(1000, now - activeSince))
    : 0
  const effectiveCutoff = active ? Math.max(activeSince, now - effectiveWindowMs) : now
  const effectiveBlocks = active
    ? filteredTimes.filter(ts => ts >= effectiveCutoff).length
    : 0
  const effectiveRatePerMinute = active && effectiveWindowMs > 0
    ? effectiveBlocks / (effectiveWindowMs / 60000)
    : 0

  return {
    blockTimes: filteredTimes,
    rawBlocksLastMinute,
    rawBlocksPerSecond: rawRecentBlocks / (speedWindowMs / 1000),
    rawRatePerMinute: rawBlocksLastMinute,
    effectiveBlocks,
    effectiveWindowMs,
    effectiveRatePerMinute,
    effectiveBlocksPerSecond: effectiveRatePerMinute / 60,
    recovering: !active && rawBlocksLastMinute === 0
  }
}

function getRuntimeRecoveryDecision(options = {}) {
  const now = Number(options.now) || Date.now()
  const lastEventAt = Number(options.lastEventAt) || 0
  const staleAfterMs = Math.max(1000, Number(options.staleAfterMs) || 600000)
  const running = options.running === true
  const desired = options.desired !== false

  if (!running || !desired || !lastEventAt) {
    return { action: 'none', reason: 'not-running' }
  }

  const staleForMs = now - lastEventAt
  if (staleForMs >= staleAfterMs) {
    return {
      action: 'restart-runtime',
      reason: 'runtime-stale',
      staleForMs,
      severity: 'error'
    }
  }

  return { action: 'none', reason: 'fresh', staleForMs }
}

module.exports = {
  HEALTH_DEFINITIONS,
  classifyHealthEvent,
  computeSmartRateStats,
  createHealthState,
  getRuntimeRecoveryDecision,
  normalizeHealthReason,
  updateHealthState
}

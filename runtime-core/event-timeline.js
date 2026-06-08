function sanitizeTimelineMessage(message) {
  return String(message || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/gho_[A-Za-z0-9_]+/g, '[token]')
    .replace(/C:\\Users\\[^\\\s]+/gi, 'C:\\Users\\[user]')
    .replace(/\/home\/[^/\s]+/gi, '/home/[user]')
    .trim()
}

function createEventTimeline(limit = 80) {
  return {
    limit: Math.max(10, Number(limit) || 80),
    events: []
  }
}

function normalizeSeverity(severity) {
  const value = String(severity || '').trim().toLowerCase()
  if (['error', 'warning', 'info', 'success', 'ok'].includes(value)) return value
  return 'info'
}

function getEventKey(event) {
  return [
    event.type || '',
    event.reason || '',
    event.source || '',
    event.message || ''
  ].join('|')
}

function addTimelineEvent(timeline, event = {}, now = Date.now()) {
  const target = timeline && typeof timeline === 'object'
    ? timeline
    : createEventTimeline()
  if (!Array.isArray(target.events)) target.events = []
  target.limit = Math.max(10, Number(target.limit) || 80)

  const timestampMs = Number(event.timestampMs || event.at || now) || Date.now()
  const normalizedEvent = {
    id: event.id || `${timestampMs}-${target.events.length + 1}`,
    timestamp: event.timestamp || new Date(timestampMs).toISOString(),
    timestampMs,
    type: String(event.type || 'event'),
    severity: normalizeSeverity(event.severity),
    reason: String(event.reason || ''),
    source: String(event.source || ''),
    botName: String(event.botName || ''),
    message: sanitizeTimelineMessage(event.message || event.reason || event.type || ''),
    repeatCount: 1
  }

  const previous = target.events[target.events.length - 1]
  if (
    previous &&
    getEventKey(previous) === getEventKey(normalizedEvent) &&
    timestampMs - (Number(previous.timestampMs) || 0) <= Math.max(1000, Number(event.dedupeMs) || 30000)
  ) {
    previous.repeatCount = (Number(previous.repeatCount) || 1) + 1
    previous.timestamp = normalizedEvent.timestamp
    previous.timestampMs = timestampMs
    return target
  }

  target.events.push(normalizedEvent)
  if (target.events.length > target.limit) {
    target.events = target.events.slice(-target.limit)
  }
  return target
}

function getTimelineSnapshot(timeline, options = {}) {
  const target = timeline && typeof timeline === 'object'
    ? timeline
    : createEventTimeline()
  const limit = Math.max(1, Number(options.limit) || 12)
  const importantOnly = options.importantOnly !== false
  const events = Array.isArray(target.events) ? target.events : []
  const filtered = importantOnly
    ? events.filter(event => event.severity === 'warning' || event.severity === 'error' || event.type === 'recovery')
    : events

  return filtered.slice(-limit).reverse().map(event => ({ ...event }))
}

module.exports = {
  addTimelineEvent,
  createEventTimeline,
  getTimelineSnapshot,
  sanitizeTimelineMessage
}

const CHAT_CAPTCHA_PATTERNS = [
  /введите\s+капч[ау]\s+в\s+чат/i,
  /solve\s+the\s+captcha/i,
  /enter\s+captcha/i
]

const FALL_WAIT_PATTERNS = [
  /дождитесь\s+окончания\s+проверки\s+и\s+не\s+двигайтесь/i,
  /please\s+wait\s+and\s+don'?t\s+move/i,
  /bot-filter\s+check\s+was\s+started/i
]

function normalizeEvidenceText(text) {
  return String(text || '')
    .replace(/\u00a7[0-9A-FK-OR]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyCaptchaEvidence(text) {
  const normalized = normalizeEvidenceText(text)
  if (!normalized) return 'none'
  if (CHAT_CAPTCHA_PATTERNS.some(pattern => pattern.test(normalized))) return 'chat-captcha'
  if (FALL_WAIT_PATTERNS.some(pattern => pattern.test(normalized))) return 'fall-wait'
  return 'none'
}

function createCaptchaEvidence(options = {}) {
  const timestampMs = Number(options.timestampMs || options.now) || Date.now()
  const text = normalizeEvidenceText(options.text || options.rawText || '')
  const kind =
    options.kind && options.kind !== 'none' ? String(options.kind) : classifyCaptchaEvidence(text)
  const position = String(options.position || '')
    .trim()
    .toLowerCase()
  const source = String(options.source || '').trim()
  const visibleChat =
    options.visibleChat === true || ['chat', 'system', 'unknown'].includes(position)

  return {
    kind,
    text,
    source,
    position,
    visibleChat,
    sender: options.sender ? String(options.sender) : '',
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    packetName: options.packetName || 'message',
    packetSeen: options.packetSeen === true || Boolean(source),
    valid: false,
    reason: ''
  }
}

function validateCaptchaEvidence(evidence, requiredKind = '') {
  const target =
    evidence && typeof evidence === 'object' ? { ...evidence } : createCaptchaEvidence()
  const expectedKind = requiredKind ? String(requiredKind) : target.kind

  if (!target.text) {
    target.valid = false
    target.reason = 'empty-text'
    return target
  }

  if (!target.packetSeen || !target.source) {
    target.valid = false
    target.reason = 'missing-source-packet'
    return target
  }

  if (expectedKind && expectedKind !== 'none' && target.kind !== expectedKind) {
    target.valid = false
    target.reason = 'kind-mismatch'
    return target
  }

  if (target.kind === 'chat-captcha' && target.visibleChat !== true) {
    target.valid = false
    target.reason = 'not-visible-chat'
    return target
  }

  target.valid = target.kind !== 'none'
  target.reason = target.valid ? 'ok' : 'not-captcha'
  return target
}

module.exports = {
  classifyCaptchaEvidence,
  createCaptchaEvidence,
  normalizeEvidenceText,
  validateCaptchaEvidence
}

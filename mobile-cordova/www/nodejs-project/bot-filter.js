const BOT_FILTER_RETRY_RESET_MS = 10 * 60 * 1000

function normalizeBotFilterText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isChatCaptchaText(text) {
  const normalized = normalizeBotFilterText(text)
  const hasCaptcha = normalized.includes('капч') || normalized.includes('captcha')
  const asksInChat =
    (normalized.includes('введите') && normalized.includes('чат')) ||
    (normalized.includes('enter') &&
      (normalized.includes('chat') || normalized.includes('captcha'))) ||
    normalized.includes('please solve') ||
    normalized.includes('решите') ||
    normalized.includes('solve')
  const hasAttempts = normalized.includes('попыт') || normalized.includes('attempt')

  return Boolean(hasCaptcha && (asksInChat || hasAttempts))
}

function isScannerWaitText(text) {
  const normalized = normalizeBotFilterText(text)
  if (isChatCaptchaText(normalized)) return false

  const hasScanner =
    normalized.includes('сканер') ||
    normalized.includes('scanner') ||
    normalized.includes('antibot') ||
    normalized.includes('botfilter') ||
    normalized.includes('bot-filter') ||
    normalized.includes('bot filter')
  const waitForCheck =
    normalized.includes('дождитесь окончания проверки') ||
    (normalized.includes('дождитесь') && normalized.includes('провер')) ||
    normalized.includes('please wait')
  const noMove =
    normalized.includes('не двигайтесь') ||
    normalized.includes("don't move") ||
    normalized.includes('do not move')

  return Boolean(hasScanner && waitForCheck && noMove)
}

function classifyBotFilterMessage(text) {
  if (isChatCaptchaText(text)) return 'chat-captcha'
  if (isScannerWaitText(text)) return 'fall-wait'
  return 'none'
}

function isFallCheckFailureReason(reason) {
  const normalized = normalizeBotFilterText(reason).replace(/_/g, '-')

  return Boolean(
    normalized.includes('limbo') ||
    normalized.includes('fall') ||
    normalized.includes('bot-filter') ||
    normalized.includes('falling-check') ||
    normalized.includes('times-up') ||
    normalized.includes('antibot-check-time-exceeded') ||
    normalized.includes('position-timeout') ||
    normalized.includes('position-missing') ||
    normalized.includes('socket-closed')
  )
}

function calculateBotFilterReconnectDelay(options = {}) {
  const now = Number(options.now ?? Date.now())
  const previousFailureAt = Number(options.lastFailureAt) || 0
  const retryResetMs = Math.max(
    1,
    Number(options.retryResetMs ?? BOT_FILTER_RETRY_RESET_MS) || BOT_FILTER_RETRY_RESET_MS
  )
  const retryBaseMs = Math.max(1, Number(options.retryBaseMs ?? 8000) || 8000)
  const retryMaxMs = Math.max(retryBaseMs, Number(options.retryMaxMs ?? 120000) || 120000)
  const fallAttemptsBeforeHold = Math.max(1, Number(options.fallAttemptsBeforeHold ?? 2) || 2)
  const fallHoldMs = Math.max(
    retryMaxMs,
    Number(options.fallHoldMs ?? 30 * 60 * 1000) || 30 * 60 * 1000
  )
  const random = typeof options.random === 'function' ? options.random : Math.random
  let retryCount = Number(options.retryCount) || 0

  if (now - previousFailureAt > retryResetMs) {
    retryCount = 0
  }

  retryCount += 1

  const reason = String(options.reason || 'bot-filter')
  const fallCheckFailure = isFallCheckFailureReason(reason)

  if (fallCheckFailure && retryCount >= fallAttemptsBeforeHold) {
    const jitter = Math.floor(random() * 30000)
    return {
      delay: fallHoldMs + jitter,
      retryCount,
      lastFailureAt: now,
      fallCheckFailure,
      fallHoldActive: true,
      jitter
    }
  }

  const exponentialDelay = retryBaseMs * Math.pow(2, Math.max(0, retryCount - 1))
  const cappedDelay = Math.min(retryMaxMs, exponentialDelay)
  const jitter = Math.floor(random() * Math.min(10000, Math.max(1000, cappedDelay / 4)))

  return {
    delay: Math.round(cappedDelay + jitter),
    retryCount,
    lastFailureAt: now,
    fallCheckFailure,
    fallHoldActive: false,
    jitter
  }
}

module.exports = {
  BOT_FILTER_RETRY_RESET_MS,
  calculateBotFilterReconnectDelay,
  classifyBotFilterMessage,
  isChatCaptchaText,
  isFallCheckFailureReason,
  isScannerWaitText,
  normalizeBotFilterText
}

function normalizeReconnectText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isTooManyPacketsText(text) {
  const normalized = normalizeReconnectText(text)

  return Boolean(
    normalized &&
    (
      normalized.includes('too many packets') ||
      normalized.includes('sending too many') ||
      normalized.includes('слишком много пакетов') ||
      normalized.includes('много пакетов')
    )
  )
}

function randomDelay(baseMs, jitterMs, random = Math.random) {
  return baseMs + Math.floor(random() * Math.max(0, jitterMs))
}

function scheduleDecision(delay, scheduleReason, options = {}) {
  return {
    action: 'schedule',
    delay,
    forced: options.forced !== false,
    scheduleReason,
    logs: options.logs || [],
    packetSafetySource: options.packetSafetySource || null,
    stabilityCooldownReason: options.stabilityCooldownReason || null,
    stabilityCooldownMs: options.stabilityCooldownMs,
    noteNoInternet: options.noteNoInternet === true,
    nextWaitKickCount: options.nextWaitKickCount
  }
}

function botFilterDecision(scheduleReason, botFilterReason, botFilterLogReason, options = {}) {
  return {
    action: 'bot-filter',
    forced: true,
    scheduleReason,
    botFilterReason,
    botFilterLogReason,
    logs: options.logs || []
  }
}

function isTimeoutText(text) {
  return text.includes('время ожидания истекло') ||
    text.includes('превысили максимальное время проверки') ||
    text.includes('maximum bot-filter check time') ||
    text.includes('exceeded the maximum') ||
    text.includes('timed out') ||
    text.includes('timeout')
}

function isLoggingTooFastText(text) {
  return text.includes('you are logging in too fast') ||
    text.includes('logging too')
}

function isConnectionIssueCode(code) {
  return code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EHOSTUNREACH'
}

function getReconnectDecision(event = {}, options = {}) {
  const random = typeof options.random === 'function' ? options.random : Math.random
  const type = event.type
  const rawMessage = event.message || event.reason || event.error?.message || event.error || ''
  const text = normalizeReconnectText(rawMessage)
  const err = event.error || {}

  if (type === 'too-many-packets-notice') {
    const source = event.source || 'server-message'
    return scheduleDecision(
      randomDelay(12000, 6000, random),
      `too-many-packets-${source}`,
      { packetSafetySource: source }
    )
  }

  if (type === 'kick') {
    if (event.wasInBotFilterCheck && (
      text.includes('falling check was failed') ||
      text.includes('falling check failed') ||
      text.includes('fall-провер') ||
      text.includes('проверка пад')
    )) {
      return botFilterDecision(
        'kick-limbo-falling-check-failed',
        'kick-limbo-falling-check-failed',
        'LimboFilter fall-проверка провалена',
        { logs: [{ level: 'error', message: 'ERR LimboFilter fall-проверка провалена' }] }
      )
    }

    if (event.wasInBotFilterCheck && isTimeoutText(text)) {
      return botFilterDecision('kick-limbo-timeout', 'kick-limbo-timeout', 'LimboFilter таймаут')
    }

    if (isTooManyPacketsText(text)) {
      return scheduleDecision(
        randomDelay(15000, 15000, random),
        'kick-too-many-packets',
        { packetSafetySource: 'kick-too-many-packets' }
      )
    }

    if (text.includes('internal error') || text.includes('connection')) {
      return scheduleDecision(
        randomDelay(30000, 30000, random),
        'kick-internal-connection',
        {
          stabilityCooldownReason: 'кик/internal connection error',
          stabilityCooldownMs: options.connectionStabilityCooldownMs
        }
      )
    }

    if (text.includes('подождите') || text.includes('wait') || text.includes('перед повторным')) {
      const nextWaitKickCount = (Number(options.waitKickCount) || 0) + 1
      const baseDelay = Math.min(600000 + (nextWaitKickCount - 1) * 300000, 1800000)
      const delay = baseDelay + Math.floor(random() * 60000)
      return scheduleDecision(delay, 'kick-wait-before-retry', {
        nextWaitKickCount,
        logs: [{
          level: 'warning',
          message: `! Подождите (попытка ${nextWaitKickCount}) - ждём ${Math.round(delay / 60000)} мин`
        }]
      })
    }

    if (text.includes('antibot') || text.includes('антибот')) {
      if (text.includes('превысили') || text.includes('превышение') || text.includes('превыс')) {
        if (event.wasInBotFilterCheck) {
          return botFilterDecision(
            'kick-antibot',
            'kick-antibot-check-time-exceeded',
            'LimboFilter НЕ ПРОЙДЕН',
            { logs: [{ level: 'error', message: 'ERR LimboFilter НЕ ПРОЙДЕН' }] }
          )
        }

        return scheduleDecision(randomDelay(15000, 15000, random), 'kick-antibot', {
          logs: [{ level: 'error', message: 'ERR LimboFilter НЕ ПРОЙДЕН' }]
        })
      }

      return scheduleDecision(randomDelay(8000, 12000, random), 'kick-antibot')
    }

    if (isLoggingTooFastText(text)) {
      return scheduleDecision(randomDelay(60000, 60000, random), 'kick-logging-too-fast', {
        logs: [{ level: 'warning', message: '! Слишком быстрый вход - ждём 1-2 минуты' }]
      })
    }

    if (text.includes('already connected')) {
      const delay = randomDelay(45000, 45000, random)
      return scheduleDecision(delay, 'kick-already-connected', {
        logs: [{ level: 'warning', message: `Already connected - ждём ${Math.round(delay / 1000)}с` }]
      })
    }

    return scheduleDecision(randomDelay(10000, 10000, random), 'kick-generic')
  }

  if (type === 'end') {
    if (event.wasInBotFilterCheck) {
      return botFilterDecision('end-limbo-socket-closed', 'end-limbo-socket-closed', 'LimboFilter закрыл socket')
    }

    return scheduleDecision(randomDelay(8000, 12000, random), 'bot-end', { forced: false })
  }

  if (type === 'error') {
    const code = String(err.code || '')

    if (event.hasReconnectPending) {
      if (text.includes('econnreset') || text.includes('econnaborted') || code.includes('ECONNRESET') || code.includes('ECONNABORTED')) {
        return {
          action: 'stability-only',
          stabilityCooldownReason: 'сетевой сброс во время reconnect',
          stabilityCooldownMs: options.connectionStabilityCooldownMs
        }
      }
      return { action: 'ignore' }
    }

    if (
      text.includes('ignoring block entities') ||
      text.includes('chunk failed to load') ||
      text.includes('entity.objecttype') ||
      text.includes('deprecated')
    ) {
      return { action: 'ignore' }
    }

    if (event.wasInBotFilterCheck && (
      text.includes('econnreset') ||
      text.includes('econnaborted') ||
      code.includes('ECONNRESET') ||
      code.includes('ECONNABORTED')
    )) {
      return botFilterDecision('error-limbo-reset', 'error-limbo-reset', 'LimboFilter оборвал соединение')
    }

    if (text.includes('connect etimedout') || err.syscall === 'connect') {
      return scheduleDecision(randomDelay(15000, 15000, random), 'error-connect-timeout')
    }

    if (text.includes('client timed out after')) {
      return scheduleDecision(
        randomDelay(
          Math.max(3000, Number(options.clientTimeoutReconnectMs) || 6000),
          Math.max(0, Number(options.clientTimeoutReconnectJitterMs) || 4000),
          random
        ),
        'error-client-timeout',
        { logs: [{ level: 'warning', message: '! Клиент таймаут' }] }
      )
    }

    if (isLoggingTooFastText(text)) {
      return scheduleDecision(randomDelay(60000, 60000, random), 'error-logging-too-fast')
    }

    const isNetworkError = ['ECONNRESET', 'ECONNABORTED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'EHOSTUNREACH']
      .some(value => code.includes(value)) || text.includes('socket hang up')

    if (isNetworkError) {
      const connectionIssue = isConnectionIssueCode(code)
      return scheduleDecision(randomDelay(20000, 20000, random), `error-network-${code || 'socket'}`, {
        noteNoInternet: connectionIssue,
        stabilityCooldownReason: connectionIssue ? null : `сетевой сброс ${code || 'socket'}`,
        stabilityCooldownMs: options.connectionStabilityCooldownMs
      })
    }

    return scheduleDecision(randomDelay(15000, 15000, random), 'error-generic')
  }

  return { action: 'ignore' }
}

module.exports = {
  getReconnectDecision,
  isTooManyPacketsText,
  normalizeReconnectText,
  randomDelay
}

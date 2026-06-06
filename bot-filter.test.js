const assert = require('assert')
const {
  calculateBotFilterReconnectDelay,
  classifyBotFilterMessage,
  isChatCaptchaText,
  isScannerWaitText
} = require('./bot-filter')

const chatCaptcha = 'Сканер | Пожалуйста, введите капчу в чат. Осталось попыток: 3.'
const fallWait = 'Сканер | Пожалуйста, дождитесь окончания проверки и не двигайтесь'
const englishCaptcha = 'LimboFilter Please, solve the captcha, you have 2 attempts.'
const englishFallWait = 'LimboFilter Bot-Filter check was started, please wait and don\'t move..'

assert.strictEqual(isChatCaptchaText(chatCaptcha), true)
assert.strictEqual(classifyBotFilterMessage(chatCaptcha), 'chat-captcha')
assert.strictEqual(isChatCaptchaText(englishCaptcha), true)
assert.strictEqual(classifyBotFilterMessage(englishCaptcha), 'chat-captcha')

assert.strictEqual(isScannerWaitText(fallWait), true)
assert.strictEqual(classifyBotFilterMessage(fallWait), 'fall-wait')
assert.strictEqual(isScannerWaitText(englishFallWait), true)
assert.strictEqual(classifyBotFilterMessage(englishFallWait), 'fall-wait')

{
  const first = calculateBotFilterReconnectDelay({
    reason: 'limbo-position-timeout',
    retryCount: 0,
    lastFailureAt: 1000,
    now: 2000,
    retryBaseMs: 8000,
    retryMaxMs: 120000,
    fallAttemptsBeforeHold: 2,
    fallHoldMs: 1800000,
    random: () => 0
  })
  assert.strictEqual(first.delay, 8000)
  assert.strictEqual(first.retryCount, 1)
  assert.strictEqual(first.fallHoldActive, false)

  const second = calculateBotFilterReconnectDelay({
    reason: 'kick-antibot-check-time-exceeded',
    retryCount: first.retryCount,
    lastFailureAt: first.lastFailureAt,
    now: 3000,
    retryBaseMs: 8000,
    retryMaxMs: 120000,
    fallAttemptsBeforeHold: 2,
    fallHoldMs: 1800000,
    random: () => 0
  })
  assert.strictEqual(second.delay, 1800000)
  assert.strictEqual(second.retryCount, 2)
  assert.strictEqual(second.fallHoldActive, true)
}

console.log('bot-filter tests passed')

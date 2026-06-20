const assert = require('assert')
const { getReconnectDecision } = require('./reconnect-policy')

{
  const decision = getReconnectDecision(
    {
      type: 'error',
      message: 'read ECONNRESET',
      error: { code: 'ECONNRESET' },
      wasInBotFilterCheck: true
    },
    { random: () => 0 }
  )

  assert.strictEqual(decision.action, 'bot-filter')
  assert.strictEqual(decision.botFilterReason, 'error-limbo-reset')
  assert.strictEqual(decision.scheduleReason, 'error-limbo-reset')
}

{
  const decision = getReconnectDecision(
    {
      type: 'kick',
      reason: 'already connected'
    },
    { random: () => 0 }
  )

  assert.strictEqual(decision.action, 'schedule')
  assert.strictEqual(decision.delay, 45000)
  assert.strictEqual(decision.scheduleReason, 'kick-already-connected')
}

{
  const decision = getReconnectDecision(
    {
      type: 'kick',
      reason: 'You are sending too many packets'
    },
    { random: () => 0 }
  )

  assert.strictEqual(decision.action, 'schedule')
  assert.strictEqual(decision.delay, 15000)
  assert.strictEqual(decision.packetSafetySource, 'kick-too-many-packets')
}

{
  const decision = getReconnectDecision(
    {
      type: 'too-many-packets-notice',
      source: 'server-system'
    },
    { random: () => 0 }
  )

  assert.strictEqual(decision.action, 'schedule')
  assert.strictEqual(decision.delay, 12000)
  assert.strictEqual(decision.scheduleReason, 'too-many-packets-server-system')
  assert.strictEqual(decision.packetSafetySource, 'server-system')
}

{
  const decision = getReconnectDecision(
    {
      type: 'kick',
      reason: 'AntiBot: вы превысили время проверки',
      wasInBotFilterCheck: true
    },
    { random: () => 0 }
  )

  assert.strictEqual(decision.action, 'bot-filter')
  assert.strictEqual(decision.botFilterReason, 'kick-antibot-check-time-exceeded')
  assert.strictEqual(decision.logs[0].message, 'ERR LimboFilter НЕ ПРОЙДЕН')
}

{
  const decision = getReconnectDecision(
    {
      type: 'kick',
      reason: 'LimboFilter Falling Check was failed. Please, rejoin the server.',
      wasInBotFilterCheck: true
    },
    { random: () => 0 }
  )

  assert.strictEqual(decision.action, 'bot-filter')
  assert.strictEqual(decision.botFilterReason, 'kick-limbo-falling-check-failed')
  assert.strictEqual(decision.logs[0].message, 'ERR LimboFilter fall-проверка провалена')
}

{
  const decision = getReconnectDecision(
    {
      type: 'kick',
      reason: 'AntiBot You have exceeded the maximum Bot-Filter check time.',
      wasInBotFilterCheck: true
    },
    { random: () => 0 }
  )

  assert.strictEqual(decision.action, 'bot-filter')
  assert.strictEqual(decision.botFilterReason, 'kick-limbo-timeout')
}

console.log('reconnect-policy tests passed')

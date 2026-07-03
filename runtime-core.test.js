const assert = require('assert')
const {
  getPacketGovernorLimits
} = require('./runtime-core/packet-governor')
const {
  createLifecycleState,
  getLifecycleSnapshot,
  transitionLifecycle
} = require('./runtime-core/lifecycle-state')
const {
  addTimelineEvent,
  createEventTimeline,
  getTimelineSnapshot
} = require('./runtime-core/event-timeline')
const {
  classifyCaptchaEvidence,
  createCaptchaEvidence,
  validateCaptchaEvidence
} = require('./runtime-core/captcha-evidence')

const baseLimits = {
  perSecond: 300,
  burst: 84,
  burstWindowMs: 250,
  targetCooldownMs: 8,
  pendingRetryMs: 32
}

{
  const limits = getPacketGovernorLimits(baseLimits)
  assert.strictEqual(limits.mode, 'fast')
  assert.strictEqual(limits.perSecond, 300)
  assert.strictEqual(limits.burst, 84)
  assert.strictEqual(limits.burstWindowMs, 250)
  assert.strictEqual(limits.targetCooldownMs, 8)
  assert.strictEqual(limits.pendingRetryMs, 32)
}

{
  const lifecycle = createLifecycleState('connecting', 1000)
  const result = transitionLifecycle(lifecycle, 'mining', 'test', { ok: true }, 5000)
  assert.strictEqual(result.changed, true)
  const snapshot = getLifecycleSnapshot(lifecycle, 9000)
  assert.strictEqual(snapshot.state, 'mining')
  assert.strictEqual(snapshot.previousState, 'connecting')
  assert.strictEqual(snapshot.ageMs, 4000)
}

{
  const timeline = createEventTimeline(3)
  addTimelineEvent(
    timeline,
    { type: 'network', severity: 'warning', reason: 'ECONNRESET', message: 'read ECONNRESET' },
    1000
  )
  addTimelineEvent(
    timeline,
    { type: 'network', severity: 'warning', reason: 'ECONNRESET', message: 'read ECONNRESET' },
    2000
  )
  addTimelineEvent(
    timeline,
    {
      type: 'mining',
      severity: 'warning',
      reason: 'mining-confirmation',
      message: 'подтверждения добычи'
    },
    40000
  )
  const snapshot = getTimelineSnapshot(timeline, { limit: 5 })
  assert.strictEqual(snapshot.length, 2)
  assert.strictEqual(snapshot[1].repeatCount, 2)
}

{
  const chatCaptcha = 'Сканер | Пожалуйста, введите капчу в чат. Осталось попыток: 3.'
  assert.strictEqual(classifyCaptchaEvidence(chatCaptcha), 'chat-captcha')
  const valid = validateCaptchaEvidence(
    createCaptchaEvidence({
      text: chatCaptcha,
      source: 'server-chat',
      position: 'chat',
      packetSeen: true
    }),
    'chat-captcha'
  )
  assert.strictEqual(valid.valid, true)

  const invisible = validateCaptchaEvidence(
    createCaptchaEvidence({
      text: chatCaptcha,
      source: 'server-game-info',
      position: 'game_info',
      packetSeen: true,
      visibleChat: false
    }),
    'chat-captcha'
  )
  assert.strictEqual(invisible.valid, false)
  assert.strictEqual(invisible.reason, 'not-visible-chat')
}

console.log('runtime-core tests passed')

const assert = require('assert')
const {
  createPacketGovernor,
  getPacketGovernorLimits,
  getPacketGovernorSnapshot,
  recordPacketIncident
} = require('./runtime-core/packet-governor')
const {
  createMiningController,
  evaluateMiningController,
  getMiningControllerLimits,
  getMiningControllerSnapshot,
  getPacketOnlyRecoveryDecision,
  pruneMiningControllerPending,
  recordBreakPacketConfirmed,
  recordBreakPacketsSent,
  recordMiningPacketIncident,
  recordPacketOnlySoftRecovery
} = require('./runtime-core/mining-controller')
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
  fastPerSecond: 300,
  fastBurst: 84,
  safePerSecond: 240,
  safeBurst: 68,
  burstWindowMs: 250,
  targetCooldownMs: 8,
  pendingRetryMs: 32,
  safeRepeats: 1
}

{
  const governor = createPacketGovernor({ recoveryMs: 100000 })
  assert.strictEqual(getPacketGovernorLimits(governor, baseLimits, 1000).mode, 'fast')
  assert.strictEqual(getPacketGovernorLimits(governor, baseLimits, 1000).perSecond, 300)

  recordPacketIncident(governor, 'too many packets', { now: 2000, safeModeMs: 120000 })
  const safeLimits = getPacketGovernorLimits(governor, baseLimits, 3000)
  assert.strictEqual(safeLimits.mode, 'safe')
  assert.strictEqual(safeLimits.perSecond, 240)
  assert.strictEqual(safeLimits.repeatsLimit, 1)

  const recoveryLimits = getPacketGovernorLimits(governor, baseLimits, 130000)
  assert.strictEqual(recoveryLimits.mode, 'recovering')
  assert(recoveryLimits.perSecond > 240)
  assert(recoveryLimits.perSecond < 300)

  const fastSnapshot = getPacketGovernorSnapshot(governor, 300000)
  assert.strictEqual(fastSnapshot.mode, 'fast')
}

{
  const controller = createMiningController({ now: 1000, minSamples: 4 })
  controller.budgetScale = 0.8
  for (let index = 0; index < 5; index++) {
    const key = `35,8${index},2335`
    recordBreakPacketsSent(controller, { positionKey: key, packetCount: 2, now: 1100 + index * 10 })
    recordBreakPacketConfirmed(controller, { positionKey: key, now: 1140 + index * 10 })
  }
  const result = evaluateMiningController(controller, { now: 15000, force: true })
  assert(result.nextScale > 0.8)
  assert.strictEqual(result.bottleneck, 'stable')
  assert.strictEqual(getMiningControllerSnapshot(controller, 15000).pendingCount, 0)
}

{
  const controller = createMiningController({ now: 1000, minSamples: 4 })
  controller.budgetScale = 1
  for (let index = 0; index < 6; index++) {
    recordBreakPacketsSent(controller, { positionKey: `p${index}`, packetCount: 2, now: 1000 + index * 10 })
  }
  pruneMiningControllerPending(controller, { now: 4000, stalePendingMs: 1500 })
  const result = evaluateMiningController(controller, { now: 5000, force: true })
  assert(result.nextScale < 1)
  assert.strictEqual(result.bottleneck, 'pending-packets')
}

{
  const controller = createMiningController({ now: 1000 })
  controller.budgetScale = 1
  recordMiningPacketIncident(controller, 'too many packets', { now: 2000 })
  assert(getMiningControllerSnapshot(controller, 2000).budgetScale < 1)
}

{
  const controller = createMiningController({ now: 1000, softRecoveryLimit: 2, softRecoveryCooldownMs: 0 })
  recordBreakPacketsSent(controller, { positionKey: '35,82,2335', packetCount: 2, now: 1000 })
  let decision = getPacketOnlyRecoveryDecision(controller, { now: 2300, idleMs: 1300, fallbackMs: 1200 })
  assert.strictEqual(decision.action, 'soft-recovery')
  recordPacketOnlySoftRecovery(controller, { now: 2300 })
  decision = getPacketOnlyRecoveryDecision(controller, { now: 2500, idleMs: 1500, fallbackMs: 1200 })
  assert.strictEqual(decision.action, 'soft-recovery')
  recordPacketOnlySoftRecovery(controller, { now: 2500 })
  decision = getPacketOnlyRecoveryDecision(controller, { now: 2700, idleMs: 1700, fallbackMs: 1200 })
  assert.strictEqual(decision.action, 'fallback-dig')
}

{
  const controller = createMiningController({ now: 1000 })
  controller.budgetScale = 0.75
  const limits = getMiningControllerLimits(controller, baseLimits)
  assert(limits.fastPerSecond < baseLimits.fastPerSecond)
  assert(limits.fastBurst < baseLimits.fastBurst)
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
  addTimelineEvent(timeline, { type: 'network', severity: 'warning', reason: 'ECONNRESET', message: 'read ECONNRESET' }, 1000)
  addTimelineEvent(timeline, { type: 'network', severity: 'warning', reason: 'ECONNRESET', message: 'read ECONNRESET' }, 2000)
  addTimelineEvent(timeline, { type: 'speed', severity: 'warning', reason: 'speed-drop', message: 'просадка' }, 40000)
  const snapshot = getTimelineSnapshot(timeline, { limit: 5 })
  assert.strictEqual(snapshot.length, 2)
  assert.strictEqual(snapshot[1].repeatCount, 2)
}

{
  const chatCaptcha = 'Сканер | Пожалуйста, введите капчу в чат. Осталось попыток: 3.'
  assert.strictEqual(classifyCaptchaEvidence(chatCaptcha), 'chat-captcha')
  const valid = validateCaptchaEvidence(createCaptchaEvidence({
    text: chatCaptcha,
    source: 'server-chat',
    position: 'chat',
    packetSeen: true
  }), 'chat-captcha')
  assert.strictEqual(valid.valid, true)

  const invisible = validateCaptchaEvidence(createCaptchaEvidence({
    text: chatCaptcha,
    source: 'server-game-info',
    position: 'game_info',
    packetSeen: true,
    visibleChat: false
  }), 'chat-captcha')
  assert.strictEqual(invisible.valid, false)
  assert.strictEqual(invisible.reason, 'not-visible-chat')
}

console.log('runtime-core tests passed')

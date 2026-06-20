const assert = require('assert')
const {
  classifyLogHealth,
  createRuntimeState,
  getHealthLogLabel,
  getMiningControllerAggregate,
  getPacketGovernorAggregate
} = require('./runtime-core/runtime-state')

{
  assert.strictEqual(getHealthLogLabel('dns-failure'), 'NETWORK DNS')
  assert.strictEqual(getHealthLogLabel('packet-budget'), 'PACKET BUDGET')
  assert.strictEqual(
    classifyLogHealth('error', 'read ECONNRESET', ({ message }) =>
      message.includes('network') || message.includes('ECONNRESET') ? 'network-reset' : 'mining-ok'
    ),
    'network-reset'
  )
}

{
  const governors = new Map([
    ['a', { mode: 'fast' }],
    ['b', { mode: 'safe' }]
  ])
  const aggregate = getPacketGovernorAggregate(
    governors,
    governor => ({
      mode: governor.mode,
      safeRemainingMs: governor.mode === 'safe' ? 1000 : 0,
      incidentCount: governor.mode === 'safe' ? 2 : 1,
      lastReason: governor.mode === 'safe' ? 'too many packets' : ''
    }),
    true
  )
  assert.strictEqual(aggregate.packetMode, 'safe')
  assert.strictEqual(aggregate.incidentCount, 3)
  assert.strictEqual(aggregate.safeRemainingMs, 1000)
}

{
  const controllers = new Map([
    [
      'a',
      {
        sustainableRate: 10,
        confirmationRatio: 0.5,
        confirmLatencyMs: 100,
        fallbackDigCount: 1,
        pendingCount: 2,
        stalePendingCleared: 3,
        budgetScale: 0.8,
        lastBottleneckAt: 10,
        lastMiningBottleneck: 'pending-packets',
        window: { sentBreakAttempts: 4, confirmedPacketBreaks: 2 }
      }
    ]
  ])
  const aggregate = getMiningControllerAggregate(controllers, controller => controller, 1000)
  assert.strictEqual(aggregate.sustainableRate, 10)
  assert.strictEqual(aggregate.confirmationRatio, 0.5)
  assert.strictEqual(aggregate.lastMiningBottleneck, 'pending-packets')
}

{
  const logs = []
  const runtimeState = createRuntimeState({
    speedWindowMs: 10000,
    writeToLogFile: line => logs.push(line),
    requestUiRefresh: () => {}
  })
  runtimeState.setRuntimeHealth('speed-drop', { diagnosis: 'slow' })
  runtimeState.updateBotStatus('Bot', 'копает', { blockMined: true })

  const snapshot = runtimeState.buildRuntimeSnapshot({
    configFilePath: 'config.json',
    logFilePath: 'bot.log',
    diggingPaused: false,
    packetGovernors: new Map(),
    miningControllers: new Map(),
    enableAdaptivePacketGovernor: true,
    enableAdaptiveMiningController: true,
    createPacketGovernor: options => ({ options }),
    createMiningController: options => ({ options }),
    getPacketGovernor: () => ({}),
    getMiningController: () => ({}),
    getPacketGovernorAggregate: () => ({
      packetMode: 'fast',
      lastReason: '',
      incidentCount: 0,
      safeRemainingMs: 0
    }),
    getMiningControllerAggregate: () => ({
      sustainableRate: 0,
      confirmationRatio: 1,
      confirmLatencyMs: 0,
      fallbackDigCount: 0,
      pendingCount: 0,
      stalePendingCleared: 0,
      budgetScale: 1,
      lastMiningBottleneck: ''
    }),
    getPacketGovernorLimits: () => ({
      perSecond: 300,
      burst: 84,
      burstWindowMs: 250,
      targetCooldownMs: 8,
      pendingRetryMs: 32
    }),
    getMiningControllerLimits: (_controller, limits) => limits,
    getPacketGovernorBaseLimits: () => ({}),
    getPacketGovernorSnapshot: () => ({ mode: 'fast' }),
    getMiningControllerSnapshot: () => ({ pendingCount: 0 }),
    getSpeedGuardProfile: () => ({ peakRatePerMinute: 12 })
  })

  assert(logs.some(line => line.includes('[HEALTH] MINING SPEED')))
  assert.strictEqual(snapshot.totalBlocks, 1)
  assert.strictEqual(snapshot.bots.Bot.status, 'копает')
  assert.strictEqual(snapshot.performance.packetMode, 'fast')
}

console.log('runtime-state tests passed')

const assert = require('assert')
const {
  classifyLogHealth,
  createRuntimeState,
  getHealthLogLabel,
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
  const aggregate = getPacketGovernorAggregate()
  assert.strictEqual(aggregate.packetMode, 'fast')
  assert.strictEqual(aggregate.incidentCount, 0)
  assert.strictEqual(aggregate.safeRemainingMs, 0)
}

{
  const logs = []
  const runtimeState = createRuntimeState({
    speedWindowMs: 10000,
    writeToLogFile: line => logs.push(line),
    requestUiRefresh: () => {}
  })
  runtimeState.setRuntimeHealth('mining-confirmation', { diagnosis: 'slow confirmations' })
  runtimeState.updateBotStatus('Bot', 'копает', { blockMined: true })

  const snapshot = runtimeState.buildRuntimeSnapshot({
    configFilePath: 'config.json',
    logFilePath: 'bot.log',
    diggingPaused: false,
    getPacketGovernorAggregate: () => ({
      packetMode: 'fast',
      lastReason: '',
      incidentCount: 0,
      safeRemainingMs: 0
    }),
    getPacketGovernorBaseLimits: () => ({
      perSecond: 300,
      burst: 84,
      burstWindowMs: 250,
      targetCooldownMs: 8,
      pendingRetryMs: 32
    })
  })

  assert(logs.some(line => line.includes('[HEALTH] MINING CONFIRMATION')))
  assert.strictEqual(snapshot.totalBlocks, 1)
  assert.strictEqual(snapshot.bots.Bot.status, 'копает')
  assert.strictEqual(snapshot.performance.packetMode, 'fast')
}

console.log('runtime-state tests passed')

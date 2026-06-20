const {
  classifyHealthEvent: defaultClassifyHealthEvent,
  computeSmartRateStats,
  createHealthState,
  updateHealthState
} = require('../stability-center')
const { addTimelineEvent, createEventTimeline, getTimelineSnapshot } = require('./event-timeline')

function classifyLogHealth(level, message, classifyHealthEvent = defaultClassifyHealthEvent) {
  if (!message) return null
  const reason = classifyHealthEvent({ message })
  if (reason !== 'mining-ok') return reason
  if (level === 'error') return classifyHealthEvent({ message: `network ${message}` })
  return null
}

function getHealthLogLabel(reason) {
  if (reason === 'dns-failure') return 'NETWORK DNS'
  if (reason === 'connect-timeout') return 'NETWORK TIMEOUT'
  if (reason === 'network-reset') return 'NETWORK RESET'
  if (reason === 'server-world-reset') return 'SERVER RESET'
  if (reason === 'runtime-stale') return 'BOT STALE'
  if (reason === 'speed-drop') return 'MINING SPEED'
  if (reason === 'mining-confirmation') return 'MINING CONFIRMATION'
  if (reason === 'packet-budget') return 'PACKET BUDGET'
  if (reason === 'fallback-dig') return 'FALLBACK DIG'
  if (reason === 'joining') return 'JOINING'
  if (reason === 'chat-captcha-hold') return 'BOTFILTER CHAT'
  if (reason === 'botfilter-hold') return 'BOTFILTER HOLD'
  return String(reason || 'HEALTH').toUpperCase()
}

function createMonitorData(now = Date.now()) {
  return {
    startTime: now,
    bots: {},
    totalBlocks: 0,
    health: createHealthState(now),
    timeline: createEventTimeline(100),
    scriptResources: {
      cpu: [],
      ram: [],
      x: []
    }
  }
}

function getPacketGovernorAggregate(packetGovernors, getPacketGovernorSnapshot, adaptiveEnabled) {
  const snapshots = [...packetGovernors.entries()].map(([botName, governor]) => ({
    botName,
    ...getPacketGovernorSnapshot(governor)
  }))

  const packetMode = snapshots.some(snapshot => snapshot.mode === 'safe')
    ? 'safe'
    : snapshots.some(snapshot => snapshot.mode === 'recovering')
      ? 'recovering'
      : adaptiveEnabled
        ? 'fast'
        : 'fixed'
  const active = snapshots.find(snapshot => snapshot.mode === packetMode) || snapshots[0] || null

  return {
    packetMode,
    lastReason: active?.lastReason || '',
    incidentCount: snapshots.reduce(
      (sum, snapshot) => sum + (Number(snapshot.incidentCount) || 0),
      0
    ),
    safeRemainingMs: Math.max(
      0,
      ...snapshots.map(snapshot => Number(snapshot.safeRemainingMs) || 0)
    )
  }
}

function getMiningControllerAggregate(
  miningControllers,
  getMiningControllerSnapshot,
  now = Date.now()
) {
  const snapshots = [...miningControllers.entries()].map(([botName, controller]) => ({
    botName,
    ...getMiningControllerSnapshot(controller, now)
  }))

  if (!snapshots.length) {
    return {
      sustainableRate: 0,
      confirmationRatio: 1,
      confirmLatencyMs: 0,
      fallbackDigCount: 0,
      pendingCount: 0,
      stalePendingCleared: 0,
      budgetScale: 1,
      lastMiningBottleneck: ''
    }
  }

  const totalAttempts = snapshots.reduce(
    (sum, snapshot) => sum + (Number(snapshot.window?.sentBreakAttempts) || 0),
    0
  )
  const totalConfirmed = snapshots.reduce(
    (sum, snapshot) => sum + (Number(snapshot.window?.confirmedPacketBreaks) || 0),
    0
  )
  const bottleneckSnapshot = [...snapshots].sort(
    (a, b) => (Number(b.lastBottleneckAt) || 0) - (Number(a.lastBottleneckAt) || 0)
  )[0]

  return {
    sustainableRate: snapshots.reduce(
      (sum, snapshot) => sum + (Number(snapshot.sustainableRate) || 0),
      0
    ),
    confirmationRatio:
      totalAttempts > 0
        ? totalConfirmed / totalAttempts
        : Math.min(...snapshots.map(snapshot => Number(snapshot.confirmationRatio) || 1)),
    confirmLatencyMs:
      snapshots.reduce((sum, snapshot) => sum + (Number(snapshot.confirmLatencyMs) || 0), 0) /
      snapshots.length,
    fallbackDigCount: snapshots.reduce(
      (sum, snapshot) => sum + (Number(snapshot.fallbackDigCount) || 0),
      0
    ),
    pendingCount: snapshots.reduce(
      (sum, snapshot) => sum + (Number(snapshot.pendingCount) || 0),
      0
    ),
    stalePendingCleared: snapshots.reduce(
      (sum, snapshot) => sum + (Number(snapshot.stalePendingCleared) || 0),
      0
    ),
    budgetScale: Math.min(...snapshots.map(snapshot => Number(snapshot.budgetScale) || 1)),
    lastMiningBottleneck: bottleneckSnapshot?.lastMiningBottleneck || ''
  }
}

function createRuntimeState(options = {}) {
  const monitorData = options.monitorData || createMonitorData(options.now || Date.now())

  function recordTimelineEvent(event = {}) {
    monitorData.timeline = addTimelineEvent(monitorData.timeline, event)
    return monitorData.timeline
  }

  function setRuntimeHealth(reason, details = {}) {
    const previousReason = monitorData.health?.reason
    monitorData.health = updateHealthState(monitorData.health, { reason, ...details }, Date.now())

    if (monitorData.health.reason !== previousReason && monitorData.health.reason !== 'mining-ok') {
      const label = getHealthLogLabel(monitorData.health.reason)
      if (typeof options.writeToLogFile === 'function') {
        options.writeToLogFile(`[HEALTH] ${label}: ${monitorData.health.diagnosis}`)
      }
      recordTimelineEvent({
        type: 'health',
        severity: monitorData.health.severity,
        reason: monitorData.health.reason,
        message: monitorData.health.diagnosis
      })
    }

    return monitorData.health
  }

  function refreshBotRates(now = Date.now()) {
    for (const botData of Object.values(monitorData.bots)) {
      const stats = computeSmartRateStats({
        blockTimes: botData.blockTimes,
        now,
        rawWindowMs: 60000,
        speedWindowMs: options.speedWindowMs,
        status: botData.status,
        activeSince: botData.rateActiveSince || 0
      })
      botData.blockTimes = stats.blockTimes
      botData.rawBlocksLastMinute = stats.rawBlocksLastMinute
      botData.rawBlocksPerSecond = stats.rawBlocksPerSecond
      botData.rawRatePerMinute = stats.rawRatePerMinute
      botData.effectiveBlocksLastMinute = stats.effectiveRatePerMinute
      botData.effectiveBlocksPerSecond = stats.effectiveBlocksPerSecond
      botData.effectiveWindowMs = stats.effectiveWindowMs
      botData.rateRecovering = stats.recovering
      botData.blocksLastMinute = stats.effectiveRatePerMinute
      botData.blocksPerSecond = stats.effectiveBlocksPerSecond
    }
  }

  function updateBotStatus(botName, status, data = {}) {
    const now = Date.now()
    if (!monitorData.bots[botName]) {
      monitorData.bots[botName] = {
        status,
        blocksTotal: 0,
        blocksLastMinute: 0,
        blocksPerSecond: 0,
        rawBlocksLastMinute: 0,
        rawBlocksPerSecond: 0,
        effectiveBlocksLastMinute: 0,
        effectiveBlocksPerSecond: 0,
        rateActiveSince: status === 'копает' ? now : 0,
        rateStatusChangedAt: now,
        lastActivityTime: now,
        lastBlockTime: now,
        blockTimes: []
      }
    }
    const bot = monitorData.bots[botName]
    const previousStatus = bot.status
    bot.status = status
    if (previousStatus !== status) {
      bot.rateStatusChangedAt = now
      bot.lastActivityTime = now
      if (status === 'копает') {
        bot.rateActiveSince = now
        setRuntimeHealth('mining-ok', { lastRecoveryAction: 'mining-resumed' })
      } else {
        bot.rateActiveSince = 0
      }
    }
    if (data.blockMined) {
      bot.blocksTotal++
      monitorData.totalBlocks++
      bot.blockTimes.push(now)
      bot.lastBlockTime = now
      bot.lastActivityTime = now
    } else if (data.timestamp) {
      bot.lastBlockTime = data.timestamp
      bot.lastActivityTime = data.timestamp
    }
    refreshBotRates()
    if (typeof options.requestUiRefresh === 'function') {
      options.requestUiRefresh()
    }
  }

  function buildRuntimeSnapshot(dependencies = {}) {
    const now = Date.now()
    const uptime = now - monitorData.startTime
    const currentRatePerMinute = Object.values(monitorData.bots).reduce(
      (sum, bot) => sum + (bot.blocksLastMinute || 0),
      0
    )
    const currentRatePerSecond = Object.values(monitorData.bots).reduce(
      (sum, bot) => sum + (bot.blocksPerSecond || 0),
      0
    )
    const currentRawRatePerMinute = Object.values(monitorData.bots).reduce(
      (sum, bot) => sum + (bot.rawBlocksLastMinute || 0),
      0
    )
    const currentRawRatePerSecond = Object.values(monitorData.bots).reduce(
      (sum, bot) => sum + (bot.rawBlocksPerSecond || 0),
      0
    )
    const currentPeakRatePerMinute = Object.keys(monitorData.bots).reduce(
      (sum, botName) =>
        sum + (Number(dependencies.getSpeedGuardProfile(botName).peakRatePerMinute) || 0),
      0
    )
    const packetAggregate = dependencies.getPacketGovernorAggregate()
    const miningAggregate = dependencies.getMiningControllerAggregate(now)
    const governorEntries = [...dependencies.packetGovernors.values()]
    const firstController =
      [...dependencies.miningControllers.values()][0] ||
      dependencies.createMiningController({
        enabled: dependencies.enableAdaptiveMiningController
      })
    const packetBudget = dependencies.getPacketGovernorLimits(
      governorEntries[0] ||
        dependencies.createPacketGovernor({ enabled: dependencies.enableAdaptivePacketGovernor }),
      dependencies.getMiningControllerLimits(
        firstController,
        dependencies.getPacketGovernorBaseLimits()
      ),
      now
    )
    const health = updateHealthState(monitorData.health, {}, now)
    monitorData.health = health

    return {
      totalBlocks: monitorData.totalBlocks,
      uptimeMs: uptime,
      activeBots: Object.values(monitorData.bots).filter(b => b.status === 'копает').length,
      totalBots: Object.keys(monitorData.bots).length,
      paused: dependencies.diggingPaused,
      configPath: dependencies.configFilePath,
      logFilePath: dependencies.logFilePath,
      currentRatePerMinute,
      currentRatePerSecond,
      currentEffectiveRatePerMinute: currentRatePerMinute,
      currentEffectiveRatePerSecond: currentRatePerSecond,
      currentRawRatePerMinute,
      currentRawRatePerSecond,
      performance: {
        rawRate: currentRawRatePerMinute,
        rawRatePerSecond: currentRawRatePerSecond,
        effectiveRate: currentRatePerMinute,
        effectiveRatePerSecond: currentRatePerSecond,
        peakRate: currentPeakRatePerMinute,
        sustainableRate: miningAggregate.sustainableRate,
        confirmationRatio: miningAggregate.confirmationRatio,
        confirmLatencyMs: miningAggregate.confirmLatencyMs,
        packetMode: packetAggregate.packetMode,
        packetBudget: {
          perSecond: packetBudget.perSecond,
          burst: packetBudget.burst,
          burstWindowMs: packetBudget.burstWindowMs,
          targetCooldownMs: packetBudget.targetCooldownMs,
          pendingRetryMs: packetBudget.pendingRetryMs,
          safeRemainingMs: packetAggregate.safeRemainingMs,
          incidentCount: packetAggregate.incidentCount,
          budgetScale: miningAggregate.budgetScale
        },
        fallbackDigCount: miningAggregate.fallbackDigCount,
        pendingBreaks: miningAggregate.pendingCount,
        stalePendingCleared: miningAggregate.stalePendingCleared,
        lastMiningBottleneck: miningAggregate.lastMiningBottleneck,
        lastSlowdownReason:
          packetAggregate.lastReason ||
          miningAggregate.lastMiningBottleneck ||
          (health.reason === 'speed-drop' ? health.diagnosis : '')
      },
      health: {
        state: health.state,
        reason: health.reason,
        severity: health.severity,
        since: health.since,
        downtimeMs: health.downtimeMs,
        diagnosis: health.diagnosis,
        lastNetworkError: health.lastNetworkError,
        lastReconnectReason: health.lastReconnectReason,
        lastRecoveryAction: health.lastRecoveryAction,
        timeline: getTimelineSnapshot(monitorData.timeline, { limit: 12 })
      },
      bots: Object.fromEntries(
        Object.entries(monitorData.bots).map(([botName, botData]) => [
          botName,
          {
            status:
              dependencies.diggingPaused && botData.status === 'копает' ? 'пауза' : botData.status,
            blocksTotal: botData.blocksTotal || 0,
            blocksLastMinute: botData.blocksLastMinute || 0,
            blocksPerSecond: botData.blocksPerSecond || 0,
            effectiveBlocksLastMinute: botData.effectiveBlocksLastMinute || 0,
            effectiveBlocksPerSecond: botData.effectiveBlocksPerSecond || 0,
            rawBlocksLastMinute: botData.rawBlocksLastMinute || 0,
            rawBlocksPerSecond: botData.rawBlocksPerSecond || 0,
            performance: {
              rawRate: botData.rawBlocksLastMinute || 0,
              effectiveRate: botData.effectiveBlocksLastMinute || botData.blocksLastMinute || 0,
              peakRate: Number(dependencies.getSpeedGuardProfile(botName).peakRatePerMinute) || 0,
              packetMode: dependencies.getPacketGovernorSnapshot(
                dependencies.getPacketGovernor(botName),
                now
              ).mode,
              ...dependencies.getMiningControllerSnapshot(
                dependencies.getMiningController(botName),
                now
              )
            },
            rateRecovering: Boolean(botData.rateRecovering),
            rateActiveSince: botData.rateActiveSince || 0,
            effectiveWindowMs: botData.effectiveWindowMs || 0,
            lastBlockTime: botData.lastBlockTime || null
          }
        ])
      )
    }
  }

  return {
    buildRuntimeSnapshot,
    getMonitorData: () => monitorData,
    recordTimelineEvent,
    refreshBotRates,
    setRuntimeHealth,
    updateBotStatus
  }
}

module.exports = {
  classifyLogHealth,
  createMonitorData,
  createRuntimeState,
  getHealthLogLabel,
  getMiningControllerAggregate,
  getPacketGovernorAggregate
}

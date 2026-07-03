const defaultMineflayer = require('mineflayer')
const defaultVec3 = require('vec3')
const { calculateBotFilterReconnectDelay, classifyBotFilterMessage } = require('../bot-filter')
const { getReconnectDecision, isTooManyPacketsText } = require('../reconnect-policy')
const { classifyHealthEvent } = require('../stability-center')
const { createFallPacket, getFinishPacketTicks, getMinimumCheckMs } = require('../limbo-filter')
const {
  getPacketGovernorLimits
} = require('./packet-governor')
const { createPacketBreakTracker } = require('./packet-break-tracker')
const {
  createLifecycleState,
  getLifecycleSnapshot: getLifecycleStateSnapshot,
  transitionLifecycle
} = require('./lifecycle-state')
const { createCaptchaEvidence, validateCaptchaEvidence } = require('./captcha-evidence')
const {
  createClientIdentityPackets,
  createTeleportConfirmPayload,
  summarizeClientPacketPayload
} = require('./client-packets')
const {
  classifyServerMenuWindow: classifyMinecraftServerMenuWindow,
  getMessageJson,
  getMinecraftMessageText: getRuntimeMinecraftMessageText,
  getWindowTitleText
} = require('./minecraft-text')
const {
  describeCoordinateHealth,
  formatDistance,
  formatPosition,
  isCoordinateHealthFarFromWorkArea,
  isCoordinateHealthInWorkArea
} = require('./position-guard')
const {
  getServerMessageSource,
  isVisibleServerMessagePosition,
  normalizeChatText,
  normalizeServerMessagePosition
} = require('./runtime-formatters')

function noop() {}

function createBotSessionFactory(options = {}) {
  const settings = options.settings || {}
  const context = options.context || {}
  const {
    ACTIVE_FALL_CHECK_ENABLED,
    BLOCK_COUNT_DEDUPE_MS,
    BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD,
    BOT_FILTER_FALL_HOLD_MS,
    BOT_FILTER_RETRY_BASE_MS,
    BOT_FILTER_RETRY_MAX_MS,
    BREAK_PACKET_MIN_TARGET_COOLDOWN_MS,
    BREAK_PACKET_PENDING_RETRY_MS,
    BREAK_PACKET_TARGET_COOLDOWN_MS,
    BURST_BREAK_INTERVAL_MS,
    BURST_BREAK_REACH,
    BURST_BREAK_REPEATS,
    BURST_BREAK_WINDOW_MS,
    BURST_LOOK_REFRESH_MS,
    CHAT_CAPTCHA_RECONNECT_MS,
    CLIENT_TIMEOUT_RECONNECT_JITTER_MS,
    CLIENT_TIMEOUT_RECONNECT_MS,
    CONNECTION_STABILITY_COOLDOWN_MS,
    DETAILED_EVENT_LOGGING,
    DIAGNOSTIC_POSITION_INTERVAL_MS,
    DIAGNOSTIC_REPEAT_SUMMARY_MS,
    DIG_ACTION_TIMEOUT_MS,
    DIG_DELAY,
    EMPTY_SCAN_DELAY_MS,
    EMPTY_TARGET_BUTTON_RETRY_COOLDOWN_MS,
    EMPTY_TARGET_BUTTON_RETRY_LIMIT,
    EMPTY_TARGET_BUTTON_RETRY_MS,
    EMPTY_TARGET_LOG_AFTER_IDLE_MS,
    EMPTY_TARGET_LOG_INTERVAL_MS,
    EMPTY_TARGET_RECHECK_MS,
    ENABLE_AGGRESSIVE_MINING,
    ENTRY_BUTTON_AFTER_PRESS_WAIT_MS,
    ENTRY_BUTTON_CONFIRM_MS,
    ENTRY_BUTTON_RETRY_INTERVAL_MS,
    ENTRY_BUTTON_STARTUP_ATTEMPTS,
    ENTRY_BUTTON_STARTUP_RETRY_MS,
    ENTRY_BUTTON_WATCHDOG_MS,
    FAST_DIG_CONFIRM_MS,
    FAST_DIG_MIN_VANILLA_TIME_MS,
    FAST_DIG_RETRY_MS,
    FEATURE_ACTIVE_FALL_CHECK_ENABLED,
    GRACE_AFTER_SPAWN,
    HOTBAR_SLOT,
    LIMBO_COMPLETION_GRACE_MS,
    LIMBO_DETECTION_TIMEOUT_MS,
    LIMBO_FALL_PACKET_MS,
    LIMBO_FALL_TICKS,
    LIMBO_MENU_WAIT_MS,
    LIMBO_SERVER_TIMEOUT_MS,
    LOGIN_COMMAND_COOLDOWN_MS,
    LOG_SERVER_MESSAGES,
    MC_VERSION,
    MENU_ACTION_INTERVAL_MS,
    MENU_ATTEMPT_LIMIT,
    MENU_RECOVERY_BASE_MS,
    MENU_RECOVERY_JITTER_MS,
    MENU_RECOVERY_MAX_MS,
    MENU_RECOVERY_STEP_MS,
    MENU_SLOT_1,
    MENU_SLOT_2,
    MENU_SUBSERVER_JOIN_WAIT_MS,
    MENU_WINDOW_TRANSITION_WAIT_MS,
    MINING_BATCH_SIZE,
    MINING_DIAGNOSTIC_INTERVAL_MS,
    MINING_LOOP_IDLE_MS,
    MOVING_PISTON_LOG_AFTER_IDLE_MS,
    MOVING_PISTON_WAIT_MS,
    PACKET_BREAK_CONFIRM_WINDOW_MS,
    PACKET_ONLY_FALLBACK_MS,
    PACKET_ONLY_MINING,
    PASSWORD,
    POSITION_CHECK_INTERVAL,
    POSITION_FAR_DISTANCE,
    POSITION_FAR_RECONNECT_IDLE_MS,
    POSITION_NEAR_MINING_EXTRA_REACH,
    POSITION_RECHECK_DELAY_MS,
    POSITION_RECHECK_SAMPLES,
    POSITION_RETURN_TIMEOUT,
    POST_JOIN_DIG_START_MS,
    POST_JOIN_POSITION_GRACE_MS,
    POST_LIMBO_MENU_WATCHDOG_MS,
    PREEMPTIVE_BREAK_TARGETS,
    REACTIVE_BREAK_REPEATS,
    RECONNECT_REGULAR,
    RESTART_IF_IDLE_MS,
    SCANNER_PASSIVE_WAIT_MS,
    SCANNER_POSITION_WAIT_MS,
    SCANNER_RECENT_POSITION_MS,
    SERVER_HOST,
    SERVER_PORT,
    STABILITY_COOLDOWN_MAX_MS,
    STABILITY_COOLDOWN_MS,
    TRANSIENT_BREAK_REPEATS
  } = settings

  const mineflayer = context.mineflayer || defaultMineflayer
  const vec3 = context.vec3 || defaultVec3
  const physicsPlugin = context.physicsPlugin
  const setTimeout = context.setTimeout || global.setTimeout
  const clearTimeout = context.clearTimeout || global.clearTimeout
  const setInterval = context.setInterval || global.setInterval
  const clearInterval = context.clearInterval || global.clearInterval
  const sleep = context.sleep || (ms => ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve())
  const getActiveBots = context.getActiveBots || (() => [])
  const isRuntimeEnabled = context.isRuntimeEnabled || (() => true)
  const isShuttingDown = context.isShuttingDown || (() => false)
  const isDiggingPaused = context.isDiggingPaused || (() => false)
  const addLog = context.addLog || noop
  const addChatLog = context.addChatLog || noop
  const addDiagnosticLog = context.addDiagnosticLog || noop
  const updateBotStatus = context.updateBotStatus || noop
  const setRuntimeHealth = context.setRuntimeHealth || noop
  const recordTimelineEvent = context.recordTimelineEvent || noop
  const refreshBotRates = context.refreshBotRates || noop
  const noteGlobalError = context.noteGlobalError || noop
  const noteNoInternetError = context.noteNoInternetError || noop
  const summarizeDiagnosticDetails = context.summarizeDiagnosticDetails || (details => details)
  const getPacketGovernorBaseLimits = context.getPacketGovernorBaseLimits
  const monitorData = context.monitorData || {}
  const stabilityCooldowns = context.stabilityCooldowns || new Map()
  const botFilterRetryStates = context.botFilterRetryStates || new Map()

  function createBot(cfg) {
    const username = cfg.username
    const blocksToMine = cfg.blocksToMine
    const miningTargets = blocksToMine.map(({ x, y, z }) => vec3(x, y, z))
    const miningTargetKeys = new Set(
      blocksToMine.map(({ x, y, z }) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`)
    )
    const standPosition = cfg.standPosition
      ? vec3(cfg.standPosition.x, cfg.standPosition.y, cfg.standPosition.z)
      : null
    let activeStandPosition = standPosition ? standPosition.clone() : null
    const entryButtonPosition = cfg.entryButton?.enabled
      ? vec3(cfg.entryButton.x, cfg.entryButton.y, cfg.entryButton.z)
      : null
    const maxDistance = cfg.maxDistanceFromStand || 0.6

    let bot = null
    let menuTimer = null,
      reconnectTimer = null,
      reconnectGraceTimer = null
    let positionCheckTimer = null,
      positionCheckStartTimer = null
    let fallCheckTimer = null,
      limboFallStartTimer = null,
      limboFallIntervalTimer = null,
      limboFallTimeoutTimer = null
    let keepAliveTimer = null,
      fullServerRetryTimer = null
    let postJoinStartTimer = null,
      recreateRetryTimer = null,
      menuFlowWakeTimer = null,
      postLimboMenuWatchdogTimer = null
    let entryButtonWatchdogTimer = null
    let joinedSubserver = false,
      lastDigTime = 0
    let spawnGraceUntil = 0,
      backoff = RECONNECT_REGULAR
    let menuAttempts = 0,
      lastMenuAttempt = 0
    let menuRecoveryCount = 0
    let menuFlowRunning = false
    let menuFlowQueued = false
    let menuFlowWakeDueAt = 0
    let menuStage = 'idle'
    let menuStageStartedAt = Date.now()
    let isReturningToPosition = false
    let reconnectScheduled = false
    let reconnectDueAt = 0
    let reconnectReason = ''
    let waitingForFall = false
    let initialY = null
    let fallCheckPassed = false
    let fallCheckActive = false
    let limboSavedPhysicsEnabled = null
    let authQuickLogin = false
    let retryingFullServer = false
    let isOnline = false
    let scannerHoldUntil = 0
    let lastScannerLogAt = 0
    let scannerWaitChallengeActive = false
    let limboSuccessSeen = false
    let lastLimboPositionPacket = null
    let botFilterRetryCount = Number(botFilterRetryStates.get(username)?.retryCount) || 0
    let botFilterLastFailureAt = Number(botFilterRetryStates.get(username)?.lastFailureAt) || 0
    let lifecycle = createLifecycleState('connecting')
    let isRotating = false
    let lastKeepAlive = Date.now()
    let botHandle = null
    let sessionEpoch = 1
    let digLoopRunning = false
    let waitKickCount = 0
    let positionConfirmed = false
    let lastEntryButtonAttemptAt = 0
    let entryButtonPressedThisJoin = false
    let entryButtonPressedJoinSeq = 0
    let entryButtonFlowRunning = false
    let subserverJoinSeq = 0
    let emptyTargetButtonRetryCount = 0
    let lastEmptyTargetButtonRetryAt = 0
    let lastBlockMinedAt = 0
    let lastMiningDiagnosticAt = 0
    let lastEmptyTargetsLogAt = 0
    let lastMiningLookAt = 0
    let lastReactiveBreakAt = 0
    let lastPositionDiagnosticAt = 0
    let lastMenuOpenAttemptAt = 0
    let lastLoginCommandAt = 0
    let diagnosticEventSeq = 0
    const diagnosticRepeatState = new Map()
    let openServerMenuItem = async (source = 'uninitialized') => {
      diagEvent('menu-open-unavailable', { source })
      return false
    }

    function setLifecycleState(nextState, source = 'unknown', details = {}) {
      const previousSnapshot = getLifecycleStateSnapshot(lifecycle)
      const transition = transitionLifecycle(lifecycle, nextState, source, details)
      lifecycle = transition.lifecycle
      if (!transition.changed) return
      const snapshot = getLifecycleStateSnapshot(lifecycle)
      recordTimelineEvent({
        type: 'lifecycle',
        severity: 'info',
        botName: username,
        reason: snapshot.state,
        source,
        message: `${previousSnapshot.state} -> ${snapshot.state}`
      })
      diagEvent('lifecycle-state', {
        previousState: previousSnapshot.state,
        state: snapshot.state,
        source,
        ...details
      })
    }

    function getLifecycleSnapshot() {
      return getLifecycleStateSnapshot(lifecycle)
    }
    let packetOnlyStartedAt = 0
    const packetBreakTracker = createPacketBreakTracker({
      getBreakPacketLimits,
      onThrottle: ({ requestedPackets, secondWindowCount, burstWindowCount, limits }) => {
        diagEvent('break-packet-throttled', {
          requestedPackets,
          secondWindowCount,
          burstWindowCount,
          limits
        })
      }
    })

    function getPositionKey(position) {
      if (!position) return ''
      return packetBreakTracker.getPositionKey(position)
    }

    function isMiningTargetPosition(position) {
      return miningTargetKeys.has(getPositionKey(position))
    }

    function getStandDelta() {
      const anchor = activeStandPosition || standPosition
      if (!anchor || !bot || !bot.entity) return null

      const dx = anchor.x - bot.entity.position.x
      const dy = anchor.y - bot.entity.position.y
      const dz = anchor.z - bot.entity.position.z

      return {
        dx,
        dy,
        dz,
        distance2d: Math.hypot(dx, dz),
        distance3d: Math.hypot(dx, dy, dz)
      }
    }

    function isCurrentSession(epoch) {
      return epoch === sessionEpoch
    }

    function getReconnectGraceDelay() {
      return Math.max(0, spawnGraceUntil - Date.now())
    }

    function hasReconnectPendingLocal() {
      return Boolean(
        reconnectScheduled || reconnectTimer || reconnectGraceTimer || recreateRetryTimer
      )
    }

    function getStabilityCooldownRemaining() {
      return Math.max(0, (stabilityCooldowns.get(username) || 0) - Date.now())
    }

    function isFastMiningAllowed() {
      return ENABLE_AGGRESSIVE_MINING && !hasReconnectPendingLocal()
    }

    function isBurstBreakAllowed() {
      return isFastMiningAllowed() && getStabilityCooldownRemaining() <= 0
    }

    function getBreakPacketLimits() {
      const baseLimits = getPacketGovernorBaseLimits()
      const limits = getPacketGovernorLimits(baseLimits)
      return {
        safeMode: false,
        packetMode: 'fast',
        perSecond: limits.perSecond,
        burstWindowMs: limits.burstWindowMs,
        burst: limits.burst,
        targetCooldownMs: limits.targetCooldownMs,
        pendingRetryMs: limits.pendingRetryMs,
        repeatsLimit: Infinity,
        safeRemainingMs: 0,
        lastReason: ''
      }
    }

    function getEffectiveBreakPacketRepeats(repeats) {
      const value = Math.max(1, Number(repeats) || 1)
      const limits = getBreakPacketLimits()
      if (Number.isFinite(limits.repeatsLimit)) {
        return Math.min(value, limits.repeatsLimit)
      }

      const trackerState = packetBreakTracker.getState()
      const secondPressure =
        limits.perSecond > 0 ? trackerState.secondWindowCount / limits.perSecond : 0
      const burstPressure = limits.burst > 0 ? trackerState.burstWindowCount / limits.burst : 0
      const pressure = Math.max(secondPressure, burstPressure)

      if (pressure >= 0.72) return 1
      if (pressure >= 0.48) return Math.min(value, 2)
      return value
    }

    function reserveBreakPacketBudget(packetCount = 2) {
      return packetBreakTracker.reserveBreakPacketBudget(packetCount)
    }

    function canSendBreakPacketForTarget(position, cooldownMs = BREAK_PACKET_TARGET_COOLDOWN_MS) {
      if (!position || cooldownMs <= 0) return true
      return packetBreakTracker.canSendBreakPacketForTarget(position, cooldownMs)
    }

    function canRetryPendingBreak(position, retryMs = BREAK_PACKET_PENDING_RETRY_MS) {
      if (!position || retryMs <= 0) return true
      return packetBreakTracker.canRetryPendingBreak(position, retryMs)
    }

    function markBreakPacketTargetSent(position) {
      if (!position) return
      packetBreakTracker.markBreakPacketTargetSent(position)
    }

    function prunePacketBreakTracking(now = Date.now(), options = {}) {
      const result = packetBreakTracker.prune(now, {
        packetTtl: Number(options.packetTtl) || Math.max(50, PACKET_BREAK_CONFIRM_WINDOW_MS * 2),
        countTtl: Math.max(1000, BLOCK_COUNT_DEDUPE_MS * 20)
      })

      if (result.stalePackets > 0) {
        diagEvent('packet-break-stale-pending-cleared', {
          stalePending: result.stalePackets,
          packetTtl: result.packetTtl,
          pendingBreaks: result.pendingBreaks
        })
      }

      return result.stalePackets
    }

    function markPacketBreakAttempt(position) {
      if (!position) return
      packetBreakTracker.markPacketBreakAttempt(position)
    }

    function hasRecentPacketBreak(position, now = Date.now()) {
      if (!position) return false
      return packetBreakTracker.hasRecentPacketBreak(position, now, PACKET_BREAK_CONFIRM_WINDOW_MS)
    }

    function isMiningPositionInReach(position) {
      const distance = getPositionDistance(position)
      return Number.isFinite(distance) && distance <= BURST_BREAK_REACH
    }

    function recordMinedBlock(position, source = 'dig') {
      if (source === 'packet' && !isMiningPositionInReach(position)) {
        packetBreakTracker.deletePending(position)
        return false
      }

      const now = Date.now()
      const key = getPositionKey(position)

      if (key) {
        if (
          BLOCK_COUNT_DEDUPE_MS > 0 &&
          !packetBreakTracker.shouldCountBlock(key, now, BLOCK_COUNT_DEDUPE_MS)
        ) {
          return false
        }

        packetBreakTracker.deletePendingKey(key)
      }

      lastDigTime = now
      lastBlockMinedAt = now
      lastEmptyTargetsLogAt = 0
      packetOnlyStartedAt = PACKET_ONLY_MINING ? now : 0
      refreshActiveStandPositionFromMining(source)

      if (!positionConfirmed) {
        positionConfirmed = true
        addLog(
          'info',
          username,
          source === 'packet'
            ? 'Позиция подтверждена (packet-break)'
            : 'Позиция подтверждена (первый блок)'
        )
        diagEvent('position-confirmed-by-mining', { source, position })
      }

      updateBotStatus(username, 'копает', { blockMined: true })
      prunePacketBreakTracking(now)
      return true
    }

    function getPacketOnlyIdleMs(now = Date.now()) {
      if (!packetOnlyStartedAt) return Infinity
      const lastConfirmedAt = lastBlockMinedAt >= packetOnlyStartedAt ? lastBlockMinedAt : 0
      return now - (lastConfirmedAt || packetOnlyStartedAt)
    }

    function getMiningProgressAgeMs(now = Date.now()) {
      const lastProgressAt = Math.max(lastBlockMinedAt || 0, lastDigTime || 0)
      return lastProgressAt > 0 ? now - lastProgressAt : Infinity
    }

    async function recoverPacketOnlyPipeline(expectedSessionEpoch, reason = 'packet-only-idle') {
      if (!PACKET_ONLY_MINING || !isMiningSessionReady(expectedSessionEpoch)) {
        return false
      }

      const now = Date.now()
      const staleCleared = prunePacketBreakTracking(now, {
        packetTtl: PACKET_BREAK_CONFIRM_WINDOW_MS
      })
      packetBreakTracker.clearTargetCooldowns()
      await ensureMiningLookAt(true)
      if (!isMiningSessionReady(expectedSessionEpoch)) return false

      const burstPackets = await runBurstBreakWindow(
        expectedSessionEpoch,
        Math.min(BURST_BREAK_WINDOW_MS, 350)
      )
      if (burstPackets > 0) {
        packetOnlyStartedAt = Date.now()
        diagEvent('packet-only-soft-recovery', {
          reason,
          burstPackets,
          staleCleared
        })
        return true
      }

      return false
    }

    function hasRecentMiningProgress(windowMs = POSITION_FAR_RECONNECT_IDLE_MS) {
      return getMiningProgressAgeMs() <= windowMs
    }

    function setMenuStage(stage, source = 'unknown') {
      if (menuStage === stage) return
      menuStage = stage
      menuStageStartedAt = Date.now()
      if (stage === 'chat-captcha-hold') {
        setLifecycleState('held', source, { menuStage: stage })
      } else if (stage === 'joined') {
        setLifecycleState('joining', source, { menuStage: stage })
      } else if (stage !== 'idle') {
        setLifecycleState('joining', source, { menuStage: stage })
      }
      diagEvent('menu-stage', { stage, source })
    }

    function getMinecraftMessageText(message) {
      return getRuntimeMinecraftMessageText(message, normalizeChatText)
    }

    function classifyServerMenuWindow(window) {
      return classifyMinecraftServerMenuWindow(window, {
        menuSlot1: MENU_SLOT_1,
        menuSlot2: MENU_SLOT_2
      })
    }

    function beginSubserverJoin() {
      try {
        if (postLimboMenuWatchdogTimer) clearTimeout(postLimboMenuWatchdogTimer)
      } catch (e) {}
      postLimboMenuWatchdogTimer = null
      joinedSubserver = true
      subserverJoinSeq += 1
      menuRecoveryCount = 0
      botFilterRetryCount = 0
      botFilterLastFailureAt = 0
      botFilterRetryStates.delete(username)
      setLifecycleState('joining', 'subserver-join')
      setMenuStage('joined', 'subserver-join')
      positionConfirmed = false
      entryButtonPressedThisJoin = false
      entryButtonPressedJoinSeq = 0
      entryButtonFlowRunning = false
      lastEntryButtonAttemptAt = 0
      diagEvent('subserver-join-begin', {})
    }

    function isEntryButtonPressedForCurrentJoin() {
      return entryButtonPressedThisJoin && entryButtonPressedJoinSeq === subserverJoinSeq
    }

    function refreshActiveStandPositionFromMining(source = 'mining') {
      if (!standPosition || !bot?.entity?.position) return

      const currentPosition = bot.entity.position.clone()
      if (!activeStandPosition) {
        activeStandPosition = currentPosition
        return
      }

      const distanceToAnchor = activeStandPosition.distanceTo(currentPosition)
      if (distanceToAnchor > 500) {
        adoptCurrentPositionAsStand(source)
      }
    }

    function activateStabilityCooldown(reason, durationMs = STABILITY_COOLDOWN_MS) {
      if (durationMs <= 0) return

      const now = Date.now()
      const currentUntil = stabilityCooldowns.get(username) || 0
      const currentRemaining = Math.max(0, currentUntil - now)
      const nextRemaining = Math.min(STABILITY_COOLDOWN_MAX_MS, currentRemaining + durationMs)
      const nextUntil = now + nextRemaining

      stabilityCooldowns.set(username, nextUntil)
      addLog(
        'warning',
        username,
        `Стабильный режим ${Math.ceil(nextRemaining / 60000)}м: ${reason}`
      )
    }

    function invalidateSession() {
      sessionEpoch += 1
      digLoopRunning = false
    }

    function createDigTimeoutError() {
      const error = new Error(`dig timeout after ${Math.round(DIG_ACTION_TIMEOUT_MS / 1000)}s`)
      error.code = 'BOT_DIG_TIMEOUT'
      return error
    }

    function isDigTimeoutError(error) {
      return error?.code === 'BOT_DIG_TIMEOUT'
    }

    function getDigFaceForBlock(block) {
      if (!bot?.entity || !block?.position) return 1

      const eyePosition = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
      const blockCenter = block.position.offset(0.5, 0.5, 0.5)
      const delta = {
        x: eyePosition.x - blockCenter.x,
        y: eyePosition.y - blockCenter.y,
        z: eyePosition.z - blockCenter.z
      }
      const absX = Math.abs(delta.x)
      const absY = Math.abs(delta.y)
      const absZ = Math.abs(delta.z)

      if (absY >= absX && absY >= absZ) return delta.y > 0 ? 1 : 0
      if (absX >= absZ) return delta.x > 0 ? 5 : 4
      return delta.z > 0 ? 3 : 2
    }

    function getSafeDigTime(block) {
      if (typeof bot?.digTime !== 'function') return Infinity
      try {
        const digTime = bot.digTime(block)
        return Number.isFinite(digTime) ? digTime : Infinity
      } catch (error) {
        return Infinity
      }
    }

    function getMiningLookTarget() {
      if (!miningTargets.length) return null

      const total = miningTargets.reduce(
        (acc, pos) => {
          acc.x += pos.x + 0.5
          acc.y += pos.y + 0.5
          acc.z += pos.z + 0.5
          return acc
        },
        { x: 0, y: 0, z: 0 }
      )

      return vec3(
        total.x / miningTargets.length,
        total.y / miningTargets.length,
        total.z / miningTargets.length
      )
    }

    async function lookAtMiningTargets() {
      const target = getMiningLookTarget()
      if (!target || !bot?.entity) return

      try {
        await bot.lookAt(target, true)
        lastMiningLookAt = Date.now()
      } catch (error) {}
    }

    async function ensureMiningLookAt(force = false) {
      if (BURST_LOOK_REFRESH_MS <= 0) return

      const now = Date.now()
      if (!force && now - lastMiningLookAt < BURST_LOOK_REFRESH_MS) {
        return
      }

      await lookAtMiningTargets()
    }

    function sendBreakPacketToTarget(target, options = {}) {
      if (!isFastMiningAllowed() || !bot?._client || !target?.position) {
        return false
      }

      const preemptive = options.preemptive ?? PREEMPTIVE_BREAK_TARGETS
      const repeats = getEffectiveBreakPacketRepeats(options.repeats ?? BURST_BREAK_REPEATS)
      const block = target.block || bot.blockAt(target.position)
      if ((!block || block.type === 0) && !preemptive) {
        return false
      }

      const location = block?.position || target.position
      const distance = Number.isFinite(target.distance)
        ? target.distance
        : getPositionDistance(location)
      if (!Number.isFinite(distance) || distance > BURST_BREAK_REACH) {
        return false
      }

      const cooldownMs = Math.max(
        BREAK_PACKET_MIN_TARGET_COOLDOWN_MS,
        Math.max(0, Number(options.cooldownMs ?? BREAK_PACKET_TARGET_COOLDOWN_MS) || 0)
      )
      if (!options.skipCooldown && !canSendBreakPacketForTarget(location, cooldownMs)) {
        return false
      }

      const pendingRetryMs = Math.max(
        0,
        Number(options.pendingRetryMs ?? BREAK_PACKET_PENDING_RETRY_MS) || 0
      )
      if (!options.skipPendingRetry && !canRetryPendingBreak(location, pendingRetryMs)) {
        return false
      }

      const face = getDigFaceForBlock(block || { position: target.position })

      try {
        let sentPairs = 0
        for (let i = 0; i < repeats; i++) {
          if (!reserveBreakPacketBudget(2)) break
          bot._client.write('block_dig', { status: 0, location, face })
          bot._client.write('block_dig', { status: 2, location, face })
          sentPairs++
        }

        if (sentPairs <= 0) {
          return false
        }
        markBreakPacketTargetSent(location)
        markPacketBreakAttempt(location)

        return true
      } catch (error) {
        return false
      }
    }

    async function breakUpdatedMiningBlock(block) {
      if (!block || block.type === 0 || !isMiningTargetPosition(block.position)) {
        return false
      }

      const distance = getPositionDistance(block.position)
      if (!Number.isFinite(distance) || distance > BURST_BREAK_REACH) {
        return false
      }

      if (!isMiningSessionReady(sessionEpoch)) {
        return false
      }

      await ensureMiningLookAt()
      const sent = sendBreakPacketToTarget(
        {
          index: -1,
          position: block.position,
          block,
          distance,
          state: 'mineable'
        },
        { preemptive: false, repeats: REACTIVE_BREAK_REPEATS }
      )

      if (sent) {
        lastDigTime = Date.now()
        lastReactiveBreakAt = lastDigTime
        try {
          bot.swingArm()
        } catch (error) {}
        updateBotStatus(username, 'копает')
      }

      return sent
    }

    function handleBlockUpdate(oldBlock, newBlock) {
      const position = newBlock?.position || oldBlock?.position
      if (!position || !isMiningTargetPosition(position)) {
        return
      }

      const oldWasSolid = oldBlock && oldBlock.type !== 0
      const becameAir = oldWasSolid && (!newBlock || newBlock.type === 0)

      if (becameAir && hasRecentPacketBreak(position)) {
        recordMinedBlock(position, 'packet')
        return
      }

      if (!newBlock || newBlock.type === 0) {
        return
      }

      breakUpdatedMiningBlock(newBlock).catch(() => {})
    }

    async function runBurstBreakWindow(expectedSessionEpoch, timeoutMs = BURST_BREAK_WINDOW_MS) {
      if (!isBurstBreakAllowed() || timeoutMs <= 0 || !bot?._client) {
        return 0
      }

      const deadline = Date.now() + timeoutMs
      let sentPackets = 0
      let lookedAtTargets = false

      while (Date.now() <= deadline) {
        if (!isMiningSessionReady(expectedSessionEpoch)) {
          return sentPackets
        }

        const snapshot = buildMiningSnapshot(0)
        const packetTargets = snapshot.all.filter(
          target =>
            Number.isFinite(target.distance) &&
            target.distance <= BURST_BREAK_REACH &&
            (PREEMPTIVE_BREAK_TARGETS || (target.block && target.block.type !== 0))
        )

        if (packetTargets.length) {
          if (!lookedAtTargets) {
            lookedAtTargets = true
            await ensureMiningLookAt()
            if (!isMiningSessionReady(expectedSessionEpoch)) {
              return sentPackets
            }
          }

          let sentThisRound = 0
          for (const target of packetTargets) {
            if (sendBreakPacketToTarget(target)) {
              sentThisRound++
            }
          }

          if (sentThisRound > 0) {
            sentPackets += sentThisRound
            lastDigTime = Date.now()
            try {
              bot.swingArm()
            } catch (error) {}
            updateBotStatus(username, 'копает')
          }
        }

        await sleep(BURST_BREAK_INTERVAL_MS)
      }

      return sentPackets
    }

    async function waitForBlockCleared(position, timeoutMs = FAST_DIG_CONFIRM_MS) {
      const deadline = Date.now() + timeoutMs

      while (Date.now() <= deadline) {
        if (!bot || !bot.world || !bot.player) return false
        const nextBlock = bot.blockAt(position)
        if (!nextBlock || nextBlock.type === 0) return true
        await sleep(FAST_DIG_RETRY_MS)
      }

      const finalBlock = bot?.blockAt?.(position)
      return !finalBlock || finalBlock.type === 0
    }

    async function tryFastDigBlock(block) {
      if (!isFastMiningAllowed() || !bot?._client || !block?.position) {
        return false
      }

      const vanillaDigTime = getSafeDigTime(block)
      if (vanillaDigTime < FAST_DIG_MIN_VANILLA_TIME_MS) {
        return false
      }

      const location = block.position

      try {
        await ensureMiningLookAt()
        const sent = sendBreakPacketToTarget(
          {
            index: -1,
            position: location,
            block,
            distance: getPositionDistance(location),
            state: 'mineable'
          },
          { preemptive: false, repeats: BURST_BREAK_REPEATS }
        )
        if (sent) {
          bot.swingArm()
        }
        return await waitForBlockCleared(location)
      } catch (error) {
        return false
      }
    }

    async function digBlockWithTimeout(block) {
      let timeoutId = null

      try {
        if (await tryFastDigBlock(block)) {
          return
        }

        await Promise.race([
          bot.dig(block, isFastMiningAllowed()),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(createDigTimeoutError()), DIG_ACTION_TIMEOUT_MS)
          })
        ])
      } catch (error) {
        if (isDigTimeoutError(error)) {
          try {
            bot?.stopDigging()
          } catch (stopError) {}
        }
        throw error
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }

    function logMiningDiagnostic(level, message) {
      const now = Date.now()
      if (now - lastMiningDiagnosticAt < MINING_DIAGNOSTIC_INTERVAL_MS) return
      lastMiningDiagnosticAt = now
      addLog(level, username, message)
    }

    function logEmptyTargetsDiagnostic(reason, snapshot) {
      const now = Date.now()
      const lastProgressAt = lastBlockMinedAt || lastDigTime
      const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity

      if (Number.isFinite(idleFor) && idleFor < EMPTY_TARGET_LOG_AFTER_IDLE_MS) {
        return
      }

      if (now - lastEmptyTargetsLogAt < EMPTY_TARGET_LOG_INTERVAL_MS) {
        return
      }

      lastEmptyTargetsLogAt = now
      const idleText = Number.isFinite(idleFor) ? `, простой ${Math.round(idleFor / 1000)}с` : ''

      addLog('warning', username, `${reason}${idleText}: ${describeMiningTargets(5, snapshot)}`)
    }

    function isMiningSessionReady(expectedSessionEpoch) {
      return Boolean(
        isCurrentSession(expectedSessionEpoch) &&
        bot &&
        bot.entity &&
        bot.world &&
        bot.player &&
        joinedSubserver &&
        !hasReconnectPendingLocal()
      )
    }

    function getTargetDistance(block) {
      if (!bot?.entity || !block?.position) return null

      try {
        return getPositionDistance(block.position)
      } catch (error) {
        return null
      }
    }

    function getPositionDistance(position) {
      if (!bot?.entity || !position) return null

      return position
        .offset(0.5, 0.5, 0.5)
        .distanceTo(bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0))
    }

    function getNearestMiningTargetDistance() {
      if (!bot?.entity || !miningTargets.length) return Infinity

      let nearestDistance = Infinity
      for (const position of miningTargets) {
        const distance = getPositionDistance(position)
        if (Number.isFinite(distance) && distance < nearestDistance) {
          nearestDistance = distance
        }
      }

      return nearestDistance
    }

    function isNearMiningTargets(extraReach = POSITION_NEAR_MINING_EXTRA_REACH) {
      const nearestDistance = getNearestMiningTargetDistance()
      return Number.isFinite(nearestDistance) && nearestDistance <= BURST_BREAK_REACH + extraReach
    }

    function adoptCurrentPositionAsStand(source = 'позиция') {
      if (!standPosition || !bot?.entity?.position) return
      activeStandPosition = bot.entity.position.clone()
      addLog('info', username, `Обновил рабочую позицию шахты (${source})`)
    }

    function getCoordinateHealthSnapshot() {
      const standAnchor = activeStandPosition || standPosition
      const standDelta = getStandDelta()
      const standDistance = standDelta?.distance3d ?? Infinity
      const nearestTargetDistance = getNearestMiningTargetDistance()
      const progressAgeMs = getMiningProgressAgeMs()
      let targetSnapshot = null

      try {
        targetSnapshot = bot?.world ? buildMiningSnapshot(0) : null
      } catch (error) {
        targetSnapshot = null
      }

      return {
        botPosition: bot?.entity?.position?.clone?.() || null,
        standAnchor,
        standDistance,
        nearestTargetDistance,
        progressAgeMs,
        hasRecentProgress: progressAgeMs <= POSITION_FAR_RECONNECT_IDLE_MS,
        nearStand: Number.isFinite(standDistance) && standDistance <= maxDistance,
        nearMiningTargets:
          Number.isFinite(nearestTargetDistance) &&
          nearestTargetDistance <= BURST_BREAK_REACH + POSITION_NEAR_MINING_EXTRA_REACH,
        farFromStand: !Number.isFinite(standDistance) || standDistance > POSITION_FAR_DISTANCE,
        farFromMiningTargets:
          !Number.isFinite(nearestTargetDistance) || nearestTargetDistance > POSITION_FAR_DISTANCE,
        targetSnapshot,
        mineableTargets: targetSnapshot?.mineable?.length || 0,
        transientTargets: targetSnapshot?.transient?.length || 0,
        emptyTargets: targetSnapshot?.empty?.length || 0,
        unloadedTargets: targetSnapshot?.unloaded?.length || 0
      }
    }

    function acceptHealthyCoordinateSnapshot(
      health = getCoordinateHealthSnapshot(),
      source = 'position'
    ) {
      if (!isCoordinateHealthInWorkArea(health)) return false

      if (health.nearMiningTargets && !health.nearStand && health.standDistance > maxDistance) {
        adoptCurrentPositionAsStand(source)
      }

      return true
    }

    async function confirmFarCoordinateState(expectedSessionEpoch, source = 'position-check') {
      let health = getCoordinateHealthSnapshot()

      for (let sample = 1; sample <= POSITION_RECHECK_SAMPLES; sample++) {
        if (!isMiningSessionReady(expectedSessionEpoch)) {
          return { confirmed: false, health, reason: 'session' }
        }

        health = getCoordinateHealthSnapshot()
        if (acceptHealthyCoordinateSnapshot(health, source)) {
          return { confirmed: false, health, reason: 'near-work-area' }
        }

        if (health.hasRecentProgress) {
          logMiningDiagnostic(
            'warning',
            `Позиция спорная, но добыча была ${Math.round(health.progressAgeMs / 1000)}с назад - перезаход пропущен: ${describeCoordinateHealth(health)}`
          )
          return { confirmed: false, health, reason: 'recent-progress' }
        }

        if (!isCoordinateHealthFarFromWorkArea(health)) {
          return { confirmed: false, health, reason: 'not-far' }
        }

        if (sample < POSITION_RECHECK_SAMPLES) {
          await sleep(POSITION_RECHECK_DELAY_MS)
        }
      }

      return { confirmed: true, health, reason: 'far-confirmed' }
    }

    function reconnectBecauseCoordinateFar(health, source = 'position-check') {
      addLog(
        'warning',
        username,
        `Координаты не подтверждены (${source}) -> перезаход: ${describeCoordinateHealth(health)}`
      )
      diagEvent('coordinate-reconnect', { source, health })
      updateBotStatus(username, 'ожидание')
      activateStabilityCooldown('координаты не подтверждены')
      cleanupTimers()
      positionConfirmed = false
      scheduleReconnectLocal(3000, true, `coordinate-${source}`)
    }

    function getDiagnosticState(extra = {}) {
      let health = null
      try {
        if (bot?.entity) {
          const snapshot = getCoordinateHealthSnapshot()
          health = {
            botPosition: snapshot.botPosition,
            standDistance: Number.isFinite(snapshot.standDistance)
              ? Number(snapshot.standDistance.toFixed(2))
              : snapshot.standDistance,
            nearestTargetDistance: Number.isFinite(snapshot.nearestTargetDistance)
              ? Number(snapshot.nearestTargetDistance.toFixed(2))
              : snapshot.nearestTargetDistance,
            progressAgeMs: snapshot.progressAgeMs,
            nearWork: snapshot.nearStand || snapshot.nearMiningTargets,
            farFromWork: snapshot.farFromStand && snapshot.farFromMiningTargets,
            targets: {
              mineable: snapshot.mineableTargets,
              transient: snapshot.transientTargets,
              empty: snapshot.emptyTargets,
              unloaded: snapshot.unloadedTargets
            }
          }
        }
      } catch (error) {
        health = { error: error.message }
      }

      return {
        sessionEpoch,
        subserverJoinSeq,
        joinedSubserver,
        isOnline,
        status: monitorData.bots[username]?.status,
        positionConfirmed,
        entryButtonPressedThisJoin,
        entryButtonPressedJoinSeq,
        entryButtonReady: isEntryButtonPressedForCurrentJoin(),
        entryButtonFlowRunning,
        digLoopRunning,
        waitingForFall,
        fallCheckPassed,
        fallCheckActive,
        retryingFullServer,
        reconnectScheduled,
        reconnectDueInMs: reconnectDueAt ? Math.max(0, reconnectDueAt - Date.now()) : 0,
        hasReconnectPending: hasReconnectPendingLocal(),
        miningProgressAgeMs: getMiningProgressAgeMs(),
        menuStage,
        currentWindow: bot?.currentWindow
          ? {
              id: bot.currentWindow.id,
              type: bot.currentWindow.type,
              title: String(bot.currentWindow.title || '').slice(0, 120)
            }
          : null,
        health,
        ...extra
      }
    }

    function isNoisyDiagnosticEvent(eventName) {
      return (
        eventName === 'menu-flow-skipped-before-spawn' ||
        eventName === 'menu-open-skipped-before-spawn' ||
        eventName === 'menu-flow-skipped-reconnect-pending' ||
        eventName === 'menu-open-skipped-reconnect-pending' ||
        eventName === 'menu-flow-queue-skipped-reconnect-pending' ||
        eventName === 'menu-flow-skipped-scanner' ||
        eventName === 'menu-open-skipped-scanner' ||
        eventName === 'menu-flow-queue-skipped-scanner' ||
        eventName === 'menu-open-skipped-limbo' ||
        eventName === 'menu-open-throttled' ||
        eventName === 'window-click-throttled' ||
        eventName === 'menu-flow-queued' ||
        eventName === 'client-write:position' ||
        eventName === 'client-packet:position'
      )
    }

    function getDiagnosticRepeatKey(eventName, details = {}) {
      return [
        eventName,
        details.source || '',
        details.state || '',
        details.reason || '',
        details.menuStage || menuStage
      ].join('|')
    }

    function diagEvent(eventName, details = {}) {
      if (!DETAILED_EVENT_LOGGING) return
      const now = Date.now()
      const summarizedDetails = summarizeDiagnosticDetails(eventName, details)

      if (isNoisyDiagnosticEvent(eventName)) {
        const repeatKey = getDiagnosticRepeatKey(eventName, summarizedDetails)
        const repeat = diagnosticRepeatState.get(repeatKey)

        if (repeat) {
          repeat.suppressed += 1
          repeat.lastAt = now
          repeat.lastDetails = summarizedDetails

          if (now - repeat.lastLogAt < DIAGNOSTIC_REPEAT_SUMMARY_MS) {
            return
          }

          diagnosticEventSeq += 1
          addDiagnosticLog(
            username,
            `#${diagnosticEventSeq} ${eventName} (повтор x${repeat.suppressed + 1})`,
            {
              ...getDiagnosticState(),
              ...repeat.lastDetails,
              repeated: repeat.suppressed + 1,
              repeatWindowMs: now - repeat.lastLogAt
            }
          )
          repeat.suppressed = 0
          repeat.lastLogAt = now
          return
        }

        diagnosticRepeatState.set(repeatKey, {
          suppressed: 0,
          lastLogAt: now,
          lastAt: now,
          lastDetails: summarizedDetails
        })
      }

      diagnosticEventSeq += 1
      addDiagnosticLog(username, `#${diagnosticEventSeq} ${eventName}`, {
        ...getDiagnosticState(),
        ...summarizedDetails
      })
    }

    function diagPositionSnapshot(source = 'periodic', force = false) {
      if (!DETAILED_EVENT_LOGGING) return
      const now = Date.now()
      if (!force && now - lastPositionDiagnosticAt < DIAGNOSTIC_POSITION_INTERVAL_MS) {
        return
      }
      lastPositionDiagnosticAt = now
      diagEvent(`position-snapshot:${source}`, {})
    }

    function canMineBlock(block) {
      if (!block || block.type === 0) return false

      try {
        if (typeof bot?.canDigBlock === 'function') {
          return Boolean(bot.canDigBlock(block))
        }
      } catch (error) {
        return false
      }

      return block.diggable !== false
    }

    function isTransientMiningBlock(block) {
      const name = block?.name || ''
      return name === 'moving_piston' || name === 'piston_head'
    }

    function getTargetSnapshot(index) {
      const position = miningTargets[index]
      const block = bot?.blockAt?.(position)
      const target = {
        index,
        position,
        block,
        state: 'unloaded',
        name: 'не загружен',
        canMine: false,
        distance: getPositionDistance(position),
        diggable: null
      }

      if (!block) {
        return target
      }

      target.distance = getTargetDistance(block)
      target.diggable = block.diggable

      if (block.type === 0) {
        target.state = 'empty'
        target.name = 'air'
        return target
      }

      target.name = block.name || `#${block.type}`
      if (isTransientMiningBlock(block)) {
        target.state = 'transient'
        return target
      }

      target.canMine = canMineBlock(block)
      target.state = target.canMine ? 'mineable' : 'unreachable'
      return target
    }

    function buildMiningSnapshot(startIndex = 0) {
      const all = []

      for (let offset = 0; offset < miningTargets.length; offset++) {
        const index = (startIndex + offset) % miningTargets.length
        all.push(getTargetSnapshot(index))
      }

      return {
        all,
        mineable: all.filter(target => target.state === 'mineable'),
        unreachable: all.filter(target => target.state === 'unreachable'),
        transient: all.filter(target => target.state === 'transient'),
        empty: all.filter(target => target.state === 'empty'),
        unloaded: all.filter(target => target.state === 'unloaded')
      }
    }

    function formatTargetSnapshot(target) {
      const { position } = target
      const distance = Number.isFinite(target.distance) ? `, ${target.distance.toFixed(2)}м` : ''
      const diggable =
        target.diggable == null ||
        target.state === 'empty' ||
        target.state === 'unloaded' ||
        target.state === 'transient'
          ? ''
          : `, diggable=${target.diggable}`

      return `${position.x},${position.y},${position.z}=${target.name}${distance}${diggable}`
    }

    function describeMiningTargets(limit = 5, snapshot = null) {
      const targets = (snapshot?.all || buildMiningSnapshot(0).all).slice(0, limit)
      const samples = targets.map(formatTargetSnapshot)
      const total = snapshot?.all?.length || miningTargets.length
      const suffix = total > limit ? `; +${total - limit} ещё` : ''

      return `${samples.join('; ')}${suffix}`
    }

    function hasAnyMiningTarget() {
      if (!bot || !bot.world || !bot.player) return false
      const snapshot = buildMiningSnapshot(0)
      return (
        snapshot.mineable.length > 0 ||
        (isFastMiningAllowed() &&
          snapshot.all.some(target => target.block && target.block.type !== 0))
      )
    }

    async function waitForAnyMiningTarget(
      expectedSessionEpoch,
      timeoutMs = EMPTY_TARGET_RECHECK_MS
    ) {
      const deadline = Date.now() + Math.max(0, timeoutMs)

      do {
        if (!isCurrentSession(expectedSessionEpoch) || !bot || !joinedSubserver) {
          return false
        }
        if (hasAnyMiningTarget()) {
          return true
        }
        await sleep(EMPTY_TARGET_RECHECK_MS)
      } while (Date.now() <= deadline)

      return hasAnyMiningTarget()
    }

    async function waitAfterEmptyTargets() {
      const delay = Math.max(EMPTY_SCAN_DELAY_MS, EMPTY_TARGET_RECHECK_MS)
      if (delay > 0) {
        await sleep(delay)
      }
    }

    async function tryRescueEmptyGenerator(expectedSessionEpoch, snapshot) {
      if (
        !entryButtonPosition ||
        EMPTY_TARGET_BUTTON_RETRY_MS <= 0 ||
        EMPTY_TARGET_BUTTON_RETRY_LIMIT <= 0 ||
        emptyTargetButtonRetryCount >= EMPTY_TARGET_BUTTON_RETRY_LIMIT ||
        entryButtonFlowRunning ||
        !isMiningSessionReady(expectedSessionEpoch)
      ) {
        return false
      }

      const now = Date.now()
      const lastProgressAt = lastBlockMinedAt || lastDigTime
      const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity
      if (!Number.isFinite(idleFor) || idleFor < EMPTY_TARGET_BUTTON_RETRY_MS) {
        return false
      }

      if (now - lastEmptyTargetButtonRetryAt < EMPTY_TARGET_BUTTON_RETRY_COOLDOWN_MS) {
        return false
      }

      const allTargetsAreAir =
        snapshot?.all?.length > 0 && snapshot.all.every(target => target.state === 'empty')
      if (!allTargetsAreAir) {
        return false
      }

      emptyTargetButtonRetryCount += 1
      lastEmptyTargetButtonRetryAt = now
      addLog(
        'warning',
        username,
        `Генератор пуст ${Math.round(idleFor / 1000)}с -> аварийно повторяю кнопку (${emptyTargetButtonRetryCount}/${EMPTY_TARGET_BUTTON_RETRY_LIMIT})`
      )

      const pressed = await pressEntryButton({ waitAfter: false })
      if (!pressed || !isMiningSessionReady(expectedSessionEpoch)) {
        return false
      }

      const burstPackets = await runBurstBreakWindow(expectedSessionEpoch, BURST_BREAK_WINDOW_MS)
      if (
        burstPackets > 0 ||
        (await waitForAnyMiningTarget(expectedSessionEpoch, ENTRY_BUTTON_CONFIRM_MS))
      ) {
        return true
      }

      addLog('warning', username, 'Аварийная кнопка нажата, но шахта всё ещё не подтвердила блоки')
      return false
    }

    async function tryRecoverUnloadedFarTargets(expectedSessionEpoch, snapshot) {
      if (
        positionConfirmed ||
        !isMiningSessionReady(expectedSessionEpoch) ||
        !snapshot?.all?.length ||
        !snapshot.all.every(target => target.state === 'unloaded')
      ) {
        return false
      }

      const nearestDistance = Math.min(
        ...snapshot.all.map(target =>
          Number.isFinite(target.distance) ? target.distance : Infinity
        )
      )
      if (!Number.isFinite(nearestDistance) || nearestDistance <= POSITION_FAR_DISTANCE) {
        return false
      }

      const now = Date.now()
      const lastProgressAt = lastBlockMinedAt || lastDigTime
      const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity
      if (!Number.isFinite(idleFor) || idleFor < EMPTY_TARGET_BUTTON_RETRY_MS) {
        return false
      }

      const confirmed = await confirmFarCoordinateState(expectedSessionEpoch, 'unloaded-targets')
      if (!confirmed.confirmed) {
        return false
      }

      reconnectBecauseCoordinateFar(confirmed.health, 'цели не загружены')
      return true
    }

    async function recoverEmptyMiningTargets(expectedSessionEpoch, reason) {
      const snapshot = buildMiningSnapshot(0)
      const emptyLogBefore = lastEmptyTargetsLogAt
      logEmptyTargetsDiagnostic(reason, snapshot)
      diagPositionSnapshot('empty-targets')
      if (lastEmptyTargetsLogAt !== emptyLogBefore) {
        diagEvent('recover-empty-targets', {
          reason,
          targets: snapshot.all.map(formatTargetSnapshot)
        })
      }

      if (await tryRecoverUnloadedFarTargets(expectedSessionEpoch, snapshot)) {
        return false
      }

      if (await tryRescueEmptyGenerator(expectedSessionEpoch, snapshot)) {
        return true
      }

      const burstPackets = await runBurstBreakWindow(
        expectedSessionEpoch,
        Math.min(BURST_BREAK_WINDOW_MS, 250)
      )
      if (burstPackets > 0) {
        return true
      }

      await waitAfterEmptyTargets()
      return true
    }

    async function recoverTransientMiningTargets(expectedSessionEpoch, snapshot) {
      if (isFastMiningAllowed() && snapshot?.transient?.length) {
        await ensureMiningLookAt()
        let sentPackets = 0
        for (const target of snapshot.transient) {
          if (!isMiningSessionReady(expectedSessionEpoch)) return false
          if (
            sendBreakPacketToTarget(target, { preemptive: false, repeats: TRANSIENT_BREAK_REPEATS })
          ) {
            sentPackets++
          }
        }

        if (sentPackets > 0) {
          lastDigTime = Date.now()
          try {
            bot.swingArm()
          } catch (error) {}
        }
      }

      const now = Date.now()
      const lastProgressAt = lastBlockMinedAt || lastDigTime
      const idleFor = lastProgressAt > 0 ? now - lastProgressAt : Infinity
      if (
        Number.isFinite(idleFor) &&
        idleFor >= MOVING_PISTON_LOG_AFTER_IDLE_MS &&
        now - lastMiningDiagnosticAt >= MINING_DIAGNOSTIC_INTERVAL_MS
      ) {
        logMiningDiagnostic(
          'warning',
          `Цели временно moving_piston, жду окно добычи: ${describeMiningTargets(5, snapshot)}`
        )
      }

      await sleep(MOVING_PISTON_WAIT_MS)
      return isMiningSessionReady(expectedSessionEpoch)
    }

    async function recoverUnreachableMiningTargets(expectedSessionEpoch, snapshot) {
      const burstPackets = await runBurstBreakWindow(
        expectedSessionEpoch,
        Math.min(BURST_BREAK_WINDOW_MS, 350)
      )
      if (burstPackets > 0) {
        return isMiningSessionReady(expectedSessionEpoch)
      }

      const standDelta = getStandDelta()
      if (standPosition && standDelta && standDelta.distance3d > maxDistance) {
        logMiningDiagnostic(
          'warning',
          `Цели вне досягаемости, бот смещён на ${standDelta.distance3d.toFixed(2)}м -> возвращаю на точку`
        )
        await returnToStandPosition()
        return isMiningSessionReady(expectedSessionEpoch)
      }

      const sample = snapshot.unreachable[0]
      if (sample) {
        logMiningDiagnostic(
          'warning',
          `Блоки есть, но копать их нельзя: ${formatTargetSnapshot(sample)}`
        )
      }

      await waitAfterEmptyTargets()
      return isMiningSessionReady(expectedSessionEpoch)
    }

    function getDigFailureKind(error) {
      if (isDigTimeoutError(error)) return 'timeout'

      const message = error && error.message ? error.message : String(error)
      if (message.includes('block is out of reach')) return 'unreachable'
      if (
        message.includes('digging aborted') ||
        message.includes('block no longer exists') ||
        message.includes('No block has been dug')
      ) {
        return 'stale'
      }

      return 'error'
    }

    function resetSessionState() {
      invalidateSession()
      setLifecycleState('connecting', 'reset-session')
      joinedSubserver = false
      spawnGraceUntil = 0
      isReturningToPosition = false
      waitingForFall = false
      initialY = null
      fallCheckPassed = false
      fallCheckActive = false
      limboSavedPhysicsEnabled = null
      positionConfirmed = false
      activeStandPosition = standPosition ? standPosition.clone() : null
      lastEntryButtonAttemptAt = 0
      entryButtonPressedThisJoin = false
      entryButtonPressedJoinSeq = 0
      entryButtonFlowRunning = false
      subserverJoinSeq = 0
      emptyTargetButtonRetryCount = 0
      lastEmptyTargetButtonRetryAt = 0
      lastBlockMinedAt = 0
      isOnline = false
      scannerHoldUntil = 0
      lastScannerLogAt = 0
      scannerWaitChallengeActive = false
      limboSuccessSeen = false
      lastLimboPositionPacket = null
      try {
        if (limboFallStartTimer) clearTimeout(limboFallStartTimer)
      } catch (e) {}
      limboFallStartTimer = null
      try {
        if (postLimboMenuWatchdogTimer) clearTimeout(postLimboMenuWatchdogTimer)
      } catch (e) {}
      postLimboMenuWatchdogTimer = null
      lastMiningDiagnosticAt = 0
      lastEmptyTargetsLogAt = 0
      lastMiningLookAt = 0
      lastReactiveBreakAt = 0
      lastPositionDiagnosticAt = 0
      diagnosticRepeatState.clear()
      lastMenuOpenAttemptAt = 0
      lastMenuAttempt = 0
      menuFlowQueued = false
      setMenuStage('idle', 'reset-session')
      packetOnlyStartedAt = 0
      packetBreakTracker.clear()
    }

    function disposeBotInstance() {
      cleanupTimers()
      resetSessionState()
      reconnectScheduled = false
      reconnectReason = ''
      try {
        if (bot) bot.removeAllListeners()
      } catch (e) {}
      try {
        if (bot) bot.quit()
      } catch (e) {}
      bot = null
    }

    function cleanupActiveSessionTimers(source = 'session-cleanup') {
      try {
        if (menuTimer) clearTimeout(menuTimer)
      } catch (e) {}
      try {
        if (positionCheckTimer) clearInterval(positionCheckTimer)
      } catch (e) {}
      try {
        if (positionCheckStartTimer) clearTimeout(positionCheckStartTimer)
      } catch (e) {}
      try {
        if (fallCheckTimer) clearTimeout(fallCheckTimer)
      } catch (e) {}
      try {
        if (limboFallStartTimer) clearTimeout(limboFallStartTimer)
      } catch (e) {}
      try {
        if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer)
      } catch (e) {}
      try {
        if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer)
      } catch (e) {}
      try {
        if (keepAliveTimer) clearInterval(keepAliveTimer)
      } catch (e) {}
      try {
        if (fullServerRetryTimer) clearTimeout(fullServerRetryTimer)
      } catch (e) {}
      try {
        if (postJoinStartTimer) clearTimeout(postJoinStartTimer)
      } catch (e) {}
      try {
        if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer)
      } catch (e) {}
      try {
        if (menuFlowWakeTimer) clearTimeout(menuFlowWakeTimer)
      } catch (e) {}
      try {
        if (postLimboMenuWatchdogTimer) clearTimeout(postLimboMenuWatchdogTimer)
      } catch (e) {}
      try {
        restoreLimboPhysics(source)
      } catch (e) {}

      menuTimer = null
      positionCheckTimer = null
      positionCheckStartTimer = null
      fallCheckTimer = null
      limboFallStartTimer = null
      limboFallIntervalTimer = null
      limboFallTimeoutTimer = null
      keepAliveTimer = null
      fullServerRetryTimer = null
      postJoinStartTimer = null
      entryButtonWatchdogTimer = null
      menuFlowWakeTimer = null
      postLimboMenuWatchdogTimer = null
      menuFlowWakeDueAt = 0
      menuFlowRunning = false
      menuFlowQueued = false
      entryButtonFlowRunning = false
      retryingFullServer = false
      fallCheckActive = false
    }

    function cleanupTimers() {
      try {
        if (menuTimer) clearTimeout(menuTimer)
      } catch (e) {}
      try {
        if (reconnectTimer) clearTimeout(reconnectTimer)
      } catch (e) {}
      try {
        if (reconnectGraceTimer) clearTimeout(reconnectGraceTimer)
      } catch (e) {}
      try {
        if (positionCheckTimer) clearInterval(positionCheckTimer)
      } catch (e) {}
      try {
        if (positionCheckStartTimer) clearTimeout(positionCheckStartTimer)
      } catch (e) {}
      try {
        if (fallCheckTimer) clearTimeout(fallCheckTimer)
      } catch (e) {}
      try {
        if (limboFallStartTimer) clearTimeout(limboFallStartTimer)
      } catch (e) {}
      try {
        if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer)
      } catch (e) {}
      try {
        if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer)
      } catch (e) {}
      try {
        if (keepAliveTimer) clearInterval(keepAliveTimer)
      } catch (e) {}
      try {
        if (fullServerRetryTimer) clearTimeout(fullServerRetryTimer)
      } catch (e) {}
      try {
        if (postJoinStartTimer) clearTimeout(postJoinStartTimer)
      } catch (e) {}
      try {
        if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer)
      } catch (e) {}
      try {
        if (recreateRetryTimer) clearTimeout(recreateRetryTimer)
      } catch (e) {}
      try {
        if (menuFlowWakeTimer) clearTimeout(menuFlowWakeTimer)
      } catch (e) {}
      try {
        if (postLimboMenuWatchdogTimer) clearTimeout(postLimboMenuWatchdogTimer)
      } catch (e) {}
      try {
        restoreLimboPhysics('cleanup')
      } catch (e) {}
      menuTimer = null
      reconnectTimer = null
      reconnectGraceTimer = null
      positionCheckTimer = null
      positionCheckStartTimer = null
      fallCheckTimer = null
      limboFallStartTimer = null
      limboFallIntervalTimer = null
      limboFallTimeoutTimer = null
      keepAliveTimer = null
      fullServerRetryTimer = null
      postJoinStartTimer = null
      entryButtonWatchdogTimer = null
      recreateRetryTimer = null
      menuFlowWakeTimer = null
      postLimboMenuWatchdogTimer = null
      menuFlowWakeDueAt = 0
      menuFlowRunning = false
      menuFlowQueued = false
      entryButtonFlowRunning = false
      reconnectScheduled = false
      reconnectDueAt = 0
      reconnectReason = ''
      retryingFullServer = false
      fallCheckActive = false
    }

    async function pressEntryButton(options = {}) {
      const waitAfter = options.waitAfter !== false
      if (!entryButtonPosition || !bot || !bot.entity || !joinedSubserver) {
        diagEvent('entry-button-skip', {
          waitAfter,
          hasEntryButton: Boolean(entryButtonPosition),
          hasBot: Boolean(bot),
          hasEntity: Boolean(bot?.entity),
          joinedSubserver
        })
        return false
      }

      const now = Date.now()
      if (now - lastEntryButtonAttemptAt < ENTRY_BUTTON_RETRY_INTERVAL_MS) {
        diagEvent('entry-button-throttled', {
          sinceLastAttemptMs: now - lastEntryButtonAttemptAt,
          retryIntervalMs: ENTRY_BUTTON_RETRY_INTERVAL_MS
        })
        return false
      }
      lastEntryButtonAttemptAt = now

      let lastError = 'unknown error'

      for (let attempt = 1; attempt <= 6; attempt++) {
        if (!bot || !bot.entity || !joinedSubserver) return false

        const buttonBlock = bot.blockAt(entryButtonPosition)
        diagEvent('entry-button-attempt', {
          attempt,
          waitAfter,
          buttonPosition: entryButtonPosition,
          buttonBlock: buttonBlock
            ? { name: buttonBlock.name, type: buttonBlock.type, position: buttonBlock.position }
            : null
        })
        if (!buttonBlock || buttonBlock.type === 0) {
          lastError = 'button block not found'
          await sleep(250)
          continue
        }

        const targetPosition = buttonBlock.position.offset(0.5, 0.5, 0.5)
        const distance = bot.entity.position.distanceTo(targetPosition)
        if (distance > 4.7) {
          addLog('warning', username, `Кнопка генератора слишком далеко: ${distance.toFixed(2)}м`)
          diagEvent('entry-button-too-far', { distance, targetPosition })
          return false
        }

        try {
          addLog(
            'info',
            username,
            `Нажимаю кнопку генератора (${entryButtonPosition.x}, ${entryButtonPosition.y}, ${entryButtonPosition.z})`
          )
          await bot.lookAt(targetPosition, true)
          await sleep(40 + Math.floor(Math.random() * 40))
          await bot.activateBlock(buttonBlock)
          if (waitAfter && ENTRY_BUTTON_AFTER_PRESS_WAIT_MS > 0) {
            await sleep(ENTRY_BUTTON_AFTER_PRESS_WAIT_MS)
          }
          addLog('success', username, 'Кнопка генератора нажата')
          diagEvent('entry-button-pressed', { attempt, distance })
          return true
        } catch (error) {
          lastError = error.message
          diagEvent('entry-button-error', { attempt, error })
          await sleep(200)
        }
      }

      addLog('warning', username, `Не удалось нажать кнопку генератора: ${lastError}`)
      diagEvent('entry-button-failed', { lastError })
      return false
    }

    async function pressEntryButtonOnJoin(expectedSessionEpoch) {
      if (!entryButtonPosition) return { pressed: true, confirmed: true }

      for (let attempt = 1; attempt <= ENTRY_BUTTON_STARTUP_ATTEMPTS; attempt++) {
        diagEvent('entry-button-join-attempt', {
          attempt,
          maxAttempts: ENTRY_BUTTON_STARTUP_ATTEMPTS
        })
        if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) {
          return { pressed: false, confirmed: false }
        }

        const pressed = await pressEntryButton({ waitAfter: false })
        if (pressed) {
          const burstPackets = await runBurstBreakWindow(
            expectedSessionEpoch,
            BURST_BREAK_WINDOW_MS
          )
          diagEvent('entry-button-join-pressed', { attempt, burstPackets })
          if (
            burstPackets > 0 ||
            (await waitForAnyMiningTarget(expectedSessionEpoch, ENTRY_BUTTON_CONFIRM_MS))
          ) {
            return { pressed: true, confirmed: true }
          }
          addLog(
            'warning',
            username,
            'Кнопка генератора нажата, но реакция шахты не подтверждена; продолжаю без повторного клика'
          )
          return { pressed: true, confirmed: false }
        }

        if (attempt < ENTRY_BUTTON_STARTUP_ATTEMPTS) {
          addLog(
            'warning',
            username,
            `Кнопка генератора не нажалась, повтор старта ${attempt + 1}/${ENTRY_BUTTON_STARTUP_ATTEMPTS}`
          )
          await sleep(ENTRY_BUTTON_STARTUP_RETRY_MS)
        }
      }

      addLog('warning', username, 'Кнопка генератора не нажалась после входа')
      return { pressed: false, confirmed: false }
    }

    async function runEntryButtonFlow(expectedSessionEpoch, source = 'postjoin') {
      diagEvent('entry-button-flow-start', { source })
      if (!entryButtonPosition) {
        entryButtonPressedThisJoin = true
        entryButtonPressedJoinSeq = subserverJoinSeq
        diagEvent('entry-button-flow-no-button-configured', { source })
        return true
      }

      if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) {
        diagEvent('entry-button-flow-not-ready', { source, expectedSessionEpoch })
        return false
      }

      if (isEntryButtonPressedForCurrentJoin()) {
        diagEvent('entry-button-flow-already-ready', { source })
        return true
      }

      if (entryButtonFlowRunning) {
        diagEvent('entry-button-flow-already-running', { source })
        return false
      }

      entryButtonFlowRunning = true
      try {
        const result = await pressEntryButtonOnJoin(expectedSessionEpoch)
        if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) {
          return false
        }

        if (result?.pressed) {
          entryButtonPressedThisJoin = true
          entryButtonPressedJoinSeq = subserverJoinSeq
          try {
            if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer)
          } catch (e) {}
          entryButtonWatchdogTimer = null
          diagEvent('entry-button-flow-success', { source, result })
          return true
        }

        if (source === 'watchdog') {
          addLog(
            'warning',
            username,
            'Post-join кнопка генератора всё ещё не нажата, оставляю повтор'
          )
        }
        return false
      } catch (error) {
        addLog('warning', username, `Ошибка автокнопки: ${error.message}`)
        diagEvent('entry-button-flow-error', { source, error })
        return false
      } finally {
        entryButtonFlowRunning = false
      }
    }

    function scheduleEntryButtonWatchdog(expectedSessionEpoch) {
      if (!entryButtonPosition || isEntryButtonPressedForCurrentJoin() || !joinedSubserver || !bot)
        return
      try {
        if (entryButtonWatchdogTimer) clearTimeout(entryButtonWatchdogTimer)
      } catch (e) {}

      entryButtonWatchdogTimer = setTimeout(async () => {
        entryButtonWatchdogTimer = null
        if (!entryButtonPosition || isEntryButtonPressedForCurrentJoin()) return
        if (!isCurrentSession(expectedSessionEpoch) || !joinedSubserver || !bot) return

        addLog(
          'warning',
          username,
          'Кнопка генератора не была нажата после входа -> повторяю post-join'
        )
        const pressed = await runEntryButtonFlow(expectedSessionEpoch, 'watchdog')
        if (pressed && isCurrentSession(expectedSessionEpoch) && joinedSubserver && bot) {
          startDiggingLoop(expectedSessionEpoch).catch(() => {})
          return
        }

        if (
          !pressed &&
          isCurrentSession(expectedSessionEpoch) &&
          joinedSubserver &&
          bot &&
          !isEntryButtonPressedForCurrentJoin()
        ) {
          scheduleEntryButtonWatchdog(expectedSessionEpoch)
        }
      }, ENTRY_BUTTON_WATCHDOG_MS)
    }

    function schedulePostJoinFlow() {
      if (!joinedSubserver || !bot) return
      const flowSessionEpoch = sessionEpoch

      if (standPosition) {
        startPositionCheck()
      }

      scheduleEntryButtonWatchdog(flowSessionEpoch)

      try {
        if (postJoinStartTimer) clearTimeout(postJoinStartTimer)
      } catch (e) {}
      postJoinStartTimer = null

      postJoinStartTimer = setTimeout(
        async () => {
          postJoinStartTimer = null
          if (!isCurrentSession(flowSessionEpoch) || !joinedSubserver || !bot) return
          const buttonReady = await runEntryButtonFlow(flowSessionEpoch, 'postjoin')
          if (
            !isCurrentSession(flowSessionEpoch) ||
            !joinedSubserver ||
            !bot ||
            hasReconnectPendingLocal()
          )
            return
          if (!buttonReady) {
            addLog(
              'warning',
              username,
              'Кнопка генератора не нажата после входа - добычу не запускаю до повтора'
            )
            scheduleEntryButtonWatchdog(flowSessionEpoch)
            return
          }
          startDiggingLoop(flowSessionEpoch).catch(() => {})
        },
        POST_JOIN_DIG_START_MS + Math.floor(Math.random() * 25)
      )
    }

    // ============================================================================
    // ============================================================================
    function startKeepAliveMonitor() {
      if (keepAliveTimer) clearInterval(keepAliveTimer)

      keepAliveTimer = setInterval(() => {
        if (!bot || !bot._client || !joinedSubserver) return
        const now = Date.now()

        const timeSinceLastKeepAlive = now - lastKeepAlive

        if (timeSinceLastKeepAlive > 25000) {
          addLog(
            'warning',
            username,
            `! Нет keep-alive ${Math.round(timeSinceLastKeepAlive / 1000)}с`
          )

          if (timeSinceLastKeepAlive > 28000 && getReconnectGraceDelay() <= 0) {
            addLog('error', username, 'Keep-alive таймаут -> перезапуск')
            diagEvent('keepalive-timeout', { timeSinceLastKeepAlive })
            cleanupTimers()
            updateBotStatus(username, 'ожидание')
            scheduleReconnectLocal(5000, false, 'keepalive-timeout')
          }
        }
      }, 5000)
    }

    // ============================================================================
    // ============================================================================
    async function walkToActiveStandPosition() {
      const initialDelta = getStandDelta()
      if (!initialDelta) return false

      if (initialDelta.distance3d <= maxDistance) {
        return true
      }

      addLog(
        'warning',
        username,
        `Отошёл от рабочей точки на ${initialDelta.distance3d.toFixed(2)}м (лимит ${maxDistance}м), возвращаюсь`
      )
      updateBotStatus(username, 'возврат')
      isReturningToPosition = true

      try {
        bot.clearControlStates()

        const timeout = Date.now() + POSITION_RETURN_TIMEOUT
        let stuck = 0

        while (bot && bot.entity && joinedSubserver) {
          const currentHealth = getCoordinateHealthSnapshot()
          if (acceptHealthyCoordinateSnapshot(currentHealth, 'return-loop')) {
            break
          }

          const currentDelta = getStandDelta()
          if (!currentDelta || currentDelta.distance3d <= maxDistance) {
            break
          }

          if (Date.now() > timeout) {
            addLog(
              'warning',
              username,
              `Таймаут возврата: ${describeCoordinateHealth(currentHealth)}`
            )
            break
          }

          if (currentDelta.distance2d > 0.05) {
            const yaw = Math.atan2(-currentDelta.dx, -currentDelta.dz)
            bot.look(yaw, 0, true)
            bot.setControlState('forward', true)

            const oldPos = bot.entity.position.clone()
            await sleep(200)
            if (bot.entity.position.distanceTo(oldPos) < 0.1) {
              stuck++
              if (stuck > 5) {
                bot.setControlState('jump', true)
                await sleep(100)
                bot.setControlState('jump', false)
                stuck = 0
              }
            } else {
              stuck = 0
            }
          } else {
            bot.clearControlStates()
            await sleep(100)
          }
        }

        bot.clearControlStates()
        const finalHealth = getCoordinateHealthSnapshot()
        if (!acceptHealthyCoordinateSnapshot(finalHealth, 'return-final')) {
          addLog(
            'warning',
            username,
            `Не смог подтвердить рабочую позицию после возврата: ${describeCoordinateHealth(finalHealth)}`
          )
          return false
        }

        addLog('success', username, 'Рабочая позиция подтверждена')
        return true
      } catch (error) {
        addLog('error', username, `Ошибка возврата: ${error.message}`)
        return false
      } finally {
        isReturningToPosition = false
        if (bot && bot.entity && joinedSubserver) {
          updateBotStatus(username, 'ожидание')
        }
      }
    }

    async function returnToStandPosition() {
      if (!standPosition || !bot || !bot.entity || !joinedSubserver || isReturningToPosition) {
        return false
      }

      const health = getCoordinateHealthSnapshot()
      if (acceptHealthyCoordinateSnapshot(health, 'position-return')) {
        return true
      }

      if (isCoordinateHealthFarFromWorkArea(health)) {
        const confirmed = await confirmFarCoordinateState(sessionEpoch, 'position-return')
        if (!confirmed.confirmed) {
          return true
        }

        reconnectBecauseCoordinateFar(confirmed.health, 'возврат к точке')
        return false
      }

      return walkToActiveStandPosition()
    }

    async function waitForPostJoinPosition(expectedSessionEpoch) {
      if (!standPosition || POST_JOIN_POSITION_GRACE_MS <= 0) {
        return true
      }

      const initialHealth = getCoordinateHealthSnapshot()
      if (acceptHealthyCoordinateSnapshot(initialHealth, 'postjoin-initial')) {
        return true
      }

      addLog(
        'info',
        username,
        `Жду подтверждение координат после входа: ${describeCoordinateHealth(initialHealth)}`
      )
      const deadline = Date.now() + POST_JOIN_POSITION_GRACE_MS

      while (Date.now() <= deadline) {
        if (
          !isCurrentSession(expectedSessionEpoch) ||
          !bot ||
          !bot.entity ||
          !joinedSubserver ||
          hasReconnectPendingLocal()
        ) {
          return false
        }

        const currentHealth = getCoordinateHealthSnapshot()
        if (acceptHealthyCoordinateSnapshot(currentHealth, 'postjoin-wait')) {
          return true
        }

        await sleep(250)
      }

      const confirmed = await confirmFarCoordinateState(expectedSessionEpoch, 'postjoin-timeout')
      if (confirmed.confirmed) {
        reconnectBecauseCoordinateFar(confirmed.health, 'postjoin')
        return false
      }

      return true
    }

    async function checkAndReturnToPosition() {
      if (
        !standPosition ||
        !bot ||
        !bot.entity ||
        !joinedSubserver ||
        isReturningToPosition ||
        !positionConfirmed
      )
        return

      diagPositionSnapshot('position-watchdog')
      const health = getCoordinateHealthSnapshot()
      if (acceptHealthyCoordinateSnapshot(health, 'position-watchdog')) {
        return
      }

      if (isCoordinateHealthFarFromWorkArea(health)) {
        const confirmed = await confirmFarCoordinateState(sessionEpoch, 'position-watchdog')
        if (!confirmed.confirmed) {
          return
        }

        reconnectBecauseCoordinateFar(confirmed.health, 'watchdog')
        return
      }

      if (health.standDistance > maxDistance) {
        await returnToStandPosition()
      }
    }

    function startPositionCheck() {
      if (!standPosition || !joinedSubserver || positionCheckTimer || positionCheckStartTimer)
        return

      positionCheckStartTimer = setTimeout(() => {
        positionCheckStartTimer = null
        if (!joinedSubserver || positionCheckTimer) return

        positionCheckTimer = setInterval(() => {
          checkAndReturnToPosition().catch(() => {})
        }, POSITION_CHECK_INTERVAL)

        addLog('info', username, 'Проверка позиции активирована')
      }, 30000)
    }

    // ============================================================================
    // ============================================================================
    function writeClientPacket(packetName, payload, source) {
      if (!bot?._client) return false
      try {
        bot._client.write(packetName, payload)
        diagEvent(`client-write:${packetName}`, {
          source,
          payload: summarizeClientPacketPayload(payload)
        })
        return true
      } catch (error) {
        diagEvent(`client-write-error:${packetName}`, { source, error })
        return false
      }
    }

    function sendClientIdentityPackets(source = 'limbo') {
      for (const { packetName, payload } of createClientIdentityPackets()) {
        writeClientPacket(packetName, payload, source)
      }
    }

    function confirmLimboTeleport(teleportId, source = 'limbo-position') {
      const payload = createTeleportConfirmPayload(teleportId)
      if (!payload) return false
      return writeClientPacket('teleport_confirm', payload, source)
    }

    function pauseLimboPhysics(source = 'limbo') {
      if (!bot) return
      try {
        if (limboSavedPhysicsEnabled === null) {
          limboSavedPhysicsEnabled = bot.physicsEnabled
        }
        bot.physicsEnabled = false
        bot.clearControlStates()
        diagEvent('limbo-physics-paused', { source, previous: limboSavedPhysicsEnabled })
      } catch (error) {
        diagEvent('limbo-physics-pause-error', { source, error })
      }
    }

    function restoreLimboPhysics(source = 'limbo') {
      if (!bot || limboSavedPhysicsEnabled === null) return
      try {
        bot.physicsEnabled = limboSavedPhysicsEnabled
        diagEvent('limbo-physics-restored', { source, restored: limboSavedPhysicsEnabled })
      } catch (error) {
        diagEvent('limbo-physics-restore-error', { source, error })
      } finally {
        limboSavedPhysicsEnabled = null
      }
    }

    function clearLimboTimers() {
      try {
        if (fallCheckTimer) clearTimeout(fallCheckTimer)
      } catch (error) {}
      try {
        if (limboFallStartTimer) clearTimeout(limboFallStartTimer)
      } catch (error) {}
      try {
        if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer)
      } catch (error) {}
      try {
        if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer)
      } catch (error) {}
      fallCheckTimer = null
      limboFallStartTimer = null
      limboFallIntervalTimer = null
      limboFallTimeoutTimer = null
    }

    function completeLimboWait(source, details = {}) {
      if (joinedSubserver) return
      clearLimboTimers()
      restoreLimboPhysics(source)
      waitingForFall = false
      fallCheckPassed = true
      fallCheckActive = false
      initialY = null
      setLifecycleState('joining', source, { limboComplete: true })
      diagEvent('limbo-complete-local', { source, ...details })
    }

    function startActiveFallCheck(start = {}) {
      const source = start.source || 'unknown'
      const canRunFallCheck = Boolean(
        FEATURE_ACTIVE_FALL_CHECK_ENABLED &&
        (scannerWaitChallengeActive ||
          source === 'scanner-recent-position' ||
          source === 'scanner-position-packet')
      )
      if (!canRunFallCheck) {
        diagEvent('limbo-active-fall-disabled', { source: start.source || 'unknown' })
        return false
      }
      if (!bot || !bot._client || fallCheckActive || fallCheckPassed || joinedSubserver) return
      const fallSessionEpoch = sessionEpoch
      const startX = Number(start.x)
      const rawStartY = Number(start.y)
      const startY = rawStartY
      const startZ = Number(start.z)
      const teleportId = Number(start.teleportId)
      if (
        !Number.isFinite(startX) ||
        !Number.isFinite(startY) ||
        !Number.isFinite(startZ) ||
        !Number.isFinite(teleportId)
      ) {
        diagEvent('limbo-fall-start-rejected', {
          source,
          reason: 'missing-server-position-packet',
          start
        })
        return false
      }

      clearLimboTimers()
      pauseLimboPhysics(source)
      sendClientIdentityPackets(source)
      confirmLimboTeleport(teleportId, source)

      waitingForFall = true
      fallCheckPassed = false
      fallCheckActive = true
      initialY = startY
      setLifecycleState('botfilter', source, { fallCheckActive: true })

      let tick = 0
      let currentY = startY
      const startedAt = Date.now()
      const finishPacketTicks = getFinishPacketTicks(LIMBO_FALL_TICKS)
      const expectedTotalMs = Math.max(
        getMinimumCheckMs({ fallingCheckTicks: LIMBO_FALL_TICKS, packetMs: LIMBO_FALL_PACKET_MS }),
        finishPacketTicks * LIMBO_FALL_PACKET_MS
      )

      addLog(
        'info',
        username,
        `LimboFilter - ванильная траектория (${LIMBO_FALL_TICKS}т/${LIMBO_FALL_PACKET_MS}мс, X=${startX}, Y=${startY}, Z=${startZ})`
      )
      diagEvent('limbo-fall-start', {
        source: start.source,
        startX,
        startY,
        rawStartY,
        normalizedStartY: false,
        startZ,
        teleportId,
        ticks: LIMBO_FALL_TICKS,
        finishPacketTicks,
        packetMs: LIMBO_FALL_PACKET_MS,
        serverTimeoutMs: LIMBO_SERVER_TIMEOUT_MS
      })

      const finishFallSequence = () => {
        if (!isCurrentSession(fallSessionEpoch) || joinedSubserver || fallCheckPassed) return
        try {
          if (limboFallIntervalTimer) clearInterval(limboFallIntervalTimer)
        } catch (error) {}
        limboFallIntervalTimer = null
        fallCheckActive = false

        const elapsed = Date.now() - startedAt
        const totalFallen = initialY - currentY
        const responseWaitMs = Math.max(
          LIMBO_COMPLETION_GRACE_MS,
          LIMBO_SERVER_TIMEOUT_MS - elapsed + LIMBO_COMPLETION_GRACE_MS
        )
        addLog(
          'success',
          username,
          `OK LimboFilter fall: ${tick} тиков, упал ${totalFallen.toFixed(1)}м, жду ответ сервера ${responseWaitMs}мс`
        )
        diagEvent('limbo-fall-sequence-sent', {
          tick,
          totalFallen,
          elapsed,
          responseWaitMs,
          expectedTotalMs,
          currentY
        })

        try {
          if (limboFallTimeoutTimer) clearTimeout(limboFallTimeoutTimer)
        } catch (error) {}
        limboFallTimeoutTimer = setTimeout(() => {
          if (!isCurrentSession(fallSessionEpoch) || joinedSubserver || fallCheckPassed) return
          const delay = getBotFilterReconnectDelay('limbo-fall-response-timeout')
          logBotFilterReconnect('LimboFilter не ответил после fall-проверки', delay)
          diagEvent('limbo-fall-response-timeout', {
            tick,
            totalFallen,
            elapsed: Date.now() - startedAt,
            botPosition: bot?.entity?.position
          })
          updateBotStatus(username, 'ожидание')
          scheduleReconnectLocal(delay, true, 'limbo-fall-response-timeout')
          cleanupActiveSessionTimers('limbo-fall-response-timeout')
          waitingForFall = false
          fallCheckPassed = false
          fallCheckActive = false
          scannerWaitChallengeActive = false
          positionConfirmed = false
          try {
            if (bot?._client?.socket && !bot._client.socket.destroyed) {
              bot._client.socket.end()
            } else if (bot) {
              bot.quit()
            }
          } catch (error) {
            diagEvent('limbo-fall-timeout-close-error', { error })
          }
        }, responseWaitMs)
      }

      const sendFallTick = () => {
        if (
          !isCurrentSession(fallSessionEpoch) ||
          !bot ||
          !bot._client ||
          joinedSubserver ||
          fallCheckPassed
        ) {
          clearLimboTimers()
          fallCheckActive = false
          return
        }

        tick += 1
        const fallPacket = createFallPacket({ x: startX, y: startY, z: startZ }, tick)
        if (!fallPacket) {
          addLog('warning', username, `Ошибка расчёта Limbo position на тике ${tick}`)
          return
        }
        currentY = fallPacket.y

        const sent = writeClientPacket(
          'position',
          {
            x: fallPacket.x,
            y: fallPacket.y,
            z: fallPacket.z,
            onGround: false
          },
          'limbo-fall'
        )

        if (!sent) {
          addLog('warning', username, `Ошибка отправки Limbo position на тике ${tick}`)
        }

        if (
          tick === 1 ||
          tick === 5 ||
          tick === 10 ||
          tick % 20 === 0 ||
          tick === LIMBO_FALL_TICKS ||
          tick === finishPacketTicks
        ) {
          const fallen = initialY - currentY
          addLog(
            'info',
            username,
            `[Limbo ${tick}т] шаг ${fallPacket.fallStep.toFixed(3)}м, упал ${fallen.toFixed(1)}м`
          )
        }

        if (tick >= finishPacketTicks) {
          finishFallSequence()
        }
      }

      limboFallIntervalTimer = setInterval(sendFallTick, LIMBO_FALL_PACKET_MS)
      limboFallTimeoutTimer = setTimeout(
        () => {
          if (!isCurrentSession(fallSessionEpoch) || joinedSubserver || fallCheckPassed) return
          const delay = getBotFilterReconnectDelay('limbo-fall-hard-timeout')
          logBotFilterReconnect('LimboFilter fall hard-timeout', delay)
          scheduleReconnectLocal(delay, true, 'limbo-fall-hard-timeout')
        },
        Math.max(LIMBO_SERVER_TIMEOUT_MS, finishPacketTicks * LIMBO_FALL_PACKET_MS + 6000)
      )
      return true
    }

    function handleLimboPositionPacket(packet) {
      if (!scannerWaitChallengeActive) return
      if (!packet || joinedSubserver || fallCheckPassed) return
      const x = Number(packet.x)
      const y = Number(packet.y)
      const z = Number(packet.z)
      const teleportId = packet.teleportId ?? packet.teleportID ?? packet.teleport_id
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
      if (Number.isFinite(Number(teleportId))) {
        confirmLimboTeleport(teleportId, 'position-packet')
      }
      if (y < 128) {
        if (!joinedSubserver && !waitingForFall && !fallCheckActive && !bot?.currentWindow) {
          setTimeout(() => {
            openServerMenuItem('normal-position-fallback', { minIntervalMs: 500 }).catch(() => {})
          }, 250)
        }
        return
      }

      if (!waitingForFall) {
        waitingForFall = true
        fallCheckPassed = false
      }

      diagEvent('limbo-falling-position-detected', {
        x,
        y,
        z,
        teleportId,
        flags: packet.flags,
        yaw: packet.yaw,
        pitch: packet.pitch
      })
      startActiveFallCheck({ x, y, z, teleportId, source: 'scanner-position-packet' })
    }

    async function waitForLimboBeforeMenu(expectedSessionEpoch) {
      if (!waitingForFall || fallCheckPassed || joinedSubserver || LIMBO_MENU_WAIT_MS <= 0) {
        return true
      }

      const deadline = Date.now() + LIMBO_MENU_WAIT_MS
      diagEvent('menu-wait-limbo-start', { limboMenuWaitMs: LIMBO_MENU_WAIT_MS })

      while (
        isCurrentSession(expectedSessionEpoch) &&
        bot &&
        waitingForFall &&
        !fallCheckPassed &&
        !joinedSubserver &&
        Date.now() < deadline
      ) {
        await sleep(100)
      }

      const ready = !waitingForFall || fallCheckPassed || joinedSubserver
      diagEvent('menu-wait-limbo-end', { ready, waitingForFall, fallCheckPassed, joinedSubserver })
      return ready
    }

    function startLimboFilterBypass() {
      waitingForFall = false
      fallCheckPassed = false
      fallCheckActive = false
      sendClientIdentityPackets('spawn-identity')
      diagEvent('limbo-message-gated-mode', {
        limboDetectionTimeoutMs: LIMBO_DETECTION_TIMEOUT_MS,
        activeFallOnlyAfterMessage: true
      })
    }

    function scheduleReconnectLocal(
      delay = backoff,
      forcedReconnect = false,
      reason = 'unspecified'
    ) {
      diagEvent('reconnect-request', { delay, forcedReconnect, reason })
      if (isShuttingDown() || !isRuntimeEnabled()) {
        diagEvent('reconnect-ignored-runtime-stopped', { reason })
        return
      }

      if (reconnectScheduled) {
        const hasPendingReconnectTimer = reconnectTimer || reconnectGraceTimer || recreateRetryTimer
        if (hasPendingReconnectTimer) {
          diagEvent('reconnect-ignored-already-scheduled', { reason })
          return
        }
        reconnectScheduled = false
        reconnectDueAt = 0
        reconnectReason = ''
        addLog('warning', username, 'Reconnect-флаг завис без таймера -> ставлю reconnect заново')
      }

      if (!bot && !joinedSubserver && !forcedReconnect && !getActiveBots().includes(botHandle)) {
        diagEvent('reconnect-ignored-inactive-bot', { reason })
        return
      }

      if (isRotating) {
        isRotating = false
        diagEvent('reconnect-ignored-rotation', { reason })
        return
      }

      setLifecycleState('waiting-reconnect', reason, { delay, forcedReconnect })
      const reconnectHealthReason = classifyHealthEvent({ reason })
      if (reconnectHealthReason !== 'mining-ok') {
        setRuntimeHealth(reconnectHealthReason, {
          reconnectReason: reason,
          lastRecoveryAction: 'reconnect scheduled'
        })
      }
      reconnectScheduled = true
      reconnectReason = reason

      const graceDelay = getReconnectGraceDelay()
      if (graceDelay > 0 && !forcedReconnect) {
        reconnectScheduled = false
        reconnectReason = ''
        diagEvent('reconnect-delayed-by-grace', { reason, graceDelay })

        if (!reconnectGraceTimer) {
          reconnectGraceTimer = setTimeout(
            () => {
              reconnectGraceTimer = null
              scheduleReconnectLocal(delay, true, `${reason}:grace-expired`)
            },
            Math.min(graceDelay, 30000)
          )
        }
        return
      }

      const jitter = forcedReconnect
        ? Math.floor(Math.random() * 500)
        : Math.floor(Math.random() * 3000)
      reconnectDueAt = Date.now() + delay + jitter
      addLog('info', username, `Переподключение через ${Math.round((delay + jitter) / 1000)}с`)
      diagEvent('reconnect-scheduled', {
        delay,
        jitter,
        forcedReconnect,
        reason,
        dueInMs: delay + jitter
      })
      updateBotStatus(username, 'ожидание')

      reconnectTimer = setTimeout(() => {
        diagEvent('reconnect-start', { reason })
        setLifecycleState('connecting', reason)
        reconnectScheduled = false
        reconnectDueAt = 0
        reconnectReason = ''
        reconnectTimer = null

        cleanupTimers()
        resetSessionState()
        try {
          if (bot) {
            bot.removeAllListeners()
            bot.quit()
          }
        } catch (e) {}
        bot = null
        backoff = RECONNECT_REGULAR

        try {
          const index = getActiveBots().indexOf(botHandle)
          if (index === -1) {
            return
          }

          const newObj = createBot(cfg)

          getActiveBots()[index] = newObj
          addLog('success', username, 'Bot instance replaced')
          diagEvent('reconnect-replaced-instance', { reason })
        } catch (e) {
          addLog('error', username, `Ошибка создания: ${e.message}`)
          diagEvent('reconnect-create-error', { reason, error: e })
          reconnectScheduled = false
          reconnectReason = ''
          recreateRetryTimer = setTimeout(
            () => scheduleReconnectLocal(5000, true, `${reason}:create-retry`),
            5000
          )
        }
      }, delay + jitter)
    }

    function handleMidSessionWorldReset(packetName, packet, meta) {
      if (!joinedSubserver || hasReconnectPendingLocal() || isShuttingDown() || !isRuntimeEnabled())
        return

      const wasMining =
        digLoopRunning ||
        isEntryButtonPressedForCurrentJoin() ||
        positionConfirmed ||
        hasRecentMiningProgress(30000)
      const coordinateHealth = bot?.entity ? getCoordinateHealthSnapshot() : null
      const packetSummary =
        packet && typeof packet === 'object'
          ? {
              keys: Object.keys(packet).slice(0, 20),
              entityId: packet.entityId,
              worldName: packet.worldName,
              gameMode: packet.gameMode ?? packet.gamemode,
              previousGameMode: packet.previousGameMode ?? packet.previousGamemode,
              metaState: meta?.state
            }
          : packet
      diagEvent('mid-session-world-reset-detected', {
        packetName,
        wasMining,
        packet: packetSummary,
        meta: meta ? { name: meta.name, state: meta.state } : null,
        coordinateHealth
      })

      addLog(
        'warning',
        username,
        `Сервер сбросил мир во время добычи (${packetName}) -> быстрый перезаход`
      )
      updateBotStatus(username, 'ожидание')

      cleanupTimers()
      invalidateSession()
      positionConfirmed = false
      entryButtonPressedThisJoin = false
      entryButtonPressedJoinSeq = 0
      entryButtonFlowRunning = false
      emptyTargetButtonRetryCount = 0
      lastEmptyTargetButtonRetryAt = 0
      lastBlockMinedAt = 0
      packetOnlyStartedAt = 0

      scheduleReconnectLocal(1500, true, `mid-session-${packetName}`)
    }

    function rescheduleReconnectLocal(delay, reason) {
      try {
        if (reconnectTimer) clearTimeout(reconnectTimer)
      } catch (e) {}
      try {
        if (reconnectGraceTimer) clearTimeout(reconnectGraceTimer)
      } catch (e) {}
      try {
        if (recreateRetryTimer) clearTimeout(recreateRetryTimer)
      } catch (e) {}
      reconnectTimer = null
      reconnectGraceTimer = null
      recreateRetryTimer = null
      reconnectScheduled = false
      reconnectDueAt = 0
      reconnectReason = ''
      scheduleReconnectLocal(delay, true, reason)
    }

    function applyReconnectDecision(decision, source = 'reconnect-policy') {
      if (!decision || decision.action === 'ignore') return false

      if (Array.isArray(decision.logs)) {
        for (const entry of decision.logs) {
          addLog(entry.level || 'info', username, entry.message)
        }
      }

      if (decision.nextWaitKickCount !== undefined) {
        waitKickCount = decision.nextWaitKickCount
      }

      if (decision.stabilityCooldownReason) {
        activateStabilityCooldown(
          decision.stabilityCooldownReason,
          decision.stabilityCooldownMs ?? CONNECTION_STABILITY_COOLDOWN_MS
        )
      }

      if (decision.noteNoInternet) {
        noteNoInternetError()
      }

      if (decision.action === 'stability-only') {
        diagEvent('reconnect-policy-stability-only', { source, decision })
        return true
      }

      if (decision.action === 'bot-filter') {
        const delay = getBotFilterReconnectDelay(decision.botFilterReason)
        backoff = delay
        logBotFilterReconnect(decision.botFilterLogReason, delay)
        scheduleReconnectLocal(delay, true, decision.scheduleReason)
        return true
      }

      if (decision.action === 'schedule') {
        backoff = decision.delay
        scheduleReconnectLocal(decision.delay, decision.forced, decision.scheduleReason)
        return true
      }

      diagEvent('reconnect-policy-unknown-action', { source, decision })
      return false
    }

    function getMenuRecoveryDelay() {
      menuRecoveryCount += 1
      const rampMs = Math.min(
        MENU_RECOVERY_MAX_MS - MENU_RECOVERY_BASE_MS,
        Math.max(0, menuRecoveryCount - 1) * MENU_RECOVERY_STEP_MS
      )
      return MENU_RECOVERY_BASE_MS + rampMs + Math.floor(Math.random() * MENU_RECOVERY_JITTER_MS)
    }

    function scheduleMenuRecovery(reason = 'menu-attempt-limit') {
      const delay = getMenuRecoveryDelay()
      const currentWindow = bot?.currentWindow
        ? {
            id: bot.currentWindow.id,
            type: bot.currentWindow.type,
            title: String(bot.currentWindow.title || '').slice(0, 160)
          }
        : null
      const postLimboStuck = reason === 'post-limbo-menu-stuck'

      addLog(
        'warning',
        username,
        postLimboStuck
          ? `Вход после Limbo завис - быстрый перезаход через ${Math.round(delay / 1000)}с`
          : `Вход завис в лобби (${menuAttempts}/${MENU_ATTEMPT_LIMIT}) - быстрый перезаход через ${Math.round(delay / 1000)}с`
      )
      diagEvent('menu-fast-recovery', {
        reason,
        delay,
        menuAttempts,
        menuRecoveryCount,
        currentWindow
      })

      menuAttempts = 0
      lastMenuAttempt = 0
      lastMenuOpenAttemptAt = 0
      updateBotStatus(username, 'ожидание')
      rescheduleReconnectLocal(delay, reason)
    }

    function schedulePostLimboMenuWatchdog(expectedSessionEpoch, source = 'limbo-success') {
      try {
        if (postLimboMenuWatchdogTimer) clearTimeout(postLimboMenuWatchdogTimer)
      } catch (e) {}
      postLimboMenuWatchdogTimer = null

      if (joinedSubserver || hasReconnectPendingLocal() || POST_LIMBO_MENU_WATCHDOG_MS <= 0) return

      postLimboMenuWatchdogTimer = setTimeout(() => {
        postLimboMenuWatchdogTimer = null
        if (
          !isCurrentSession(expectedSessionEpoch) ||
          joinedSubserver ||
          hasReconnectPendingLocal() ||
          isShuttingDown() ||
          !isRuntimeEnabled() ||
          scannerHoldUntil > Date.now() ||
          scannerWaitChallengeActive ||
          waitingForFall ||
          fallCheckActive
        ) {
          return
        }

        diagEvent('post-limbo-menu-watchdog', {
          source,
          menuStage,
          menuAttempts,
          isOnline,
          currentWindow: bot?.currentWindow
            ? {
                id: bot.currentWindow.id,
                type: bot.currentWindow.type,
                title: String(bot.currentWindow.title || '').slice(0, 160)
              }
            : null
        })
        scheduleMenuRecovery('post-limbo-menu-stuck')
      }, POST_LIMBO_MENU_WATCHDOG_MS)
    }

    function handleTooManyPacketsNotice(source, rawText = '') {
      const decision = getReconnectDecision(
        { type: 'too-many-packets-notice', source },
        { random: Math.random }
      )
      diagEvent('too-many-packets-notice', {
        source,
        text: String(rawText || '').slice(0, 500),
        decision
      })

      updateBotStatus(username, 'ожидание')

      if (hasReconnectPendingLocal()) {
        if (String(reconnectReason || '').startsWith('mid-session-')) {
          diagEvent('too-many-packets-reschedule-mid-session', {
            source,
            currentReason: reconnectReason,
            delay: decision.delay,
            scheduleReason: decision.scheduleReason
          })
          rescheduleReconnectLocal(decision.delay, decision.scheduleReason)
          return
        }
        rescheduleReconnectLocal(decision.delay, decision.scheduleReason)
        return
      }

      cleanupTimers()
      invalidateSession()
      positionConfirmed = false
      entryButtonPressedThisJoin = false
      entryButtonPressedJoinSeq = 0
      entryButtonFlowRunning = false
      applyReconnectDecision(decision, 'too-many-packets-notice')
    }

    function isAlreadyAuthorizedMessage(text) {
      return Boolean(
        text.includes('уже авториз') ||
        text.includes('already authorized') ||
        text.includes('already logged') ||
        text.includes('вы недавно входили') ||
        text.includes('ввод пароля не требуется') ||
        text.includes('you recently logged in') ||
        text.includes('password is not required')
      )
    }

    function shouldSendLoginCommand(text) {
      if (!PASSWORD || isAlreadyAuthorizedMessage(text)) return false

      return Boolean(
        text.includes('/login') ||
        text.includes('введите пароль') ||
        text.includes('введи пароль') ||
        text.includes('авторизуйтесь') ||
        text.includes('необходимо авториз') ||
        text.includes('please login') ||
        text.includes('please log in') ||
        text.includes('login with') ||
        text.includes('use /login')
      )
    }

    function isLimboSuccessText(text) {
      const normalized = String(text || '').toLowerCase()
      return Boolean(
        normalized.includes('отслеживается') ||
        normalized.includes('проверка завершена') ||
        normalized.includes('проверка успешно пройдена') ||
        normalized.includes('successfully passed') ||
        normalized.includes('passed bot-filter') ||
        normalized.includes('passed the bot-filter') ||
        normalized.includes('успешно прош') ||
        normalized.includes('успешно пройд')
      )
    }

    function maybeSendLoginCommand(rawText, text) {
      if (!shouldSendLoginCommand(text)) return

      const now = Date.now()
      if (now - lastLoginCommandAt < LOGIN_COMMAND_COOLDOWN_MS) {
        diagEvent('login-command-throttled', {
          ageMs: now - lastLoginCommandAt,
          cooldownMs: LOGIN_COMMAND_COOLDOWN_MS,
          text: String(rawText || '').slice(0, 300)
        })
        return
      }

      lastLoginCommandAt = now
      try {
        bot.chat(`/login ${PASSWORD}`)
        diagEvent('login-command-sent', { text: String(rawText || '').slice(0, 300) })
      } catch (error) {
        diagEvent('login-command-error', { error })
      }
    }

    function rememberLimboPositionPacket(packet) {
      if (!packet || typeof packet !== 'object') return
      const x = Number(packet.x)
      const y = Number(packet.y)
      const z = Number(packet.z)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
      const teleportId = packet.teleportId ?? packet.teleportID ?? packet.teleport_id
      lastLimboPositionPacket = {
        x,
        y,
        z,
        teleportId,
        at: Date.now()
      }
      if (
        !joinedSubserver &&
        !scannerWaitChallengeActive &&
        !fallCheckActive &&
        !fallCheckPassed &&
        FEATURE_ACTIVE_FALL_CHECK_ENABLED &&
        y >= 128
      ) {
        confirmLimboTeleport(teleportId, 'limbo-position-prep')
        sendClientIdentityPackets('limbo-position-prep')
        pauseLimboPhysics('limbo-position-prep')
        if (!fallCheckTimer) {
          fallCheckTimer = setTimeout(() => {
            fallCheckTimer = null
            if (!scannerWaitChallengeActive && !fallCheckActive && !joinedSubserver) {
              restoreLimboPhysics('limbo-position-prep-timeout')
            }
          }, LIMBO_DETECTION_TIMEOUT_MS)
        }
      }
    }

    function getBotFilterReconnectDelay(reason = 'bot-filter') {
      const now = Date.now()
      const decision = calculateBotFilterReconnectDelay({
        reason,
        retryCount: botFilterRetryCount,
        lastFailureAt: botFilterLastFailureAt,
        now,
        retryBaseMs: BOT_FILTER_RETRY_BASE_MS,
        retryMaxMs: BOT_FILTER_RETRY_MAX_MS,
        fallAttemptsBeforeHold: BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD,
        fallHoldMs: BOT_FILTER_FALL_HOLD_MS
      })

      botFilterRetryCount = decision.retryCount
      botFilterLastFailureAt = decision.lastFailureAt
      botFilterRetryStates.set(username, {
        retryCount: botFilterRetryCount,
        lastFailureAt: botFilterLastFailureAt
      })

      if (decision.fallHoldActive) {
        diagEvent('bot-filter-fall-hold', {
          reason,
          retry: botFilterRetryCount,
          delay: decision.delay,
          threshold: BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD
        })
        return decision.delay
      }

      diagEvent('bot-filter-reconnect-delay', {
        reason,
        retry: botFilterRetryCount,
        delay: decision.delay
      })

      return decision.delay
    }

    function handleScannerWaitChallenge(rawText, source = 'server-message', evidence = null) {
      if (joinedSubserver || hasReconnectPendingLocal()) return
      const challengeSessionEpoch = sessionEpoch
      setLifecycleState('botfilter', source, { challenge: 'fall-wait' })
      setRuntimeHealth('botfilter-hold', {
        lastRecoveryAction: 'waiting fall-check position',
        diagnosis: 'Бот проходит fall-проверку BotFilter/LimboFilter.'
      })
      scannerWaitChallengeActive = true
      waitingForFall = true
      fallCheckPassed = false
      fallCheckActive = false
      try {
        if (limboFallStartTimer) clearTimeout(limboFallStartTimer)
      } catch (error) {}
      limboFallStartTimer = null

      const waitMs = SCANNER_POSITION_WAIT_MS
      const recentPositionAgeMs = lastLimboPositionPacket?.at
        ? Date.now() - lastLimboPositionPacket.at
        : Infinity
      const hasRecentPosition = Boolean(
        lastLimboPositionPacket &&
        Number.isFinite(recentPositionAgeMs) &&
        recentPositionAgeMs <= SCANNER_RECENT_POSITION_MS
      )
      addLog(
        'warning',
        username,
        `BotFilter: тип проверки = fall-проверка, жду position-пакет до ${Math.round(waitMs / 1000)}с`
      )
      recordTimelineEvent({
        type: 'botfilter',
        severity: 'warning',
        botName: username,
        reason: 'fall-wait',
        source,
        message: evidence?.text || rawText
      })
      diagEvent('bot-filter-classified', {
        type: 'fall-wait',
        source,
        waitMs,
        passiveWaitLimitMs: SCANNER_PASSIVE_WAIT_MS,
        recentPositionWindowMs: SCANNER_RECENT_POSITION_MS,
        recentPositionAgeMs: Number.isFinite(recentPositionAgeMs) ? recentPositionAgeMs : null,
        recentPosition: lastLimboPositionPacket,
        evidence,
        text: String(rawText || '').slice(0, 500)
      })

      const startedFromRecentPosition = hasRecentPosition
        ? startActiveFallCheck({
            ...lastLimboPositionPacket,
            source: 'scanner-recent-position'
          })
        : false

      diagEvent('scanner-wait-position-packet', {
        source,
        waitMs,
        passiveWait: false,
        activeFallStarted: startedFromRecentPosition,
        recentPositionAgeMs: Number.isFinite(recentPositionAgeMs) ? recentPositionAgeMs : null
      })

      if (startedFromRecentPosition) {
        return
      }

      limboFallStartTimer = setTimeout(() => {
        limboFallStartTimer = null
        if (
          !isCurrentSession(challengeSessionEpoch) ||
          joinedSubserver ||
          hasReconnectPendingLocal() ||
          !scannerWaitChallengeActive ||
          fallCheckPassed
        ) {
          return
        }
        if (fallCheckActive) return

        const delay = getBotFilterReconnectDelay('scanner-position-missing')
        logBotFilterReconnect('BotFilter не прислал position-пакет для fall-проверки', delay)
        diagEvent('scanner-position-missing', {
          source,
          waitMs,
          botPosition: bot?.entity?.position,
          text: String(rawText || '').slice(0, 500)
        })

        updateBotStatus(username, 'ожидание')
        scheduleReconnectLocal(delay, true, 'scanner-position-missing')
        cleanupActiveSessionTimers('scanner-position-missing')
        waitingForFall = false
        fallCheckPassed = false
        scannerWaitChallengeActive = false
        isOnline = false
        positionConfirmed = false

        try {
          if (bot?._client?.socket && !bot._client.socket.destroyed) {
            bot._client.socket.end()
          } else if (bot) {
            bot.quit()
          }
        } catch (error) {
          diagEvent('scanner-position-missing-close-error', { error })
        }
      }, waitMs)
    }

    function handleChatCaptchaChallenge(rawText, source = 'server-message', evidence = null) {
      const now = Date.now()
      setLifecycleState('held', source, { challenge: 'chat-captcha' })
      setRuntimeHealth('chat-captcha-hold', {
        lastRecoveryAction: '30-minute captcha hold',
        diagnosis: `Чат-капча обнаружена, бот ждёт ${Math.round(CHAT_CAPTCHA_RECONNECT_MS / 60000)} минут перед новым входом.`
      })
      scannerHoldUntil = Math.max(scannerHoldUntil, now + CHAT_CAPTCHA_RECONNECT_MS)
      setMenuStage('chat-captcha-hold', source)

      if (now - lastScannerLogAt >= 30000) {
        lastScannerLogAt = now
        addLog(
          'warning',
          username,
          `BotFilter: тип проверки = чат-капча, перезаход через ${Math.round(CHAT_CAPTCHA_RECONNECT_MS / 60000)} минут`
        )
      }
      diagEvent('chat-captcha-reconnect-hold', {
        source,
        holdMs: scannerHoldUntil - now,
        evidence,
        text: String(rawText || '').slice(0, 500)
      })
      recordTimelineEvent({
        type: 'botfilter',
        severity: 'error',
        botName: username,
        reason: 'chat-captcha',
        source,
        message: evidence?.text || rawText
      })

      if (!hasReconnectPendingLocal()) {
        updateBotStatus(username, 'ожидание')
        scheduleReconnectLocal(CHAT_CAPTCHA_RECONNECT_MS, true, 'chat-captcha')
      }

      cleanupActiveSessionTimers('chat-captcha-hold')
      waitingForFall = false
      fallCheckPassed = false
      scannerWaitChallengeActive = false
      isOnline = false
      positionConfirmed = false
      try {
        if (bot?._client?.socket && !bot._client.socket.destroyed) {
          bot._client.socket.end()
        } else if (bot) {
          bot.quit()
        }
      } catch (error) {
        diagEvent('chat-captcha-close-error', { error })
      }
    }

    function isEntryBlockedByScanner() {
      return scannerHoldUntil > Date.now()
    }

    function isBotFilterBusy() {
      return (
        scannerHoldUntil > Date.now() ||
        scannerWaitChallengeActive ||
        waitingForFall ||
        fallCheckActive ||
        hasReconnectPendingLocal()
      )
    }

    function isInBotFilterChallenge() {
      return (
        !joinedSubserver &&
        (scannerWaitChallengeActive ||
          waitingForFall ||
          fallCheckActive ||
          fallCheckPassed ||
          scannerHoldUntil > Date.now())
      )
    }

    function logBotFilterReconnect(reasonText, delay) {
      const fallHoldActive =
        botFilterRetryCount >= BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD &&
        delay >= BOT_FILTER_FALL_HOLD_MS
      addLog(
        'warning',
        username,
        fallHoldActive
          ? `LimboFilter: ${botFilterRetryCount} fall-проверки не прошли -> пауза ${Math.round(delay / 60000)} мин, чтобы не ловить чат-капчу`
          : `${reasonText} -> перезаход через ${Math.round(delay / 1000)}с (попытка ${botFilterRetryCount})`
      )
    }

    function startClient() {
      const botOptions = {
        host: SERVER_HOST,
        port: SERVER_PORT,
        username,
        auth: 'offline',
        version: MC_VERSION,
        keepAlive: true,
        keepAliveInterval: 15000
      }

      diagEvent('client-create-start', {
        host: SERVER_HOST,
        port: SERVER_PORT,
        version: MC_VERSION,
        standPosition,
        entryButtonPosition,
        miningTargets,
        maxDistance
      })

      bot = mineflayer.createBot(botOptions)
      diagEvent('client-created', {})

      if (physicsPlugin) {
        try {
          bot.loadPlugin(physicsPlugin.plugin)
          addLog('success', username, 'OK Плагин физики загружен')
        } catch (e) {
          addLog('warning', username, `! Физика не загрузилась: ${e.message}`)
        }
      }

      if (bot._client) {
        const diagnosticPacketNames = new Set([
          'login',
          'respawn',
          'position',
          'update_health',
          'kick_disconnect',
          'disconnect',
          'open_window',
          'close_window',
          'held_item_slot',
          'game_state_change',
          'difficulty'
        ])
        bot._client.on('packet', (data, meta) => {
          const packetName = meta?.name
          if (DETAILED_EVENT_LOGGING && diagnosticPacketNames.has(packetName)) {
            diagEvent(`client-packet:${packetName}`, {
              packet: data,
              meta: meta ? { name: meta.name, state: meta.state } : null
            })
          }

          if (packetName === 'login' || packetName === 'respawn') {
            handleMidSessionWorldReset(packetName, data, meta)
          }

          if (packetName === 'position') {
            rememberLimboPositionPacket(data)
          }

          if (
            (ACTIVE_FALL_CHECK_ENABLED || scannerWaitChallengeActive) &&
            packetName === 'position'
          ) {
            handleLimboPositionPacket(data)
          }
        })

        bot._client.on('keep_alive', () => {
          lastKeepAlive = Date.now()
        })

        bot._client.on('error', err => {
          const msg = String(err && err.message ? err.message : err)
          diagEvent('client-error', { error: err })
          if (msg.includes('connect ETIMEDOUT') || msg.includes('connect ECONNREFUSED')) {
            return
          }
        })

        bot._client.on('end', reason => {
          diagEvent('client-end', { reason })
        })

        bot._client.on('connect', () => {
          diagEvent('client-connect', {})
        })
      }

      if (bot._client.socket) {
        bot._client.socket.on('error', error => {
          diagEvent('socket-error', { error })
        })
        bot._client.socket.on('close', hadError => {
          diagEvent('socket-close', {
            hadError,
            destroyed: bot?._client?.socket?.destroyed,
            bytesRead: bot?._client?.socket?.bytesRead,
            bytesWritten: bot?._client?.socket?.bytesWritten,
            localAddress: bot?._client?.socket?.localAddress,
            localPort: bot?._client?.socket?.localPort,
            remoteAddress: bot?._client?.socket?.remoteAddress,
            remotePort: bot?._client?.socket?.remotePort
          })
        })
        bot._client.socket.on('end', () => {
          diagEvent('socket-end', {})
        })
        bot._client.socket.on('timeout', () => {
          diagEvent('socket-timeout', {})
        })
      }

      bot.on('blockUpdate', handleBlockUpdate)
      bot.on('login', () => diagEvent('bot-login', {}))
      bot.on('respawn', () => diagEvent('bot-respawn', {}))
      bot.on('death', () => diagEvent('bot-death', {}))
      bot.on('health', () =>
        diagEvent('bot-health', { health: bot.health, food: bot.food, oxygen: bot.oxygenLevel })
      )
      bot.on('windowOpen', window => {
        diagEvent('window-open', {
          id: window?.id,
          type: window?.type,
          title: getWindowTitleText(window).slice(0, 160),
          slotCount: window?.slots?.length
        })
        queueMenuFlow('window-open', 80)
      })
      bot.on('windowClose', window => {
        diagEvent('window-close', {
          id: window?.id,
          type: window?.type,
          title: getWindowTitleText(window).slice(0, 160)
        })
        queueMenuFlow('window-close', 250)
      })
      bot.on('forcedMove', () => diagEvent('bot-forced-move', {}))

      bot.once('spawn', async () => {
        const spawnSessionEpoch = sessionEpoch
        addLog('success', username, 'Подключен к серверу')
        setLifecycleState('connecting', 'bot-spawn')
        diagEvent('bot-spawn', { spawnSessionEpoch })
        updateBotStatus(username, 'подключается')
        isOnline = true
        lastKeepAlive = Date.now()
        spawnGraceUntil = Date.now() + GRACE_AFTER_SPAWN

        menuAttempts = 0
        setMenuStage('spawn', 'bot-spawn')

        if (bot._client && bot._client.socket) {
          bot._client.socket.on('error', error => {
            diagEvent('socket-error-after-spawn', { error })
          })
        }

        if (bot.physics) {
          bot.physics.gravity = 0.08
          addLog('success', username, 'OK Гравитация активна: 0.08')
        }

        startKeepAliveMonitor()

        startLimboFilterBypass()

        const initialDelay = 800 + Math.floor(Math.random() * 1200)
        await sleep(initialDelay)
        if (!isCurrentSession(spawnSessionEpoch) || !bot) return

        const limboReadyForMenu = await waitForLimboBeforeMenu(spawnSessionEpoch)
        if (!isCurrentSession(spawnSessionEpoch) || !bot || joinedSubserver || !limboReadyForMenu)
          return

        await driveMenuFlow('spawn-flow', { countAttempt: false })
        backoff = RECONNECT_REGULAR
      })

      function safeClickWindow(slot, options = {}) {
        if (!bot || !bot.currentWindow) return false
        const { countAttempt = true, minIntervalMs = 900 } = options
        const now = Date.now()
        if (now - lastMenuAttempt < minIntervalMs) {
          diagEvent('window-click-throttled', {
            slot,
            sinceLastAttemptMs: now - lastMenuAttempt,
            minIntervalMs
          })
          return false
        }
        lastMenuAttempt = now
        if (countAttempt) {
          menuAttempts++
        }
        const windowId = bot.currentWindow.id
        const item = bot.currentWindow.slots[slot] || { itemId: -1 }
        try {
          diagEvent('window-click', { windowId, slot, countAttempt, menuAttempts, item })
          bot._client.write('window_click', {
            windowId,
            slot,
            mouseButton: 0,
            action: 0,
            mode: 0,
            item
          })
          return true
        } catch (e) {
          diagEvent('window-click-error', { windowId, slot, error: e })
          noteGlobalError()
          return false
        }
      }

      openServerMenuItem = async function openServerMenuItemImpl(
        source = 'menu-loop',
        options = {}
      ) {
        if (!bot || !bot._client || joinedSubserver) return false
        if (hasReconnectPendingLocal()) {
          diagEvent('menu-open-skipped-reconnect-pending', { source })
          return false
        }
        if (bot.currentWindow) return true
        if (!isOnline) {
          diagEvent('menu-open-skipped-before-spawn', { source })
          return false
        }
        if (isEntryBlockedByScanner()) {
          diagEvent('menu-open-skipped-scanner', {
            source,
            holdMs: scannerHoldUntil - Date.now()
          })
          return false
        }
        if (bot._client.state && bot._client.state !== 'play') {
          diagEvent('menu-open-skipped-client-state', { source, state: bot._client.state })
          return false
        }
        if (!bot.entity) {
          diagEvent('menu-open-skipped-no-entity', { source })
          return false
        }

        const { countAttempt = true, minIntervalMs = 900 } = options
        const now = Date.now()
        if (now - lastMenuOpenAttemptAt < minIntervalMs) {
          diagEvent('menu-open-throttled', {
            source,
            sinceLastAttemptMs: now - lastMenuOpenAttemptAt,
            minIntervalMs
          })
          return false
        }
        lastMenuOpenAttemptAt = now
        if (countAttempt) {
          menuAttempts++
        }

        try {
          bot.setQuickBarSlot(HOTBAR_SLOT)
        } catch (error) {
          diagEvent('menu-open-set-slot-error', { source, error })
        }

        writeClientPacket('held_item_slot', { slotId: HOTBAR_SLOT }, `${source}:slot`)

        const thinkingDelay = Number(options.delayMs)
        if (Number.isFinite(thinkingDelay) && thinkingDelay > 0) {
          await sleep(thinkingDelay)
        }
        if (!bot || joinedSubserver || bot.currentWindow) return Boolean(bot?.currentWindow)

        diagEvent('menu-open-use-item', { source, hotbarSlot: HOTBAR_SLOT })
        return writeClientPacket('use_item', { hand: 0 }, `${source}:use-item`)
      }

      function queueMenuFlow(source = 'queued', delayMs = 0) {
        if (joinedSubserver || retryingFullServer || isShuttingDown() || !isRuntimeEnabled()) return
        if (hasReconnectPendingLocal()) {
          diagEvent('menu-flow-queue-skipped-reconnect-pending', { source })
          return
        }
        if (isEntryBlockedByScanner()) {
          diagEvent('menu-flow-queue-skipped-scanner', {
            source,
            holdMs: scannerHoldUntil - Date.now()
          })
          return
        }

        const dueAt = Date.now() + Math.max(0, delayMs)
        if (menuFlowWakeTimer && menuFlowWakeDueAt <= dueAt) {
          return
        }

        try {
          if (menuFlowWakeTimer) clearTimeout(menuFlowWakeTimer)
        } catch (error) {}
        menuFlowWakeDueAt = dueAt
        menuFlowWakeTimer = setTimeout(
          () => {
            menuFlowWakeTimer = null
            menuFlowWakeDueAt = 0
            driveMenuFlow(source).catch(() => {})
          },
          Math.max(0, delayMs)
        )
      }

      async function driveMenuFlow(source = 'menu-loop', options = {}) {
        if (!bot || joinedSubserver) return false
        if (hasReconnectPendingLocal()) {
          diagEvent('menu-flow-skipped-reconnect-pending', { source })
          return false
        }
        if (!isOnline && !bot.currentWindow) {
          diagEvent('menu-flow-skipped-before-spawn', { source })
          return false
        }
        if (isEntryBlockedByScanner()) {
          diagEvent('menu-flow-skipped-scanner', {
            source,
            holdMs: scannerHoldUntil - Date.now()
          })
          return false
        }
        if (retryingFullServer && !options.allowDuringFullServerRetry) return false
        if (waitingForFall && !fallCheckPassed) {
          diagEvent('menu-open-skipped-limbo', { source, waitingForFall, fallCheckPassed })
          return false
        }

        if (menuFlowRunning) {
          menuFlowQueued = true
          diagEvent('menu-flow-queued', { source, menuStage })
          return false
        }

        menuFlowRunning = true
        menuFlowQueued = false

        try {
          const {
            ignoreAttemptLimit = false,
            countAttempt = true,
            allowDuringFullServerRetry = false
          } = options
          const forceProgress = allowDuringFullServerRetry === true

          if (!ignoreAttemptLimit && !retryingFullServer && menuAttempts >= MENU_ATTEMPT_LIMIT) {
            diagEvent('menu-attempt-limit', { menuAttempts, menuRecoveryCount, menuStage })
            scheduleMenuRecovery('menu-attempt-limit')
            return false
          }

          const now = Date.now()
          const stageAgeMs = now - menuStageStartedAt

          if (!bot.currentWindow) {
            if (
              !forceProgress &&
              menuStage === 'game-clicked' &&
              stageAgeMs < MENU_WINDOW_TRANSITION_WAIT_MS
            ) {
              queueMenuFlow('wait-skyblock-window', 300)
              return false
            }

            if (
              !forceProgress &&
              menuStage === 'skyblock-clicked' &&
              stageAgeMs < MENU_SUBSERVER_JOIN_WAIT_MS
            ) {
              queueMenuFlow('wait-subserver-teleport', 700)
              return false
            }

            setMenuStage('opening-game-menu', source)
            const opened = await openServerMenuItem(source, {
              countAttempt,
              minIntervalMs: MENU_ACTION_INTERVAL_MS
            })
            if (opened) queueMenuFlow('after-menu-open', 300)
            return opened
          }

          const menuInfo = classifyServerMenuWindow(bot.currentWindow)
          diagEvent('menu-flow-window', {
            source,
            menuStage,
            kind: menuInfo.kind,
            title: menuInfo.title,
            slot1Text: menuInfo.slot1Text.slice(0, 160),
            slot2Text: menuInfo.slot2Text.slice(0, 160)
          })

          if (menuInfo.kind === 'game') {
            if (
              !forceProgress &&
              menuStage === 'game-clicked' &&
              stageAgeMs < MENU_WINDOW_TRANSITION_WAIT_MS
            ) {
              queueMenuFlow('wait-after-game-click', 300)
              return false
            }

            const clicked = safeClickWindow(MENU_SLOT_1, {
              countAttempt,
              minIntervalMs: MENU_ACTION_INTERVAL_MS
            })
            if (clicked) {
              setMenuStage('game-clicked', source)
              queueMenuFlow('after-game-click', 350)
            }
            return clicked
          }

          if (menuInfo.kind === 'skyblock') {
            if (
              !forceProgress &&
              menuStage === 'skyblock-clicked' &&
              stageAgeMs < MENU_SUBSERVER_JOIN_WAIT_MS
            ) {
              queueMenuFlow('wait-after-skyblock-click', 700)
              return false
            }

            const clicked = safeClickWindow(MENU_SLOT_2, {
              countAttempt,
              minIntervalMs: MENU_ACTION_INTERVAL_MS
            })
            if (clicked) {
              setMenuStage('skyblock-clicked', source)
              queueMenuFlow('after-skyblock-click', 900)
            }
            return clicked
          }

          if (countAttempt) menuAttempts += 1
          diagEvent('menu-window-unknown', {
            source,
            menuAttempts,
            title: menuInfo.title,
            slot1Text: menuInfo.slot1Text.slice(0, 160),
            slot2Text: menuInfo.slot2Text.slice(0, 160)
          })

          try {
            if (bot.currentWindow) bot.closeWindow(bot.currentWindow)
          } catch (error) {
            diagEvent('menu-window-close-error', { source, error })
          }
          setMenuStage('unknown-window', source)
          queueMenuFlow('unknown-window-retry', 700)
          return false
        } finally {
          menuFlowRunning = false
          if (menuFlowQueued) {
            menuFlowQueued = false
            queueMenuFlow('queued-menu-flow', 50)
          }
        }
      }

      async function tryOpenMenuOnce(ignoreAttemptLimit = false) {
        return driveMenuFlow('menu-loop', { ignoreAttemptLimit })
      }

      function stopFullServerRetry() {
        retryingFullServer = false
        if (fullServerRetryTimer) {
          clearTimeout(fullServerRetryTimer)
          fullServerRetryTimer = null
        }
      }

      async function tryFullServerRetryOnce() {
        if (!retryingFullServer || joinedSubserver || !bot) return
        await driveMenuFlow('full-server-retry', {
          ignoreAttemptLimit: true,
          countAttempt: false,
          allowDuringFullServerRetry: true
        })
      }

      function startFullServerRetry() {
        if (joinedSubserver || retryingFullServer) return

        retryingFullServer = true
        menuAttempts = 0
        lastMenuAttempt = 0
        lastMenuOpenAttemptAt = 0
        setMenuStage('full-server-retry', 'server-full')
        addLog('warning', username, '! sb02 заполнен - повторяю вход каждую секунду')

        const retryLoop = async () => {
          if (!retryingFullServer || joinedSubserver) {
            stopFullServerRetry()
            return
          }

          await tryFullServerRetryOnce().catch(() => {})
          fullServerRetryTimer = setTimeout(retryLoop, 1000)
        }

        fullServerRetryTimer = setTimeout(retryLoop, 1000)
      }

      ;(function menuLoop() {
        if (
          !joinedSubserver &&
          !retryingFullServer &&
          !hasReconnectPendingLocal() &&
          (!waitingForFall || fallCheckPassed)
        ) {
          tryOpenMenuOnce().catch(() => {})
        }
        const nextAttempt = 1000 + Math.floor(Math.random() * 750)
        menuTimer = setTimeout(menuLoop, nextAttempt)
      })()

      bot.on('message', (msg, position, sender) => {
        try {
          const rawText = getMinecraftMessageText(msg)
          const messagePosition = normalizeServerMessagePosition(position)
          const messageSource = getServerMessageSource(messagePosition)
          const isVisibleChatMessage = isVisibleServerMessagePosition(messagePosition)
          const messageJson = getMessageJson(msg)

          if (!rawText) {
            diagEvent('server-message-empty', {
              source: messageSource,
              position: messagePosition,
              json: messageJson
            })
            return
          }

          if (LOG_SERVER_MESSAGES) {
            diagEvent('server-message', {
              source: messageSource,
              position: messagePosition,
              text: rawText.slice(0, 1000),
              json: messageJson
            })
          }
          const text = rawText.toLowerCase()
          const botFilterMessageKind = !joinedSubserver ? classifyBotFilterMessage(text) : 'none'
          const botFilterEvidence =
            botFilterMessageKind !== 'none'
              ? createCaptchaEvidence({
                  kind: botFilterMessageKind,
                  text: rawText,
                  source: messageSource,
                  position: messagePosition,
                  visibleChat: isVisibleChatMessage,
                  sender: sender ? String(sender) : '',
                  packetName: 'message',
                  packetSeen: true
                })
              : null

          if (isVisibleChatMessage) {
            addChatLog(username, rawText, messageSource, {
              position: messagePosition,
              sender: sender ? String(sender) : undefined,
              packetName: 'message',
              kind: botFilterMessageKind !== 'none' ? botFilterMessageKind : undefined,
              evidence: botFilterEvidence || undefined
            })
          }

          if (isTooManyPacketsText(text)) {
            handleTooManyPacketsNotice(messageSource, rawText)
            return
          }

          maybeSendLoginCommand(rawText, text)

          if (!joinedSubserver) {
            if (botFilterMessageKind !== 'none') {
              addLog(
                'info',
                username,
                `BotFilter evidence: ${botFilterMessageKind}, source=${messageSource}, position=${messagePosition}, text="${rawText.slice(0, 240)}"`
              )
              diagEvent('bot-filter-message-evidence', {
                kind: botFilterMessageKind,
                source: messageSource,
                position: messagePosition,
                visibleChat: isVisibleChatMessage,
                sender: sender ? String(sender) : undefined,
                evidence: botFilterEvidence,
                text: rawText.slice(0, 1000),
                json: messageJson
              })
            }

            if (botFilterMessageKind === 'chat-captcha') {
              const validatedEvidence = validateCaptchaEvidence(botFilterEvidence, 'chat-captcha')
              if (validatedEvidence.valid) {
                handleChatCaptchaChallenge(rawText, messageSource, validatedEvidence)
                return
              }

              diagEvent('chat-captcha-ignored', {
                source: messageSource,
                position: messagePosition,
                visibleChat: isVisibleChatMessage,
                evidence: validatedEvidence,
                fallCheckActive,
                waitingForFall,
                scannerWaitChallengeActive,
                text: rawText.slice(0, 500)
              })
              return
            }

            if (botFilterMessageKind === 'fall-wait') {
              const validatedEvidence = validateCaptchaEvidence(botFilterEvidence, 'fall-wait')
              if (!validatedEvidence.valid) {
                diagEvent('fall-wait-ignored', {
                  source: messageSource,
                  position: messagePosition,
                  evidence: validatedEvidence,
                  text: rawText.slice(0, 500)
                })
                return
              }
              handleScannerWaitChallenge(rawText, messageSource, validatedEvidence)
              return
            }
          }

          if (
            text.includes('вы недавно входили') ||
            text.includes('ввод пароля не требуется') ||
            text.includes('you recently logged in')
          ) {
            if (!authQuickLogin) {
              authQuickLogin = true
              addLog('success', username, '+ Быстрый вход - авторизация пропущена')
            }
          }

          if (
            (text.includes('не удалось подключить вас к серверу') ||
              text.includes('failed to connect you to')) &&
            (text.includes('сервер заполнен') || text.includes('server is full'))
          ) {
            startFullServerRetry()
          }

          if (!joinedSubserver && isLimboSuccessText(text)) {
            const trackedSuccess =
              text.includes('отслеживается') || text.includes('проверка завершена')
            const successSessionEpoch = sessionEpoch
            limboSuccessSeen = true
            scannerHoldUntil = 0
            scannerWaitChallengeActive = false
            waitingForFall = false
            fallCheckActive = false
            stopFullServerRetry()
            completeLimboWait('limbo-success-message')
            setRuntimeHealth('joining', {
              lastRecoveryAction: 'limbo passed',
              diagnosis: trackedSuccess
                ? 'LimboFilter пройден, сервер перевёл бота на подсервер.'
                : 'LimboFilter пройден, бот входит на подсервер через меню.'
            })
            waitKickCount = 0
            updateBotStatus(username, 'ожидание')
            try {
              if (fallCheckTimer) clearTimeout(fallCheckTimer)
            } catch (e) {}

            fallCheckPassed = true

            if (trackedSuccess) {
              beginSubserverJoin()
              addLog('success', username, 'Зашёл на подсервер')
              schedulePostJoinFlow()
            } else {
              addLog('success', username, 'LimboFilter пройден, запускаю вход через меню')
              queueMenuFlow('limbo-success-menu', 250)
              schedulePostLimboMenuWatchdog(successSessionEpoch, 'limbo-success-menu')
            }
          }
        } catch (e) {
          diagEvent('server-message-handler-error', { error: e })
        }
      })

      bot.on('kicked', reason => {
        diagEvent('bot-kicked-event', { reason })
        const wasInBotFilterCheck = isInBotFilterChallenge()
        const hadLimboSuccess = limboSuccessSeen
        isOnline = false
        positionConfirmed = false
        resetSessionState()

        let r = typeof reason === 'string' ? reason : JSON.stringify(reason)

        try {
          if (typeof reason === 'object' && reason.extra) {
            const textParts = reason.extra
              .filter(e => e.text)
              .map(e => e.text)
              .join(' ')
            if (textParts) r = textParts
          }
        } catch (e) {}

        addLog('warning', username, `Кикнут: ${r.substring(0, 300)}`)
        diagEvent('bot-kicked-parsed', { parsedReason: r })

        updateBotStatus(username, 'оффлайн')
        cleanupTimers()

        if (hadLimboSuccess || isLimboSuccessText(r)) {
          addLog('success', username, 'LimboFilter пройден, перезахожу после success-kick')
          scheduleReconnectLocal(1200, true, 'limbo-success-kick')
          return
        }

        applyReconnectDecision(
          getReconnectDecision(
            {
              type: 'kick',
              reason: r,
              wasInBotFilterCheck
            },
            {
              random: Math.random,
              waitKickCount,
              connectionStabilityCooldownMs: CONNECTION_STABILITY_COOLDOWN_MS
            }
          ),
          'kick'
        )
      })

      bot.on('end', reason => {
        diagEvent('bot-end-event', { reason })
        const wasInBotFilterCheck = isInBotFilterChallenge()
        const hadLimboSuccess = limboSuccessSeen
        isOnline = false
        positionConfirmed = false
        resetSessionState()
        if (!reconnectScheduled && !isRotating) {
          addLog('warning', username, 'Отключен от сервера')
          updateBotStatus(username, 'оффлайн')
          cleanupTimers()

          if (hadLimboSuccess) {
            addLog(
              'success',
              username,
              'LimboFilter пройден, socket закрыт штатно -> быстрый перезаход'
            )
            scheduleReconnectLocal(1200, true, 'limbo-success-end')
            return
          }

          applyReconnectDecision(
            getReconnectDecision(
              {
                type: 'end',
                reason,
                wasInBotFilterCheck
              },
              { random: Math.random }
            ),
            'end'
          )
        }
      })

      bot.on('error', err => {
        const msg = String(err && err.message ? err.message : err)
        diagEvent('bot-error-event', { error: err })
        const wasInBotFilterCheck = isInBotFilterChallenge()
        const decision = getReconnectDecision(
          {
            type: 'error',
            message: msg,
            error: err,
            wasInBotFilterCheck,
            hasReconnectPending: hasReconnectPendingLocal()
          },
          {
            random: Math.random,
            clientTimeoutReconnectMs: CLIENT_TIMEOUT_RECONNECT_MS,
            clientTimeoutReconnectJitterMs: CLIENT_TIMEOUT_RECONNECT_JITTER_MS,
            connectionStabilityCooldownMs: CONNECTION_STABILITY_COOLDOWN_MS
          }
        )

        if (decision.action === 'ignore' || decision.action === 'stability-only') {
          applyReconnectDecision(decision, 'error')
          return
        }

        isOnline = false
        positionConfirmed = false
        resetSessionState()

        addLog('error', username, msg.substring(0, 60))
        cleanupTimers()
        updateBotStatus(username, 'оффлайн')
        applyReconnectDecision(decision, 'error')
      })
    }

    async function startDiggingLoop(expectedSessionEpoch = sessionEpoch) {
      diagEvent('mining-loop-request', { expectedSessionEpoch })
      if (digLoopRunning) return
      if (!miningTargets.length) {
        addLog('error', username, 'Нет блоков для копания')
        diagEvent('mining-loop-no-targets', {})
        return
      }

      digLoopRunning = true
      try {
        for (let i = 0; i < 100; i++) {
          if (!isCurrentSession(expectedSessionEpoch)) return
          if (isMiningSessionReady(expectedSessionEpoch)) break
          await sleep(200)
        }

        if (!isMiningSessionReady(expectedSessionEpoch)) {
          return
        }

        if (waitingForFall) {
          addLog('info', username, 'Ожидание проверки LimboFilter...')

          for (let i = 0; i < 50; i++) {
            if (!isCurrentSession(expectedSessionEpoch)) return
            if (!waitingForFall || fallCheckPassed) break
            await sleep(200)
          }
        }

        if (waitingForFall) {
          addLog('warning', username, 'Таймаут LimboFilter - начинаю копать')
          restoreLimboPhysics('mining-loop-timeout')
          waitingForFall = false
          fallCheckPassed = true
          fallCheckActive = false
        }

        if (standPosition) {
          const postJoinPositionReady = await waitForPostJoinPosition(expectedSessionEpoch)
          if (!isMiningSessionReady(expectedSessionEpoch)) {
            return
          }

          if (!postJoinPositionReady) {
            return
          }

          const returnedToStand = await returnToStandPosition()
          if (!returnedToStand) {
            return
          }

          if (!isMiningSessionReady(expectedSessionEpoch)) {
            return
          }
        }
        await ensureMiningLookAt(true)

        addLog(
          'success',
          username,
          `Запускаю новый движок добычи (${miningTargets.length} точек, пачка ${MINING_BATCH_SIZE})`
        )
        setLifecycleState('mining', 'mining-loop-started')
        diagEvent('mining-loop-started', {
          targets: miningTargets.length,
          batchSize: MINING_BATCH_SIZE,
          breakPacketLimits: getBreakPacketLimits()
        })

        const readyAt = Date.now()
        lastDigTime = readyAt
        lastBlockMinedAt = 0
        let cursor = 0
        let lastHealthCheckAt = readyAt

        while (isMiningSessionReady(expectedSessionEpoch)) {
          if (isDiggingPaused()) {
            lastDigTime = Date.now()
            await sleep(500)
            continue
          }

          if (isReturningToPosition) {
            await sleep(250)
            continue
          }

          const now = Date.now()
          if (now - lastHealthCheckAt >= 5000) {
            lastHealthCheckAt = now
            diagPositionSnapshot('mining-loop')
            prunePacketBreakTracking(now)

            if (RESTART_IF_IDLE_MS > 0 && now - lastDigTime > RESTART_IF_IDLE_MS) {
              addLog('warning', username, 'Долгий простой -> перезапуск')
              updateBotStatus(username, 'ожидание')
              diagEvent('mining-idle-restart', {
                idleMs: now - lastDigTime,
                restartIfIdleMs: RESTART_IF_IDLE_MS
              })
              scheduleReconnectLocal(undefined, false, 'mining-idle')
              return
            }
          }

          const snapshot = buildMiningSnapshot(cursor)

          if (!snapshot.mineable.length) {
            const recovered =
              snapshot.transient.length > 0
                ? await recoverTransientMiningTargets(expectedSessionEpoch, snapshot)
                : snapshot.unreachable.length > 0
                  ? await recoverUnreachableMiningTargets(expectedSessionEpoch, snapshot)
                  : await recoverEmptyMiningTargets(
                      expectedSessionEpoch,
                      'Нет доступных блоков для добычи'
                    )

            if (!recovered || !isMiningSessionReady(expectedSessionEpoch)) {
              return
            }

            continue
          }

          let minedThisPass = 0
          const batch = snapshot.mineable.slice(0, MINING_BATCH_SIZE)
          let fastPacketsThisPass = 0
          let packetOnlyFallbackThisPass = false

          if (isFastMiningAllowed()) {
            await ensureMiningLookAt()
            for (const target of batch) {
              if (sendBreakPacketToTarget(target, { preemptive: false })) {
                fastPacketsThisPass++
              }
            }
            if (fastPacketsThisPass > 0) {
              lastDigTime = Date.now()
              try {
                bot.swingArm()
              } catch (error) {}
              await sleep(FAST_DIG_RETRY_MS)

              if (PACKET_ONLY_MINING) {
                const packetNow = Date.now()
                if (!packetOnlyStartedAt) {
                  packetOnlyStartedAt = packetNow
                }

                const packetOnlyIdleMs = getPacketOnlyIdleMs(packetNow)

                if (packetOnlyIdleMs < PACKET_ONLY_FALLBACK_MS) {
                  continue
                }

                const recovered = await recoverPacketOnlyPipeline(
                  expectedSessionEpoch,
                  'packet-only-idle'
                )
                if (recovered) {
                  cursor = (cursor + 1) % miningTargets.length
                  continue
                }

                packetOnlyStartedAt = packetNow
                packetOnlyFallbackThisPass = true
                diagEvent('packet-only-fallback-dig', {
                  reason: 'packet-only-idle',
                  packetOnlyIdleMs
                })
              }
            }
          }

          if (
            !packetOnlyFallbackThisPass &&
            PACKET_ONLY_MINING &&
            isFastMiningAllowed() &&
            packetOnlyStartedAt
          ) {
            const packetNow = Date.now()
            const packetOnlyIdleMs = getPacketOnlyIdleMs(packetNow)

            if (packetOnlyIdleMs < PACKET_ONLY_FALLBACK_MS) {
              await sleep(MINING_LOOP_IDLE_MS)
              continue
            }

            const recovered = await recoverPacketOnlyPipeline(
              expectedSessionEpoch,
              'packet-only-idle'
            )
            if (recovered) {
              cursor = (cursor + 1) % miningTargets.length
              continue
            }

            packetOnlyStartedAt = packetNow
            diagEvent('packet-only-fallback-dig', {
              reason: 'packet-only-idle',
              packetOnlyIdleMs
            })
          }

          for (const target of batch) {
            if (
              !isMiningSessionReady(expectedSessionEpoch) ||
              isDiggingPaused() ||
              isReturningToPosition
            ) {
              break
            }

            const freshTarget = getTargetSnapshot(target.index)
            cursor = (freshTarget.index + 1) % miningTargets.length

            if (!freshTarget.canMine || !freshTarget.block || freshTarget.block.type === 0) {
              continue
            }

            try {
              await digBlockWithTimeout(freshTarget.block)

              if (!isMiningSessionReady(expectedSessionEpoch)) return

              recordMinedBlock(freshTarget.position, 'dig')
              minedThisPass++

              if (DIG_DELAY > 0) {
                await sleep(DIG_DELAY)
              }
            } catch (error) {
              const failureKind = getDigFailureKind(error)

              if (failureKind === 'timeout') {
                addLog(
                  'warning',
                  username,
                  `Копание зависло (${Math.round(DIG_ACTION_TIMEOUT_MS / 1000)}с) -> перезапуск`
                )
                diagEvent('dig-timeout-restart', { target: freshTarget, error })
                updateBotStatus(username, 'ожидание')
                scheduleReconnectLocal(5000, true, 'dig-timeout')
                return
              }

              if (failureKind === 'unreachable') {
                logMiningDiagnostic(
                  'warning',
                  `Цель стала недосягаемой: ${formatTargetSnapshot(freshTarget)}`
                )
                if (standPosition) {
                  await returnToStandPosition()
                }
                break
              }

              if (failureKind === 'error') {
                const errMsg = error && error.message ? error.message : String(error)
                addLog('warning', username, errMsg.substring(0, 60))
              }
            }
          }

          if (minedThisPass === 0 && fastPacketsThisPass === 0) {
            await sleep(MINING_LOOP_IDLE_MS)
          }
        }
      } catch (error) {
        addLog('error', username, `Ошибка в mining engine: ${error.message}`)
        diagEvent('mining-loop-error', { error })
        scheduleReconnectLocal(undefined, false, 'mining-loop-error')
      } finally {
        digLoopRunning = false
      }
    }

    botHandle = {
      username,
      get bot() {
        return bot
      },
      get isOnline() {
        return isOnline
      },
      get hasReconnectPending() {
        return hasReconnectPendingLocal()
      },
      get isBotFilterBusy() {
        return isBotFilterBusy()
      },
      getLifecycleSnapshot,
      get reconnectDueAt() {
        return reconnectDueAt
      },
      set isRotating(val) {
        isRotating = val
      },
      cleanup: () => {
        disposeBotInstance()
      }
    }
    startClient()
    return botHandle
  }

  return createBot
}

module.exports = {
  createBotSessionFactory
}

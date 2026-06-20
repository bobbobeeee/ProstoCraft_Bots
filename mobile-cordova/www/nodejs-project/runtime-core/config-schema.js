const fs = require('fs')
const path = require('path')
const { applyLegacyConfigMigrations } = require('../config-migrations')
const { LIMBO_FILTER_DEFAULTS } = require('../limbo-filter')
const { getSpeedGuardTargetRatioFromDropPercent } = require('../speed-guard')

const CONFIG_SCHEMA_VERSION = 1

function mergeConfigDefaults(defaultValue, currentValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(currentValue) ? currentValue : [...defaultValue]
  }

  if (defaultValue && typeof defaultValue === 'object') {
    const currentObject =
      currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? currentValue
        : {}
    const merged = { ...currentObject }

    for (const [key, nestedDefault] of Object.entries(defaultValue)) {
      merged[key] = mergeConfigDefaults(nestedDefault, currentObject[key])
    }

    return merged
  }

  return currentValue === undefined ? defaultValue : currentValue
}

function normalizeRuntimeConfig(input, defaults = {}) {
  const merged = mergeConfigDefaults(defaults || {}, input || {})
  return applyLegacyConfigMigrations(merged, defaults || {})
}

function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function createRuntimeSettings(config, options = {}) {
  const mobileRuntimeProfile = options.mobileRuntimeProfile === true
  const configDir = options.configDir || process.cwd()
  const timing = config.timing || {}
  const antibot = config.antibot || {}
  const features = config.features || {}
  const logging = config.logging || {}
  const menu = config.menu || {}
  const globalRestart = config.globalRestart || {}
  const position = config.position || {}
  const ui = config.ui || {}
  const monitor = config.monitor || {}
  const pause = config.pause || {}
  const maintenance = config.maintenance || {}

  const DEBUG_MODE = logging.debugMode === true
  const MOBILE_SNAPSHOT_INTERVAL_MS = 4000
  const MOBILE_RESOURCE_INTERVAL_MS = 5000
  const MOBILE_PAUSE_CHECK_INTERVAL_MS = 4000
  const MOBILE_POSITION_CHECK_INTERVAL_MS = 15000
  const PACKET_ONLY_FALLBACK_MS = Math.max(100, Number(timing.packetOnlyFallbackMs ?? 1200) || 1200)
  const STUCK_THRESHOLD = Number(timing.stuckThreshold) || 0
  const RESTART_IF_IDLE_MS = Number(timing.restartIfIdleMs) || 0
  const configuredStartStagger = Number(timing.startStagger)
  const configuredStartStaggerJitter = Number(timing.startStaggerJitter)
  const ANTIBOT_FALL_CHECK_ENABLED = antibot.fallCheckEnabled
  const FEATURE_ACTIVE_FALL_CHECK_ENABLED = features.enableActiveFallCheck !== false
  const configuredLimboFallTicks = Number(antibot.limboFallTicks)
  const configuredLimboFallPacketMs = Number(antibot.limboFallPacketMs)
  const UI_RENDER_INTERVAL = Number(ui.renderIntervalMs) || 1000
  const CHAT_CAPTCHA_RECONNECT_MS = Math.max(
    600000,
    Number(maintenance.chatCaptchaReconnectMs ?? 30 * 60 * 1000) || 30 * 60 * 1000
  )
  const OFFLINE_WATCHDOG_INTERVAL_MS = Math.max(
    10000,
    Number(maintenance.offlineWatchdogIntervalMs ?? 30000) || 30000
  )
  const SPEED_WINDOW_MS = Math.max(1000, monitor.speedWindowMs || 10000)
  const SPEED_GUARD_INTERVAL_MS = Math.max(
    1000,
    Number(timing.speedGuardIntervalMs ?? 5000) || 5000
  )
  const SPEED_GUARD_NO_PROGRESS_RECONNECT_MS = Math.max(
    15000,
    Number(timing.speedGuardNoProgressReconnectMs ?? 35000) || 35000
  )
  const SPEED_GUARD_LOW_RATE_MS = Math.max(
    SPEED_GUARD_INTERVAL_MS,
    Number(timing.speedGuardLowRateMs ?? 25000) || 25000
  )
  const BREAK_PACKET_SAFE_MODE_MS = Math.max(
    60000,
    Number(timing.breakPacketSafeModeMs ?? 120000) || 120000
  )
  const STABILITY_COOLDOWN_MS = Math.max(0, Number(timing.stabilityCooldownMs ?? 0) || 0)
  const CONNECTION_STABILITY_COOLDOWN_MS = Math.max(
    STABILITY_COOLDOWN_MS,
    Number(timing.connectionStabilityCooldownMs ?? 0) || 0
  )
  const MENU_RECOVERY_BASE_MS = Math.max(1000, Number(timing.menuRecoveryBaseMs ?? 3500) || 3500)
  const BOT_FILTER_RETRY_BASE_MS = Math.max(
    5000,
    Number(maintenance.botFilterRetryBaseMs ?? 8000) || 8000
  )

  return {
    CONFIG_SCHEMA_VERSION,
    SERVER_HOST: config.server?.host,
    SERVER_PORT: Number.isFinite(Number(config.server?.port)) ? Number(config.server.port) : 25565,
    MC_VERSION: config.server?.version,
    PASSWORD: config.server?.password,
    MENU_SLOT_1: menu.slot1,
    MENU_SLOT_2: menu.slot2,
    HOTBAR_SLOT: menu.hotbarSlot,
    DEBUG_MODE,
    DETAILED_EVENT_LOGGING: DEBUG_MODE,
    LOG_SERVER_MESSAGES: DEBUG_MODE && logging.logServerMessages !== false,
    DIAGNOSTIC_MAX_VALUE_LENGTH: Math.max(
      500,
      Number(logging.diagnosticMaxValueLength ?? 1400) || 1400
    ),
    DIAGNOSTIC_POSITION_INTERVAL_MS: Math.max(
      5000,
      Number(logging.diagnosticPositionIntervalMs ?? 30000) || 30000
    ),
    DIAGNOSTIC_REPEAT_SUMMARY_MS: Math.max(
      5000,
      Number(logging.diagnosticRepeatSummaryMs ?? 30000) || 30000
    ),
    DIAGNOSTIC_FULL_PACKET_DETAILS: logging.diagnosticFullPacketDetails === true,
    DIG_DELAY: Math.max(0, Number(timing.digDelay) || 0),
    EMPTY_SCAN_DELAY_MS: Math.max(0, Number(timing.emptyScanDelayMs ?? 0) || 0),
    EMPTY_TARGET_RECHECK_MS: Math.max(5, Number(timing.emptyTargetRecheckMs ?? 5) || 5),
    EMPTY_TARGET_LOG_AFTER_IDLE_MS: Math.max(
      0,
      Number(timing.emptyTargetLogAfterIdleMs ?? 15000) || 15000
    ),
    EMPTY_TARGET_LOG_INTERVAL_MS: Math.max(
      1000,
      Number(timing.emptyTargetLogIntervalMs ?? 30000) || 30000
    ),
    ENTRY_BUTTON_AFTER_PRESS_WAIT_MS: Math.max(
      0,
      Number(timing.entryButtonAfterPressWaitMs ?? 0) || 0
    ),
    ENTRY_BUTTON_RETRY_INTERVAL_MS: Math.max(
      0,
      Number(timing.entryButtonRetryIntervalMs ?? 250) || 250
    ),
    ENTRY_BUTTON_STARTUP_ATTEMPTS: Math.max(1, Number(timing.entryButtonStartupAttempts ?? 4) || 4),
    ENTRY_BUTTON_STARTUP_RETRY_MS: Math.max(
      50,
      Number(timing.entryButtonStartupRetryMs ?? 350) || 350
    ),
    ENTRY_BUTTON_CONFIRM_MS: Math.max(50, Number(timing.entryButtonConfirmMs ?? 900) || 900),
    ENTRY_BUTTON_WATCHDOG_MS: Math.max(500, Number(timing.entryButtonWatchdogMs ?? 3000) || 3000),
    EMPTY_TARGET_BUTTON_RETRY_MS: Math.max(
      0,
      Number(timing.emptyTargetButtonRetryMs ?? 20000) || 20000
    ),
    EMPTY_TARGET_BUTTON_RETRY_COOLDOWN_MS: Math.max(
      1000,
      Number(timing.emptyTargetButtonRetryCooldownMs ?? 60000) || 60000
    ),
    EMPTY_TARGET_BUTTON_RETRY_LIMIT: Math.max(
      0,
      Number(timing.emptyTargetButtonRetryLimit ?? 2) || 2
    ),
    MINING_LOOP_IDLE_MS: Math.max(1, Number(timing.miningLoopIdleMs ?? 2) || 2),
    MINING_BATCH_SIZE: Math.max(1, Number(timing.miningBatchSize ?? 96) || 96),
    BURST_BREAK_WINDOW_MS: Math.max(0, Number(timing.burstBreakWindowMs ?? 1500) || 1500),
    BURST_BREAK_INTERVAL_MS: Math.max(
      1,
      Number(
        [5, 20].includes(timing.burstBreakIntervalMs) ? 1 : (timing.burstBreakIntervalMs ?? 1)
      ) || 1
    ),
    BURST_BREAK_REPEATS: Math.max(
      1,
      Number(timing.burstBreakRepeats === 3 ? 2 : (timing.burstBreakRepeats ?? 2)) || 2
    ),
    BURST_BREAK_REACH: Math.max(1, Number(timing.burstBreakReach ?? 5.1) || 5.1),
    BURST_LOOK_REFRESH_MS: Math.max(0, Number(timing.burstLookRefreshMs ?? 2000) || 2000),
    BREAK_PACKET_TARGET_COOLDOWN_MS: Math.max(
      0,
      Number(
        [25, 10].includes(timing.breakPacketTargetCooldownMs)
          ? 12
          : (timing.breakPacketTargetCooldownMs ?? 12)
      ) || 12
    ),
    BREAK_PACKET_PENDING_RETRY_MS: Math.max(
      0,
      Number(timing.breakPacketPendingRetryMs ?? 32) || 32
    ),
    BREAK_PACKET_MIN_TARGET_COOLDOWN_MS: Math.max(
      0,
      Number(
        [75, 45, 20].includes(timing.breakPacketMinTargetCooldownMs)
          ? 8
          : (timing.breakPacketMinTargetCooldownMs ?? 8)
      ) || 8
    ),
    BREAK_PACKET_MAX_PER_SECOND: Math.max(
      2,
      Number(
        [72, 108, 160, 240].includes(timing.breakPacketMaxPerSecond)
          ? 300
          : (timing.breakPacketMaxPerSecond ?? 300)
      ) || 300
    ),
    BREAK_PACKET_BURST_WINDOW_MS: Math.max(
      50,
      Number(timing.breakPacketBurstWindowMs ?? 250) || 250
    ),
    BREAK_PACKET_BURST_LIMIT: Math.max(
      2,
      Number(
        [18, 28, 42, 64].includes(timing.breakPacketBurstLimit)
          ? 84
          : (timing.breakPacketBurstLimit ?? 84)
      ) || 84
    ),
    BREAK_PACKET_SAFE_MAX_PER_SECOND: Math.max(
      2,
      Number(
        [42, 60, 96, 120, 150, 240].includes(timing.breakPacketSafeMaxPerSecond)
          ? 160
          : (timing.breakPacketSafeMaxPerSecond ?? 160)
      ) || 160
    ),
    BREAK_PACKET_SAFE_BURST_LIMIT: Math.max(
      2,
      Number(
        [10, 15, 24, 32, 40, 68].includes(timing.breakPacketSafeBurstLimit)
          ? 42
          : (timing.breakPacketSafeBurstLimit ?? 42)
      ) || 42
    ),
    BREAK_PACKET_SAFE_MODE_MS,
    BREAK_PACKET_SAFE_REPEATS: Math.max(1, Number(timing.breakPacketSafeRepeats ?? 1) || 1),
    LOGIN_COMMAND_COOLDOWN_MS: Math.max(
      1000,
      Number(timing.loginCommandCooldownMs ?? 7000) || 7000
    ),
    REACTIVE_BREAK_REPEATS: Math.max(
      1,
      Number(timing.reactiveBreakRepeats === 2 ? 1 : (timing.reactiveBreakRepeats ?? 1)) || 1
    ),
    TRANSIENT_BREAK_REPEATS: Math.max(
      1,
      Number(timing.transientBreakRepeats === 2 ? 1 : (timing.transientBreakRepeats ?? 1)) || 1
    ),
    PACKET_BREAK_CONFIRM_WINDOW_MS: Math.max(
      50,
      Number(timing.packetBreakConfirmWindowMs ?? 1500) || 1500
    ),
    BLOCK_COUNT_DEDUPE_MS: Math.max(0, Number(timing.blockCountDedupeMs ?? 75) || 75),
    PACKET_ONLY_MINING: timing.packetOnlyMining !== false,
    PACKET_ONLY_FALLBACK_MS,
    MINING_CONTROLLER_ADJUST_INTERVAL_MS: Math.max(
      3000,
      Number(timing.miningControllerAdjustIntervalMs ?? 12000) || 12000
    ),
    MINING_CONTROLLER_SOFT_RECOVERY_LIMIT: Math.max(
      1,
      Number(timing.miningControllerSoftRecoveryLimit ?? 3) || 3
    ),
    MINING_CONTROLLER_MIN_BUDGET_SCALE: Math.min(
      1,
      Math.max(0.1, Number(timing.miningControllerMinBudgetScale ?? 0.85) || 0.85)
    ),
    MINING_CONTROLLER_GOOD_CONFIRMATION_RATIO: Math.min(
      1,
      Math.max(0.1, Number(timing.miningControllerGoodConfirmationRatio ?? 0.86) || 0.86)
    ),
    MINING_CONTROLLER_BAD_CONFIRMATION_RATIO: Math.min(
      1,
      Math.max(0.1, Number(timing.miningControllerBadConfirmationRatio ?? 0.55) || 0.55)
    ),
    MINING_CONTROLLER_STALE_PENDING_MS: Math.max(
      100,
      Number(timing.miningControllerStalePendingMs ?? PACKET_ONLY_FALLBACK_MS) ||
        PACKET_ONLY_FALLBACK_MS
    ),
    PREEMPTIVE_BREAK_TARGETS: timing.preemptiveBreakTargets === true,
    FAST_DIG_CONFIRM_MS: Math.max(5, Number(timing.fastDigConfirmMs ?? 15) || 15),
    FAST_DIG_RETRY_MS: Math.max(1, Number(timing.fastDigRetryMs ?? 5) || 5),
    FAST_DIG_MIN_VANILLA_TIME_MS: Math.max(0, Number(timing.fastDigMinVanillaTimeMs ?? 0) || 0),
    STUCK_THRESHOLD,
    RESTART_IF_IDLE_MS,
    DIG_ACTION_TIMEOUT_MS: Math.max(
      5000,
      Math.min(
        STUCK_THRESHOLD > 0 ? STUCK_THRESHOLD : 30000,
        RESTART_IF_IDLE_MS > 0 ? RESTART_IF_IDLE_MS : 30000
      )
    ),
    RECONNECT_REGULAR: timing.reconnectRegular,
    RECONNECT_ON_INTERNET_LOSS: timing.reconnectOnInternetLoss,
    INTERNET_RETRY_INTERVAL: timing.internetRetryInterval,
    INTERNET_CHECK_INTERVAL: timing.internetCheckInterval,
    MAX_INTERNET_RETRIES: timing.maxInternetRetries,
    GRACE_AFTER_SPAWN: timing.graceAfterSpawn,
    POST_JOIN_DIG_START_MS: Math.max(0, timing.postJoinDigStartMs ?? 25),
    POST_JOIN_POSITION_GRACE_MS: Math.max(
      0,
      Number(timing.postJoinPositionGraceMs ?? 8000) || 8000
    ),
    STABILITY_COOLDOWN_MS,
    CONNECTION_STABILITY_COOLDOWN_MS,
    STABILITY_COOLDOWN_MAX_MS: Math.max(
      STABILITY_COOLDOWN_MS,
      CONNECTION_STABILITY_COOLDOWN_MS,
      Number(timing.stabilityCooldownMaxMs ?? 0) || 0
    ),
    MINING_DIAGNOSTIC_INTERVAL_MS: Math.max(
      1000,
      Number(timing.miningDiagnosticIntervalMs ?? 30000) || 30000
    ),
    MOVING_PISTON_WAIT_MS: Math.max(1, Number(timing.movingPistonWaitMs ?? 1) || 1),
    MOVING_PISTON_LOG_AFTER_IDLE_MS: Math.max(
      0,
      Number(timing.movingPistonLogAfterIdleMs ?? 15000) || 15000
    ),
    START_STAGGER: Math.max(
      0,
      Number.isFinite(configuredStartStagger)
        ? configuredStartStagger === 30000
          ? 1000
          : configuredStartStagger
        : 1000
    ),
    START_STAGGER_JITTER: Math.max(
      0,
      Number.isFinite(configuredStartStaggerJitter)
        ? configuredStartStaggerJitter === 15000
          ? 500
          : configuredStartStaggerJitter
        : 500
    ),
    PERIODIC_REJOIN_MS: timing.periodicRejoinMs || 3600000,
    ANTIBOT_MIN_INTERVAL: antibot.minInterval,
    ANTIBOT_MAX_INTERVAL: antibot.maxInterval,
    ANTIBOT_SHORT_MOVE_MS: antibot.shortMoveMs,
    ANTIBOT_FALL_CHECK_ENABLED,
    FEATURE_ACTIVE_FALL_CHECK_ENABLED,
    ACTIVE_FALL_CHECK_ENABLED: Boolean(
      ANTIBOT_FALL_CHECK_ENABLED && FEATURE_ACTIVE_FALL_CHECK_ENABLED
    ),
    ANTIBOT_FALL_CHECK_TIMEOUT: antibot.fallCheckTimeout,
    LIMBO_FALL_TICKS: Math.max(
      20,
      Number.isFinite(configuredLimboFallTicks)
        ? configuredLimboFallTicks === 96
          ? 128
          : configuredLimboFallTicks
        : LIMBO_FILTER_DEFAULTS.fallingCheckTicks
    ),
    LIMBO_FALL_PACKET_MS: Math.max(
      15,
      Number.isFinite(configuredLimboFallPacketMs)
        ? configuredLimboFallPacketMs === 25
          ? 50
          : configuredLimboFallPacketMs
        : LIMBO_FILTER_DEFAULTS.packetMs
    ),
    LIMBO_DETECTION_TIMEOUT_MS: Math.max(
      1500,
      Number(antibot.limboDetectionTimeoutMs ?? 4500) || 4500
    ),
    LIMBO_COMPLETION_GRACE_MS: Math.max(0, Number(antibot.limboCompletionGraceMs ?? 900) || 900),
    LIMBO_POST_FALL_JOIN_MS: Math.max(0, Number(antibot.limboPostFallJoinMs ?? 900) || 900),
    LIMBO_MENU_WAIT_MS: Math.max(0, Number(antibot.limboMenuWaitMs ?? 12000) || 12000),
    POST_LIMBO_MENU_WATCHDOG_MS: Math.max(
      10000,
      Number(timing.postLimboMenuWatchdogMs ?? 45000) || 45000
    ),
    SCANNER_PASSIVE_WAIT_MS: Math.max(
      15000,
      Number(antibot.scannerPassiveWaitMs ?? 60000) || 60000
    ),
    SCANNER_RECENT_POSITION_MS: Math.max(
      500,
      Number(antibot.scannerRecentPositionMs ?? 5000) || 5000
    ),
    SCANNER_POSITION_WAIT_MS: Math.max(500, Number(antibot.scannerPositionWaitMs ?? 2500) || 2500),
    LIMBO_SERVER_TIMEOUT_MS: Math.max(
      5000,
      Number(antibot.limboServerTimeoutMs ?? LIMBO_FILTER_DEFAULTS.timeoutMs) ||
        LIMBO_FILTER_DEFAULTS.timeoutMs
    ),
    MENU_ATTEMPT_LIMIT: Math.max(3, Number(timing.menuAttemptLimit ?? 6) || 6),
    MENU_RECOVERY_BASE_MS,
    MENU_RECOVERY_STEP_MS: Math.max(0, Number(timing.menuRecoveryStepMs ?? 2500) || 2500),
    MENU_RECOVERY_MAX_MS: Math.max(
      MENU_RECOVERY_BASE_MS,
      Number(timing.menuRecoveryMaxMs ?? 18000) || 18000
    ),
    MENU_RECOVERY_JITTER_MS: Math.max(0, Number(timing.menuRecoveryJitterMs ?? 2500) || 2500),
    CLIENT_TIMEOUT_RECONNECT_MS: Math.max(
      3000,
      Number(timing.clientTimeoutReconnectMs ?? 6000) || 6000
    ),
    CLIENT_TIMEOUT_RECONNECT_JITTER_MS: Math.max(
      0,
      Number(timing.clientTimeoutReconnectJitterMs ?? 4000) || 4000
    ),
    MENU_ACTION_INTERVAL_MS: 350,
    MENU_WINDOW_TRANSITION_WAIT_MS: 2200,
    MENU_SUBSERVER_JOIN_WAIT_MS: 10000,
    GLOBAL_ERROR_THRESHOLD: globalRestart.errorThreshold,
    GLOBAL_ERROR_TIME_WINDOW: globalRestart.timeWindowMs,
    STOP_ON_NO_INTERNET: globalRestart.stopOnNoInternet,
    NO_INTERNET_THRESHOLD: globalRestart.noInternetThreshold,
    botsConfigs: Array.isArray(config.bots) ? config.bots : [],
    ROTATION_DELAY_BETWEEN_BOTS: timing.rotationDelayBetweenBots || 120000,
    POSITION_CHECK_INTERVAL: mobileRuntimeProfile
      ? Math.max(numberOr(position.checkInterval, 10000), MOBILE_POSITION_CHECK_INTERVAL_MS)
      : numberOr(position.checkInterval, 10000),
    POSITION_RETURN_TIMEOUT: position.returnTimeout || 8000,
    POSITION_FAR_RECONNECT_IDLE_MS: Math.max(
      5000,
      Number(position.farReconnectIdleMs ?? 30000) || 30000
    ),
    POSITION_FAR_DISTANCE: Math.max(50, Number(position.farDistance ?? 500) || 500),
    POSITION_RECHECK_SAMPLES: Math.max(1, Number(position.recheckSamples ?? 3) || 3),
    POSITION_RECHECK_DELAY_MS: Math.max(100, Number(position.recheckDelayMs ?? 700) || 700),
    POSITION_NEAR_MINING_EXTRA_REACH: Math.max(0, Number(position.nearMiningExtraReach ?? 1) || 1),
    UI_RENDER_INTERVAL,
    SNAPSHOT_INTERVAL: mobileRuntimeProfile
      ? Math.max(UI_RENDER_INTERVAL, MOBILE_SNAPSHOT_INTERVAL_MS)
      : UI_RENDER_INTERVAL,
    RESOURCE_INTERVAL: mobileRuntimeProfile
      ? Math.max(UI_RENDER_INTERVAL, MOBILE_RESOURCE_INTERVAL_MS)
      : UI_RENDER_INTERVAL,
    PAUSE_FILE_PATH: path.resolve(configDir, pause.file || 'pause.txt'),
    PAUSE_CHECK_INTERVAL: mobileRuntimeProfile
      ? Math.max(numberOr(pause.checkInterval, 1000), MOBILE_PAUSE_CHECK_INTERVAL_MS)
      : numberOr(pause.checkInterval, 1000),
    CHAT_CAPTCHA_RECONNECT_MS,
    MEMORY_LIMIT_MB: globalRestart.memoryLimitMB || 0,
    OFFLINE_WATCHDOG_MS: Math.max(30000, Number(maintenance.offlineWatchdogMs ?? 90000) || 90000),
    OFFLINE_WATCHDOG_INTERVAL_MS,
    BOT_FILTER_RETRY_BASE_MS,
    BOT_FILTER_RETRY_MAX_MS: Math.max(
      BOT_FILTER_RETRY_BASE_MS,
      Number(maintenance.botFilterRetryMaxMs ?? 120000) || 120000
    ),
    BOT_FILTER_FALL_ATTEMPTS_BEFORE_HOLD: Math.max(
      1,
      Number(maintenance.botFilterFallAttemptsBeforeHold ?? 2) || 2
    ),
    BOT_FILTER_FALL_HOLD_MS: Math.max(
      CHAT_CAPTCHA_RECONNECT_MS,
      Number(maintenance.botFilterFallHoldMs ?? CHAT_CAPTCHA_RECONNECT_MS) ||
        CHAT_CAPTCHA_RECONNECT_MS
    ),
    ENABLE_SOFT_RESTART: features.enableSoftRestart !== false,
    ENABLE_AGGRESSIVE_MINING: features.enableAggressiveMining !== false,
    ENABLE_ADAPTIVE_PACKET_GOVERNOR: features.adaptivePacketGovernorEnabled !== false,
    ENABLE_ADAPTIVE_MINING_CONTROLLER: features.adaptiveMiningControllerEnabled !== false,
    ENABLE_PERIODIC_ROTATION: features.enablePeriodicRotation === true,
    SPEED_WINDOW_MS,
    SPEED_GUARD_ENABLED: features.enableSpeedGuard !== false,
    SPEED_GUARD_INTERVAL_MS,
    SPEED_GUARD_START_GRACE_MS: Math.max(
      15000,
      Number(timing.speedGuardStartGraceMs ?? 45000) || 45000
    ),
    SPEED_GUARD_LOW_RATE_MS,
    SPEED_GUARD_RECOVERY_COOLDOWN_MS: Math.max(
      5000,
      Number(timing.speedGuardRecoveryCooldownMs ?? 15000) || 15000
    ),
    SPEED_GUARD_ALLOWED_DROP_PERCENT: Math.min(
      50,
      Math.max(1, Number(timing.speedGuardAllowedDropPercent ?? 10) || 10)
    ),
    SPEED_GUARD_TARGET_RATIO: getSpeedGuardTargetRatioFromDropPercent(
      timing.speedGuardAllowedDropPercent,
      timing.speedGuardTargetRatio ?? 0.9
    ),
    SPEED_GUARD_RATE_WINDOW_MS: Math.max(
      SPEED_WINDOW_MS,
      Number(timing.speedGuardRateWindowMs ?? 30000) || 30000
    ),
    SPEED_GUARD_BUTTON_IDLE_MS: Math.max(
      5000,
      Number(timing.speedGuardButtonIdleMs ?? 12000) || 12000
    ),
    SPEED_GUARD_NO_PROGRESS_RECONNECT_MS,
    SPEED_GUARD_RECOVERY_TOLERANCE_RATIO: Math.min(
      0.995,
      Math.max(0.9, Number(timing.speedGuardRecoveryToleranceRatio ?? 0.98) || 0.98)
    ),
    SPEED_GUARD_RECOVERY_MIN_GAP_BPM: Math.max(
      0,
      Number(timing.speedGuardRecoveryMinGapBpm ?? 20) || 20
    ),
    ONLINE_MINING_STALL_MS: Math.max(
      OFFLINE_WATCHDOG_INTERVAL_MS * 2,
      SPEED_GUARD_NO_PROGRESS_RECONNECT_MS * 3,
      Number(maintenance.onlineMiningStallMs ?? 90000) || 90000
    ),
    SPEED_GUARD_RECONNECT_AFTER_RECOVERIES: Math.max(
      3,
      Number(timing.speedGuardReconnectAfterRecoveries ?? 3) || 3
    ),
    SPEED_GUARD_SOFT_RESTART_AFTER_RECOVERIES: Math.max(
      2,
      Number(timing.speedGuardSoftRestartAfterRecoveries ?? 2) || 2
    ),
    SPEED_GUARD_SUSTAINED_DROP_RECONNECT_MS: Math.max(
      SPEED_GUARD_LOW_RATE_MS,
      Number(timing.speedGuardSustainedDropReconnectMs ?? 45000) || 45000
    ),
    SPEED_GUARD_SEVERE_DROP_RATIO: Math.min(
      0.95,
      Math.max(0.4, Number(timing.speedGuardSevereDropRatio ?? 0.85) || 0.85)
    ),
    SPEED_GUARD_PEAK_MEMORY_MS: Math.max(
      5 * 60 * 1000,
      Number(timing.speedGuardPeakMemoryMs ?? 2 * 60 * 60 * 1000) || 2 * 60 * 60 * 1000
    ),
    PACKET_GOVERNOR_RECOVERY_MS: Math.max(
      BREAK_PACKET_SAFE_MODE_MS,
      Number(timing.packetGovernorRecoveryMs ?? 5 * 60 * 1000) || 5 * 60 * 1000
    )
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function loadRuntimeConfig(filePath, defaultsPath = path.join(__dirname, '..', 'config.json')) {
  const rawConfig = readJson(filePath)
  const defaults = defaultsPath && fs.existsSync(defaultsPath) ? readJson(defaultsPath) : {}
  return normalizeRuntimeConfig(rawConfig, defaults)
}

module.exports = {
  CONFIG_SCHEMA_VERSION,
  createRuntimeSettings,
  loadRuntimeConfig,
  mergeConfigDefaults,
  normalizeRuntimeConfig
}

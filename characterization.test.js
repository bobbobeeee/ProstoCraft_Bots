const assert = require('assert')
const { execFileSync } = require('child_process')

function assertExportNames(modulePath, expected) {
  const actual = Object.keys(require(modulePath)).sort()
  assert.deepStrictEqual(actual, [...expected].sort(), modulePath)
}

function stable(value) {
  return JSON.parse(JSON.stringify(value))
}

assertExportNames('./monitoring', [
  'computeBotRateStats',
  'formatBlocksPerMinute',
  'formatBlocksPerSecond'
])

assertExportNames('./bot-filter', [
  'BOT_FILTER_RETRY_RESET_MS',
  'calculateBotFilterReconnectDelay',
  'classifyBotFilterMessage',
  'isChatCaptchaText',
  'isFallCheckFailureReason',
  'isScannerWaitText',
  'normalizeBotFilterText'
])

assertExportNames('./reconnect-policy', [
  'getReconnectDecision',
  'isTooManyPacketsText',
  'normalizeReconnectText',
  'randomDelay'
])

assertExportNames('./limbo-filter', [
  'LIMBO_FILTER_DEFAULTS',
  'createFallPacket',
  'createFallSequence',
  'getFinishPacketTicks',
  'getLoadedChunkSpeed',
  'getMinimumCheckMs',
  'normalizeLimboStartY',
  'validateFallPacket'
])

assertExportNames('./stability-center', [
  'HEALTH_DEFINITIONS',
  'classifyHealthEvent',
  'computeSmartRateStats',
  'createHealthState',
  'getRuntimeRecoveryDecision',
  'normalizeHealthReason',
  'updateHealthState'
])

assertExportNames('./config-migrations', [
  'LEGACY_CONFIG_RULES',
  'applyLegacyConfigMigrations',
  'getValueByPath'
])

assertExportNames('./update-service', [
  'DEFAULT_UPDATE_SOURCES',
  'buildUpdateInfoFromRelease',
  'checkForUpdates',
  'compareVersions',
  'downloadUpdate',
  'fetchReleaseManifest',
  'findChecksumForAsset',
  'getPlatformAssetPattern',
  'isNewerVersion',
  'normalizeVersion',
  'parseSha256Sums',
  'readUpdateCache',
  'selectUpdateAsset',
  'verifyFileSha256',
  'writeUpdateCache'
])

assertExportNames('./runtime-core/packet-governor', [
  'getPacketGovernorLimits',
  'normalizeBaseLimits'
])

assertExportNames('./runtime-core/lifecycle-state', [
  'LIFECYCLE_STATES',
  'createLifecycleState',
  'getLifecycleSnapshot',
  'normalizeLifecycleState',
  'transitionLifecycle'
])

assertExportNames('./runtime-core/event-timeline', [
  'addTimelineEvent',
  'createEventTimeline',
  'getTimelineSnapshot',
  'sanitizeTimelineMessage'
])

assertExportNames('./runtime-core/captcha-evidence', [
  'classifyCaptchaEvidence',
  'createCaptchaEvidence',
  'normalizeEvidenceText',
  'validateCaptchaEvidence'
])

assertExportNames('./runtime-core/packet-break-tracker', [
  'createPacketBreakTracker',
  'getPositionKey'
])

assertExportNames('./runtime-core/client-packets', [
  'createClientIdentityPackets',
  'createTeleportConfirmPayload',
  'encodeMinecraftString',
  'encodeVarInt',
  'summarizeClientPacketPayload'
])

assertExportNames('./runtime-core/config-schema', [
  'CONFIG_SCHEMA_VERSION',
  'createRuntimeSettings',
  'loadRuntimeConfig',
  'mergeConfigDefaults',
  'normalizeRuntimeConfig'
])

assertExportNames('./runtime-core/minecraft-text', [
  'classifyServerMenuWindow',
  'flatifyMinecraftTextPart',
  'flattenMinecraftText',
  'getItemDisplayText',
  'getMessageJson',
  'getMinecraftMessageText',
  'getWindowSlotText',
  'getWindowTitleText',
  'isUsableChatText'
])

assertExportNames('./runtime-core/position-guard', [
  'describeCoordinateHealth',
  'formatDistance',
  'formatPosition',
  'isCoordinateHealthFarFromWorkArea',
  'isCoordinateHealthInWorkArea'
])

assertExportNames('./runtime-core/runtime-formatters', [
  'cleanLogMessage',
  'getServerMessageSource',
  'isVisibleServerMessagePosition',
  'normalizeChatText',
  'normalizeDiagnosticValue',
  'normalizeServerMessagePosition',
  'shortenDiagnosticText',
  'stringifyDiagnostic',
  'summarizeDiagnosticDetails',
  'summarizeDiagnosticPacket',
  'summarizeServerMessageJson'
])

assertExportNames('./runtime-core/runtime-logger', [
  'DEFAULT_MAX_LOG_SIZE',
  'createRuntimeLogger',
  'formatChatLogLine',
  'initAppendOnlyLogFile',
  'writeAppendOnlyLogLine'
])

assertExportNames('./runtime-core/runtime-state', [
  'classifyLogHealth',
  'createMonitorData',
  'createRuntimeState',
  'getHealthLogLabel',
  'getPacketGovernorAggregate'
])

assertExportNames('./runtime-core/bot-session', ['createBotSessionFactory'])

assertExportNames('./runtime-core/runtime-manager', ['createRuntimeManager'])

assertExportNames('./runtime-core/runtime-ui', ['createRuntimeUi'])

assertExportNames('./runtime-core/process-guard', [
  'createProcessLifecycle',
  'installConsoleNoiseFilters',
  'isIgnorableProcessError'
])

assertExportNames('./desktop/main/config-store', ['createConfigStore'])
assertExportNames('./desktop/main/constants', [
  'APP_VERSION',
  'BOT_EVENT_PREFIX',
  'DEFAULT_DESKTOP_SETTINGS',
  'DESKTOP_SETTINGS_FILE',
  'MAX_RECENT_CHAT_LOGS',
  'MAX_RECENT_LOGS',
  'PRODUCT_NAME',
  'RUNTIME_DIRNAME',
  'RUNTIME_STALE_AFTER_MS',
  'RUNTIME_STALE_CHECK_MS',
  'RUNTIME_STALE_RESTART_COOLDOWN_MS',
  'UPDATE_SOURCE'
])
assertExportNames('./desktop/main/desktop-settings', ['createDesktopSettingsStore'])
assertExportNames('./desktop/main/dialog-actions', ['createDialogActions'])
assertExportNames('./desktop/main/ipc-handlers', ['registerIpcHandlers'])
assertExportNames('./desktop/main/ipc-security', [
  'IPC_CHANNELS',
  'assertBoolean',
  'assertNoPayload',
  'assertPlainObject',
  'createSecureIpcRegistry',
  'ipcValidators',
  'isPlainObject'
])
assertExportNames('./desktop/main/json-store', ['readJson', 'writeJson'])
assertExportNames('./desktop/main/paths', ['createDesktopPaths'])
assertExportNames('./desktop/main/runtime-controller', [
  'createInitialRuntimeState',
  'createRuntimeController'
])
assertExportNames('./desktop/main/tray-controller', ['createTrayController'])
assertExportNames('./desktop/main/update-controller', [
  'createEmptyUpdateState',
  'createUpdateController'
])
assertExportNames('./desktop/main/window-controller', [
  'createWindowController',
  'isExternalHttpUrl'
])

assertExportNames('./scripts/android-release/android-tools', [
  'findExecutableInDir',
  'isSupportedJavaHome',
  'resolveAndroidBuildTool',
  'resolveJavaHome',
  'resolveKeytool'
])
assertExportNames('./scripts/android-release/build-pipeline', [
  'buildCordovaAndroidRelease',
  'createAndroidReleaseEnv'
])
assertExportNames('./scripts/android-release/context', ['createAndroidReleaseContext'])
assertExportNames('./scripts/android-release/cordova-android-project', [
  'ensureCordovaAndroidBuildExtras',
  'ensureCordovaAndroidManifest',
  'ensureCordovaAndroidResources',
  'ensureCordovaAndroidSources'
])
assertExportNames('./scripts/android-release/fs-utils', [
  'cleanBuildDirectories',
  'cleanOutputApks',
  'ensurePathExists',
  'writeFileIfChanged',
  'writeFileIfMissing'
])
assertExportNames('./scripts/android-release/nodejs-plugin-patcher', [
  'patchNodeJsMobilePlugin',
  'patchNodeJsMobilePluginSource'
])
assertExportNames('./scripts/android-release/process-runner', [
  'normalizeSpawn',
  'run',
  'spawnChecked',
  'stopGradle'
])
assertExportNames('./scripts/android-release/runtime-keepalive-service-source', [
  'getRuntimeKeepAliveServiceSource'
])
assertExportNames('./scripts/android-release/signing', [
  'findBuiltReleaseApk',
  'signUnsignedApkIfNeeded',
  'syncSigningConfigPaths'
])
assertExportNames('./scripts/android-release/versioning', [
  'ensureAndroidManifestNativeLibPackaging',
  'ensureAndroidManifestPermission',
  'ensureAndroidManifestVersion',
  'ensureCordovaConfigVersion',
  'ensureJavaImport',
  'ensureNodeJsFeature',
  'escapeRegex',
  'setRootXmlAttribute',
  'toAndroidPath',
  'toAndroidVersionCode'
])

const { calculateBotFilterReconnectDelay, classifyBotFilterMessage } = require('./bot-filter')
const { getReconnectDecision } = require('./reconnect-policy')
const { createFallPacket, createFallSequence, validateFallPacket } = require('./limbo-filter')
const {
  classifyHealthEvent,
  computeSmartRateStats,
  createHealthState,
  getRuntimeRecoveryDecision,
  updateHealthState
} = require('./stability-center')
const {
  addTimelineEvent,
  createEventTimeline,
  getTimelineSnapshot
} = require('./runtime-core/event-timeline')
const {
  getPacketGovernorLimits
} = require('./runtime-core/packet-governor')
const {
  createCaptchaEvidence,
  validateCaptchaEvidence
} = require('./runtime-core/captcha-evidence')
const { buildUpdateInfoFromRelease, parseSha256Sums } = require('./update-service')

assert.deepStrictEqual(
  [
    classifyBotFilterMessage('Сканер | Пожалуйста, введите капчу в чат. Осталось попыток: 3.'),
    classifyBotFilterMessage(
      "LimboFilter Bot-Filter check was started, please wait and don't move.."
    ),
    classifyBotFilterMessage('Добро пожаловать на сервер')
  ],
  ['chat-captcha', 'fall-wait', 'none']
)

assert.deepStrictEqual(
  stable(
    calculateBotFilterReconnectDelay({
      reason: 'limbo-position-timeout',
      retryCount: 1,
      lastFailureAt: 1000,
      now: 3000,
      retryBaseMs: 8000,
      retryMaxMs: 120000,
      fallAttemptsBeforeHold: 2,
      fallHoldMs: 1800000,
      random: () => 0.5
    })
  ),
  {
    delay: 1815000,
    retryCount: 2,
    lastFailureAt: 3000,
    fallCheckFailure: true,
    fallHoldActive: true,
    jitter: 15000
  }
)

assert.deepStrictEqual(
  stable(
    getReconnectDecision(
      {
        type: 'kick',
        reason: 'AntiBot You have exceeded the maximum Bot-Filter check time.',
        wasInBotFilterCheck: true
      },
      { random: () => 0 }
    )
  ),
  {
    action: 'bot-filter',
    forced: true,
    scheduleReason: 'kick-limbo-timeout',
    botFilterReason: 'kick-limbo-timeout',
    botFilterLogReason: 'LimboFilter таймаут',
    logs: []
  }
)

assert.deepStrictEqual(
  stable(
    getReconnectDecision(
      {
        type: 'error',
        message: 'Client timed out after 30000 milliseconds',
        error: { code: 'ETIMEDOUT' }
      },
      {
        clientTimeoutReconnectMs: 6000,
        clientTimeoutReconnectJitterMs: 4000,
        random: () => 0.25
      }
    )
  ),
  {
    action: 'schedule',
    delay: 7000,
    forced: true,
    scheduleReason: 'error-client-timeout',
    logs: [{ level: 'warning', message: '! Клиент таймаут' }],
    stabilityCooldownReason: null,
    noteNoInternet: false
  }
)

assert.deepStrictEqual(stable(createFallPacket({ x: 10, y: 300, z: -4 }, 3)), {
  tick: 3,
  x: 10,
  y: 299.53584064,
  z: -4,
  onGround: false,
  fallStep: 0.23052736000000032,
  totalFallen: 0.46415935999999647
})

const fallSequence = createFallSequence({ x: 10, y: 300, z: -4 }, { fallingCheckTicks: 3 })
assert.strictEqual(fallSequence.length, 4)
assert.deepStrictEqual(
  stable(
    validateFallPacket(fallSequence[1], {
      validX: 10,
      validZ: -4,
      lastY: fallSequence[0].y,
      tick: 2
    })
  ),
  {
    ok: true,
    delta: 0.15523200000001225,
    expectedDelta: 0.15523200000000031,
    diff: 1.1934897514720433e-14,
    tick: 2
  }
)

const health = updateHealthState(
  createHealthState(1000),
  { message: 'read ECONNRESET', reconnectReason: 'error-network-ECONNRESET' },
  4000
)
assert.deepStrictEqual(stable(health), {
  state: 'recovering',
  reason: 'network-reset',
  severity: 'warning',
  since: '1970-01-01T00:00:04.000Z',
  sinceMs: 4000,
  downtimeMs: 0,
  diagnosis: 'Причина просадки: сеть сбросила соединение, бот переподключается.',
  lastNetworkError: 'read ECONNRESET',
  lastReconnectReason: 'error-network-ECONNRESET',
  lastRecoveryAction: ''
})

assert.strictEqual(classifyHealthEvent({ message: 'mining-confirmation просадка' }), 'mining-confirmation')
assert.deepStrictEqual(
  stable(
    getRuntimeRecoveryDecision({
      running: true,
      desired: true,
      lastEventAt: 1000,
      now: 62000,
      staleAfterMs: 60000
    })
  ),
  {
    action: 'restart-runtime',
    reason: 'runtime-stale',
    staleForMs: 61000,
    severity: 'error'
  }
)
assert.deepStrictEqual(
  stable(
    computeSmartRateStats({
      blockTimes: [1000, 30000, 59000, 61000, 90000],
      now: 91000,
      rawWindowMs: 60000,
      speedWindowMs: 10000,
      status: 'копает',
      activeSince: 31000
    })
  ),
  {
    blockTimes: [59000, 61000, 90000],
    rawBlocksLastMinute: 3,
    rawBlocksPerSecond: 0.1,
    rawRatePerMinute: 3,
    effectiveBlocks: 3,
    effectiveWindowMs: 60000,
    effectiveRatePerMinute: 3,
    effectiveBlocksPerSecond: 0.05,
    recovering: false
  }
)

const timeline = createEventTimeline(10)
addTimelineEvent(
  timeline,
  {
    type: 'network',
    severity: 'warning',
    reason: 'ECONNRESET',
    message: 'C:\\Users\\Ilya\\bot.log token gho_123ABC'
  },
  1000
)
addTimelineEvent(
  timeline,
  {
    type: 'network',
    severity: 'warning',
    reason: 'ECONNRESET',
    message: 'C:\\Users\\Ilya\\bot.log token gho_123ABC'
  },
  2000
)
assert.deepStrictEqual(stable(getTimelineSnapshot(timeline, { limit: 1 })), [
  {
    id: '1000-1',
    timestamp: '1970-01-01T00:00:02.000Z',
    timestampMs: 2000,
    type: 'network',
    severity: 'warning',
    reason: 'ECONNRESET',
    source: '',
    botName: '',
    message: 'C:\\Users\\[user]\\bot.log token [token]',
    repeatCount: 2
  }
])

assert.deepStrictEqual(
  stable(
    getPacketGovernorLimits({
      perSecond: 300,
      burst: 84,
      burstWindowMs: 250,
      targetCooldownMs: 8,
      pendingRetryMs: 32
    })
  ),
  {
    mode: 'fast',
    fastPerSecond: 300,
    fastBurst: 84,
    perSecond: 300,
    burst: 84,
    burstWindowMs: 250,
    targetCooldownMs: 8,
    pendingRetryMs: 32
  }
)

const evidence = validateCaptchaEvidence(
  createCaptchaEvidence({
    text: 'Сканер | Пожалуйста, введите капчу в чат.',
    source: 'server-chat',
    position: 'chat',
    packetSeen: true,
    now: 1000
  }),
  'chat-captcha'
)
assert.deepStrictEqual(stable(evidence), {
  kind: 'chat-captcha',
  text: 'Сканер | Пожалуйста, введите капчу в чат.',
  source: 'server-chat',
  position: 'chat',
  visibleChat: true,
  sender: '',
  timestamp: '1970-01-01T00:00:01.000Z',
  timestampMs: 1000,
  packetName: 'message',
  packetSeen: true,
  valid: true,
  reason: 'ok'
})

const checksumText = [
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  ProstoCraft.Bot.Studio-Setup-3.0.0.exe',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  ProstoCraft.Bot.Studio-Mobile-3.0.0.apk'
].join('\n')
const release = {
  tag_name: 'v3.0.0',
  name: 'ProstoCraft Bot Studio 3.0.0',
  html_url: 'https://example.test/release',
  published_at: '2026-06-01T00:00:00Z',
  body: 'release body',
  assets: [
    {
      name: 'ProstoCraft.Bot.Studio-Setup-3.0.0.exe',
      size: 10,
      browser_download_url: 'https://example.test/setup.exe'
    },
    {
      name: 'SHA256SUMS.txt',
      size: 100,
      browser_download_url: 'https://example.test/SHA256SUMS.txt'
    }
  ]
}
assert.strictEqual(
  parseSha256Sums(checksumText).get('prostocraft.bot.studio-mobile-3.0.0.apk'),
  'b'.repeat(64)
)
const updateInfo = buildUpdateInfoFromRelease(release, {
  platform: 'desktop',
  currentVersion: '2.9.9',
  checksumText
})
assert(Number.isFinite(Date.parse(updateInfo.checkedAt)))
assert.deepStrictEqual(
  stable({
    ...updateInfo,
    checkedAt: '[checked-at]'
  }),
  {
    status: 'available',
    updateAvailable: true,
    currentVersion: '2.9.9',
    latestVersion: '3.0.0',
    tagName: 'v3.0.0',
    releaseName: 'ProstoCraft Bot Studio 3.0.0',
    releaseUrl: 'https://example.test/release',
    publishedAt: '2026-06-01T00:00:00Z',
    body: 'release body',
    source: null,
    sourceMode: 'online',
    checkedAt: '[checked-at]',
    asset: {
      name: 'ProstoCraft.Bot.Studio-Setup-3.0.0.exe',
      size: 10,
      downloadUrl: 'https://example.test/setup.exe',
      contentType: ''
    },
    checksum: {
      algorithm: 'sha256',
      hash: 'a'.repeat(64),
      assetName: 'SHA256SUMS.txt'
    },
    checksumAsset: {
      name: 'SHA256SUMS.txt',
      size: 100,
      downloadUrl: 'https://example.test/SHA256SUMS.txt'
    }
  }
)

const hostProbe = `
global.__BOT_HOST__ = { register(api) { global.__api = api } };
global.__BOT_BASE_CONSOLE__ = { warn() {}, error() {}, log() {} };
global.__BOT_BASE_STDERR_WRITE__ = () => true;
const write = process.stdout.write.bind(process.stdout);
process.env.BOT_AUTOSTART = '0';
process.env.BOT_HEADLESS = '1';
process.env.BOT_GUI_MODE = '0';
const api = require('./bot');
const snapshot = api.getRuntimeSnapshot();
api.shutdownForHost('characterization-test');
write(JSON.stringify({
  exportKeys: Object.keys(api).sort(),
  registeredSameApi: global.__api === api,
  snapshotKeys: Object.keys(snapshot).sort(),
  performanceKeys: Object.keys(snapshot.performance).sort(),
  healthKeys: Object.keys(snapshot.health).sort(),
  botCount: Object.keys(snapshot.bots).length
}) + '\\n');
`

const hostOutput = execFileSync(process.execPath, ['-e', hostProbe], {
  cwd: __dirname,
  encoding: 'utf8',
  env: {
    ...process.env,
    BOT_AUTOSTART: '0',
    BOT_HEADLESS: '1',
    BOT_GUI_MODE: '0'
  },
  timeout: 10000
})
  .trim()
  .split(/\r?\n/)
  .pop()

assert.deepStrictEqual(JSON.parse(hostOutput), {
  exportKeys: ['getRuntimeSnapshot', 'restart', 'setPaused', 'shutdownForHost', 'start', 'stop'],
  registeredSameApi: true,
  snapshotKeys: [
    'activeBots',
    'bots',
    'configPath',
    'currentEffectiveRatePerMinute',
    'currentEffectiveRatePerSecond',
    'currentRatePerMinute',
    'currentRatePerSecond',
    'currentRawRatePerMinute',
    'currentRawRatePerSecond',
    'health',
    'logFilePath',
    'paused',
    'performance',
    'totalBlocks',
    'totalBots',
    'uptimeMs'
  ],
  performanceKeys: [
    'effectiveRate',
    'effectiveRatePerSecond',
    'lastSlowdownReason',
    'packetBudget',
    'packetMode',
    'peakRate',
    'rawRate',
    'rawRatePerSecond'
  ],
  healthKeys: [
    'diagnosis',
    'downtimeMs',
    'lastNetworkError',
    'lastReconnectReason',
    'lastRecoveryAction',
    'reason',
    'severity',
    'since',
    'state',
    'timeline'
  ],
  botCount: 0
})

console.log('characterization tests passed')

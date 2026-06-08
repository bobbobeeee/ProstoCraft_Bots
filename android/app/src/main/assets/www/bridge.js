(function initBotStudioBridge() {
  const DEFAULT_CONFIG = {
      "server": {
          "host": "mc.prostocraft.com",
          "port": 25565,
          "version": "1.16.5",
          "password": ""
      },
      "timing": {
          "digDelay": 0,
          "emptyScanDelayMs": 0,
          "emptyTargetRecheckMs": 5,
          "emptyTargetLogAfterIdleMs": 15000,
          "emptyTargetLogIntervalMs": 30000,
          "entryButtonAfterPressWaitMs": 0,
          "entryButtonRetryIntervalMs": 250,
          "entryButtonStartupAttempts": 4,
          "entryButtonStartupRetryMs": 350,
          "entryButtonConfirmMs": 900,
          "entryButtonWatchdogMs": 3000,
          "emptyTargetButtonRetryMs": 20000,
          "emptyTargetButtonRetryCooldownMs": 60000,
          "emptyTargetButtonRetryLimit": 2,
          "miningLoopIdleMs": 2,
          "miningBatchSize": 96,
          "burstBreakWindowMs": 1500,
          "burstBreakIntervalMs": 1,
          "burstBreakRepeats": 2,
          "burstBreakReach": 5.1,
          "burstLookRefreshMs": 2000,
          "breakPacketTargetCooldownMs": 12,
          "breakPacketPendingRetryMs": 32,
          "breakPacketMinTargetCooldownMs": 8,
          "breakPacketMaxPerSecond": 300,
          "breakPacketBurstWindowMs": 250,
          "breakPacketBurstLimit": 84,
          "breakPacketSafeMaxPerSecond": 240,
          "breakPacketSafeBurstLimit": 68,
          "breakPacketSafeModeMs": 120000,
          "breakPacketSafeRepeats": 1,
          "packetGovernorRecoveryMs": 300000,
          "loginCommandCooldownMs": 7000,
          "reactiveBreakRepeats": 1,
          "transientBreakRepeats": 1,
          "packetBreakConfirmWindowMs": 1500,
          "blockCountDedupeMs": 75,
          "packetOnlyMining": true,
          "packetOnlyFallbackMs": 1200,
          "miningControllerAdjustIntervalMs": 12000,
          "miningControllerSoftRecoveryLimit": 3,
          "miningControllerMinBudgetScale": 0.55,
          "miningControllerGoodConfirmationRatio": 0.86,
          "miningControllerBadConfirmationRatio": 0.55,
          "miningControllerStalePendingMs": 1200,
          "preemptiveBreakTargets": false,
          "fastDigConfirmMs": 15,
          "fastDigRetryMs": 1,
          "fastDigMinVanillaTimeMs": 0,
          "postJoinDigStartMs": 25,
          "postJoinPositionGraceMs": 8000,
          "stabilityCooldownMs": 0,
          "connectionStabilityCooldownMs": 0,
          "stabilityCooldownMaxMs": 0,
          "miningDiagnosticIntervalMs": 30000,
          "movingPistonWaitMs": 1,
          "movingPistonLogAfterIdleMs": 15000,
          "stuckThreshold": 30000,
          "restartIfIdleMs": 120000,
          "menuAttemptLimit": 6,
          "menuRecoveryBaseMs": 3500,
          "menuRecoveryStepMs": 2500,
          "menuRecoveryMaxMs": 18000,
          "menuRecoveryJitterMs": 2500,
          "postLimboMenuWatchdogMs": 45000,
          "clientTimeoutReconnectMs": 6000,
          "clientTimeoutReconnectJitterMs": 4000,
          "reconnectRegular": 15000,
          "reconnectOnInternetLoss": 45000,
          "internetRetryInterval": 60000,
          "internetCheckInterval": 30000,
          "maxInternetRetries": 999,
          "graceAfterSpawn": 20000,
          "startStagger": 1000,
          "startStaggerJitter": 500,
          "periodicRejoinMs": 3600000,
          "rotationDelayBetweenBots": 120000,
          "speedGuardIntervalMs": 5000,
          "speedGuardStartGraceMs": 20000,
          "speedGuardLowRateMs": 10000,
          "speedGuardRecoveryCooldownMs": 5000,
          "speedGuardTargetRatio": 0.9,
          "speedGuardRateWindowMs": 30000,
          "speedGuardButtonIdleMs": 12000,
          "speedGuardNoProgressReconnectMs": 20000,
          "speedGuardReconnectAfterRecoveries": 3,
          "speedGuardSoftRestartAfterRecoveries": 2,
          "speedGuardSustainedDropReconnectMs": 45000,
          "speedGuardSevereDropRatio": 0.85,
          "speedGuardPeakMemoryMs": 7200000,
          "stuckRecoveryMs": 60000,
          "speedGuardAllowedDropPercent": 10
      },
      "antibot": {
          "minInterval": 3000,
          "maxInterval": 12000,
          "shortMoveMs": 150,
          "fallCheckEnabled": false,
          "fallCheckTimeout": 3000,
          "limboFallTicks": 128,
          "limboFallPacketMs": 50,
          "limboDetectionTimeoutMs": 4500,
          "limboCompletionGraceMs": 900,
          "limboPostFallJoinMs": 900,
          "limboMenuWaitMs": 12000,
          "scannerPassiveWaitMs": 60000,
          "scannerRecentPositionMs": 5000,
          "scannerPositionWaitMs": 2500,
          "limboServerTimeoutMs": 15000
      },
      "menu": {
          "slot1": 10,
          "slot2": 13,
          "hotbarSlot": 0
      },
      "globalRestart": {
          "errorThreshold": 15,
          "timeWindowMs": 600000,
          "stopOnNoInternet": false,
          "noInternetThreshold": 8,
          "memoryLimitMB": 1024
      },
      "position": {
          "checkInterval": 10000,
          "returnTimeout": 8000,
          "farReconnectIdleMs": 30000,
          "farDistance": 500,
          "recheckSamples": 3,
          "recheckDelayMs": 700,
          "nearMiningExtraReach": 1
      },
      "ui": {
          "renderIntervalMs": 1000,
          "graphUpdateMs": 15000
      },
      "monitor": {
          "historyLength": 180,
          "cpuRamHistoryLength": 60
      },
      "maintenance": {
          "cleanupIntervalMs": 3600000,
          "softRestartMaxPerHour": 2,
          "offlineWatchdogMs": 90000,
          "offlineWatchdogIntervalMs": 30000,
          "botFilterRetryBaseMs": 8000,
          "botFilterRetryMaxMs": 120000,
          "botFilterFallAttemptsBeforeHold": 2,
          "botFilterFallHoldMs": 1800000,
          "chatCaptchaReconnectMs": 1800000
      },
      "metrics": {
          "port": 3000
      },
      "log": {
          "maxSizeBytes": 52428800
      },
      "features": {
          "enableAggressiveMining": true,
          "enableSoftRestart": true,
          "enableHeapSnapshot": false,
          "enableActiveFallCheck": true,
          "enableMetrics": true,
          "enablePerBotLogs": true,
          "enableLazyRotation": false,
          "enablePeriodicRotation": false,
          "enableSpeedGuard": true,
          "adaptivePacketGovernorEnabled": true,
          "adaptiveMiningControllerEnabled": true
      },
      "logging": {
          "level": "info",
          "logVerbosity": "normal",
          "toFile": false,
          "filePath": "bot.log",
          "debugMode": false,
          "detailedEvents": false,
          "logServerMessages": false,
          "diagnosticMaxValueLength": 1400,
          "diagnosticPositionIntervalMs": 30000,
          "diagnosticRepeatSummaryMs": 30000,
          "diagnosticFullPacketDetails": false
      },
      "pause": {
          "file": "pause.txt",
          "checkInterval": 1000
      },
      "bots": []
  }

  const DEFAULT_DESKTOP_SETTINGS = {
    launchOnStartup: false,
    autoStartBotsOnLaunch: false,
    startMinimized: false,
    minimizeToTray: false,
    closeToTray: false
  }

  const DEFAULT_CAPABILITIES = {
    runtimeControl: true,
    runtimeStreaming: true,
    fileImport: true,
    fileExport: true,
    openRuntimeDir: true,
    updates: false
  }

  function createEmptyUpdateState() {
    return {
      status: 'idle',
      currentVersion: '0.0.0',
      latestVersion: '',
      updateAvailable: false,
      checkedAt: '',
      publishedAt: '',
      releaseName: '',
      releaseUrl: '',
      body: '',
      asset: null,
      checksum: null,
      sourceMode: 'idle',
      signatureStatus: '',
      installResumeState: '',
      progress: null,
      downloadedFilePath: '',
      downloadedFileName: '',
      downloadedSize: 0,
      error: ''
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function createEmptyRuntime(note) {
    const logs = note
      ? [
          {
            level: 'warning',
            botName: 'SYSTEM',
            message: note,
            rawMessage: note,
            time: new Date().toLocaleTimeString('ru-RU'),
            timestamp: new Date().toISOString()
          }
        ]
      : []

    return {
      status: 'stopped',
      isPaused: false,
      resources: { cpuPercent: 0, memoryMb: 0 },
      snapshot: {
        totalBlocks: 0,
        uptimeMs: 0,
        activeBots: 0,
        totalBots: 0,
        paused: false,
        currentRatePerMinute: 0,
        currentRatePerSecond: 0,
        currentEffectiveRatePerMinute: 0,
        currentEffectiveRatePerSecond: 0,
        currentRawRatePerMinute: 0,
        currentRawRatePerSecond: 0,
        performance: {
          rawRate: 0,
          rawRatePerSecond: 0,
          effectiveRate: 0,
          effectiveRatePerSecond: 0,
          peakRate: 0,
          sustainableRate: 0,
          confirmationRatio: 1,
          confirmLatencyMs: 0,
          packetMode: 'fast',
          packetBudget: null,
          fallbackDigCount: 0,
          pendingBreaks: 0,
          stalePendingCleared: 0,
          lastMiningBottleneck: '',
          lastSlowdownReason: ''
        },
        bots: {}
      },
      logs,
      chatLogs: [],
      configPath: '-',
      logPath: '-',
      chatLogPath: '-',
      runtimeDir: '-'
    }
  }

  function normalizeBootstrapPayload(payload, fallback = {}) {
    return {
      platform: fallback.platform || payload?.platform || 'desktop',
      capabilities: {
        ...DEFAULT_CAPABILITIES,
        ...(fallback.capabilities || {}),
        ...(payload?.capabilities || {})
      },
      config: payload?.config || clone(DEFAULT_CONFIG),
      desktopSettings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        ...(payload?.desktopSettings || {})
      },
      runtime: {
        ...createEmptyRuntime(),
        ...(payload?.runtime || {})
      },
      updates: {
        ...createEmptyUpdateState(),
        ...(payload?.updates || {})
      },
      appVersion: payload?.appVersion || payload?.updates?.currentVersion || '0.0.0',
      updateSource: payload?.updateSource || null
    }
  }

  function createElectronBridge() {
    const nativeBridge = window.botStudio

    return {
      async getBootstrap() {
        const payload = await nativeBridge.getBootstrap()
        return normalizeBootstrapPayload(payload, {
          platform: 'desktop',
          capabilities: DEFAULT_CAPABILITIES
        })
      },
      saveDesktopSettings: settings => nativeBridge.saveDesktopSettings(settings),
      saveConfig: config => nativeBridge.saveConfig(config),
      resetConfig: () => nativeBridge.resetConfig(),
      importConfig: () => nativeBridge.importConfig(),
      exportConfig: config => nativeBridge.exportConfig(config),
      startRuntime: () => nativeBridge.startRuntime(),
      stopRuntime: () => nativeBridge.stopRuntime(),
      restartRuntime: () => nativeBridge.restartRuntime(),
      setPaused: nextPaused => nativeBridge.setPaused(nextPaused),
      checkUpdates: () => nativeBridge.checkUpdates(),
      downloadUpdate: () => nativeBridge.downloadUpdate(),
      installUpdate: () => nativeBridge.installUpdate(),
      openRuntimeDir: () => nativeBridge.openRuntimeDir(),
      onRuntimeState: callback => nativeBridge.onRuntimeState(callback),
      onUpdateState: callback => nativeBridge.onUpdateState(callback)
    }
  }

  function createCordovaBridge() {
    const runtimeListeners = new Set()
    const updateListeners = new Set()
    const pendingRequests = new Map()
    let requestId = 0
    let startupPromise = null
    let listenersAttached = false

    const deviceReadyPromise = new Promise(resolve => {
      if (window.cordova?.platformId) {
        resolve()
        return
      }

      document.addEventListener('deviceready', resolve, { once: true })
    })

    async function waitForNodeBridge(timeoutMs = 15000) {
      if (window.nodejs?.channel && typeof window.nodejs.start === 'function') {
        return
      }

      await new Promise((resolve, reject) => {
        const startedAt = Date.now()
        const timer = window.setInterval(() => {
          if (window.nodejs?.channel && typeof window.nodejs.start === 'function') {
            window.clearInterval(timer)
            resolve()
            return
          }

          if (Date.now() - startedAt >= timeoutMs) {
            window.clearInterval(timer)
            reject(new Error('Android Node bridge did not become available after deviceready.'))
          }
        }, 120)
      })
    }

    function attachListeners() {
      if (listenersAttached) return
      listenersAttached = true

      window.nodejs.channel.on('bridge:response', message => {
        const pending = pendingRequests.get(message?.requestId)
        if (!pending) return
        pendingRequests.delete(message.requestId)

        if (message?.error) {
          pending.reject(new Error(message.error))
          return
        }

        pending.resolve(message?.payload)
      })

      window.nodejs.channel.on('bridge:event', message => {
        if (!message) return
        if (message.type === 'runtime') {
          runtimeListeners.forEach(listener => listener(message.payload))
        } else if (message.type === 'updates') {
          updateListeners.forEach(listener => listener(message.payload))
        }
      })
    }

    function isEngineAlreadyStartedError(error) {
      const message = typeof error === 'string'
        ? error
        : error?.message

      return typeof message === 'string' && /engine already started/i.test(message)
    }

    async function ensureStarted() {
      await deviceReadyPromise
      await waitForNodeBridge()

      if (startupPromise) {
        return startupPromise
      }

      attachListeners()
      startupPromise = new Promise((resolve, reject) => {
        window.nodejs.start(
          'mobile-runtime.js',
          error => {
            if (error && !isEngineAlreadyStartedError(error)) {
              startupPromise = null
              reject(typeof error === 'string' ? new Error(error) : error)
              return
            }
            resolve()
          },
          { redirectOutputToLogcat: false }
        )
      })

      return startupPromise
    }

    async function sendRequest(action, payload = {}) {
      await ensureStarted()

      return new Promise((resolve, reject) => {
        const nextRequestId = `cordova-${++requestId}`
        pendingRequests.set(nextRequestId, { resolve, reject })
        window.nodejs.channel.post('bridge:request', {
          requestId: nextRequestId,
          action,
          payload
        })
      })
    }

    return {
      getBootstrap: () => sendRequest('getBootstrap'),
      saveDesktopSettings: settings => sendRequest('saveDesktopSettings', { settings }),
      saveConfig: config => sendRequest('saveConfig', { config }),
      resetConfig: () => sendRequest('resetConfig'),
      importConfig: () => Promise.resolve({ canceled: true, reason: 'not_supported' }),
      exportConfig: config => Promise.resolve({ canceled: true, reason: 'not_supported', config }),
      startRuntime: () => sendRequest('startRuntime'),
      stopRuntime: () => sendRequest('stopRuntime'),
      restartRuntime: () => sendRequest('restartRuntime'),
      setPaused: nextPaused => sendRequest('setPaused', { nextPaused }),
      checkUpdates: () => sendRequest('checkUpdates'),
      downloadUpdate: () => sendRequest('downloadUpdate'),
      installUpdate: () => sendRequest('installUpdate'),
      openRuntimeDir: () => Promise.resolve(null),
      onRuntimeState(callback) {
        runtimeListeners.add(callback)
        return () => runtimeListeners.delete(callback)
      },
      onUpdateState(callback) {
        updateListeners.add(callback)
        return () => updateListeners.delete(callback)
      }
    }
  }

  function createAndroidBridge() {
    const nativeBridge = window.BotStudioAndroid
    const listeners = new Set()

    function parseNativeJson(rawValue, fallback) {
      if (rawValue == null || rawValue === '') {
        return fallback
      }

      if (typeof rawValue === 'object') {
        return rawValue
      }

      try {
        return JSON.parse(rawValue)
      } catch (error) {
        return fallback
      }
    }

    function callNative(methodName, ...args) {
      if (!nativeBridge || typeof nativeBridge[methodName] !== 'function') {
        return undefined
      }

      return nativeBridge[methodName](...args)
    }

    window.__BOT_STUDIO_PUSH_RUNTIME = rawPayload => {
      const payload = parseNativeJson(rawPayload, null)
      if (!payload) return
      listeners.forEach(listener => listener(payload))
    }

    return {
      async getBootstrap() {
        const payload = parseNativeJson(callNative('getBootstrap'), {})
        return normalizeBootstrapPayload(payload, {
          platform: 'android',
          capabilities: {
            runtimeControl: false,
            runtimeStreaming: false,
            fileImport: false,
            fileExport: false,
            openRuntimeDir: false,
            updates: false
          }
        })
      },
      async saveDesktopSettings(settings) {
        return parseNativeJson(
          callNative('saveDesktopSettings', JSON.stringify(settings)),
          { ...DEFAULT_DESKTOP_SETTINGS }
        )
      },
      async saveConfig(config) {
        return parseNativeJson(
          callNative('saveConfig', JSON.stringify(config)),
          {
            config,
            runtime: createEmptyRuntime(
              'Android-сборка сохраняет конфиг локально, но не запускает встроенный runtime mineflayer.'
            )
          }
        )
      },
      async resetConfig() {
        return parseNativeJson(
          callNative('resetConfig'),
          {
            config: clone(DEFAULT_CONFIG),
            runtime: createEmptyRuntime()
          }
        )
      },
      async importConfig() {
        return parseNativeJson(callNative('importConfig'), { canceled: true, reason: 'not_supported' })
      },
      async exportConfig(config) {
        return parseNativeJson(
          callNative('exportConfig', JSON.stringify(config)),
          { canceled: true, reason: 'not_supported' }
        )
      },
      async startRuntime() {
        return parseNativeJson(callNative('startRuntime'), createEmptyRuntime())
      },
      async stopRuntime() {
        return parseNativeJson(callNative('stopRuntime'), createEmptyRuntime())
      },
      async restartRuntime() {
        return parseNativeJson(callNative('restartRuntime'), createEmptyRuntime())
      },
      async setPaused(nextPaused) {
        return parseNativeJson(callNative('setPaused', String(nextPaused)), createEmptyRuntime())
      },
      async checkUpdates() {
        return createEmptyUpdateState()
      },
      async downloadUpdate() {
        return createEmptyUpdateState()
      },
      async installUpdate() {
        return createEmptyUpdateState()
      },
      async openRuntimeDir() {
        return parseNativeJson(callNative('openRuntimeDir'), createEmptyRuntime())
      },
      onRuntimeState(callback) {
        listeners.add(callback)
        return () => listeners.delete(callback)
      },
      onUpdateState() {
        return () => {}
      }
    }
  }

  function createUnavailableBridge() {
    const buildError = () => new Error(
      'Bot Studio bridge is unavailable. Open this interface from the desktop app or Android build.'
    )
    const rejectUnavailable = async () => {
      throw buildError()
    }

    return {
      getBootstrap: rejectUnavailable,
      saveDesktopSettings: rejectUnavailable,
      saveConfig: rejectUnavailable,
      resetConfig: rejectUnavailable,
      importConfig: rejectUnavailable,
      exportConfig: rejectUnavailable,
      startRuntime: rejectUnavailable,
      stopRuntime: rejectUnavailable,
      restartRuntime: rejectUnavailable,
      setPaused: rejectUnavailable,
      checkUpdates: rejectUnavailable,
      downloadUpdate: rejectUnavailable,
      installUpdate: rejectUnavailable,
      openRuntimeDir: rejectUnavailable,
      onRuntimeState() {
        return () => {}
      },
      onUpdateState() {
        return () => {}
      }
    }
  }

  const bridgeCache = {
    electron: null,
    cordova: null,
    android: null,
    unavailable: null
  }

  function resolveBridge() {
    if (window.botStudio) {
      if (!bridgeCache.electron) {
        bridgeCache.electron = createElectronBridge()
      }
      return bridgeCache.electron
    }

    if (window.cordova) {
      if (!bridgeCache.cordova) {
        bridgeCache.cordova = createCordovaBridge()
      }
      return bridgeCache.cordova
    }

    if (window.BotStudioAndroid) {
      if (!bridgeCache.android) {
        bridgeCache.android = createAndroidBridge()
      }
      return bridgeCache.android
    }

    if (!bridgeCache.unavailable) {
      bridgeCache.unavailable = createUnavailableBridge()
    }

    return bridgeCache.unavailable
  }

  async function getBridgeWithRetry(timeoutMs = 1500) {
    const bridge = resolveBridge()
    if (bridge !== bridgeCache.unavailable) {
      return bridge
    }

    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise(resolve => window.setTimeout(resolve, 50))
      const nextBridge = resolveBridge()
      if (nextBridge !== bridgeCache.unavailable) {
        return nextBridge
      }
    }

    return bridgeCache.unavailable
  }

  window.botStudioBridge = {
    async getBootstrap() {
      const bridge = await getBridgeWithRetry()
      return bridge.getBootstrap()
    },
    async saveDesktopSettings(settings) {
      const bridge = await getBridgeWithRetry()
      return bridge.saveDesktopSettings(settings)
    },
    async saveConfig(config) {
      const bridge = await getBridgeWithRetry()
      return bridge.saveConfig(config)
    },
    async resetConfig() {
      const bridge = await getBridgeWithRetry()
      return bridge.resetConfig()
    },
    async importConfig() {
      const bridge = await getBridgeWithRetry()
      return bridge.importConfig()
    },
    async exportConfig(config) {
      const bridge = await getBridgeWithRetry()
      return bridge.exportConfig(config)
    },
    async startRuntime() {
      const bridge = await getBridgeWithRetry()
      return bridge.startRuntime()
    },
    async stopRuntime() {
      const bridge = await getBridgeWithRetry()
      return bridge.stopRuntime()
    },
    async restartRuntime() {
      const bridge = await getBridgeWithRetry()
      return bridge.restartRuntime()
    },
    async setPaused(nextPaused) {
      const bridge = await getBridgeWithRetry()
      return bridge.setPaused(nextPaused)
    },
    async checkUpdates() {
      const bridge = await getBridgeWithRetry()
      return bridge.checkUpdates()
    },
    async downloadUpdate() {
      const bridge = await getBridgeWithRetry()
      return bridge.downloadUpdate()
    },
    async installUpdate() {
      const bridge = await getBridgeWithRetry()
      return bridge.installUpdate()
    },
    async openRuntimeDir() {
      const bridge = await getBridgeWithRetry()
      return bridge.openRuntimeDir()
    },
    onRuntimeState(callback) {
      return resolveBridge().onRuntimeState(callback)
    },
    onUpdateState(callback) {
      return resolveBridge().onUpdateState(callback)
    }
  }
})()

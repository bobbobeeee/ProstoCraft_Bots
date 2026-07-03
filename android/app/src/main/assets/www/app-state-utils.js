;(function initBotStudioRendererUtils() {
  function createEmptyRuntime() {
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
        bots: {}
      },
      logs: [],
      chatLogs: [],
      configPath: '-',
      logPath: '-',
      chatLogPath: '-',
      runtimeDir: '-'
    }
  }

  function createDefaultDesktopSettings() {
    return {
      launchOnStartup: false,
      autoStartBotsOnLaunch: false,
      startMinimized: false,
      minimizeToTray: false,
      closeToTray: false
    }
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

  function createDefaultEntryButton() {
    return {
      enabled: false,
      x: 0,
      y: 0,
      z: 0
    }
  }

  function normalizeCapabilities(capabilities = {}) {
    return {
      runtimeControl: true,
      runtimeStreaming: true,
      fileImport: true,
      fileExport: true,
      openRuntimeDir: true,
      updates: false,
      ...capabilities
    }
  }

  function toFiniteNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  function normalizeVector3(vector, fallback = 0) {
    const source = vector && typeof vector === 'object' ? vector : {}
    return {
      x: toFiniteNumber(source.x, fallback),
      y: toFiniteNumber(source.y, fallback),
      z: toFiniteNumber(source.z, fallback)
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function normalizeBotShape(sourceBot = {}) {
    const nextBot = sourceBot && typeof sourceBot === 'object' ? clone(sourceBot) : {}
    const rawEntryButton =
      nextBot.entryButton && typeof nextBot.entryButton === 'object' ? nextBot.entryButton : {}

    nextBot.standPosition = normalizeVector3(nextBot.standPosition)
    nextBot.maxDistanceFromStand = toFiniteNumber(nextBot.maxDistanceFromStand, 0.6)
    nextBot.blocksToMine =
      Array.isArray(nextBot.blocksToMine) && nextBot.blocksToMine.length > 0
        ? nextBot.blocksToMine.map(coordinate => normalizeVector3(coordinate))
        : [{ x: 0, y: 0, z: 0 }]
    nextBot.entryButton = {
      enabled: Boolean(rawEntryButton.enabled),
      ...normalizeVector3(rawEntryButton)
    }

    return nextBot
  }

  function normalizeConfigShape(config) {
    const nextConfig = {
      ...(config || {})
    }
    if (!Array.isArray(nextConfig.bots)) {
      nextConfig.bots = []
    } else {
      nextConfig.bots = nextConfig.bots.map(bot => normalizeBotShape(bot))
    }
    return nextConfig
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function escapeAttribute(value) {
    return escapeHtml(value)
  }

  function humanizeKey(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, char => char.toUpperCase())
      .replace(/\bMs\b/g, 'ms')
      .replace(/\bMB\b/g, 'MB')
  }

  function formatStatus(status) {
    const map = {
      stopped: { label: 'Остановлен', className: 'status-pill--idle' },
      starting: { label: 'Запуск', className: 'status-pill--starting' },
      running: { label: 'Работает', className: 'status-pill--running' },
      stopping: { label: 'Остановка', className: 'status-pill--stopping' },
      error: { label: 'Ошибка', className: 'status-pill--error' }
    }
    return map[status] || map.stopped
  }

  function formatLiveStatus(status) {
    const map = {
      stopped: 'Остановлен',
      stopping: 'Останавливается',
      starting: 'Запускается',
      running: 'Работает',
      paused: 'На паузе',
      idle: 'Ожидает',
      reconnecting: 'Переподключается',
      offline: 'Оффлайн',
      online: 'Онлайн',
      mining: 'Добывает',
      копает: 'Добывает',
      ожидание: 'Ожидает',
      оффлайн: 'Оффлайн',
      подключается: 'Подключается',
      возврат: 'Возврат',
      error: 'Ошибка'
    }

    if (!status) return 'Неизвестно'
    return map[status] || String(status)
  }

  function getLiveStatusClass(status) {
    const map = {
      mining: 'bot-live--good',
      running: 'bot-live--good',
      online: 'bot-live--good',
      starting: 'bot-live--busy',
      stopping: 'bot-live--busy',
      reconnecting: 'bot-live--busy',
      подключается: 'bot-live--busy',
      paused: 'bot-live--warn',
      idle: 'bot-live--warn',
      ожидание: 'bot-live--warn',
      error: 'bot-live--bad',
      offline: 'bot-live--idle',
      оффлайн: 'bot-live--idle',
      копает: 'bot-live--good',
      stopped: 'bot-live--idle'
    }

    return map[status] || 'bot-live--idle'
  }

  function formatCoordinateTriplet(coordinate) {
    if (!coordinate) return '0, 0, 0'
    return `${coordinate.x ?? 0}, ${coordinate.y ?? 0}, ${coordinate.z ?? 0}`
  }

  function formatEntryButtonLabel(bot) {
    if (!bot?.entryButton?.enabled) return 'выключена'
    return `${bot.entryButton.x ?? 0}, ${bot.entryButton.y ?? 0}, ${bot.entryButton.z ?? 0}`
  }

  function formatLastBlockLabel(liveBot) {
    if (!liveBot?.lastBlockTime) return 'нет данных'
    return `${formatDuration(Date.now() - liveBot.lastBlockTime)} назад`
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0с'
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) return `${hours}ч ${minutes}м`
    if (minutes > 0) return `${minutes}м ${seconds}с`
    return `${seconds}с`
  }

  function formatNumber(value, fractionDigits = 0) {
    if (!Number.isFinite(value)) return '0'
    return new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits
    }).format(value)
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex += 1
    }

    return `${formatNumber(size, unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
  }

  function formatDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function createSummaryCard(label, value, note) {
    return `
    <article class="summary-card">
      <span class="summary-label">${label}</span>
      <div class="summary-value">${value}</div>
      <div class="summary-note">${note}</div>
    </article>
  `
  }

  function createCompactSummaryCard(label, value, note) {
    return `
    <article class="mini-summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(note)}</span>
    </article>
  `
  }

  function renderMobileActionButton(action) {
    return `
    <button
      class="button button--${action.variant || 'secondary'}"
      type="button"
      data-mobile-action="${escapeAttribute(action.id)}"
      ${action.disabled ? 'disabled' : ''}
    >
      ${escapeHtml(action.label)}
    </button>
  `
  }

  window.BotStudioRendererUtils = {
    createEmptyRuntime,
    createDefaultDesktopSettings,
    createEmptyUpdateState,
    createDefaultEntryButton,
    normalizeCapabilities,
    toFiniteNumber,
    normalizeVector3,
    clone,
    normalizeBotShape,
    normalizeConfigShape,
    escapeHtml,
    escapeAttribute,
    humanizeKey,
    formatStatus,
    formatLiveStatus,
    getLiveStatusClass,
    formatCoordinateTriplet,
    formatEntryButtonLabel,
    formatLastBlockLabel,
    formatDuration,
    formatNumber,
    formatBytes,
    formatDateTime,
    createSummaryCard,
    createCompactSummaryCard,
    renderMobileActionButton
  }
})()

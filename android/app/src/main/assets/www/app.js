const utils = window.BotStudioRendererUtils
const settingsValues = window.BotStudioSettingsValues
const bridge = window.botStudioBridge || window.botStudio
const elements = {}
const renderQueue = new Set()
let renderFrameId = null

const state = {
  config: null,
  desktopSettings: utils.createDefaultDesktopSettings(),
  runtime: utils.createEmptyRuntime(),
  platform: 'desktop',
  capabilities: {
    runtimeControl: true,
    runtimeStreaming: true,
    fileImport: true,
    fileExport: true,
    openRuntimeDir: true,
    updates: false
  },
  appVersion: '0.0.0',
  updateSource: null,
  updates: utils.createEmptyUpdateState(),
  activeTab: 'dashboard',
  activeLogView: 'events',
  activeLogFilter: 'important',
  activeMoreView: 'settings',
  selectedBotIndex: 0,
  isDirty: false,
  coordinateModalOpen: false,
  unsubscribeRuntime: null,
  unsubscribeUpdates: null,
  updateAutoCheckStarted: false
}

function queueRender(...parts) {
  const nextParts = parts.flat().filter(Boolean)
  if (!nextParts.length) nextParts.push('all')
  nextParts.forEach(part => renderQueue.add(part))
  if (document.hidden || renderFrameId != null) return

  renderFrameId = window.requestAnimationFrame(() => {
    renderFrameId = null
    flushRenderQueue()
  })
}

function isTextEntryElement(element) {
  if (!element || typeof element.matches !== 'function') return false
  if (element.matches('textarea, [contenteditable]:not([contenteditable="false"])')) return true
  if (!element.matches('input')) return false

  const inputType = (element.getAttribute('type') || 'text').toLowerCase()
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit'
  ].includes(inputType)
}

function flushRenderQueue() {
  if (document.hidden || !renderQueue.size) return
  const nextParts = new Set(renderQueue)
  renderQueue.clear()

  if (nextParts.has('all')) {
    window.BotStudioApp.renderAll()
    return
  }

  const app = window.BotStudioApp
  if (nextParts.has('tabs')) app.renderTabs()
  if (nextParts.has('chrome')) app.renderChrome()
  if (nextParts.has('dashboard')) app.renderDashboard()
  if (nextParts.has('botList')) app.renderBotList()
  if (nextParts.has('botEditor')) app.renderBotEditor()
  if (nextParts.has('settings')) app.renderSettingsV2()
  if (nextParts.has('validation')) app.renderValidation()
  if (nextParts.has('logs')) app.renderLogs()
  if (nextParts.has('updates')) app.renderUpdates()
  if (nextParts.has('chat')) app.renderChatLogs()
  if (nextParts.has('about')) app.renderAbout()
}

function getBots() {
  return Array.isArray(state.config?.bots) ? state.config.bots : []
}

function ensureSelectedBot() {
  const bots = getBots()
  if (!bots.length) {
    state.selectedBotIndex = 0
    return
  }
  if (state.selectedBotIndex >= bots.length) state.selectedBotIndex = bots.length - 1
  if (state.selectedBotIndex < 0) state.selectedBotIndex = 0
}

function getSelectedBot() {
  ensureSelectedBot()
  return getBots()[state.selectedBotIndex] || null
}

function buildUniqueBotName(baseName = 'Bot') {
  const existing = new Set(getBots().map(bot => bot.username))
  if (!existing.has(baseName)) return baseName

  let index = 2
  while (existing.has(`${baseName}_${index}`)) index += 1
  return `${baseName}_${index}`
}

function createBotTemplate(source = null) {
  const bot = utils.normalizeBotShape(
    source
      ? utils.clone(source)
      : {
          username: buildUniqueBotName('NewMiner'),
          standPosition: { x: 0, y: 0, z: 0 },
          maxDistanceFromStand: 0.6,
          blocksToMine: [{ x: 0, y: 0, z: 0 }],
          entryButton: utils.createDefaultEntryButton()
        }
  )

  bot.username = buildUniqueBotName(bot.username || 'NewMiner')
  if (!Array.isArray(bot.blocksToMine) || bot.blocksToMine.length === 0) {
    bot.blocksToMine = [{ x: 0, y: 0, z: 0 }]
  }
  bot.entryButton = {
    ...utils.createDefaultEntryButton(),
    ...(bot.entryButton || {})
  }
  return bot
}

function showToast(message, variant = 'success') {
  const toast = document.createElement('div')
  toast.className = `toast toast--${variant}`
  toast.textContent = message
  elements.toastStack.appendChild(toast)

  window.setTimeout(() => {
    toast.remove()
  }, 3200)
}

function closeCoordinateModal() {
  state.coordinateModalOpen = false
  elements.coordinateModal.hidden = true
  elements.coordinateModal.style.display = 'none'
}

function openCoordinateModal() {
  const selectedBot = getSelectedBot()
  state.coordinateModalOpen = true
  elements.coordinateModal.hidden = false
  elements.coordinateModal.style.display = 'grid'
  elements.coordinateModalTarget.textContent = selectedBot
    ? `Бот: ${selectedBot.username}`
    : 'Бот не выбран'
}

function markDirty(nextDirty = true) {
  state.isDirty = nextDirty
  queueRender('chrome', 'validation')
}

function renderAll() {
  const app = window.BotStudioApp
  renderQueue.clear()
  app.renderTabs()
  app.renderChrome()
  app.renderDashboard()
  app.renderBotList()
  app.renderBotEditor()
  app.renderSettingsV2()
  app.renderValidation()
  app.renderUpdates()
  app.renderLogs()
  app.renderChatLogs()
  app.renderAbout()
}

function cacheElements() {
  const ids = {
    workspace: 'workspace',
    dashboardTopbar: 'dashboard-topbar',
    dashboardHero: 'dashboard-hero',
    platformLabel: 'platform-label',
    topbarTitle: 'topbar-title',
    sidebarStatusPill: 'sidebar-status-pill',
    sidebarStatusCopy: 'sidebar-status-copy',
    topbarSubtitle: 'topbar-subtitle',
    summaryCards: 'summary-cards',
    contextSwitcher: 'context-switcher',
    mobileOverview: 'mobile-overview',
    mobileActionBar: 'mobile-action-bar',
    startStopButton: 'start-stop-btn',
    restartButton: 'restart-btn',
    pauseButton: 'pause-btn',
    saveConfigButton: 'save-config-btn',
    openRuntimeDirButton: 'open-runtime-dir-btn',
    dashboardBotGrid: 'dashboard-bot-grid',
    botList: 'bot-list',
    botEditor: 'bot-editor',
    saveBotsButton: 'save-bots-btn',
    settingsSections: 'settings-sections',
    saveSettingsButton: 'save-settings-btn',
    validationBanner: 'validation-banner',
    logStream: 'log-stream',
    logCounter: 'log-counter',
    chatLogStream: 'chat-log-stream',
    chatLogCounter: 'chat-log-counter',
    updatesContent: 'updates-content',
    checkUpdatesButton: 'check-updates-btn',
    downloadUpdateButton: 'download-update-btn',
    installUpdateButton: 'install-update-btn',
    openReleaseButton: 'open-release-btn',
    aboutContent: 'about-content',
    configPathLabel: 'config-path-label',
    logPathLabel: 'log-path-label',
    chatLogPathLabel: 'chat-log-path-label',
    runtimePathLabel: 'runtime-path-label',
    addBotButton: 'add-bot-btn',
    duplicateBotButton: 'duplicate-bot-btn',
    removeBotButton: 'remove-bot-btn',
    importConfigButton: 'import-config-btn',
    exportConfigButton: 'export-config-btn',
    resetConfigButton: 'reset-config-btn',
    coordinateModal: 'coordinate-modal',
    coordinateModalTarget: 'coordinate-modal-target',
    coordinateTextarea: 'coordinate-textarea',
    closeCoordinateModalButton: 'close-coordinate-modal-btn',
    replaceCoordinatesButton: 'replace-coordinates-btn',
    appendCoordinatesButton: 'append-coordinates-btn',
    toastStack: 'toast-stack'
  }

  for (const [key, id] of Object.entries(ids)) {
    elements[key] = document.getElementById(id)
  }
  elements.coordinateModal.style.display = elements.coordinateModal.hidden ? 'none' : 'grid'
}

async function bootstrap() {
  cacheElements()
  window.BotStudioApp.attachStaticListeners()

  const bootstrapPayload = await bridge.getBootstrap()
  state.config = utils.normalizeConfigShape(bootstrapPayload.config)
  state.desktopSettings = {
    ...utils.createDefaultDesktopSettings(),
    ...(bootstrapPayload.desktopSettings || {})
  }
  state.platform = bootstrapPayload.platform || 'desktop'
  state.appVersion =
    bootstrapPayload.appVersion || bootstrapPayload.updates?.currentVersion || '0.0.0'
  state.updateSource = bootstrapPayload.updateSource || null
  state.capabilities = utils.normalizeCapabilities(bootstrapPayload.capabilities)
  state.runtime = {
    ...utils.createEmptyRuntime(),
    ...(bootstrapPayload.runtime || {})
  }
  state.updates = {
    ...utils.createEmptyUpdateState(),
    currentVersion: state.appVersion,
    ...(bootstrapPayload.updates || {})
  }
  state.selectedBotIndex = 0
  document.body.dataset.platform = state.platform

  if (state.unsubscribeRuntime) state.unsubscribeRuntime()
  state.unsubscribeRuntime = bridge.onRuntimeState(nextRuntime => {
    state.runtime = {
      ...utils.createEmptyRuntime(),
      ...(nextRuntime || {})
    }
    const runtimeParts = ['chrome']
    if (state.activeTab === 'dashboard') runtimeParts.push('dashboard')
    else if (state.activeTab === 'bots') runtimeParts.push('botList', 'botEditor')
    else if (state.activeTab === 'logs')
      runtimeParts.push(state.activeLogView === 'chat' ? 'chat' : 'logs')
    else if (state.activeTab === 'more' && state.activeMoreView === 'about')
      runtimeParts.push('about')
    queueRender(runtimeParts)
  })

  if (state.unsubscribeUpdates) state.unsubscribeUpdates()
  state.unsubscribeUpdates = bridge.onUpdateState(nextUpdates => {
    state.updates = {
      ...utils.createEmptyUpdateState(),
      currentVersion: state.appVersion,
      ...(nextUpdates || {})
    }
    queueRender(
      state.activeTab === 'more' && state.activeMoreView === 'updates' ? 'updates' : null,
      'chrome',
      'about'
    )
  })

  renderAll()
  window.BotStudioApp.startAutoUpdateCheck()
}

window.BotStudioApp = {
  state,
  bridge,
  elements,
  settingsValues,
  queueRender,
  isTextEntryElement,
  flushRenderQueue,
  getBots,
  ensureSelectedBot,
  getSelectedBot,
  buildUniqueBotName,
  createBotTemplate,
  showToast,
  closeCoordinateModal,
  openCoordinateModal,
  markDirty,
  renderAll,
  cacheElements,
  bootstrap
}

window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(error => {
    console.error(error)
    document.body.innerHTML = `
      <div style="padding: 32px; color: white; font-family: sans-serif;">
        <h1>Не удалось запустить интерфейс</h1>
        <pre>${error.message}</pre>
      </div>
    `
  })
})

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.coordinateModalOpen) {
    closeCoordinateModal()
  }
})

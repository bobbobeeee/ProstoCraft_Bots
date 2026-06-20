;(function initBotStudioActions() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const validation = window.BotStudioValidation
  const { state, bridge } = app
  const { createDefaultDesktopSettings, createEmptyRuntime, normalizeConfigShape } = utils
  const { validateConfig } = validation

  function queueRender(...args) {
    return app.queueRender(...args)
  }

  function renderAll(...args) {
    return app.renderAll(...args)
  }

  function showToast(...args) {
    return app.showToast(...args)
  }

  function getSelectedBot(...args) {
    return app.getSelectedBot(...args)
  }

  function getBots(...args) {
    return app.getBots(...args)
  }

  function ensureSelectedBot(...args) {
    return app.ensureSelectedBot(...args)
  }

  function createBotTemplate(...args) {
    return app.createBotTemplate(...args)
  }

  function getActivePanelName(...args) {
    return app.getActivePanelName(...args)
  }

  function getTopLevelTabForRequest(...args) {
    return app.getTopLevelTabForRequest(...args)
  }

  async function persistConfig(showSuccessToast = true) {
    const issues = validateConfig(state.config)
    if (issues.length) {
      state.activeTab = 'more'
      state.activeMoreView = 'settings'
      queueRender('tabs', 'chrome', 'settings', 'validation')
      throw new Error('Сначала исправьте ошибки в конфиге на вкладке настроек.')
    }

    const nextDesktopSettings = await bridge.saveDesktopSettings(state.desktopSettings)
    const result = await bridge.saveConfig(state.config)
    state.desktopSettings = {
      ...createDefaultDesktopSettings(),
      ...nextDesktopSettings
    }
    state.config = normalizeConfigShape(result.config)
    state.runtime = {
      ...createEmptyRuntime(),
      ...(result.runtime || {})
    }
    state.isDirty = false
    renderAll()

    if (showSuccessToast) {
      showToast('Конфиг и настройки приложения сохранены.', 'success')
    }
  }

  async function handleStartStopClick() {
    if (state.capabilities.runtimeControl === false) {
      showToast('В этой Android/WebView-сборке локальный runtime не запускается.', 'warning')
      return
    }

    const isRunning = state.runtime.status === 'running' || state.runtime.status === 'starting'
    if (isRunning) {
      await bridge.stopRuntime()
      return
    }

    await persistConfig(false)
    await bridge.startRuntime()
    showToast('Backend запущен.', 'success')
  }

  async function handleRestartClick() {
    if (state.capabilities.runtimeControl === false) {
      showToast('Перезапуск runtime доступен только в desktop-сборке.', 'warning')
      return
    }

    await persistConfig(false)
    await bridge.restartRuntime()
    showToast('Backend перезапускается с новым конфигом.', 'success')
  }

  async function handlePauseToggle() {
    if (state.capabilities.runtimeControl === false) {
      showToast('Пауза runtime доступна только в desktop-сборке.', 'warning')
      return
    }

    const nextPaused = !state.runtime.isPaused
    await bridge.setPaused(nextPaused)
    showToast(nextPaused ? 'Пауза включена.' : 'Пауза снята.', 'success')
  }

  async function handleImportConfig() {
    const result = await bridge.importConfig()
    if (result.canceled) {
      if (result.reason === 'not_supported') {
        showToast('Импорт конфигурации недоступен на текущей платформе.', 'warning')
      }
      return
    }

    state.config = normalizeConfigShape(result.config)
    state.selectedBotIndex = 0
    state.isDirty = false
    renderAll()
    showToast(`Конфиг импортирован из ${result.importedFrom}.`, 'success')
  }

  async function handleExportConfig() {
    await persistConfig(false)
    const result = await bridge.exportConfig(state.config)
    if (!result.canceled) {
      showToast(`Конфиг экспортирован в ${result.exportedTo}.`, 'success')
    } else if (result.reason === 'not_supported') {
      showToast('Экспорт конфигурации недоступен на текущей платформе.', 'warning')
    }
  }

  function switchTab(nextTab) {
    if (!nextTab) {
      return
    }

    const previousTab = state.activeTab
    const previousPanel = getActivePanelName()

    if (nextTab === 'chat') {
      state.activeLogView = 'chat'
    } else if (nextTab === 'logs') {
      state.activeLogView = state.activeLogView || 'events'
    } else if (['settings', 'updates', 'files', 'about'].includes(nextTab)) {
      state.activeMoreView = nextTab
    } else if (nextTab === 'more') {
      state.activeMoreView = state.activeMoreView || 'settings'
    }

    const nextTopLevelTab = getTopLevelTabForRequest(nextTab)
    state.activeTab = nextTopLevelTab
    const nextPanel = getActivePanelName()

    if (previousTab === nextTopLevelTab && previousPanel === nextPanel) {
      return
    }

    queueRender(
      'tabs',
      'chrome',
      nextPanel === 'dashboard' ? 'dashboard' : null,
      nextPanel === 'bots' ? ['botList', 'botEditor'] : null,
      nextPanel === 'settings' ? ['settings', 'validation'] : null,
      nextPanel === 'updates' ? 'updates' : null,
      nextPanel === 'logs' ? 'logs' : null,
      nextPanel === 'chat' ? 'chat' : null,
      nextPanel === 'about' ? 'about' : null
    )
  }

  function selectBot(index, openBotsTab = false) {
    const bots = getBots()
    if (!bots[index]) {
      return
    }

    state.selectedBotIndex = index
    if (openBotsTab) {
      state.activeTab = 'bots'
    }

    queueRender(openBotsTab ? 'tabs' : null, 'chrome', 'botList', 'botEditor')
  }

  function addBot() {
    state.config.bots.push(createBotTemplate())
    state.selectedBotIndex = state.config.bots.length - 1
    state.activeTab = 'bots'
    app.markDirty()
    queueRender('tabs', 'chrome', 'botList', 'botEditor', 'dashboard')
  }

  function duplicateSelectedBot() {
    const selectedBot = getSelectedBot()
    if (!selectedBot) return

    state.config.bots.splice(state.selectedBotIndex + 1, 0, createBotTemplate(selectedBot))
    state.selectedBotIndex += 1
    state.activeTab = 'bots'
    app.markDirty()
    queueRender('tabs', 'chrome', 'botList', 'botEditor', 'dashboard')
  }

  function removeSelectedBot() {
    const selectedBot = getSelectedBot()
    if (!selectedBot) return
    if (!window.confirm(`Удалить бота "${selectedBot.username}"?`)) return

    state.config.bots.splice(state.selectedBotIndex, 1)
    ensureSelectedBot()
    app.markDirty()
    queueRender('chrome', 'botList', 'botEditor', 'dashboard')
  }

  async function handleMobileAction(action) {
    if (action === 'save-config') {
      await persistConfig()
      return
    }

    if (action === 'toggle-runtime') {
      await handleStartStopClick()
      return
    }

    if (action === 'restart-runtime') {
      await handleRestartClick()
      return
    }

    if (action === 'toggle-pause') {
      await handlePauseToggle()
      return
    }

    if (action === 'add-bot') {
      addBot()
      return
    }

    if (action === 'duplicate-bot') {
      duplicateSelectedBot()
      return
    }

    if (action === 'remove-bot') {
      removeSelectedBot()
      return
    }

    if (action === 'import-config') {
      await handleImportConfig()
      return
    }

    if (action === 'export-config') {
      await handleExportConfig()
      return
    }

    if (action === 'reset-config') {
      if (
        !window.confirm(
          'Сбросить config.json к базовому шаблону? Несохранённые изменения будут потеряны.'
        )
      )
        return
      const result = await bridge.resetConfig()
      state.config = normalizeConfigShape(result.config)
      state.selectedBotIndex = 0
      state.isDirty = false
      renderAll()
      showToast('Конфиг сброшен к базовому шаблону.', 'success')
      return
    }

    if (action === 'open-bots') {
      switchTab('bots')
    }
  }

  Object.assign(app, {
    persistConfig,
    handleStartStopClick,
    handleRestartClick,
    handlePauseToggle,
    handleImportConfig,
    handleExportConfig,
    switchTab,
    selectBot,
    addBot,
    duplicateSelectedBot,
    removeSelectedBot,
    handleMobileAction
  })
})()

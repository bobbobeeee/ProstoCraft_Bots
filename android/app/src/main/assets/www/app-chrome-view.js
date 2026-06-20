;(function initBotStudioChromeView() {
  const app = window.BotStudioApp
  const schema = window.BotStudioSettingsSchema
  const utils = window.BotStudioRendererUtils
  const { state, elements } = app
  const { LOG_VIEW_LABELS, MORE_VIEW_LABELS, TOP_LEVEL_TABS } = schema
  const {
    createSummaryCard,
    escapeAttribute,
    escapeHtml,
    formatDuration,
    formatNumber,
    formatStatus,
    renderMobileActionButton
  } = utils

  function getBots() {
    return app.getBots()
  }

  function getSelectedBot() {
    return app.getSelectedBot()
  }

  function getRuntimeHealth(...args) {
    return app.getRuntimeHealth(...args)
  }

  function formatHealthReason(...args) {
    return app.formatHealthReason(...args)
  }

  function buildMobileActions(...args) {
    return app.buildMobileActions(...args)
  }

  function buildMobileOverviewMarkup(...args) {
    return app.buildMobileOverviewMarkup(...args)
  }

  function getRuntimeUiState() {
    const supportsDesktopFiles = state.platform === 'desktop'

    return {
      supportsRuntimeControl: state.capabilities.runtimeControl !== false,
      supportsImport: supportsDesktopFiles && state.capabilities.fileImport !== false,
      supportsExport: supportsDesktopFiles && state.capabilities.fileExport !== false,
      supportsRuntimeFolder: state.capabilities.openRuntimeDir !== false,
      isRunning: state.runtime.status === 'running' || state.runtime.status === 'starting',
      isBusy: state.runtime.status === 'starting' || state.runtime.status === 'stopping'
    }
  }

  function getActiveTabTitle() {
    if (state.activeTab === 'bots') {
      const selectedBot = getSelectedBot()
      return selectedBot ? `Бот: ${selectedBot.username}` : 'Боты и маршруты'
    }

    if (state.activeTab === 'logs') {
      return state.activeLogView === 'chat' ? 'Чат сервера' : 'Логи runtime'
    }

    if (state.activeTab === 'more') {
      return MORE_VIEW_LABELS[state.activeMoreView] || 'Ещё'
    }

    return 'Пульт добычи'
  }

  function buildTopbarSubtitle({
    configuredBots,
    activeBots,
    runtimeTotalBots,
    isRunning,
    supportsRuntimeControl
  }) {
    if (state.activeTab === 'bots') {
      const selectedBot = getSelectedBot()
      if (!selectedBot) {
        return 'Создайте первого бота, затем задайте ему позицию, кнопку входа и маршрут добычи.'
      }

      return `Профиль ${selectedBot.username}: ${selectedBot.blocksToMine.length} точек, стенд ${selectedBot.standPosition.x}/${selectedBot.standPosition.y}/${selectedBot.standPosition.z}, радиус ${formatNumber(selectedBot.maxDistanceFromStand, 2)} м.`
    }

    if (state.activeTab === 'logs') {
      return state.activeLogView === 'chat'
        ? `Сообщения сервера и чата: ${formatNumber((state.runtime.chatLogs || []).length)} записей.`
        : `Последние события runtime: ${formatNumber((state.runtime.logs || []).length)} записей.`
    }

    if (state.activeTab === 'more' && state.activeMoreView === 'settings') {
      return 'Базовые настройки запуска, слотов, ротации, speed guard и отладки.'
    }

    if (state.activeTab === 'more' && state.activeMoreView === 'updates') {
      if (state.updates.status === 'available') {
        return `Доступна версия ${state.updates.latestVersion}. Скачивание и установка запускаются только вручную.`
      }

      if (state.updates.status === 'current') {
        return `Установлена актуальная версия ${state.updates.currentVersion || state.appVersion}.`
      }

      return 'Приложение проверяет обновления на GitHub и показывает установку только по вашему нажатию.'
    }

    if (state.activeTab === 'more' && state.activeMoreView === 'files') {
      return 'Пути к config.json, runtime-логу, chat.log и папке данных.'
    }

    if (state.activeTab === 'more' && state.activeMoreView === 'about') {
      return `Версия приложения: ${state.appVersion}.`
    }

    if (supportsRuntimeControl && isRunning) {
      return `Активных ботов: ${formatNumber(activeBots)}/${formatNumber(runtimeTotalBots)}. Живые события и телеметрия обновляются прямо на устройстве.`
    }

    if (state.platform === 'android' && supportsRuntimeControl) {
      return `APK хранит конфиг локально на телефоне и может запускать runtime прямо здесь. Профилей ботов: ${formatNumber(configuredBots)}.`
    }

    if (!supportsRuntimeControl) {
      return `Профилей ботов: ${formatNumber(configuredBots)}. Экран подготовлен под локальный конфиг, маршруты и просмотр логов без тяжёлых фоновых задач.`
    }

    return `Профилей ботов: ${formatNumber(configuredBots)}. Отсюда удобно запускать весь пул и следить за стабильностью runtime.`
  }

  function getActivePanelName() {
    if (state.activeTab === 'logs') {
      return state.activeLogView === 'chat' ? 'chat' : 'logs'
    }

    if (state.activeTab === 'more') {
      return state.activeMoreView || 'settings'
    }

    return state.activeTab
  }

  function getTopLevelTabForRequest(tabName) {
    if (TOP_LEVEL_TABS.has(tabName)) return tabName
    if (tabName === 'chat') return 'logs'
    if (['settings', 'updates', 'files', 'about'].includes(tabName)) return 'more'
    return 'dashboard'
  }

  function renderContextSwitcher() {
    if (!elements.contextSwitcher) return

    if (state.activeTab === 'logs') {
      const logCount = (state.runtime.logs || []).length
      const chatCount = (state.runtime.chatLogs || []).length
      elements.contextSwitcher.hidden = false
      elements.contextSwitcher.innerHTML = `
      <button class="context-tab ${state.activeLogView === 'events' ? 'is-active' : ''}" type="button" data-log-view="events">
        ${escapeHtml(LOG_VIEW_LABELS.events)} <span>${formatNumber(logCount)}</span>
      </button>
      <button class="context-tab ${state.activeLogView === 'chat' ? 'is-active' : ''}" type="button" data-log-view="chat">
        ${escapeHtml(LOG_VIEW_LABELS.chat)} <span>${formatNumber(chatCount)}</span>
      </button>
      <button class="context-tab ${state.activeLogFilter === 'important' ? 'is-active' : ''}" type="button" data-log-filter="important">
        Важное
      </button>
      <button class="context-tab ${state.activeLogFilter === 'all' ? 'is-active' : ''}" type="button" data-log-filter="all">
        Всё
      </button>
    `
      return
    }

    if (state.activeTab === 'more') {
      elements.contextSwitcher.hidden = false
      elements.contextSwitcher.innerHTML = Object.entries(MORE_VIEW_LABELS)
        .map(
          ([view, label]) => `
      <button class="context-tab ${state.activeMoreView === view ? 'is-active' : ''}" type="button" data-more-view="${escapeAttribute(view)}">
        ${escapeHtml(label)}
      </button>
    `
        )
        .join('')
      return
    }

    elements.contextSwitcher.hidden = true
    elements.contextSwitcher.innerHTML = ''
  }

  function renderTabs() {
    const topLevelTab = getTopLevelTabForRequest(state.activeTab)
    const activePanelName = getActivePanelName()

    state.activeTab = topLevelTab
    elements.workspace.classList.toggle('workspace--dashboard', topLevelTab === 'dashboard')
    ;['bots', 'logs', 'more', 'settings', 'updates', 'files', 'about', 'chat'].forEach(tabName => {
      const isActive = tabName === topLevelTab || tabName === activePanelName
      elements.workspace.classList.toggle(`workspace--${tabName}`, isActive)
    })

    document.querySelectorAll('.nav-item').forEach(button => {
      button.classList.toggle('is-active', button.dataset.tab === topLevelTab)
    })

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.panel === activePanelName)
    })

    renderContextSwitcher()
  }

  function syncMobileStickyMetrics() {
    const rootStyle = document.documentElement.style
    const suppressTopStickyChrome = state.platform === 'android'
    const topbarHeight = suppressTopStickyChrome
      ? 0
      : Math.ceil(elements.dashboardTopbar?.offsetHeight || 0)
    const mobileOverviewCard = elements.mobileOverview?.querySelector('.mini-status-card')
    const mobileOverviewHeight = suppressTopStickyChrome
      ? 0
      : Math.ceil(mobileOverviewCard?.offsetHeight || 0)

    rootStyle.setProperty('--mobile-topbar-height', `${topbarHeight}px`)
    rootStyle.setProperty('--mobile-overview-sticky-height', `${mobileOverviewHeight}px`)
  }

  function renderChrome() {
    const runtimeStatus = formatStatus(state.runtime.status)
    const configuredBots = getBots().length
    const snapshot = state.runtime.snapshot || {}
    const health = getRuntimeHealth(snapshot)
    const runtimeTotalBots = snapshot.totalBots || configuredBots
    const activeBots = snapshot.activeBots || 0
    const {
      supportsRuntimeControl,
      supportsImport,
      supportsExport,
      supportsRuntimeFolder,
      isRunning,
      isBusy
    } = getRuntimeUiState()
    const platformLabel =
      state.platform === 'android'
        ? supportsRuntimeControl
          ? 'Android local runtime'
          : 'Android config shell'
        : 'Desktop runtime shell'

    const statusCopy = !supportsRuntimeControl
      ? 'Конфиг хранится локально в Android/WebView-оболочке. Кнопки запуска backend скрыты, чтобы не тратить батарею на неработающий процесс.'
      : state.isDirty
        ? 'Есть несохраненные изменения. Сначала сохраните конфиг, чтобы запустить backend с новыми параметрами.'
        : 'Локальная конфигурация загружена и готова к запуску.'

    if (elements.platformLabel) {
      elements.platformLabel.textContent = platformLabel
    }
    const logsPanelHeading = document.querySelector('#logs-panel .panel-header h3')
    if (logsPanelHeading) {
      logsPanelHeading.textContent = 'Логи runtime'
    }
    const logsPanelEyebrow = document.querySelector('#logs-panel .panel-header .eyebrow')
    if (logsPanelEyebrow) {
      logsPanelEyebrow.textContent = 'Логи'
    }
    if (elements.dashboardTopbar) {
      elements.dashboardTopbar.hidden = state.platform === 'android'
    }
    if (elements.topbarTitle) {
      elements.topbarTitle.textContent = getActiveTabTitle()
    }
    elements.sidebarStatusPill.className = `status-pill ${runtimeStatus.className}`
    elements.sidebarStatusPill.textContent = runtimeStatus.label
    elements.sidebarStatusCopy.textContent = statusCopy
    document.body.dataset.platform = state.platform

    elements.topbarSubtitle.textContent = state.isDirty
      ? 'Сначала сохраните изменения, затем продолжайте работу с runtime.'
      : supportsRuntimeControl
        ? `Конфиг готов к запуску. Ботов в профиле: ${configuredBots}.`
        : `Мобильная сборка готова к редактированию. Ботов в профиле: ${configuredBots}.`

    elements.topbarSubtitle.textContent = state.isDirty
      ? 'Сначала сохраните изменения, затем продолжайте работу с runtime.'
      : buildTopbarSubtitle({
          configuredBots,
          activeBots,
          runtimeTotalBots,
          isRunning,
          supportsRuntimeControl
        })

    elements.summaryCards.innerHTML = [
      createSummaryCard(
        'Runtime',
        escapeHtml(runtimeStatus.label),
        `${formatNumber(activeBots)}/${formatNumber(runtimeTotalBots)} активных · ${formatNumber(configuredBots)} в конфиге`
      ),
      createSummaryCard(
        'Текущий темп добычи',
        `${formatNumber(snapshot.currentRatePerMinute || 0, 1)} блок/мин`,
        `${formatNumber(snapshot.currentRatePerSecond || 0, 2)} блок/с · raw ${formatNumber(snapshot.currentRawRatePerMinute || 0, 1)} б/м`
      ),
      createSummaryCard(
        'Добыто',
        formatNumber(snapshot.totalBlocks || 0),
        `Аптайм ${formatDuration(snapshot.uptimeMs || 0)}`
      ),
      createSummaryCard(
        'Состояние',
        escapeHtml(formatHealthReason(health.reason)),
        escapeHtml(health.diagnosis || '')
      )
    ].join('')

    if (elements.mobileOverview) {
      const showMobileOverview = state.activeTab === 'dashboard'
      elements.mobileOverview.hidden = !showMobileOverview
      elements.mobileOverview.innerHTML = showMobileOverview
        ? buildMobileOverviewMarkup({
            runtimeStatus,
            configuredBots,
            activeBots,
            runtimeTotalBots,
            snapshot
          })
        : ''
    }

    if (elements.mobileActionBar) {
      const actions = buildMobileActions({
        supportsRuntimeControl,
        supportsImport,
        supportsExport,
        isRunning,
        isBusy
      })
      elements.mobileActionBar.hidden = actions.length === 0
      elements.mobileActionBar.innerHTML = actions.map(renderMobileActionButton).join('')
    }

    elements.startStopButton.hidden = !supportsRuntimeControl
    elements.restartButton.hidden = !supportsRuntimeControl
    elements.pauseButton.hidden = !supportsRuntimeControl
    elements.openRuntimeDirButton.hidden = !supportsRuntimeFolder
    elements.importConfigButton.hidden = !supportsImport
    elements.exportConfigButton.hidden = !supportsExport

    elements.startStopButton.textContent = isRunning ? 'Остановить' : 'Запустить'
    elements.startStopButton.disabled = !supportsRuntimeControl || isBusy
    elements.restartButton.disabled = !supportsRuntimeControl || !isRunning
    elements.pauseButton.disabled = !supportsRuntimeControl || !isRunning
    elements.pauseButton.textContent = state.runtime.isPaused ? 'Снять паузу' : 'Пауза'

    elements.saveConfigButton.disabled = !state.isDirty
    if (elements.saveBotsButton) {
      elements.saveBotsButton.disabled = !state.isDirty
    }
    if (elements.saveSettingsButton) {
      elements.saveSettingsButton.disabled = !state.isDirty
    }

    elements.logCounter.textContent = `${(state.runtime.logs || []).length} записей`
    if (elements.chatLogCounter) {
      elements.chatLogCounter.textContent = `${(state.runtime.chatLogs || []).length} записей`
    }
    if (elements.configPathLabel)
      elements.configPathLabel.textContent = state.runtime.configPath || '-'
    if (elements.logPathLabel) elements.logPathLabel.textContent = state.runtime.logPath || '-'
    if (elements.chatLogPathLabel)
      elements.chatLogPathLabel.textContent = state.runtime.chatLogPath || '-'
    if (elements.runtimePathLabel)
      elements.runtimePathLabel.textContent = state.runtime.runtimeDir || '-'
    renderContextSwitcher()
    syncMobileStickyMetrics()
  }

  Object.assign(app, {
    getRuntimeUiState,
    getActiveTabTitle,
    buildTopbarSubtitle,
    getActivePanelName,
    getTopLevelTabForRequest,
    renderContextSwitcher,
    renderTabs,
    syncMobileStickyMetrics,
    renderChrome
  })
})()

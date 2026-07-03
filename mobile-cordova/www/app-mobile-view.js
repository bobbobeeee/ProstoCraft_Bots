;(function initBotStudioMobileView() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const { state } = app
  const {
    createCompactSummaryCard,
    escapeHtml,
    formatDuration,
    formatLiveStatus,
    formatNumber,
    renderMobileActionButton
  } = utils

  function getSelectedBot() {
    return app.getSelectedBot()
  }

  function getBots() {
    return app.getBots()
  }

  function getRuntimeHealth(...args) {
    return app.getRuntimeHealth(...args)
  }

  function getActiveTabTitle(...args) {
    return app.getActiveTabTitle(...args)
  }

  function getRuntimeUiState(...args) {
    return app.getRuntimeUiState(...args)
  }

  function buildMobileActions({
    supportsRuntimeControl,
    supportsImport,
    supportsExport,
    isRunning,
    isBusy
  }) {
    const selectedBot = getSelectedBot()
    const actions = []

    if (supportsRuntimeControl && state.activeTab === 'dashboard') {
      actions.push({
        id: 'toggle-runtime',
        label: isRunning ? 'Остановить' : 'Запустить',
        variant: isRunning ? 'danger' : 'primary',
        disabled: isBusy
      })

      if (isRunning) {
        actions.push({
          id: 'toggle-pause',
          label: state.runtime.isPaused ? 'Снять паузу' : 'Пауза',
          variant: 'secondary'
        })
        actions.push({ id: 'restart-runtime', label: 'Рестарт', variant: 'ghost' })
      }
    }

    if (state.activeTab === 'bots') {
      actions.push({ id: 'add-bot', label: 'Добавить', variant: 'primary' })
      if (selectedBot) actions.push({ id: 'duplicate-bot', label: 'Дубль', variant: 'secondary' })
      if (selectedBot) actions.push({ id: 'remove-bot', label: 'Удалить', variant: 'danger' })
    } else if (state.activeTab === 'more' && state.activeMoreView === 'settings') {
      if (supportsImport)
        actions.push({ id: 'import-config', label: 'Импорт', variant: 'secondary' })
      if (supportsExport)
        actions.push({ id: 'export-config', label: 'Экспорт', variant: 'secondary' })
      actions.push({ id: 'reset-config', label: 'Сбросить', variant: 'ghost' })
    }

    if (state.isDirty) {
      actions.push({
        id: 'save-config',
        label: 'Сохранить',
        variant: 'primary',
        disabled: false
      })
    }

    return actions.filter(
      (action, index, list) => list.findIndex(candidate => candidate.id === action.id) === index
    )
  }

  function buildMobileHeaderActions() {
    const { supportsRuntimeControl, isRunning, isBusy } = getRuntimeUiState()
    const actions = []

    if (supportsRuntimeControl) {
      actions.push({
        id: 'toggle-runtime',
        label: isRunning ? 'Остановить runtime' : 'Запустить runtime',
        variant: isRunning ? 'danger' : 'primary',
        disabled: isBusy
      })
    }

    actions.push({
      id: 'save-config',
      label: state.isDirty ? 'Сохранить изменения' : 'Конфиг сохранён',
      variant: state.isDirty ? 'secondary' : 'ghost',
      disabled: !state.isDirty
    })

    return actions
  }

  function renderActionButtons(actions) {
    return actions.map(renderMobileActionButton).join('')
  }

  function buildMobileOverviewMarkup({
    runtimeStatus,
    configuredBots,
    activeBots,
    runtimeTotalBots,
    snapshot
  }) {
    const selectedBot = getSelectedBot()
    const snapshotBots = state.runtime.snapshot?.bots || {}
    const health = getRuntimeHealth(snapshot)

    const botStrip = getBots().length
      ? `
      <div class="mobile-bot-strip">
        ${getBots()
          .map((bot, index) => {
            const liveBot = snapshotBots[bot.username]
            const liveLabel = liveBot ? formatLiveStatus(liveBot.status) : 'Готов к запуску'
            return `
            <button
              class="mobile-bot-pill ${index === state.selectedBotIndex ? 'is-active' : ''}"
              type="button"
              data-select-bot-index="${index}"
            >
              <strong>${escapeHtml(bot.username)}</strong>
              <span>${escapeHtml(liveLabel)}</span>
              <span>${formatNumber(bot.blocksToMine.length)} точек • ${bot.standPosition.x}, ${bot.standPosition.y}, ${bot.standPosition.z}</span>
            </button>
          `
          })
          .join('')}
      </div>
    `
      : `
      <div class="empty-state">
        Боты ещё не добавлены. Откройте вкладку "Боты" и создайте первый профиль.
      </div>
    `

    return `
    <article class="mini-status-card">
      <div class="mini-status-card__top">
        <div>
          <p class="eyebrow">${state.platform === 'android' ? 'Android local runtime' : 'Compact overview'}</p>
          <strong>${escapeHtml(getActiveTabTitle())}</strong>
        </div>
        <span class="status-pill ${runtimeStatus.className}">${escapeHtml(runtimeStatus.label)}</span>
      </div>
      <div class="mini-status-card__meta">
        <span>Ботов: ${formatNumber(configuredBots)}</span>
        <span>Активных: ${formatNumber(activeBots)}/${formatNumber(runtimeTotalBots)}</span>
        <span>${selectedBot ? `Выбран: ${escapeHtml(selectedBot.username)}` : 'Бот не выбран'}</span>
      </div>
      <div class="mobile-status-actions">
        ${renderActionButtons(buildMobileHeaderActions())}
      </div>
    </article>

    <div class="mini-summary-grid">
      ${createCompactSummaryCard('Effective', `${formatNumber(snapshot.currentRatePerMinute || 0, 1)} бл/мин`, `Raw ${formatNumber(snapshot.currentRawRatePerMinute || 0, 1)} б/м`)}
      ${createCompactSummaryCard('Добыто', formatNumber(snapshot.totalBlocks || 0), `Аптайм ${formatDuration(snapshot.uptimeMs || 0)}`)}
      ${createCompactSummaryCard('Состояние', app.formatHealthReason(health.reason), health.diagnosis || '')}
    </div>

    ${botStrip}
  `
  }

  Object.assign(app, {
    buildMobileActions,
    buildMobileHeaderActions,
    renderActionButtons,
    buildMobileOverviewMarkup
  })
})()

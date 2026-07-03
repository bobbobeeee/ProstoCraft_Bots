;(function initBotStudioDashboardView() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const { state, elements } = app
  const { escapeHtml, formatDuration, formatLiveStatus, formatNumber } = utils

  function getBots() {
    return app.getBots()
  }

  function getRuntimeHealth(...args) {
    return app.getRuntimeHealth(...args)
  }

  function formatHealthReason(...args) {
    return app.formatHealthReason(...args)
  }

  function formatPacketMode(...args) {
    return app.formatPacketMode(...args)
  }

  function getHealthClass(...args) {
    return app.getHealthClass(...args)
  }

  function renderHealthDashboardCard(snapshot = state.runtime.snapshot || {}) {
    const health = getRuntimeHealth(snapshot)
    const performance = snapshot.performance || {}
    const rawRate = performance.rawRate ?? snapshot.currentRawRatePerMinute ?? 0
    const effectiveRate =
      performance.effectiveRate ??
      snapshot.currentEffectiveRatePerMinute ??
      snapshot.currentRatePerMinute ??
      0
    const peakRate = performance.peakRate || 0
    const sustainableRate = performance.sustainableRate || 0
    const confirmationRatio = Number.isFinite(Number(performance.confirmationRatio))
      ? Number(performance.confirmationRatio)
      : 1
    const confirmLatencyMs = performance.confirmLatencyMs || 0
    const packetMode = performance.packetMode || 'fast'
    const packetBudget = performance.packetBudget || {}
    const fallbackDigCount = performance.fallbackDigCount || 0
    const bottleneck = performance.lastMiningBottleneck || ''
    const slowdownReason = performance.lastSlowdownReason || health.diagnosis || ''
    const downtime = formatDuration(health.downtimeMs || 0)
    const lastNetworkError = health.lastNetworkError || 'нет'
    const reconnectReason = health.lastReconnectReason || 'нет'
    const recoveryAction = health.lastRecoveryAction || 'ожидание событий'

    return `
    <article class="dashboard-card dashboard-card--health ${getHealthClass(health)}">
      <div class="panel-header panel-header--spread">
        <div>
          <p class="eyebrow">Состояние</p>
          <h4>${escapeHtml(formatHealthReason(health.reason))}</h4>
        </div>
        <span class="chip health-chip">${escapeHtml(health.state || 'healthy')}</span>
      </div>
      <p class="health-diagnosis">${escapeHtml(health.diagnosis || '')}</p>
      <div class="dashboard-meta">
        <div class="dashboard-meta-row"><span>Effective</span><strong>${formatNumber(effectiveRate, 1)} б/м</strong></div>
        <div class="dashboard-meta-row"><span>Raw с простоями</span><strong>${formatNumber(rawRate, 1)} б/м</strong></div>
        <div class="dashboard-meta-row"><span>Peak</span><strong>${formatNumber(peakRate, 1)} б/м</strong></div>
        <div class="dashboard-meta-row"><span>Sustainable</span><strong>${formatNumber(sustainableRate, 1)} б/м</strong></div>
        <div class="dashboard-meta-row"><span>Confirm</span><strong>${formatNumber(confirmationRatio * 100, 0)}%</strong></div>
        <div class="dashboard-meta-row"><span>Latency</span><strong>${formatNumber(confirmLatencyMs, 0)} мс</strong></div>
        <div class="dashboard-meta-row"><span>Packet</span><strong>${escapeHtml(formatPacketMode(packetMode))}</strong></div>
        <div class="dashboard-meta-row"><span>Budget</span><strong>${formatNumber(packetBudget.perSecond || 0, 0)}/с · ${formatNumber((packetBudget.budgetScale || 1) * 100, 0)}%</strong></div>
        <div class="dashboard-meta-row"><span>Fallback</span><strong>${formatNumber(fallbackDigCount, 0)}</strong></div>
        <div class="dashboard-meta-row"><span>Простой</span><strong>${escapeHtml(downtime)}</strong></div>
        <div class="dashboard-meta-row"><span>Reconnect</span><strong>${escapeHtml(reconnectReason)}</strong></div>
        <div class="dashboard-meta-row"><span>Сеть</span><strong>${escapeHtml(lastNetworkError)}</strong></div>
        <div class="dashboard-meta-row"><span>Действие</span><strong>${escapeHtml(recoveryAction)}</strong></div>
        <div class="dashboard-meta-row dashboard-meta-row--wide"><span>Bottleneck</span><strong>${escapeHtml(bottleneck || 'stable')}</strong></div>
        <div class="dashboard-meta-row dashboard-meta-row--wide"><span>Диагноз</span><strong>${escapeHtml(slowdownReason || 'скорость нормальная')}</strong></div>
      </div>
    </article>
  `
  }

  function renderDashboard() {
    const snapshotBots = state.runtime.snapshot?.bots || {}
    const snapshot = state.runtime.snapshot || {}
    const configBots = getBots()
    const configuredNames = new Set(configBots.map(bot => bot.username))
    const cards = []
    const supportsRuntimeControl = state.capabilities.runtimeControl !== false
    const health = getRuntimeHealth(snapshot)

    if (health.reason && health.reason !== 'mining-ok') {
      cards.push(renderHealthDashboardCard(snapshot))
    }

    if (Object.keys(snapshotBots).length > 0) {
      const orderedBots = [
        ...configBots
          .map(bot => [bot.username, snapshotBots[bot.username]])
          .filter(([, botData]) => Boolean(botData)),
        ...Object.entries(snapshotBots).filter(([botName]) => !configuredNames.has(botName))
      ]

      orderedBots.forEach(([botName, botData]) => {
        const lastBlockLabel = botData?.lastBlockTime
          ? `${formatDuration(Date.now() - botData.lastBlockTime)} назад`
          : 'Еще нет данных'

        cards.push(`
        <article class="dashboard-card">
          <div class="panel-header panel-header--spread">
            <div>
              <p class="eyebrow">Live bot</p>
              <h4>${escapeHtml(botName)}</h4>
            </div>
            <span class="chip">${escapeHtml(formatLiveStatus(botData?.status))}</span>
          </div>
          <div class="dashboard-meta">
            <div class="dashboard-meta-row"><span>Добыто блоков</span><strong>${formatNumber(botData?.blocksTotal || 0)}</strong></div>
            <div class="dashboard-meta-row"><span>Effective</span><strong>${formatNumber(botData?.effectiveBlocksLastMinute ?? botData?.blocksLastMinute ?? 0, 1)} б/м</strong></div>
            <div class="dashboard-meta-row"><span>Raw</span><strong>${formatNumber(botData?.rawBlocksLastMinute || 0, 1)} б/м</strong></div>
            <div class="dashboard-meta-row"><span>Последний блок</span><strong>${escapeHtml(lastBlockLabel)}</strong></div>
          </div>
        </article>
      `)
      })
    } else if (configBots.length > 0) {
      configBots.forEach(bot => {
        const buttonLabel = bot.entryButton?.enabled
          ? `${bot.entryButton.x}, ${bot.entryButton.y}, ${bot.entryButton.z}`
          : 'выкл'

        cards.push(`
        <article class="dashboard-card">
          <div class="panel-header panel-header--spread">
            <div>
              <p class="eyebrow">Профиль бота</p>
              <h4>${escapeHtml(bot.username)}</h4>
            </div>
            <span class="chip">Живой runtime еще не запущен</span>
          </div>
          <div class="dashboard-meta">
            <div class="dashboard-meta-row"><span>Позиция стенда</span><strong>${bot.standPosition.x}, ${bot.standPosition.y}, ${bot.standPosition.z}</strong></div>
            <div class="dashboard-meta-row"><span>Точек добычи</span><strong>${formatNumber(bot.blocksToMine.length)}</strong></div>
            <div class="dashboard-meta-row"><span>Макс. дистанция</span><strong>${formatNumber(bot.maxDistanceFromStand, 2)} м</strong></div>
            <div class="dashboard-meta-row"><span>Кнопка входа</span><strong>${escapeHtml(buttonLabel)}</strong></div>
          </div>
        </article>
      `)
      })
    } else {
      cards.push(
        supportsRuntimeControl
          ? '<div class="dashboard-empty">Добавьте бота, сохраните конфиг и запустите runtime.</div>'
          : '<div class="dashboard-empty">Добавьте бота, чтобы настроить маршрут и сохранить конфиг на устройстве.</div>'
      )
    }

    elements.dashboardBotGrid.innerHTML = cards.join('')
  }

  Object.assign(app, {
    renderHealthDashboardCard,
    renderDashboard
  })
})()

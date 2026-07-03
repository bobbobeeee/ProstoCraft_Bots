;(function initBotStudioLogsAboutView() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const { state, elements } = app
  const { escapeHtml, formatDateTime, formatNumber, formatStatus } = utils

  function getBots() {
    return app.getBots()
  }

  function renderLogs() {
    const totalLogs = state.runtime.logs || []
    const sourceLogs =
      state.activeLogFilter === 'important'
        ? totalLogs.filter(entry => {
            const level = String(entry.level || '').toLowerCase()
            const message = String(entry.message || entry.rawMessage || '').toLowerCase()
            return (
              level === 'warning' ||
              level === 'error' ||
              message.includes('packet-safe') ||
              message.includes('limbofilter') ||
              message.includes('botfilter') ||
              message.includes('reconnect') ||
              message.includes('переподключ')
            )
          })
        : totalLogs
    const logs = sourceLogs.slice(-140).reverse()
    if (!logs.length) {
      elements.logStream.innerHTML =
        state.capabilities.runtimeControl !== false
          ? '<div class="empty-state">Логи появятся после запуска backend. Здесь будут события по ботам, таймингам и ошибкам соединения.</div>'
          : '<div class="empty-state">В Android-сборке здесь будут локальные служебные сообщения и будущие события удаленного runtime, если вы подключите его отдельно.</div>'
      return
    }

    elements.logStream.innerHTML = logs
      .map(
        entry => `
    <article class="log-entry" data-level="${entry.level || 'info'}">
      <div class="log-entry__top">
        <span>${escapeHtml(entry.time || '-')}</span>
        <span>${escapeHtml(entry.botName || 'SYSTEM')}</span>
        <span>${escapeHtml(entry.level || 'info')}</span>
      </div>
      <pre class="log-entry__message">${escapeHtml(entry.message || entry.rawMessage || '')}</pre>
    </article>
  `
      )
      .join('')

    if (sourceLogs.length > logs.length || sourceLogs.length !== totalLogs.length) {
      elements.logStream.insertAdjacentHTML(
        'beforeend',
        `<div class="log-trim-note">Показаны ${logs.length} записей из ${sourceLogs.length} (${totalLogs.length} всего); свежие записи находятся сверху.</div>`
      )
    }
  }

  function formatChatSource(entry = {}) {
    const position = String(entry.position || '').toLowerCase()
    const labels = {
      chat: 'чат',
      system: 'система',
      game_info: 'actionbar',
      unknown: 'неизвестно'
    }
    const label = labels[position] || entry.source || 'чат'
    return entry.sender ? `${label} / ${entry.sender}` : label
  }

  function renderChatLogs() {
    if (!elements.chatLogStream) return

    const totalChatLogs = state.runtime.chatLogs || []
    const chatLogs = totalChatLogs.slice(-180).reverse()
    if (!chatLogs.length) {
      elements.chatLogStream.innerHTML =
        state.capabilities.runtimeControl !== false
          ? '<div class="empty-state">Чат появится после запуска backend. Здесь будут сообщения сервера, сканера и игроков отдельно от runtime-логов.</div>'
          : '<div class="empty-state">В Android-сборке здесь появятся сообщения чата, если подключить локальный runtime.</div>'
      return
    }

    elements.chatLogStream.innerHTML = chatLogs
      .map(
        entry => `
    <article class="log-entry chat-entry" data-level="chat">
      <div class="log-entry__top">
        <span>${escapeHtml(entry.time || '-')}</span>
        <span>${escapeHtml(entry.botName || 'SERVER')}</span>
        <span>${escapeHtml(formatChatSource(entry))}</span>
      </div>
      <pre class="log-entry__message">${escapeHtml(entry.message || entry.rawMessage || '')}</pre>
    </article>
  `
      )
      .join('')

    if (totalChatLogs.length > chatLogs.length) {
      elements.chatLogStream.insertAdjacentHTML(
        'beforeend',
        `<div class="log-trim-note">Показаны последние ${chatLogs.length} сообщений из ${totalChatLogs.length}; свежие сообщения находятся сверху.</div>`
      )
    }
  }

  function renderAbout() {
    if (!elements.aboutContent) return

    const updates = state.updates || {}
    const updateLabel = updates.latestVersion
      ? `${updates.latestVersion}${updates.updateAvailable ? ' доступна' : ' актуальна'}`
      : 'Ещё не проверялось'

    elements.aboutContent.innerHTML = `
    <article class="about-card">
      <span class="summary-label">Приложение</span>
      <strong>ProstoCraft Bot Studio</strong>
      <span class="summary-note">Версия ${escapeHtml(state.appVersion || '0.0.0')}</span>
    </article>
    <article class="about-card">
      <span class="summary-label">Платформа</span>
      <strong>${escapeHtml(state.platform === 'android' ? 'Android' : 'Windows')}</strong>
      <span class="summary-note">${state.capabilities.runtimeControl === false ? 'Конфиг и мониторинг' : 'Локальный runtime'}</span>
    </article>
    <article class="about-card">
      <span class="summary-label">Обновления</span>
      <strong>${escapeHtml(updateLabel)}</strong>
      <span class="summary-note">${escapeHtml(formatDateTime(updates.checkedAt || updates.publishedAt))}</span>
    </article>
    <article class="about-card">
      <span class="summary-label">Runtime</span>
      <strong>${escapeHtml(formatStatus(state.runtime.status).label)}</strong>
      <span class="summary-note">Ботов: ${formatNumber(state.runtime.snapshot?.activeBots || 0)}/${formatNumber(state.runtime.snapshot?.totalBots || getBots().length)}</span>
    </article>
  `
  }

  Object.assign(app, {
    renderLogs,
    formatChatSource,
    renderChatLogs,
    renderAbout
  })
})()

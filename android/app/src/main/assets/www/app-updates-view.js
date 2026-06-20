;(function initBotStudioUpdatesView() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const { state, elements } = app
  const {
    createEmptyUpdateState,
    escapeAttribute,
    escapeHtml,
    formatBytes,
    formatDateTime,
    formatNumber
  } = utils

  function formatUpdateStatus(status) {
    const map = {
      idle: { label: 'Не проверялось', className: 'status-pill--idle' },
      checking: { label: 'Проверка', className: 'status-pill--starting' },
      current: { label: 'Актуальная', className: 'status-pill--running' },
      available: { label: 'Доступно', className: 'status-pill--starting' },
      downloading: { label: 'Скачивание', className: 'status-pill--starting' },
      ready: { label: 'Готово к установке', className: 'status-pill--running' },
      installing: { label: 'Установка', className: 'status-pill--starting' },
      unavailable: { label: 'Нет файла', className: 'status-pill--error' },
      error: { label: 'Ошибка', className: 'status-pill--error' }
    }
    return map[status] || map.idle
  }

  function getUpdateProgress(updates = state.updates) {
    const progress = updates.progress || {}
    const receivedBytes = Number(progress.receivedBytes) || 0
    const totalBytes = Number(progress.totalBytes) || Number(updates.asset?.size) || 0
    const percent = Number.isFinite(Number(progress.percent))
      ? Math.max(0, Math.min(100, Number(progress.percent)))
      : totalBytes > 0
        ? Math.max(0, Math.min(100, (receivedBytes / totalBytes) * 100))
        : 0

    return { receivedBytes, totalBytes, percent }
  }

  function formatUpdateSourceMode(mode) {
    const map = {
      online: 'GitHub API',
      fallback: 'manifest',
      cache: 'cache',
      offline: 'offline',
      idle: 'ожидание'
    }
    return map[mode] || String(mode || 'ожидание')
  }

  function renderUpdates() {
    if (!elements.updatesContent) return

    const updates = {
      ...createEmptyUpdateState(),
      currentVersion: state.appVersion,
      ...state.updates
    }
    const status = formatUpdateStatus(updates.status)
    const progress = getUpdateProgress(updates)
    const supportsUpdates = state.capabilities.updates === true
    const canCheck =
      supportsUpdates && !['checking', 'downloading', 'installing'].includes(updates.status)
    const canDownload =
      supportsUpdates && updates.status === 'available' && updates.updateAvailable && updates.asset
    const canInstall = supportsUpdates && updates.status === 'ready' && updates.downloadedFilePath
    const releaseUrl = updates.releaseUrl || state.updateSource?.releaseUrl || ''
    const releaseBody = String(updates.body || '').trim()
    const assetName = updates.asset?.name || '-'
    const assetSize = updates.asset?.size || updates.downloadedSize || 0

    if (elements.checkUpdatesButton) elements.checkUpdatesButton.disabled = !canCheck
    if (elements.downloadUpdateButton) elements.downloadUpdateButton.disabled = !canDownload
    if (elements.installUpdateButton) elements.installUpdateButton.disabled = !canInstall
    if (elements.openReleaseButton) elements.openReleaseButton.disabled = !releaseUrl

    if (!supportsUpdates) {
      elements.updatesContent.innerHTML = `
      <div class="empty-state">Центр обновления недоступен в этой оболочке приложения.</div>
    `
      return
    }

    elements.updatesContent.innerHTML = `
    <div class="updates-grid">
      <article class="updates-card updates-card--main">
        <div class="updates-card__top">
          <div>
            <p class="eyebrow">Состояние</p>
            <h4>${escapeHtml(status.label)}</h4>
          </div>
          <span class="status-pill ${status.className}">${escapeHtml(status.label)}</span>
        </div>
        <p class="muted-copy">${escapeHtml(getUpdateStatusCopy(updates))}</p>
        ${
          updates.status === 'downloading' || updates.status === 'ready'
            ? `
            <div class="update-progress" aria-label="Прогресс скачивания">
              <div class="update-progress__bar">
                <span style="width: ${escapeAttribute(String(progress.percent))}%"></span>
              </div>
              <div class="update-progress__meta">
                <span>${formatNumber(progress.percent, 0)}%</span>
                <span>${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes || assetSize)}</span>
              </div>
            </div>
          `
            : ''
        }
        ${updates.error ? `<div class="validation-banner">${escapeHtml(updates.error)}</div>` : ''}
      </article>

      <article class="updates-card">
        <span class="summary-label">Текущая версия</span>
        <strong class="summary-value">${escapeHtml(updates.currentVersion || state.appVersion)}</strong>
        <span class="summary-note">Установлена сейчас</span>
      </article>

      <article class="updates-card">
        <span class="summary-label">Последняя версия</span>
        <strong class="summary-value">${escapeHtml(updates.latestVersion || '-')}</strong>
        <span class="summary-note">${escapeHtml(formatDateTime(updates.publishedAt))}</span>
      </article>

      <article class="updates-card">
        <span class="summary-label">Файл обновления</span>
        <strong class="updates-file-name">${escapeHtml(assetName)}</strong>
        <span class="summary-note">${formatBytes(assetSize)}</span>
      </article>

      <article class="updates-card">
        <span class="summary-label">Источник</span>
        <strong>${escapeHtml(formatUpdateSourceMode(updates.sourceMode))}</strong>
        <span class="summary-note">${updates.installResumeState ? escapeHtml(updates.installResumeState) : 'без автоустановки'}</span>
      </article>

      <article class="updates-card">
        <span class="summary-label">Проверка файла</span>
        <strong>${updates.checksum?.hash ? 'SHA256 готов' : 'SHA256 не найден'}</strong>
        <span class="summary-note">${updates.checksum?.hash ? escapeHtml(updates.checksum.hash.slice(0, 12)) : 'Скачивание будет заблокировано'}</span>
      </article>
    </div>

    <article class="updates-card updates-card--notes">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Release notes</p>
          <h4>${escapeHtml(updates.releaseName || updates.tagName || 'Описание версии')}</h4>
        </div>
      </div>
      <pre class="update-notes">${escapeHtml(releaseBody || 'Описание появится после проверки обновлений.')}</pre>
    </article>
  `
  }

  function getUpdateStatusCopy(updates) {
    if (updates.status === 'checking') return 'Проверяю последнюю версию на странице скачивания.'
    if (updates.sourceMode === 'cache')
      return 'GitHub сейчас недоступен, показана последняя успешная проверка из cache.'
    if (updates.sourceMode === 'fallback')
      return 'GitHub API недоступен, использую lightweight manifest из репозитория.'
    if (updates.status === 'current') return 'У вас уже установлена последняя доступная версия.'
    if (updates.status === 'available')
      return 'Найдена новая версия. Скачивание начнётся только после нажатия кнопки.'
    if (updates.status === 'downloading') return 'Скачиваю файл обновления и затем проверю SHA256.'
    if (updates.status === 'ready')
      return state.platform === 'android'
        ? 'APK скачан и проверен. Нажмите установку, затем подтвердите её в Android.'
        : 'Установщик скачан и проверен. При установке runtime будет остановлен.'
    if (updates.status === 'installing')
      return 'Открываю системную установку. Подтвердите действие в системе.'
    if (updates.status === 'unavailable')
      return 'Релиз найден, но файл для этой платформы не прикреплён.'
    if (updates.status === 'error') return 'Проверка или скачивание завершились ошибкой.'
    return 'Автопроверка запускается при старте приложения. Установка всегда только по вашему нажатию.'
  }

  Object.assign(app, {
    formatUpdateStatus,
    getUpdateProgress,
    formatUpdateSourceMode,
    renderUpdates,
    getUpdateStatusCopy
  })
})()

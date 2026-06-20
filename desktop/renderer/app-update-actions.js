;(function initBotStudioUpdateActions() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const { state, bridge } = app
  const { createEmptyUpdateState } = utils

  function queueRender(...args) {
    return app.queueRender(...args)
  }

  function showToast(...args) {
    return app.showToast(...args)
  }

  async function refreshUpdates(showResultToast = false) {
    if (state.capabilities.updates !== true) {
      showToast('Центр обновления недоступен на текущей платформе.', 'warning')
      return
    }

    state.updates = {
      ...state.updates,
      status: 'checking',
      error: ''
    }
    queueRender('updates', 'chrome')

    const result = await bridge.checkUpdates()
    state.updates = {
      ...createEmptyUpdateState(),
      currentVersion: state.appVersion,
      ...(result || {})
    }
    queueRender('updates', 'chrome')

    if (!showResultToast) return
    if (state.updates.status === 'available') {
      showToast(`Доступна версия ${state.updates.latestVersion}.`, 'success')
    } else if (state.updates.status === 'current') {
      showToast('Установлена актуальная версия.', 'success')
    } else if (state.updates.status === 'error') {
      showToast(state.updates.error || 'Не удалось проверить обновления.', 'error')
    }
  }

  function startAutoUpdateCheck() {
    if (state.updateAutoCheckStarted || state.capabilities.updates !== true) return
    state.updateAutoCheckStarted = true

    window.setTimeout(() => {
      refreshUpdates(false).catch(error => {
        state.updates = {
          ...state.updates,
          status: 'error',
          error: error.message || String(error)
        }
        queueRender('updates', 'chrome')
      })
    }, 1200)
  }

  async function handleDownloadUpdate() {
    if (state.capabilities.updates !== true) {
      showToast('Центр обновления недоступен на текущей платформе.', 'warning')
      return
    }

    const result = await bridge.downloadUpdate()
    state.updates = {
      ...createEmptyUpdateState(),
      currentVersion: state.appVersion,
      ...(result || {})
    }
    queueRender('updates', 'chrome')
    showToast('Обновление скачано и проверено.', 'success')
  }

  async function handleInstallUpdate() {
    if (state.capabilities.updates !== true) {
      showToast('Центр обновления недоступен на текущей платформе.', 'warning')
      return
    }

    if (
      state.platform === 'desktop' &&
      !window.confirm('Остановить runtime и запустить установщик обновления?')
    ) {
      return
    }

    const result = await bridge.installUpdate()
    state.updates = {
      ...createEmptyUpdateState(),
      currentVersion: state.appVersion,
      ...(result || {})
    }
    queueRender('updates', 'chrome')
    showToast(
      state.platform === 'android'
        ? 'Открыл установку APK. Если Android попросит разрешение источника, включите его для приложения.'
        : 'Запускаю установщик обновления.',
      'success'
    )
  }

  function openUpdateReleasePage() {
    const releaseUrl = state.updates.releaseUrl || state.updateSource?.releaseUrl
    if (!releaseUrl) {
      showToast('Страница версии пока неизвестна. Сначала проверьте обновления.', 'warning')
      return
    }

    window.open(releaseUrl, '_blank', 'noopener')
  }

  Object.assign(app, {
    refreshUpdates,
    startAutoUpdateCheck,
    handleDownloadUpdate,
    handleInstallUpdate,
    openUpdateReleasePage
  })
})()

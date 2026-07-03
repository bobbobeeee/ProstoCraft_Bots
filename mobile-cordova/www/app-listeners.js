;(function initBotStudioListeners() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const coordinates = window.BotStudioCoordinateUtils
  const { state, elements, bridge } = app
  const { normalizeConfigShape } = utils
  const { parseCoordinatesText, uniqueCoordinates } = coordinates

  function showToast(...args) {
    return app.showToast(...args)
  }

  function attachStaticListeners() {
    document.querySelectorAll('.nav-item').forEach(button => {
      button.addEventListener('click', () => {
        app.switchTab(button.dataset.tab)
      })
    })

    elements.contextSwitcher.addEventListener('click', event => {
      const logViewButton = event.target.closest('[data-log-view]')
      if (logViewButton) {
        state.activeLogView = logViewButton.dataset.logView === 'chat' ? 'chat' : 'events'
        state.activeTab = 'logs'
        app.queueRender('tabs', 'chrome', state.activeLogView === 'chat' ? 'chat' : 'logs')
        return
      }

      const logFilterButton = event.target.closest('[data-log-filter]')
      if (logFilterButton) {
        state.activeLogFilter = logFilterButton.dataset.logFilter === 'all' ? 'all' : 'important'
        state.activeLogView = 'events'
        state.activeTab = 'logs'
        app.queueRender('tabs', 'chrome', 'logs')
        return
      }

      const moreViewButton = event.target.closest('[data-more-view]')
      if (!moreViewButton) return

      state.activeMoreView = moreViewButton.dataset.moreView || 'settings'
      state.activeTab = 'more'
      const activePanel = app.getActivePanelName()
      app.queueRender(
        'tabs',
        'chrome',
        activePanel === 'settings' ? ['settings', 'validation'] : null,
        activePanel === 'updates' ? 'updates' : null,
        activePanel === 'about' ? 'about' : null
      )
    })

    elements.saveConfigButton.addEventListener('click', async () => {
      try {
        await app.persistConfig()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    if (elements.saveBotsButton) {
      elements.saveBotsButton.addEventListener('click', async () => {
        try {
          await app.persistConfig()
        } catch (error) {
          showToast(error.message, 'error')
        }
      })
    }

    if (elements.saveSettingsButton) {
      elements.saveSettingsButton.addEventListener('click', async () => {
        try {
          await app.persistConfig()
        } catch (error) {
          showToast(error.message, 'error')
        }
      })
    }

    elements.startStopButton.addEventListener('click', async () => {
      try {
        await app.handleStartStopClick()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.restartButton.addEventListener('click', async () => {
      try {
        await app.handleRestartClick()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.pauseButton.addEventListener('click', async () => {
      try {
        await app.handlePauseToggle()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.openRuntimeDirButton.addEventListener('click', async () => {
      if (state.capabilities.openRuntimeDir === false) {
        showToast('Папка runtime недоступна на текущей платформе.', 'warning')
        return
      }

      await bridge.openRuntimeDir()
    })

    elements.importConfigButton.addEventListener('click', async () => {
      try {
        await app.handleImportConfig()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.exportConfigButton.addEventListener('click', async () => {
      try {
        await app.handleExportConfig()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.resetConfigButton.addEventListener('click', async () => {
      if (
        !window.confirm(
          'Сбросить config.json к базовому шаблону? Несохраненные изменения будут потеряны.'
        )
      )
        return
      const result = await bridge.resetConfig()
      state.config = normalizeConfigShape(result.config)
      state.selectedBotIndex = 0
      state.isDirty = false
      app.renderAll()
      showToast('Конфиг сброшен к базовому шаблону.', 'success')
    })

    elements.checkUpdatesButton.addEventListener('click', async () => {
      try {
        await app.refreshUpdates(true)
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.downloadUpdateButton.addEventListener('click', async () => {
      try {
        await app.handleDownloadUpdate()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.installUpdateButton.addEventListener('click', async () => {
      try {
        await app.handleInstallUpdate()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.openReleaseButton.addEventListener('click', () => {
      app.openUpdateReleasePage()
    })

    elements.addBotButton.addEventListener('click', () => {
      app.addBot()
    })

    elements.duplicateBotButton.addEventListener('click', () => {
      app.duplicateSelectedBot()
    })

    elements.removeBotButton.addEventListener('click', () => {
      app.removeSelectedBot()
    })

    elements.mobileOverview.addEventListener('click', async event => {
      const actionButton = event.target.closest('[data-mobile-action]')
      if (actionButton) {
        try {
          await app.handleMobileAction(actionButton.dataset.mobileAction)
        } catch (error) {
          showToast(error.message, 'error')
        }
        return
      }

      const botButton = event.target.closest('[data-select-bot-index]')
      if (!botButton) return
      app.selectBot(Number(botButton.dataset.selectBotIndex), true)
    })

    elements.mobileActionBar.addEventListener('click', async event => {
      const actionButton = event.target.closest('[data-mobile-action]')
      if (!actionButton) return

      try {
        await app.handleMobileAction(actionButton.dataset.mobileAction)
      } catch (error) {
        showToast(error.message, 'error')
      }
    })

    elements.settingsSections.addEventListener('click', event => {
      const jumpButton = event.target.closest('[data-settings-jump]')
      if (!jumpButton) return

      const target = document.getElementById(jumpButton.dataset.settingsJump)
      if (!target) return

      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      })
    })

    elements.closeCoordinateModalButton.addEventListener('click', () => {
      app.closeCoordinateModal()
    })

    elements.coordinateModal.addEventListener('click', event => {
      if (event.target === elements.coordinateModal) {
        app.closeCoordinateModal()
      }
    })

    const applyCoordinates = appendMode => {
      try {
        const selectedBot = app.getSelectedBot()
        if (!selectedBot) return

        const parsed = parseCoordinatesText(elements.coordinateTextarea.value)
        selectedBot.blocksToMine = appendMode
          ? uniqueCoordinates([...selectedBot.blocksToMine, ...parsed])
          : parsed

        app.closeCoordinateModal()
        app.markDirty()
        app.queueRender('botEditor', 'botList', 'dashboard')
        showToast(
          appendMode ? 'Координаты добавлены к текущему маршруту.' : 'Маршрут координат заменен.',
          'success'
        )
      } catch (error) {
        showToast(error.message, 'error')
      }
    }

    elements.replaceCoordinatesButton.addEventListener('click', () => applyCoordinates(false))
    elements.appendCoordinatesButton.addEventListener('click', () => applyCoordinates(true))

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        app.queueRender('all')
      }
    })

    let resizeFrameId = null
    let lastViewportWidth = window.innerWidth
    let lastViewportHeight = window.innerHeight

    window.addEventListener('resize', () => {
      const nextViewportWidth = window.innerWidth
      const nextViewportHeight = window.innerHeight
      const widthChanged = Math.abs(nextViewportWidth - lastViewportWidth) > 2
      const heightChanged = Math.abs(nextViewportHeight - lastViewportHeight) > 2

      lastViewportWidth = nextViewportWidth
      lastViewportHeight = nextViewportHeight

      // On Android, opening the soft keyboard changes viewport height and used to
      // recreate the form, immediately dropping focus from the active field.
      if (
        state.platform === 'android' &&
        !widthChanged &&
        heightChanged &&
        app.isTextEntryElement(document.activeElement)
      ) {
        return
      }

      if (resizeFrameId != null) {
        return
      }

      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = null
        const resizeParts = ['chrome']

        if (state.activeTab === 'dashboard') {
          resizeParts.push('dashboard')
        } else if (state.activeTab === 'bots') {
          resizeParts.push('botList', 'botEditor')
        } else if (state.activeTab === 'logs') {
          resizeParts.push(state.activeLogView === 'chat' ? 'chat' : 'logs')
        } else if (state.activeTab === 'more') {
          resizeParts.push(app.getActivePanelName())
        }

        app.queueRender(resizeParts)
      })
    })
  }

  Object.assign(app, {
    attachStaticListeners
  })
})()

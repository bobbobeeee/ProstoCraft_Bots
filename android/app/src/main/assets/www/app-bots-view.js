;(function initBotStudioBotsView() {
  const app = window.BotStudioApp
  const utils = window.BotStudioRendererUtils
  const settingsValues = window.BotStudioSettingsValues
  const coordinates = window.BotStudioCoordinateUtils
  const { state, elements } = app
  const {
    escapeAttribute,
    escapeHtml,
    formatCoordinateTriplet,
    formatEntryButtonLabel,
    formatLastBlockLabel,
    formatLiveStatus,
    formatNumber,
    getLiveStatusClass
  } = utils
  const { parsePrimitiveValue } = settingsValues
  const { formatCoordinatesText, parseCoordinatesText } = coordinates

  function getBots() {
    return app.getBots()
  }

  function ensureSelectedBot() {
    return app.ensureSelectedBot()
  }

  function getSelectedBot() {
    return app.getSelectedBot()
  }

  function selectBot(...args) {
    return app.selectBot(...args)
  }

  function markDirty(...args) {
    return app.markDirty(...args)
  }

  function queueRender(...args) {
    return app.queueRender(...args)
  }

  function showToast(...args) {
    return app.showToast(...args)
  }

  function openCoordinateModal(...args) {
    return app.openCoordinateModal(...args)
  }

  function renderBotList() {
    const bots = getBots()
    ensureSelectedBot()

    if (!bots.length) {
      elements.botList.innerHTML =
        '<div class="empty-state">Список ботов пока пуст. Нажмите "Добавить бота", чтобы создать первый профиль.</div>'
      return
    }

    const snapshotBots = state.runtime.snapshot?.bots || {}
    const activeCount = bots.filter(bot => {
      const status = snapshotBots[bot.username]?.status
      return status && !['offline', 'stopped', 'error'].includes(status)
    }).length

    const headerMarkup = `
    <div class="bot-list__header">
      <div>
        <p class="eyebrow">Profiles</p>
        <h4>Профили</h4>
      </div>
      <span class="chip">${formatNumber(bots.length)} бота · ${formatNumber(activeCount)} активн.</span>
    </div>
  `

    const cardMarkup = bots
      .map((bot, index) => {
        const liveBot = snapshotBots[bot.username]
        const liveStatus = liveBot ? formatLiveStatus(liveBot.status) : 'Не запущен'
        const liveStatusClass = getLiveStatusClass(liveBot?.status)
        const routePoints = bot.blocksToMine?.length || 0

        return `
      <button class="bot-card ${liveStatusClass} ${index === state.selectedBotIndex ? 'is-active' : ''}" type="button" data-bot-index="${index}">
        <div class="bot-card__top">
          <span class="bot-card__index">${String(index + 1).padStart(2, '0')}</span>
          <div class="bot-card__identity">
            <strong>${escapeHtml(bot.username)}</strong>
            <span>Стенд: ${escapeHtml(formatCoordinateTriplet(bot.standPosition))}</span>
          </div>
          <span class="bot-status-dot" aria-hidden="true"></span>
        </div>
        <p class="bot-card__line">${escapeHtml(liveStatus)} · ${formatNumber(liveBot?.blocksLastMinute || 0, 1)} б/м · ${formatNumber(routePoints)} точек</p>
      </button>
    `
      })
      .join('')

    elements.botList.innerHTML = headerMarkup + cardMarkup

    elements.botList.querySelectorAll('[data-bot-index]').forEach(button => {
      button.addEventListener('click', () => {
        selectBot(Number(button.dataset.botIndex))
      })
    })
  }

  function renderBotEditor() {
    const bot = getSelectedBot()
    if (!bot) {
      elements.botEditor.innerHTML =
        '<div class="empty-state">Выберите бота в списке сверху или создайте нового, чтобы настроить маршрут добычи и параметры входа.</div>'
      return
    }

    const liveBot = state.runtime.snapshot?.bots?.[bot.username]
    const liveStatus = liveBot ? formatLiveStatus(liveBot.status) : 'Не запущен'
    const liveStatusClass = getLiveStatusClass(liveBot?.status)
    const liveBlocks = liveBot?.blocksTotal || 0
    const liveRate = liveBot?.blocksLastMinute || 0
    const standLabel = formatCoordinateTriplet(bot.standPosition)
    const buttonLabel = formatEntryButtonLabel(bot)
    const lastBlockLabel = formatLastBlockLabel(liveBot)
    const routePointsCount = (bot.blocksToMine || []).length

    elements.botEditor.innerHTML = `
    <article class="bot-control-panel ${liveStatusClass}">
      <div class="bot-control-panel__main">
        <p class="eyebrow">Selected</p>
        <h3>${escapeHtml(bot.username)}</h3>
        <div class="bot-control-panel__meta">
          <span>Стенд: ${escapeHtml(standLabel)}</span>
          <span>Кнопка: ${escapeHtml(buttonLabel)}</span>
        </div>
      </div>
      <div class="bot-live-grid bot-live-grid--compact">
        <div class="bot-stat">
          <span>Статус</span>
          <strong>${escapeHtml(liveStatus)}</strong>
        </div>
        <div class="bot-stat">
          <span>Скорость</span>
          <strong>${formatNumber(liveRate, 1)} б/м</strong>
        </div>
        <div class="bot-stat">
          <span>Добыто</span>
          <strong>${formatNumber(liveBlocks)}</strong>
        </div>
      </div>
    </article>

    <div class="bot-editor-sections">
      <article class="bot-editor-card bot-editor-card--profile">
        <div class="bot-card-section">
          <div class="panel-header panel-header--spread">
            <div>
              <p class="eyebrow">Profile</p>
              <h3>Основное</h3>
            </div>
            <span class="chip">Блок: ${escapeHtml(lastBlockLabel)}</span>
          </div>
          <div class="field-grid bot-field-grid--two">
            <label class="field">
              <span class="field-label">Имя бота</span>
              <input type="text" value="${escapeAttribute(bot.username)}" data-bot-field="username" />
            </label>
            <label class="field">
              <span class="field-label">Макс. дистанция от стенда</span>
              <input type="number" inputmode="decimal" step="any" value="${bot.maxDistanceFromStand}" data-bot-field="maxDistanceFromStand" />
            </label>
          </div>
        </div>

        <div class="bot-card-section">
          <div>
            <p class="eyebrow">Stand position</p>
            <h3>Точка стояния</h3>
          </div>
          <div class="field-grid bot-axis-grid">
            ${['x', 'y', 'z']
              .map(
                axis => `
              <label class="field">
                <span class="field-label">${axis.toUpperCase()}</span>
                <input type="number" inputmode="decimal" step="any" value="${bot.standPosition[axis]}" data-stand-axis="${axis}" />
              </label>
            `
              )
              .join('')}
          </div>
        </div>

        <details class="bot-details" ${bot.entryButton?.enabled ? 'open' : ''}>
          <summary>
            <span>Кнопка после входа</span>
            <span class="chip">${escapeHtml(buttonLabel)}</span>
          </summary>
          <label class="field--checkbox field--checkbox-rich">
            <div class="field-checkbox-copy">
              <div class="field-label field-label--rich">
                <span>Нажимать кнопку автоматически</span>
              </div>
            </div>
            <input type="checkbox" ${bot.entryButton?.enabled ? 'checked' : ''} data-entry-button-enabled="true" />
          </label>
          <div class="field-grid bot-axis-grid">
            ${['x', 'y', 'z']
              .map(
                axis => `
              <label class="field">
                <span class="field-label">Кнопка ${axis.toUpperCase()}</span>
                <input
                  type="number"
                  inputmode="decimal"
                  step="any"
                  value="${bot.entryButton?.[axis] ?? 0}"
                  data-entry-button-axis="${axis}"
                  ${bot.entryButton?.enabled ? '' : 'disabled'}
                />
              </label>
            `
              )
              .join('')}
          </div>
        </details>
      </article>

      <article class="bot-editor-card bot-editor-card--route">
        <div class="panel-header panel-header--spread">
          <div>
            <p class="eyebrow">Mining route</p>
            <h3>Маршрут добычи</h3>
          </div>
          <span class="chip">${routePointsCount} точек</span>
        </div>
        <div class="coordinate-bulk-editor coordinate-bulk-editor--primary">
          <div class="coordinates-toolbar coordinates-toolbar--compact">
            <button class="button button--primary" type="button" id="apply-coordinate-list-btn">Применить список</button>
            <button class="button button--secondary" type="button" id="copy-coordinate-list-btn">Копировать</button>
            <button class="button button--secondary" type="button" id="open-coordinate-modal-btn">Открыть крупно</button>
          </div>
          <label class="field">
            <span class="field-label">Список координат блоков</span>
            <textarea id="coordinate-list-textarea" class="coordinate-textarea coordinate-textarea--inline" spellcheck="false">${escapeHtml(formatCoordinatesText(bot.blocksToMine))}</textarea>
          </label>
        </div>
      </article>
    </div>
  `

    elements.botEditor.querySelectorAll('[data-bot-field]').forEach(input => {
      input.addEventListener('input', event => {
        const fieldName = event.currentTarget.dataset.botField
        const rawValue = event.currentTarget.value
        bot[fieldName] =
          fieldName === 'username' ? rawValue : parsePrimitiveValue('number', rawValue)
        markDirty()
        queueRender('botList', 'dashboard')
      })
    })

    elements.botEditor.querySelectorAll('[data-stand-axis]').forEach(input => {
      input.addEventListener('input', event => {
        const axis = event.currentTarget.dataset.standAxis
        bot.standPosition[axis] = parsePrimitiveValue('number', event.currentTarget.value)
        markDirty()
        queueRender('botList', 'dashboard')
      })
    })

    elements.botEditor.querySelectorAll('[data-entry-button-enabled]').forEach(input => {
      input.addEventListener('change', event => {
        bot.entryButton.enabled = event.currentTarget.checked
        markDirty()
        queueRender('botEditor', 'botList', 'dashboard')
      })
    })

    elements.botEditor.querySelectorAll('[data-entry-button-axis]').forEach(input => {
      input.addEventListener('input', event => {
        const axis = event.currentTarget.dataset.entryButtonAxis
        bot.entryButton[axis] = parsePrimitiveValue('number', event.currentTarget.value)
        markDirty()
        queueRender('botList', 'dashboard')
      })
    })

    const coordinateListTextarea = elements.botEditor.querySelector('#coordinate-list-textarea')
    const applyCoordinateListButton = elements.botEditor.querySelector('#apply-coordinate-list-btn')
    const copyCoordinateListButton = elements.botEditor.querySelector('#copy-coordinate-list-btn')

    const applyCoordinateList = () => {
      try {
        const parsed = parseCoordinatesText(coordinateListTextarea.value)
        bot.blocksToMine = parsed
        markDirty()
        queueRender('botEditor', 'botList', 'dashboard')
        showToast(`Маршрут обновлен: ${parsed.length} точек.`, 'success')
      } catch (error) {
        showToast(error.message, 'error')
      }
    }

    coordinateListTextarea.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        applyCoordinateList()
      }
    })

    applyCoordinateListButton.addEventListener('click', applyCoordinateList)

    copyCoordinateListButton.addEventListener('click', async () => {
      const text = formatCoordinatesText(bot.blocksToMine)
      try {
        await navigator.clipboard.writeText(text)
        showToast('Список координат скопирован.', 'success')
      } catch (_error) {
        coordinateListTextarea.focus()
        coordinateListTextarea.select()
        showToast('Список выделен, можно скопировать вручную.', 'warning')
      }
    })

    elements.botEditor.querySelector('#open-coordinate-modal-btn').addEventListener('click', () => {
      openCoordinateModal()
      elements.coordinateTextarea.value = formatCoordinatesText(bot.blocksToMine)
      elements.coordinateTextarea.focus()
    })
  }

  Object.assign(app, {
    renderBotList,
    renderBotEditor
  })
})()

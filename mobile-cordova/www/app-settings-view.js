;(function initBotStudioSettingsView() {
  const app = window.BotStudioApp
  const schema = window.BotStudioSettingsSchema
  const utils = window.BotStudioRendererUtils
  const settingsValues = window.BotStudioSettingsValues
  const validation = window.BotStudioValidation
  const { state, elements } = app
  const {
    BOT_SETTINGS_SECTIONS_V2,
    DESKTOP_SETTINGS_FIELDS_V2,
    EXTRA_SETTINGS_SECTIONS,
    VISIBLE_CONFIG_SETTING_PATHS
  } = schema
  const { escapeAttribute, escapeHtml } = utils
  const {
    getValueByPath,
    isDisplaySlotPath,
    parsePrimitiveValue,
    setValueByPath,
    toDisplayValue,
    toStoredSettingsValue
  } = settingsValues
  const { validateConfig } = validation

  function markDirty(...args) {
    return app.markDirty(...args)
  }

  function renderHelpBadge(helpText) {
    return `
    <span class="help-wrap" tabindex="0" aria-label="${escapeAttribute(helpText)}">
      <span class="help-badge">?</span>
      <span class="help-popover">${escapeHtml(helpText)}</span>
    </span>
  `
  }

  function renderSettingsField(targetName, field) {
    const source = targetName === 'desktop' ? state.desktopSettings : state.config
    const value =
      targetName === 'config'
        ? toDisplayValue(field.path, getValueByPath(source, field.path))
        : getValueByPath(source, field.path)
    const inputType = field.inputType || (field.kind === 'number' ? 'number' : 'text')
    const isSlotField = targetName === 'config' && isDisplaySlotPath(field.path)

    if (field.kind === 'boolean') {
      return `
      <label class="field--checkbox field--checkbox-rich">
        <div class="field-checkbox-copy">
          <div class="field-label field-label--rich">
            <span>${escapeHtml(field.label)}</span>
            ${renderHelpBadge(field.help)}
          </div>
        </div>
        <input
          type="checkbox"
          ${value ? 'checked' : ''}
          data-settings-target="${targetName}"
          data-settings-path="${field.path}"
          data-settings-kind="${field.kind}"
        />
      </label>
    `
    }

    return `
    <label class="field settings-field">
      <span class="field-label field-label--rich">
        <span>${escapeHtml(field.label)}</span>
        ${renderHelpBadge(field.help)}
      </span>
      <input
        type="${inputType}"
        step="${field.kind === 'number' ? (isSlotField ? '1' : 'any') : ''}"
        ${isSlotField ? 'min="1"' : ''}
        value="${escapeAttribute(String(value ?? ''))}"
        data-settings-target="${targetName}"
        data-settings-path="${field.path}"
        data-settings-kind="${field.kind}"
      />
    </label>
  `
  }

  function getVisibleSettingsSections() {
    const baseSections = BOT_SETTINGS_SECTIONS_V2.map(section => ({
      ...section,
      fields: section.fields.filter(field => VISIBLE_CONFIG_SETTING_PATHS.has(field.path))
    })).filter(section => section.fields.length > 0)

    const extraSections = state.platform === 'desktop' ? EXTRA_SETTINGS_SECTIONS : []
    return [...baseSections, ...extraSections]
  }

  function renderSettingsV2() {
    const visibleSections = getVisibleSettingsSections()

    const desktopSettingsCard =
      state.platform === 'desktop'
        ? `
      <article class="settings-card settings-card--section">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Desktop</p>
            <h4>Приложение</h4>
          </div>
        </div>
        <div class="settings-card-grid settings-card-grid--single">
          ${DESKTOP_SETTINGS_FIELDS_V2.map(field => renderSettingsField('desktop', field)).join('')}
        </div>
      </article>
    `
        : ''

    elements.settingsSections.innerHTML = `
    ${desktopSettingsCard}

    <article class="settings-card settings-card--section">
      <div class="settings-section-stack">
        ${visibleSections
          .map(
            (section, index) => `
          <section class="settings-subsection" id="settings-section-${index + 1}">
            <div class="panel-header">
              <div>
                <p class="eyebrow">${escapeHtml(section.eyebrow)}</p>
                <h4>${escapeHtml(section.title)}</h4>
              </div>
            </div>
            <div class="settings-card-grid">
              ${section.fields.map(field => renderSettingsField('config', field)).join('')}
            </div>
          </section>
        `
          )
          .join('')}
      </div>
    </article>
  `

    elements.settingsSections.querySelectorAll('[data-settings-path]').forEach(input => {
      const eventName = input.type === 'checkbox' ? 'change' : 'input'
      input.addEventListener(eventName, event => {
        const targetName = event.currentTarget.dataset.settingsTarget
        const path = event.currentTarget.dataset.settingsPath
        const kind = event.currentTarget.dataset.settingsKind
        const rawValue =
          event.currentTarget.type === 'checkbox'
            ? event.currentTarget.checked
            : event.currentTarget.value

        if (targetName === 'desktop') {
          setValueByPath(state.desktopSettings, path, parsePrimitiveValue(kind, rawValue))
        } else {
          setValueByPath(state.config, path, toStoredSettingsValue(path, kind, rawValue))
        }

        markDirty()
      })
    })
  }

  function renderValidation() {
    const issues = validateConfig(state.config)
    if (!issues.length) {
      elements.validationBanner.hidden = true
      elements.validationBanner.innerHTML = ''
      return
    }

    elements.validationBanner.hidden = false
    elements.validationBanner.innerHTML = `
    <strong>Найдены проблемы в конфиге:</strong><br />
    ${issues
      .slice(0, 8)
      .map(issue => escapeHtml(issue))
      .join('<br />')}
  `
  }

  Object.assign(app, {
    renderHelpBadge,
    renderSettingsField,
    getVisibleSettingsSections,
    renderSettingsV2,
    renderValidation
  })
})()

;(function initBotStudioSettingsValues() {
  function setValueByPath(target, path, nextValue) {
    const parts = path.split('.')
    let cursor = target

    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor = cursor[parts[index]]
    }

    cursor[parts[parts.length - 1]] = nextValue
  }

  function getValueByPath(target, path) {
    return path.split('.').reduce((cursor, segment) => cursor?.[segment], target)
  }

  const DISPLAY_SLOT_PATHS = new Set(['menu.slot1', 'menu.slot2', 'menu.hotbarSlot'])

  function isDisplaySlotPath(path) {
    return DISPLAY_SLOT_PATHS.has(path)
  }

  function toDisplayValue(path, value) {
    if (!isDisplaySlotPath(path) || value == null || value === '') {
      return value
    }

    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue + 1 : value
  }

  function toStoredSettingsValue(path, kind, rawValue) {
    const parsedValue = parsePrimitiveValue(kind, rawValue)

    if (!isDisplaySlotPath(path) || kind !== 'number') {
      return parsedValue
    }

    const numericValue = Number(parsedValue)
    return Number.isFinite(numericValue) ? Math.max(0, Math.trunc(numericValue) - 1) : 0
  }

  function parsePrimitiveValue(kind, rawValue) {
    if (kind === 'boolean') return Boolean(rawValue)
    if (kind === 'number') {
      const parsed = Number(rawValue)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return rawValue
  }

  window.BotStudioSettingsValues = {
    DISPLAY_SLOT_PATHS,
    setValueByPath,
    getValueByPath,
    isDisplaySlotPath,
    toDisplayValue,
    toStoredSettingsValue,
    parsePrimitiveValue
  }
})()

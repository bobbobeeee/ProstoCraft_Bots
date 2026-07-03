function flattenMinecraftText(value, options = {}) {
  const arrayJoiner = options.arrayJoiner ?? ' '
  const partJoiner = options.partJoiner ?? ' '

  if (value == null) return ''

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return flattenMinecraftText(JSON.parse(trimmed), options)
      } catch (_error) {
        return value
      }
    }
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(entry => flattenMinecraftText(entry, options))
      .filter(Boolean)
      .join(arrayJoiner)
  }

  if (typeof value === 'object') {
    const parts = []
    if (Object.prototype.hasOwnProperty.call(value, 'text')) {
      parts.push(flatifyMinecraftTextPart(value.text, options))
    }
    if (value.translate) parts.push(flattenMinecraftText(value.translate, options))
    if (value.fallback && parts.length === 0) {
      parts.push(flattenMinecraftText(value.fallback, options))
    }
    if (value.with && parts.length === 0) parts.push(flattenMinecraftText(value.with, options))
    if (value.extra) parts.push(flattenMinecraftText(value.extra, options))
    if (value.value && parts.length === 0) parts.push(flattenMinecraftText(value.value, options))
    if (value.name && parts.length === 0) parts.push(flattenMinecraftText(value.name, options))
    return parts.filter(Boolean).join(partJoiner)
  }

  return String(value)
}

function flatifyMinecraftTextPart(value, options = {}) {
  if (value == null) return ''
  return typeof value === 'object' ? flattenMinecraftText(value, options) : String(value)
}

function getMessageJson(message) {
  if (!message || typeof message !== 'object') return null
  if (message.json) return message.json
  if (message.unsigned?.json) return message.unsigned.json
  return null
}

function isUsableChatText(value, normalizeChatText) {
  const text = normalizeChatText(value)
  return Boolean(text && text !== '[object Object]' && text !== 'undefined' && text !== 'null')
}

function getMinecraftMessageText(message, normalizeChatText) {
  const candidates = []
  const addCandidate = getter => {
    try {
      const value = getter()
      if (isUsableChatText(value, normalizeChatText)) {
        candidates.push(normalizeChatText(value))
      }
    } catch (_error) {}
  }

  addCandidate(() => (typeof message?.toString === 'function' ? message.toString() : null))
  addCandidate(() =>
    typeof message?.unsigned?.toString === 'function' ? message.unsigned.toString() : null
  )
  addCandidate(() => flattenMinecraftText(message?.json, { arrayJoiner: '', partJoiner: '' }))
  addCandidate(() =>
    flattenMinecraftText(message?.unsigned?.json, { arrayJoiner: '', partJoiner: '' })
  )
  addCandidate(() => (typeof message === 'string' ? message : null))
  addCandidate(() => flattenMinecraftText(message, { arrayJoiner: '', partJoiner: '' }))

  return candidates[0] || ''
}

function getWindowTitleText(window) {
  return flattenMinecraftText(window?.title || '')
}

function getItemDisplayText(item) {
  const display = item?.nbt?.value?.display?.value
  if (!display) return ''

  const parts = []
  if (display.Name) parts.push(flattenMinecraftText(display.Name.value ?? display.Name))
  const lore = display.Lore?.value?.value || display.Lore?.value
  if (Array.isArray(lore)) parts.push(flattenMinecraftText(lore))
  return parts.filter(Boolean).join(' ')
}

function getWindowSlotText(window, slot) {
  if (!window || !Array.isArray(window.slots)) return ''
  return getItemDisplayText(window.slots[slot])
}

function classifyServerMenuWindow(window, options = {}) {
  if (!window) return { kind: 'none', title: '', slot1Text: '', slot2Text: '' }

  const title = getWindowTitleText(window)
  const lowTitle = title.toLowerCase()
  const slot1Text = getWindowSlotText(window, options.menuSlot1)
  const slot2Text = getWindowSlotText(window, options.menuSlot2)
  const lowSlot1 = slot1Text.toLowerCase()
  const lowSlot2 = slot2Text.toLowerCase()

  if (lowTitle.includes('выбор игры') || lowTitle.includes('game')) {
    return { kind: 'game', title, slot1Text, slot2Text }
  }

  if (lowTitle.includes('выбор скайблока') || lowTitle.includes('skyblock')) {
    return { kind: 'skyblock', title, slot1Text, slot2Text }
  }

  if (lowSlot2.includes('второй скайблок') || lowSlot2.includes('second skyblock')) {
    return { kind: 'skyblock', title, slot1Text, slot2Text }
  }

  if (lowSlot1.includes('скайблок') || lowSlot1.includes('skyblock')) {
    return { kind: 'game', title, slot1Text, slot2Text }
  }

  return { kind: 'unknown', title, slot1Text, slot2Text }
}

module.exports = {
  classifyServerMenuWindow,
  flatifyMinecraftTextPart,
  flattenMinecraftText,
  getItemDisplayText,
  getMessageJson,
  getMinecraftMessageText,
  getWindowSlotText,
  getWindowTitleText,
  isUsableChatText
}

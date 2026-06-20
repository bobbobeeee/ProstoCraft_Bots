function cleanLogMessage(message) {
  return String(message ?? '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[+✗⚠•⏸▶OKERR]/g, '')
    .trim()
}

function normalizeServerMessagePosition(position) {
  if (position === 0) return 'chat'
  if (position === 1) return 'system'
  if (position === 2) return 'game_info'
  if (typeof position === 'string' && position.trim()) {
    const normalized = position
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    if (normalized === '0' || normalized === 'chat') return 'chat'
    if (normalized === '1' || normalized === 'system') return 'system'
    if (
      normalized === '2' ||
      normalized === 'game_info' ||
      normalized === 'gameinfo' ||
      normalized === 'action_bar' ||
      normalized === 'actionbar'
    ) {
      return 'game_info'
    }
    return normalized
  }
  return 'unknown'
}

function getServerMessageSource(position) {
  return `server-${normalizeServerMessagePosition(position).replace(/_/g, '-')}`
}

function isVisibleServerMessagePosition(position) {
  const normalized = normalizeServerMessagePosition(position)
  return normalized === 'chat' || normalized === 'system' || normalized === 'unknown'
}

function normalizeChatText(text) {
  return String(text ?? '')
    .replace(/\u00a7[0-9A-FK-OR]/gi, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function normalizeDiagnosticValue(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      errno: value.errno,
      syscall: value.syscall,
      address: value.address,
      port: value.port,
      stack: value.stack ? value.stack.split('\n').slice(0, 8).join(' | ') : undefined
    }
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    if (
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.z) &&
      Object.keys(value).some(key => ['x', 'y', 'z'].includes(key))
    ) {
      return {
        x: Number(value.x.toFixed ? value.x.toFixed(3) : value.x),
        y: Number(value.y.toFixed ? value.y.toFixed(3) : value.y),
        z: Number(value.z.toFixed ? value.z.toFixed(3) : value.z)
      }
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map(item => normalizeDiagnosticValue(item, seen))
    }

    const output = {}
    for (const [key, nestedValue] of Object.entries(value).slice(0, 40)) {
      if (typeof nestedValue === 'function') continue
      output[key] = normalizeDiagnosticValue(nestedValue, seen)
    }
    return output
  }

  return value
}

function shortenDiagnosticText(value, maxLength = 300) {
  const text = String(value ?? '')
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function summarizeDiagnosticPacket(eventName, packet, options = {}) {
  if (options.fullPacketDetails || !packet || typeof packet !== 'object') {
    return packet
  }

  if (eventName === 'client-packet:login' || eventName === 'client-packet:respawn') {
    return {
      entityId: packet.entityId,
      gameMode: packet.gameMode,
      previousGameMode: packet.previousGameMode,
      worldName: packet.worldName,
      worldNamesCount: Array.isArray(packet.worldNames) ? packet.worldNames.length : undefined,
      dimension: typeof packet.dimension === 'string' ? packet.dimension : undefined,
      hashedSeed: packet.hashedSeed,
      maxPlayers: packet.maxPlayers,
      reducedDebugInfo: packet.reducedDebugInfo,
      enableRespawnScreen: packet.enableRespawnScreen
    }
  }

  if (eventName === 'client-packet:position' || eventName === 'client-write:position') {
    return {
      x: Number.isFinite(Number(packet.x)) ? Number(Number(packet.x).toFixed(3)) : packet.x,
      y: Number.isFinite(Number(packet.y)) ? Number(Number(packet.y).toFixed(3)) : packet.y,
      z: Number.isFinite(Number(packet.z)) ? Number(Number(packet.z).toFixed(3)) : packet.z,
      yaw: packet.yaw,
      pitch: packet.pitch,
      flags: packet.flags,
      teleportId: packet.teleportId ?? packet.teleportID ?? packet.teleport_id,
      onGround: packet.onGround
    }
  }

  if (eventName === 'client-packet:kick_disconnect' || eventName === 'client-packet:disconnect') {
    return { reason: shortenDiagnosticText(packet.reason, 500) }
  }

  if (eventName === 'client-packet:open_window') {
    return {
      windowId: packet.windowId,
      inventoryType: packet.inventoryType,
      windowTitle: shortenDiagnosticText(packet.windowTitle ?? packet.title, 160),
      slotCount: packet.slotCount
    }
  }

  return packet
}

function summarizeServerMessageJson(json, options = {}) {
  if (options.fullPacketDetails || !json || typeof json !== 'object') {
    return json
  }

  return {
    text: shortenDiagnosticText(json.text, 240),
    color: json.color,
    extraCount: Array.isArray(json.extra) ? json.extra.length : undefined
  }
}

function summarizeDiagnosticDetails(eventName, details = {}, options = {}) {
  if (!details || typeof details !== 'object') return details
  const summarized = { ...details }

  if (Object.prototype.hasOwnProperty.call(summarized, 'packet')) {
    summarized.packet = summarizeDiagnosticPacket(eventName, summarized.packet, options)
  }

  if (
    eventName.startsWith('client-write:') &&
    Object.prototype.hasOwnProperty.call(summarized, 'payload')
  ) {
    summarized.payload = summarizeDiagnosticPacket(eventName, summarized.payload, options)
  }

  if (eventName === 'server-message') {
    summarized.text = shortenDiagnosticText(summarized.text, 500)
    summarized.json = summarizeServerMessageJson(summarized.json, options)
  }

  if (Object.prototype.hasOwnProperty.call(summarized, 'error')) {
    summarized.error = normalizeDiagnosticValue(summarized.error)
  }

  return summarized
}

function stringifyDiagnostic(details = {}, options = {}) {
  try {
    const normalized = normalizeDiagnosticValue(details)
    const text = JSON.stringify(normalized)
    if (!text) return ''
    const maxLength = Math.max(1, Number(options.maxValueLength) || 300)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  } catch (_error) {
    return String(details)
  }
}

module.exports = {
  cleanLogMessage,
  getServerMessageSource,
  isVisibleServerMessagePosition,
  normalizeChatText,
  normalizeDiagnosticValue,
  normalizeServerMessagePosition,
  shortenDiagnosticText,
  stringifyDiagnostic,
  summarizeDiagnosticDetails,
  summarizeDiagnosticPacket,
  summarizeServerMessageJson
}

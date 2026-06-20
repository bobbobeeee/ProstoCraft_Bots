function encodeVarInt(value) {
  const bytes = []
  let remaining = Number(value) >>> 0
  do {
    let current = remaining & 0x7f
    remaining >>>= 7
    if (remaining !== 0) current |= 0x80
    bytes.push(current)
  } while (remaining !== 0)
  return Buffer.from(bytes)
}

function encodeMinecraftString(value) {
  const text = Buffer.from(String(value), 'utf8')
  return Buffer.concat([encodeVarInt(text.length), text])
}

function summarizeClientPacketPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const summary = { ...payload }
  if (Buffer.isBuffer(summary.data)) {
    summary.data = {
      length: summary.data.length,
      hex: summary.data.toString('hex').slice(0, 48)
    }
  }
  return summary
}

function createClientIdentityPackets() {
  return [
    {
      packetName: 'settings',
      payload: {
        locale: 'ru_ru',
        viewDistance: 8,
        chatFlags: 0,
        chatColors: true,
        skinParts: 0x7f,
        mainHand: 1
      }
    },
    {
      packetName: 'custom_payload',
      payload: {
        channel: 'minecraft:brand',
        data: encodeMinecraftString('vanilla')
      }
    }
  ]
}

function createTeleportConfirmPayload(teleportId) {
  const numericTeleportId = Number(teleportId)
  if (!Number.isFinite(numericTeleportId)) return null
  return {
    teleportId: numericTeleportId
  }
}

module.exports = {
  createClientIdentityPackets,
  createTeleportConfirmPayload,
  encodeMinecraftString,
  encodeVarInt,
  summarizeClientPacketPayload
}

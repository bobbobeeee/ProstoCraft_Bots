const LIMBO_FILTER_DEFAULTS = Object.freeze({
  fallingCheckTicks: 128,
  packetMs: 50,
  timeoutMs: 15000,
  maxValidPositionDifference: 0.01,
  nonValidPositionXzAttempts: 10,
  nonValidPositionYAttempts: 10,
  fallbackTeleportId: 44
})

function toFiniteNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getLoadedChunkSpeed(tick) {
  const numericTick = Number(tick)
  if (numericTick === -1) return 0
  if (!Number.isFinite(numericTick)) return NaN
  return -((Math.pow(0.98, numericTick) - 1) * 3.92)
}

function normalizeLimboStartY(rawY) {
  const y = Number(rawY)
  if (!Number.isFinite(y)) return y

  if (y >= 768 && y <= 4096) {
    const halfY = y / 2
    if (halfY >= 128 && halfY <= 2048) {
      return halfY
    }
  }

  return y
}

function getFinishPacketTicks(fallingCheckTicks = LIMBO_FILTER_DEFAULTS.fallingCheckTicks) {
  return Math.max(1, Number(fallingCheckTicks) || LIMBO_FILTER_DEFAULTS.fallingCheckTicks) + 1
}

function getMinimumCheckMs(options = {}) {
  const ticks = Math.max(
    1,
    Number(options.fallingCheckTicks ?? LIMBO_FILTER_DEFAULTS.fallingCheckTicks) ||
      LIMBO_FILTER_DEFAULTS.fallingCheckTicks
  )
  const packetMs = Math.max(
    1,
    Number(options.packetMs ?? LIMBO_FILTER_DEFAULTS.packetMs) || LIMBO_FILTER_DEFAULTS.packetMs
  )
  return ticks * packetMs
}

function createFallPacket(start, tick) {
  const x = toFiniteNumber(start?.x)
  const y = toFiniteNumber(start?.y)
  const z = toFiniteNumber(start?.z)
  const numericTick = Number(tick)
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(numericTick)
  ) {
    return null
  }

  let currentY = y
  for (let i = 1; i <= numericTick; i += 1) {
    currentY -= getLoadedChunkSpeed(i)
  }

  return {
    tick: numericTick,
    x,
    y: currentY,
    z,
    onGround: false,
    fallStep: getLoadedChunkSpeed(numericTick),
    totalFallen: y - currentY
  }
}

function createFallSequence(start, options = {}) {
  const ticks = getFinishPacketTicks(options.fallingCheckTicks)
  const packets = []
  for (let tick = 1; tick <= ticks; tick += 1) {
    const packet = createFallPacket(start, tick)
    if (!packet) return []
    packets.push(packet)
  }
  return packets
}

function validateFallPacket(packet, state, options = {}) {
  const tolerance = Math.max(
    0,
    Number(
      options.maxValidPositionDifference ?? LIMBO_FILTER_DEFAULTS.maxValidPositionDifference
    ) || LIMBO_FILTER_DEFAULTS.maxValidPositionDifference
  )
  const x = toFiniteNumber(packet?.x)
  const y = toFiniteNumber(packet?.y)
  const z = toFiniteNumber(packet?.z)
  const expectedX = toFiniteNumber(state?.validX)
  const expectedZ = toFiniteNumber(state?.validZ)
  const lastY = toFiniteNumber(state?.lastY)
  const tick = Number(state?.tick)

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return { ok: false, reason: 'non-finite-position' }
  }
  if (
    !Number.isFinite(expectedX) ||
    !Number.isFinite(expectedZ) ||
    !Number.isFinite(lastY) ||
    !Number.isFinite(tick)
  ) {
    return { ok: false, reason: 'invalid-state' }
  }
  if (x !== expectedX || z !== expectedZ) {
    return { ok: false, reason: 'invalid-xz', x, z, expectedX, expectedZ }
  }
  if (packet.onGround !== false) {
    return { ok: false, reason: 'on-ground' }
  }

  const delta = lastY - y
  const expectedDelta = getLoadedChunkSpeed(tick)
  const diff = Math.abs(delta - expectedDelta)

  if (diff > tolerance) {
    return {
      ok: false,
      reason: 'invalid-y-delta',
      delta,
      expectedDelta,
      diff,
      tolerance,
      tick
    }
  }

  return {
    ok: true,
    delta,
    expectedDelta,
    diff,
    tick
  }
}

module.exports = {
  LIMBO_FILTER_DEFAULTS,
  createFallPacket,
  createFallSequence,
  getFinishPacketTicks,
  getLoadedChunkSpeed,
  getMinimumCheckMs,
  normalizeLimboStartY,
  validateFallPacket
}

const assert = require('assert')
const {
  LIMBO_FILTER_DEFAULTS,
  createFallPacket,
  createFallSequence,
  getFinishPacketTicks,
  getLoadedChunkSpeed,
  getMinimumCheckMs,
  validateFallPacket
} = require('./limbo-filter')

assert.strictEqual(LIMBO_FILTER_DEFAULTS.fallingCheckTicks, 128)
assert.strictEqual(getFinishPacketTicks(128), 129)
assert.strictEqual(getMinimumCheckMs({ fallingCheckTicks: 128, packetMs: 50 }), 6400)

assert.ok(Math.abs(getLoadedChunkSpeed(1) - 0.0784) < 1e-12)
assert.ok(Math.abs(getLoadedChunkSpeed(2) - 0.155232) < 1e-12)
assert.strictEqual(getLoadedChunkSpeed(-1), 0)

const start = { x: 0, y: 512, z: 0 }
const sequence = createFallSequence(start, { fallingCheckTicks: 128 })
assert.strictEqual(sequence.length, 129)
assert.strictEqual(sequence[0].onGround, false)
assert.ok(sequence[0].y < 512)
assert.ok(sequence[128].y < sequence[127].y)

let state = { validX: 0, validZ: 0, lastY: 512, tick: 1 }
let result = validateFallPacket(createFallPacket(start, 1), state)
assert.strictEqual(result.ok, true)

state = { validX: 0, validZ: 0, lastY: sequence[0].y, tick: 2 }
result = validateFallPacket(sequence[1], state)
assert.strictEqual(result.ok, true)

result = validateFallPacket({ ...sequence[1], x: 1 }, state)
assert.strictEqual(result.ok, false)
assert.strictEqual(result.reason, 'invalid-xz')

result = validateFallPacket({ ...sequence[1], onGround: true }, state)
assert.strictEqual(result.ok, false)
assert.strictEqual(result.reason, 'on-ground')

result = validateFallPacket({ ...sequence[1], y: sequence[1].y + 0.1 }, state)
assert.strictEqual(result.ok, false)
assert.strictEqual(result.reason, 'invalid-y-delta')

const highStartPacket = createFallPacket({ x: 0, y: 1024, z: 0 }, 1)
assert.ok(Math.abs(highStartPacket.y - 1023.9216) < 1e-12)

console.log('limbo-filter tests passed')

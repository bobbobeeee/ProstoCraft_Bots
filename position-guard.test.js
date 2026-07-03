const assert = require('assert')
const {
  describeCoordinateHealth,
  formatDistance,
  formatPosition,
  isCoordinateHealthFarFromWorkArea,
  isCoordinateHealthInWorkArea
} = require('./runtime-core/position-guard')

{
  assert.strictEqual(formatPosition({ x: 1.234, y: 70, z: -2.5 }), '1.23, 70.00, -2.50')
  assert.strictEqual(formatPosition(null), '?')
  assert.strictEqual(formatDistance(4.567), '4.57м')
  assert.strictEqual(formatDistance(Infinity), '?')
}

{
  assert.strictEqual(isCoordinateHealthInWorkArea({ nearStand: true }), true)
  assert.strictEqual(isCoordinateHealthInWorkArea({ nearMiningTargets: true }), true)
  assert.strictEqual(isCoordinateHealthFarFromWorkArea({ farFromStand: true }), false)
  assert.strictEqual(
    isCoordinateHealthFarFromWorkArea({ farFromStand: true, farFromMiningTargets: true }),
    true
  )
}

{
  const description = describeCoordinateHealth({
    botPosition: { x: 1, y: 2, z: 3 },
    standAnchor: { x: 4, y: 5, z: 6 },
    standDistance: 7.1,
    nearestTargetDistance: 8.2,
    progressAgeMs: 12345,
    targetSnapshot: {},
    mineableTargets: 1,
    transientTargets: 2,
    emptyTargets: 3,
    unloadedTargets: 4
  })
  assert(description.includes('bot=1.00, 2.00, 3.00'))
  assert(description.includes('добыча=12с назад'))
  assert(description.includes('mineable=1'))
}

console.log('position-guard tests passed')

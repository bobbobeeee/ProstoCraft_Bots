function formatPosition(position) {
  if (!position) return '?'
  const format = value => (Number.isFinite(value) ? value.toFixed(2) : '?')
  return `${format(position.x)}, ${format(position.y)}, ${format(position.z)}`
}

function formatDistance(distance) {
  return Number.isFinite(distance) ? `${distance.toFixed(2)}м` : '?'
}

function isCoordinateHealthInWorkArea(health) {
  return Boolean(health?.nearStand || health?.nearMiningTargets)
}

function isCoordinateHealthFarFromWorkArea(health) {
  return Boolean(health?.farFromStand && health?.farFromMiningTargets)
}

function describeCoordinateHealth(health) {
  const progressText = Number.isFinite(health?.progressAgeMs)
    ? `${Math.round(health.progressAgeMs / 1000)}с назад`
    : 'нет'
  const targetText = health?.targetSnapshot
    ? `цели mineable=${health.mineableTargets}, transient=${health.transientTargets}, air=${health.emptyTargets}, unloaded=${health.unloadedTargets}`
    : 'цели неизвестны'

  return `bot=${formatPosition(health?.botPosition)}, stand=${formatPosition(health?.standAnchor)}, до stand=${formatDistance(health?.standDistance)}, до блока=${formatDistance(health?.nearestTargetDistance)}, добыча=${progressText}, ${targetText}`
}

module.exports = {
  describeCoordinateHealth,
  formatDistance,
  formatPosition,
  isCoordinateHealthFarFromWorkArea,
  isCoordinateHealthInWorkArea
}

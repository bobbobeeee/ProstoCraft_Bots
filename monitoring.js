function formatBlocksPerSecond(value) {
  if (!Number.isFinite(value) || value <= 0) return '0.0 б/с'
  if (value >= 100) return `${value.toFixed(0)} б/с`
  if (value >= 10) return `${value.toFixed(1)} б/с`
  return `${value.toFixed(2)} б/с`
}

function formatBlocksPerMinute(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 б/м'
  if (value >= 100) return `${value.toFixed(0)} б/м`
  if (value >= 10) return `${value.toFixed(1)} б/м`
  return `${value.toFixed(2)} б/м`
}

function computeBotRateStats(blockTimes, now = Date.now(), speedWindowMs = 10000) {
  const safeBlockTimes = Array.isArray(blockTimes) ? blockTimes : []
  const effectiveWindowMs = Math.max(1000, speedWindowMs)
  const maxHistoryMs = Math.max(60000, effectiveWindowMs)

  let blocksLastMinute = 0
  let recentBlocks = 0
  const filteredTimes = []

  for (const timestamp of safeBlockTimes) {
    const age = now - timestamp
    if (age >= maxHistoryMs) continue

    filteredTimes.push(timestamp)
    if (age < 60000) blocksLastMinute++
    if (age < effectiveWindowMs) recentBlocks++
  }

  return {
    blockTimes: filteredTimes,
    blocksLastMinute,
    blocksPerSecond: recentBlocks / (effectiveWindowMs / 1000)
  }
}

module.exports = {
  computeBotRateStats,
  formatBlocksPerMinute,
  formatBlocksPerSecond
}

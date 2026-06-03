const assert = require('assert')
const { computeBotRateStats, formatBlocksPerMinute, formatBlocksPerSecond } = require('./monitoring')

const now = 100000

{
  const stats = computeBotRateStats([99500, 98000, 90500, 39000], now, 10000)
  assert.deepStrictEqual(stats.blockTimes, [99500, 98000, 90500])
  assert.strictEqual(stats.blocksLastMinute, 3)
  assert.strictEqual(stats.blocksPerSecond, 0.3)
}

{
  const stats = computeBotRateStats([89000, 70000], now, 10000)
  assert.deepStrictEqual(stats.blockTimes, [89000, 70000])
  assert.strictEqual(stats.blocksLastMinute, 2)
  assert.strictEqual(stats.blocksPerSecond, 0)
}

{
  assert.strictEqual(formatBlocksPerSecond(0), '0.0 б/с')
  assert.strictEqual(formatBlocksPerSecond(9.876), '9.88 б/с')
  assert.strictEqual(formatBlocksPerSecond(10.25), '10.3 б/с')
  assert.strictEqual(formatBlocksPerSecond(120.9), '121 б/с')
}

{
  assert.strictEqual(formatBlocksPerMinute(0), '0 б/м')
  assert.strictEqual(formatBlocksPerMinute(9.876), '9.88 б/м')
  assert.strictEqual(formatBlocksPerMinute(10.25), '10.3 б/м')
  assert.strictEqual(formatBlocksPerMinute(120.9), '121 б/м')
}

console.log('monitoring tests passed')

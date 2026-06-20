const assert = require('assert')
const {
  createProcessLifecycle,
  installConsoleNoiseFilters,
  isIgnorableProcessError
} = require('./runtime-core/process-guard')

assert.strictEqual(isIgnorableProcessError('read ECONNRESET'), true)
assert.strictEqual(isIgnorableProcessError('ordinary failure'), false)

const writes = []
const baseConsole = {
  warn: (...args) => writes.push(['warn', ...args]),
  error: (...args) => writes.push(['error', ...args]),
  log: (...args) => writes.push(['log', ...args])
}
const originalWarn = console.warn
const originalError = console.error
const originalLog = console.log
const originalStderrWrite = process.stderr.write

const guard = installConsoleNoiseFilters({
  baseConsole,
  stderrWrite(chunk, _encoding, callback) {
    writes.push(['stderr', String(chunk)])
    if (callback) callback()
    return true
  }
})

console.warn('deprecated')
console.warn('visible')
console.error(new Error('read ECONNRESET'))
console.error('visible error')
process.stderr.write('socket hang up')
process.stderr.write('visible stderr')
guard.restore()

assert.deepStrictEqual(writes, [
  ['warn', 'visible'],
  ['error', 'visible error'],
  ['stderr', 'visible stderr']
])
assert.strictEqual(console.warn, baseConsole.warn)
assert.strictEqual(console.error, baseConsole.error)
assert.strictEqual(console.log, baseConsole.log)

console.warn = originalWarn
console.error = originalError
console.log = originalLog
process.stderr.write = originalStderrWrite

const timeoutTimers = []
const intervalTimers = []
const clearedTimeouts = []
const clearedIntervals = []
const registeredHandlers = []
const removedHandlers = []
const fakeGlobal = {
  setTimeout(handler, timeout, ...args) {
    const timer = { type: 'timeout', handler, timeout, args }
    timeoutTimers.push(timer)
    return timer
  },
  clearTimeout(timer) {
    clearedTimeouts.push(timer)
  },
  setInterval(handler, timeout, ...args) {
    const timer = { type: 'interval', handler, timeout, args }
    intervalTimers.push(timer)
    return timer
  },
  clearInterval(timer) {
    clearedIntervals.push(timer)
  }
}
const fakeProcess = {
  on(eventName, handler) {
    registeredHandlers.push({ eventName, handler })
  },
  removeListener(eventName, handler) {
    removedHandlers.push({ eventName, handler })
  }
}
const lifecycle = createProcessLifecycle({
  global: fakeGlobal,
  process: fakeProcess
})
const timeoutCalls = []
const timeout = lifecycle.setTimeout(value => timeoutCalls.push(value), 250, 'ready')
const interval = lifecycle.setInterval(() => {}, 500)
lifecycle.registerProcessHandler('SIGTERM', timeout.handler)
timeout.handler(...timeout.args)
lifecycle.clearInterval(interval)
lifecycle.removeProcessHandlers()
lifecycle.clearTrackedTimers()

assert.deepStrictEqual(timeoutCalls, ['ready'])
assert.deepStrictEqual(registeredHandlers, [{ eventName: 'SIGTERM', handler: timeout.handler }])
assert.deepStrictEqual(removedHandlers, [{ eventName: 'SIGTERM', handler: timeout.handler }])
assert.deepStrictEqual(clearedTimeouts, [])
assert.deepStrictEqual(clearedIntervals, [interval])

console.log('process-guard tests passed')

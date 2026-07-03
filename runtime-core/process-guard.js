const NETWORK_NOISE_PATTERNS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'socket hang up'
]

const STDERR_NOISE_PATTERNS = [...NETWORK_NOISE_PATTERNS, 'errno', 'syscall']

const WARNING_NOISE_PATTERNS = [
  'Ignoring block entities',
  'chunk failed to load',
  'entity.objectType is deprecated',
  'deprecated',
  ...NETWORK_NOISE_PATTERNS
]

function containsAny(text, patterns) {
  return patterns.some(pattern => text.includes(pattern))
}

function normalizeConsoleArg(arg) {
  if (typeof arg === 'string') return arg
  if (arg && arg.message) return arg.message
  if (arg && arg.stack) return arg.stack
  return JSON.stringify(arg)
}

function installConsoleNoiseFilters(options = {}) {
  const baseConsole = options.baseConsole || console
  const stderrWrite = options.stderrWrite || process.stderr.write.bind(process.stderr)
  const originalStderrWrite = stderrWrite

  console.warn = (...args) => {
    const msg = args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')
    if (containsAny(msg, WARNING_NOISE_PATTERNS)) return
    baseConsole.warn(...args)
  }

  console.error = (...args) => {
    const msg = args.map(normalizeConsoleArg).join(' ')
    if (containsAny(msg, STDERR_NOISE_PATTERNS)) return
    baseConsole.error(...args)
  }

  console.log = () => {}

  process.stderr.write = (chunk, encoding, callback) => {
    const str = chunk.toString()
    if (containsAny(str, STDERR_NOISE_PATTERNS)) {
      if (callback) callback()
      return true
    }
    return originalStderrWrite(chunk, encoding, callback)
  }

  return {
    restore() {
      console.warn = baseConsole.warn
      console.error = baseConsole.error
      console.log = baseConsole.log
      process.stderr.write = stderrWrite
    }
  }
}

function createProcessLifecycle(options = {}) {
  const runtimeGlobal = options.global || global
  const runtimeProcess = options.process || process
  const trackedTimeouts = new Set()
  const trackedIntervals = new Set()
  const nativeSetTimeout = runtimeGlobal.setTimeout.bind(runtimeGlobal)
  const nativeClearTimeout = runtimeGlobal.clearTimeout.bind(runtimeGlobal)
  const nativeSetInterval = runtimeGlobal.setInterval.bind(runtimeGlobal)
  const nativeClearInterval = runtimeGlobal.clearInterval.bind(runtimeGlobal)
  const processListeners = []

  const setTimeout = (handler, timeout, ...args) => {
    const timer = nativeSetTimeout(() => {
      trackedTimeouts.delete(timer)
      if (typeof handler === 'function') {
        handler(...args)
      }
    }, timeout)
    trackedTimeouts.add(timer)
    return timer
  }

  const clearTimeout = timer => {
    trackedTimeouts.delete(timer)
    return nativeClearTimeout(timer)
  }

  const setInterval = (handler, timeout, ...args) => {
    const timer = nativeSetInterval(() => {
      if (typeof handler === 'function') {
        handler(...args)
      }
    }, timeout)
    trackedIntervals.add(timer)
    return timer
  }

  const clearInterval = timer => {
    trackedIntervals.delete(timer)
    return nativeClearInterval(timer)
  }

  function registerProcessHandler(eventName, handler) {
    runtimeProcess.on(eventName, handler)
    processListeners.push({ eventName, handler })
  }

  function removeProcessHandlers() {
    for (const { eventName, handler } of processListeners.splice(0)) {
      try {
        runtimeProcess.removeListener(eventName, handler)
      } catch (_error) {}
    }
  }

  function clearTrackedTimers() {
    for (const timer of [...trackedTimeouts]) {
      try {
        nativeClearTimeout(timer)
      } catch (_error) {}
      trackedTimeouts.delete(timer)
    }

    for (const timer of [...trackedIntervals]) {
      try {
        nativeClearInterval(timer)
      } catch (_error) {}
      trackedIntervals.delete(timer)
    }
  }

  return {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    registerProcessHandler,
    removeProcessHandlers,
    clearTrackedTimers
  }
}

function isIgnorableProcessError(message) {
  return containsAny(String(message || ''), STDERR_NOISE_PATTERNS)
}

module.exports = {
  createProcessLifecycle,
  installConsoleNoiseFilters,
  isIgnorableProcessError
}

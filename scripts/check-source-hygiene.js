const fs = require('fs')
const crypto = require('crypto')
const vm = require('vm')

const SOURCE_FILES = [
  'bot.js',
  'bot-filter.js',
  'limbo-filter.js',
  'reconnect-policy.js',
  'speed-guard.js',
  'stability-center.js',
  'config-migrations.js',
  'update-service.js',
  'monitoring.js',
  'monitoring.test.js',
  'bot-filter.test.js',
  'limbo-filter.test.js',
  'reconnect-policy.test.js',
  'speed-guard.test.js',
  'stability-center.test.js',
  'config-migrations.test.js',
  'update-service.test.js',
  'desktop/main.js',
  'desktop/preload.js',
  'desktop/renderer/app.js',
  'desktop/renderer/bridge.js',
  'scripts/sync-android-assets.js',
  'scripts/sync-cordova-app.js',
  'scripts/build-cordova-android-release.js',
  'scripts/run-local-bot-test.js',
  'mobile-cordova-src/nodejs-project/mobile-runtime.js'
]

const SYNCED_FILE_PAIRS = [
  ['desktop/renderer/app.js', 'mobile-cordova/www/app.js'],
  ['desktop/renderer/bridge.js', 'mobile-cordova/www/bridge.js'],
  ['desktop/renderer/styles.css', 'mobile-cordova/www/styles.css'],
  ['desktop/renderer/index.html', 'mobile-cordova/www/index.html'],
  ['desktop/renderer/app.js', 'android/app/src/main/assets/www/app.js'],
  ['desktop/renderer/bridge.js', 'android/app/src/main/assets/www/bridge.js'],
  ['desktop/renderer/styles.css', 'android/app/src/main/assets/www/styles.css'],
  ['desktop/renderer/index.html', 'android/app/src/main/assets/www/index.html'],
  ['bot.js', 'mobile-cordova/www/nodejs-project/bot.js'],
  ['bot-filter.js', 'mobile-cordova/www/nodejs-project/bot-filter.js'],
  ['limbo-filter.js', 'mobile-cordova/www/nodejs-project/limbo-filter.js'],
  ['reconnect-policy.js', 'mobile-cordova/www/nodejs-project/reconnect-policy.js'],
  ['speed-guard.js', 'mobile-cordova/www/nodejs-project/speed-guard.js'],
  ['stability-center.js', 'mobile-cordova/www/nodejs-project/stability-center.js'],
  ['monitoring.js', 'mobile-cordova/www/nodejs-project/monitoring.js'],
  ['update-service.js', 'mobile-cordova/www/nodejs-project/update-service.js'],
  ['config.json', 'mobile-cordova/www/nodejs-project/config.json'],
  ['config.json', 'android/app/src/main/assets/default-config.json']
]

function fail(message) {
  throw new Error(message)
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function hashFile(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex')
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

function checkDuplicateFunctionDeclarations() {
  const failures = []

  for (const filePath of SOURCE_FILES) {
    if (!fs.existsSync(filePath)) continue
    const text = readText(filePath)
    const functions = new Map()

    for (const match of text.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = match[1]
      if (!functions.has(name)) {
        functions.set(name, [])
      }
      functions.get(name).push(lineOf(text, match.index))
    }

    for (const [name, lines] of functions.entries()) {
      if (lines.length > 1) {
        failures.push(`${filePath}: duplicate function ${name} at lines ${lines.join(', ')}`)
      }
    }
  }

  if (failures.length) {
    fail(`Duplicate function declarations found:\n${failures.join('\n')}`)
  }
}

function checkDuplicateJsonKeys(filePath) {
  const text = readText(filePath)
  const duplicates = []
  const stack = []
  let index = 0

  function skipWhitespace() {
    while (/\s/.test(text[index] || '')) index += 1
  }

  function parseString() {
    const start = index
    index += 1

    while (index < text.length) {
      const char = text[index]
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === '"') {
        index += 1
        return text.slice(start, index)
      }
      index += 1
    }

    return text.slice(start)
  }

  while (index < text.length) {
    const char = text[index]

    if (char === '"') {
      const rawString = parseString()
      skipWhitespace()

      if (text[index] === ':' && stack.length > 0) {
        const currentObject = stack[stack.length - 1]
        let key
        try {
          key = JSON.parse(rawString)
        } catch (error) {
          key = rawString
        }

        if (currentObject.keys.has(key)) {
          duplicates.push(`${filePath}: duplicate JSON key "${key}" near line ${lineOf(text, index)}`)
        } else {
          currentObject.keys.add(key)
        }
      }
      continue
    }

    if (char === '{') {
      stack.push({ keys: new Set() })
    } else if (char === '}') {
      stack.pop()
    }

    index += 1
  }

  if (duplicates.length) {
    fail(`Duplicate JSON keys found:\n${duplicates.join('\n')}`)
  }
}

async function readBridgeFallbackConfig() {
  const bridgeText = readText('desktop/renderer/bridge.js')
  const emptyNative = () => ''
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    CustomEvent: function CustomEvent(type, init) {
      return { type, ...init }
    },
    document: {
      addEventListener() {}
    },
    window: {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
      setTimeout,
      botStudio: null,
      cordova: null,
      BotStudioAndroid: {
        getBootstrap: emptyNative,
        saveDesktopSettings: emptyNative,
        saveConfig: emptyNative,
        resetConfig: emptyNative,
        importConfig: emptyNative,
        exportConfig: emptyNative,
        startRuntime: emptyNative,
        stopRuntime: emptyNative,
        restartRuntime: emptyNative,
        setPaused: emptyNative,
        openRuntimeDir: emptyNative
      }
    }
  }
  sandbox.window.window = sandbox.window

  vm.runInNewContext(bridgeText, sandbox)
  const payload = await sandbox.window.botStudioBridge.getBootstrap()
  return payload.config
}

async function checkBridgeDefaultConfig() {
  const rootConfig = JSON.parse(readText('config.json'))
  const fallbackConfig = await readBridgeFallbackConfig()

  if (JSON.stringify(rootConfig) !== JSON.stringify(fallbackConfig)) {
    fail('desktop/renderer/bridge.js DEFAULT_CONFIG is out of sync with config.json')
  }
}

function checkSyncedGeneratedAssets() {
  const failures = []

  for (const [sourcePath, targetPath] of SYNCED_FILE_PAIRS) {
    if (!fs.existsSync(targetPath)) continue
    if (hashFile(sourcePath) !== hashFile(targetPath)) {
      failures.push(`${targetPath} is out of sync with ${sourcePath}`)
    }
  }

  if (failures.length) {
    fail(`Generated assets are out of sync. Run npm run android:sync and npm run cordova:sync.\n${failures.join('\n')}`)
  }
}

async function main() {
  checkDuplicateJsonKeys('config.json')
  checkDuplicateFunctionDeclarations()
  await checkBridgeDefaultConfig()
  checkSyncedGeneratedAssets()
  console.log('source hygiene checks passed')
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})

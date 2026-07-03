const fs = require('fs')
const crypto = require('crypto')
const vm = require('vm')

const SOURCE_FILES = [
  'bot.js',
  'bot-filter.js',
  'limbo-filter.js',
  'reconnect-policy.js',
  'stability-center.js',
  'config-migrations.js',
  'update-service.js',
  'tsconfig.checkjs.json',
  'runtime-core/packet-governor.js',
  'runtime-core/packet-break-tracker.js',

  'runtime-core/lifecycle-state.js',
  'runtime-core/event-timeline.js',
  'runtime-core/captcha-evidence.js',
  'runtime-core/client-packets.js',
  'runtime-core/bot-session.js',
  'runtime-core/config-schema.js',
  'runtime-core/minecraft-text.js',
  'runtime-core/position-guard.js',
  'runtime-core/process-guard.js',
  'runtime-core/runtime-formatters.js',
  'runtime-core/runtime-logger.js',
  'runtime-core/runtime-manager.js',
  'runtime-core/runtime-state.js',
  'runtime-core/runtime-ui.js',
  'runtime-core.test.js',
  'monitoring.js',
  'monitoring.test.js',
  'bot-filter.test.js',
  'limbo-filter.test.js',
  'reconnect-policy.test.js',
  'stability-center.test.js',
  'config-migrations.test.js',
  'config-schema.test.js',
  'runtime-formatters.test.js',
  'runtime-logger.test.js',
  'runtime-state.test.js',
  'packet-break-tracker.test.js',
  'minecraft-text.test.js',
  'position-guard.test.js',
  'client-packets.test.js',
  'bot-session.test.js',
  'runtime-manager.test.js',
  'process-guard.test.js',
  'runtime-ui.test.js',
  'update-service.test.js',
  'renderer-modules.test.js',
  'desktop-main.test.js',
  'android-release.test.js',
  'desktop/main.js',
  'desktop/main/app-bootstrap.js',
  'desktop/main/config-store.js',
  'desktop/main/constants.js',
  'desktop/main/desktop-settings.js',
  'desktop/main/dialog-actions.js',
  'desktop/main/ipc-handlers.js',
  'desktop/main/ipc-security.js',
  'desktop/main/json-store.js',
  'desktop/main/paths.js',
  'desktop/main/runtime-controller.js',
  'desktop/main/tray-controller.js',
  'desktop/main/update-controller.js',
  'desktop/main/window-controller.js',
  'desktop/preload.js',
  'desktop/renderer/app-actions.js',
  'desktop/renderer/app-bots-view.js',
  'desktop/renderer/app-chrome-view.js',
  'desktop/renderer/app-coordinate-utils.js',
  'desktop/renderer/app-dashboard-view.js',
  'desktop/renderer/app-listeners.js',
  'desktop/renderer/app-logs-about-view.js',
  'desktop/renderer/app-mobile-view.js',
  'desktop/renderer/app-settings-schema.js',
  'desktop/renderer/app-settings-timing.js',
  'desktop/renderer/app-settings-values.js',
  'desktop/renderer/app-settings-view.js',
  'desktop/renderer/app-state-utils.js',
  'desktop/renderer/app-update-actions.js',
  'desktop/renderer/app-updates-view.js',
  'desktop/renderer/app-validation.js',
  'desktop/renderer/app-view-utils.js',
  'desktop/renderer/app.js',
  'desktop/renderer/bridge.js',
  'scripts/android-release/android-tools.js',
  'scripts/android-release/build-pipeline.js',
  'scripts/android-release/context.js',
  'scripts/android-release/cordova-android-project.js',
  'scripts/android-release/fs-utils.js',
  'scripts/android-release/nodejs-plugin-patcher.js',
  'scripts/android-release/process-runner.js',
  'scripts/android-release/runtime-keepalive-service-source.js',
  'scripts/android-release/signing.js',
  'scripts/android-release/types.d.ts',
  'scripts/android-release/versioning.js',
  'scripts/sync-android-assets.js',
  'scripts/sync-cordova-app.js',
  'scripts/build-cordova-android-release.js',
  'scripts/run-local-bot-test.js',
  'mobile-cordova-src/nodejs-project/mobile-runtime.js'
]

const SYNCED_FILE_PAIRS = [
  ['desktop/renderer/app-actions.js', 'mobile-cordova/www/app-actions.js'],
  ['desktop/renderer/app-bots-view.js', 'mobile-cordova/www/app-bots-view.js'],
  ['desktop/renderer/app-chrome-view.js', 'mobile-cordova/www/app-chrome-view.js'],
  ['desktop/renderer/app-coordinate-utils.js', 'mobile-cordova/www/app-coordinate-utils.js'],
  ['desktop/renderer/app-dashboard-view.js', 'mobile-cordova/www/app-dashboard-view.js'],
  ['desktop/renderer/app-listeners.js', 'mobile-cordova/www/app-listeners.js'],
  ['desktop/renderer/app-logs-about-view.js', 'mobile-cordova/www/app-logs-about-view.js'],
  ['desktop/renderer/app-mobile-view.js', 'mobile-cordova/www/app-mobile-view.js'],
  ['desktop/renderer/app-settings-schema.js', 'mobile-cordova/www/app-settings-schema.js'],
  ['desktop/renderer/app-settings-timing.js', 'mobile-cordova/www/app-settings-timing.js'],
  ['desktop/renderer/app-settings-values.js', 'mobile-cordova/www/app-settings-values.js'],
  ['desktop/renderer/app-settings-view.js', 'mobile-cordova/www/app-settings-view.js'],
  ['desktop/renderer/app-state-utils.js', 'mobile-cordova/www/app-state-utils.js'],
  ['desktop/renderer/app-update-actions.js', 'mobile-cordova/www/app-update-actions.js'],
  ['desktop/renderer/app-updates-view.js', 'mobile-cordova/www/app-updates-view.js'],
  ['desktop/renderer/app-validation.js', 'mobile-cordova/www/app-validation.js'],
  ['desktop/renderer/app-view-utils.js', 'mobile-cordova/www/app-view-utils.js'],
  ['desktop/renderer/app.js', 'mobile-cordova/www/app.js'],
  ['desktop/renderer/bridge.js', 'mobile-cordova/www/bridge.js'],
  ['desktop/renderer/styles.css', 'mobile-cordova/www/styles.css'],
  ['desktop/renderer/index.html', 'mobile-cordova/www/index.html'],
  ['desktop/renderer/app-actions.js', 'android/app/src/main/assets/www/app-actions.js'],
  ['desktop/renderer/app-bots-view.js', 'android/app/src/main/assets/www/app-bots-view.js'],
  ['desktop/renderer/app-chrome-view.js', 'android/app/src/main/assets/www/app-chrome-view.js'],
  [
    'desktop/renderer/app-coordinate-utils.js',
    'android/app/src/main/assets/www/app-coordinate-utils.js'
  ],
  [
    'desktop/renderer/app-dashboard-view.js',
    'android/app/src/main/assets/www/app-dashboard-view.js'
  ],
  ['desktop/renderer/app-listeners.js', 'android/app/src/main/assets/www/app-listeners.js'],
  [
    'desktop/renderer/app-logs-about-view.js',
    'android/app/src/main/assets/www/app-logs-about-view.js'
  ],
  ['desktop/renderer/app-mobile-view.js', 'android/app/src/main/assets/www/app-mobile-view.js'],
  [
    'desktop/renderer/app-settings-schema.js',
    'android/app/src/main/assets/www/app-settings-schema.js'
  ],
  [
    'desktop/renderer/app-settings-timing.js',
    'android/app/src/main/assets/www/app-settings-timing.js'
  ],
  [
    'desktop/renderer/app-settings-values.js',
    'android/app/src/main/assets/www/app-settings-values.js'
  ],
  ['desktop/renderer/app-settings-view.js', 'android/app/src/main/assets/www/app-settings-view.js'],
  ['desktop/renderer/app-state-utils.js', 'android/app/src/main/assets/www/app-state-utils.js'],
  [
    'desktop/renderer/app-update-actions.js',
    'android/app/src/main/assets/www/app-update-actions.js'
  ],
  ['desktop/renderer/app-updates-view.js', 'android/app/src/main/assets/www/app-updates-view.js'],
  ['desktop/renderer/app-validation.js', 'android/app/src/main/assets/www/app-validation.js'],
  ['desktop/renderer/app-view-utils.js', 'android/app/src/main/assets/www/app-view-utils.js'],
  ['desktop/renderer/app.js', 'android/app/src/main/assets/www/app.js'],
  ['desktop/renderer/bridge.js', 'android/app/src/main/assets/www/bridge.js'],
  ['desktop/renderer/styles.css', 'android/app/src/main/assets/www/styles.css'],
  ['desktop/renderer/index.html', 'android/app/src/main/assets/www/index.html'],
  ['bot.js', 'mobile-cordova/www/nodejs-project/bot.js'],
  ['bot-filter.js', 'mobile-cordova/www/nodejs-project/bot-filter.js'],
  ['limbo-filter.js', 'mobile-cordova/www/nodejs-project/limbo-filter.js'],
  ['reconnect-policy.js', 'mobile-cordova/www/nodejs-project/reconnect-policy.js'],
  ['stability-center.js', 'mobile-cordova/www/nodejs-project/stability-center.js'],
  ['monitoring.js', 'mobile-cordova/www/nodejs-project/monitoring.js'],
  ['config-migrations.js', 'mobile-cordova/www/nodejs-project/config-migrations.js'],
  ['update-service.js', 'mobile-cordova/www/nodejs-project/update-service.js'],
  [
    'runtime-core/packet-governor.js',
    'mobile-cordova/www/nodejs-project/runtime-core/packet-governor.js'
  ],
  [
    'runtime-core/packet-break-tracker.js',
    'mobile-cordova/www/nodejs-project/runtime-core/packet-break-tracker.js'
  ],
  [
    'runtime-core/lifecycle-state.js',
    'mobile-cordova/www/nodejs-project/runtime-core/lifecycle-state.js'
  ],
  [
    'runtime-core/event-timeline.js',
    'mobile-cordova/www/nodejs-project/runtime-core/event-timeline.js'
  ],
  [
    'runtime-core/captcha-evidence.js',
    'mobile-cordova/www/nodejs-project/runtime-core/captcha-evidence.js'
  ],
  [
    'runtime-core/client-packets.js',
    'mobile-cordova/www/nodejs-project/runtime-core/client-packets.js'
  ],
  ['runtime-core/bot-session.js', 'mobile-cordova/www/nodejs-project/runtime-core/bot-session.js'],
  [
    'runtime-core/config-schema.js',
    'mobile-cordova/www/nodejs-project/runtime-core/config-schema.js'
  ],
  [
    'runtime-core/minecraft-text.js',
    'mobile-cordova/www/nodejs-project/runtime-core/minecraft-text.js'
  ],
  [
    'runtime-core/position-guard.js',
    'mobile-cordova/www/nodejs-project/runtime-core/position-guard.js'
  ],
  [
    'runtime-core/process-guard.js',
    'mobile-cordova/www/nodejs-project/runtime-core/process-guard.js'
  ],
  [
    'runtime-core/runtime-formatters.js',
    'mobile-cordova/www/nodejs-project/runtime-core/runtime-formatters.js'
  ],
  [
    'runtime-core/runtime-logger.js',
    'mobile-cordova/www/nodejs-project/runtime-core/runtime-logger.js'
  ],
  [
    'runtime-core/runtime-manager.js',
    'mobile-cordova/www/nodejs-project/runtime-core/runtime-manager.js'
  ],
  [
    'runtime-core/runtime-state.js',
    'mobile-cordova/www/nodejs-project/runtime-core/runtime-state.js'
  ],
  ['runtime-core/runtime-ui.js', 'mobile-cordova/www/nodejs-project/runtime-core/runtime-ui.js'],
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
        } catch (_error) {
          key = rawString
        }

        if (currentObject.keys.has(key)) {
          duplicates.push(
            `${filePath}: duplicate JSON key "${key}" near line ${lineOf(text, index)}`
          )
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
    fail(
      `Generated assets are out of sync. Run npm run android:sync and npm run cordova:sync.\n${failures.join('\n')}`
    )
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

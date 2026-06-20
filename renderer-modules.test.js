const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const rendererRoot = path.join(__dirname, 'desktop', 'renderer')
const indexHtml = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8')
const scripts = [...indexHtml.matchAll(/<script src="\.\/([^"]+\.js)"><\/script>/g)].map(
  match => match[1]
)

assert.deepStrictEqual(scripts, [
  'bridge.js',
  'app-settings-timing.js',
  'app-settings-schema.js',
  'app-state-utils.js',
  'app-settings-values.js',
  'app-coordinate-utils.js',
  'app-validation.js',
  'app.js',
  'app-view-utils.js',
  'app-mobile-view.js',
  'app-chrome-view.js',
  'app-dashboard-view.js',
  'app-bots-view.js',
  'app-settings-view.js',
  'app-updates-view.js',
  'app-logs-about-view.js',
  'app-actions.js',
  'app-update-actions.js',
  'app-listeners.js'
])

function createStubElement(id) {
  return {
    id,
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    dataset: {},
    hidden: false,
    innerHTML: '',
    style: {},
    textContent: '',
    appendChild() {},
    addEventListener() {},
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    }
  }
}

const listeners = []
const documentStub = {
  body: createStubElement('body'),
  documentElement: {
    style: {
      setProperty() {}
    }
  },
  hidden: false,
  addEventListener(type, handler) {
    listeners.push({ target: 'document', type, handler })
  },
  createElement(tagName) {
    return createStubElement(tagName)
  },
  getElementById(id) {
    return createStubElement(id)
  },
  querySelector() {
    return null
  },
  querySelectorAll() {
    return []
  }
}

const windowStub = {
  document: documentStub,
  navigator: {
    clipboard: {
      writeText() {
        return Promise.resolve()
      }
    }
  },
  botStudioBridge: {
    getBootstrap() {
      return Promise.resolve({})
    }
  },
  addEventListener(type, handler) {
    listeners.push({ target: 'window', type, handler })
  },
  requestAnimationFrame(handler) {
    return handler()
  },
  setTimeout(handler) {
    return handler()
  },
  matchMedia() {
    return { matches: false }
  },
  open() {},
  confirm() {
    return true
  }
}
windowStub.window = windowStub

const sandbox = {
  console,
  document: documentStub,
  navigator: windowStub.navigator,
  window: windowStub,
  CustomEvent: function CustomEvent(type, init) {
    return { type, ...init }
  },
  Promise,
  setTimeout: windowStub.setTimeout
}

function stable(value) {
  return JSON.parse(JSON.stringify(value))
}

for (const scriptName of scripts.filter(name => name !== 'bridge.js')) {
  vm.runInNewContext(fs.readFileSync(path.join(rendererRoot, scriptName), 'utf8'), sandbox, {
    filename: scriptName
  })
}

assert.strictEqual(typeof windowStub.BotStudioRendererUtils.normalizeConfigShape, 'function')
assert.strictEqual(typeof windowStub.BotStudioCoordinateUtils.parseCoordinatesText, 'function')
assert.strictEqual(typeof windowStub.BotStudioValidation.validateConfig, 'function')
assert.strictEqual(typeof windowStub.BotStudioApp.renderDashboard, 'function')
assert.strictEqual(typeof windowStub.BotStudioApp.renderBotEditor, 'function')
assert.strictEqual(typeof windowStub.BotStudioApp.renderSettingsV2, 'function')
assert.strictEqual(typeof windowStub.BotStudioApp.renderUpdates, 'function')
assert.strictEqual(typeof windowStub.BotStudioApp.attachStaticListeners, 'function')
assert.strictEqual(typeof windowStub.BotStudioApp.refreshUpdates, 'function')

assert.deepStrictEqual(
  stable(windowStub.BotStudioCoordinateUtils.parseCoordinatesText('1 2-3 4')),
  [
    { x: 1, y: 2, z: 4 },
    { x: 1, y: 3, z: 4 }
  ]
)
assert.deepStrictEqual(stable(windowStub.BotStudioRendererUtils.normalizeConfigShape({}).bots), [])

console.log('renderer module tests passed')

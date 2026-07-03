const assert = require('assert')
const { createRuntimeUi } = require('./runtime-core/runtime-ui')

const events = []
const boxes = {
  screen: {
    rendered: 0,
    render() {
      this.rendered += 1
    }
  },
  infoBox: {
    content: '',
    setContent(value) {
      this.content = value
    }
  },
  resourcesBox: {
    content: '',
    setContent(value) {
      this.content = value
    }
  },
  botsTable: {
    table: null,
    setData(value) {
      this.table = value
    }
  }
}

const ui = createRuntimeUi({
  boxes,
  monitorData: {
    startTime: Date.now() - 61000,
    totalBlocks: 5,
    health: { reason: 'mining-ok', severity: 'ok' },
    bots: {
      Bot: {
        status: 'копает',
        blocksTotal: 5,
        blocksPerSecond: 1,
        blocksLastMinute: 60,
        rawBlocksLastMinute: 70
      }
    }
  },
  getRuntimeManager: () => ({ isDiggingPaused: () => true }),
  getHeadlessMode: () => false,
  emitRuntimeEvent: (type, payload) => events.push({ type, payload }),
  getHealthLogLabel: reason => reason,
  periodicRejoinMs: 600000
})

ui.updateInfoBox()
ui.updateBotsTable()
ui.updateScriptResources()

assert(boxes.infoBox.content.includes('ПАУЗА'))
assert.strictEqual(boxes.botsTable.table.data[0][1], '{red-fg}пауза{/}')
assert(events.some(event => event.type === 'resources'))
assert.strictEqual(boxes.screen.rendered, 1)

console.log('runtime-ui tests passed')

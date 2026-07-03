const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  createRuntimeLogger,
  formatChatLogLine,
  writeAppendOnlyLogLine
} = require('./runtime-core/runtime-logger')

function waitForClose(stream) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject)
    stream.once('close', resolve)
  })
}

async function main() {
  const line = formatChatLogLine(
    {
      botName: 'Bot',
      source: 'server-chat',
      position: 'chat',
      sender: 'Server',
      message: '  §aHello\u0000  '
    },
    text =>
      String(text)
        .replace(/\u00a7[0-9A-FK-OR]/gi, '')
        .replace(/\u0000/g, '')
        .trim()
  )

  assert.strictEqual(line, '[CHAT] [Bot                 ] [server-chat/chat/Server] Hello')
  assert.strictEqual(
    formatChatLogLine({ message: '   ' }, text => String(text).trim()),
    ''
  )

  const rotationTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prostocraft-runtime-logger-'))
  const rotationLogPath = path.join(rotationTempDir, 'bot.log')
  fs.writeFileSync(rotationLogPath, 'existing log', 'utf8')
  let stream = {
    end() {},
    write() {}
  }
  const streamRef = {
    get current() {
      return stream
    },
    set current(value) {
      stream = value
    }
  }
  let size = 100
  writeAppendOnlyLogLine(rotationLogPath, streamRef, size, value => (size = value), 'first line', {
    maxLogSize: 50
  })
  stream.end()
  if (typeof stream.once === 'function') {
    await waitForClose(stream)
  }

  assert(fs.existsSync(`${rotationLogPath}.old`))
  fs.rmSync(rotationTempDir, { recursive: true, force: true })

  const runtimeTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prostocraft-runtime-logger-'))
  const logger = createRuntimeLogger({
    logFilePath: path.join(runtimeTempDir, 'bot.log'),
    chatLogFilePath: path.join(runtimeTempDir, 'chat.log'),
    normalizeChatText: text => String(text || '').trim()
  })

  logger.init()
  logger.writeToLogFile('[INFO] [SYSTEM              ] hello')
  logger.writeToChatLogFile({ botName: 'Bot', source: 'server', message: 'chat' })
  const openState = logger.getState()
  assert(openState.logFileStream)
  assert(openState.chatLogFileStream)
  logger.closeAll({ writeExitMessage: false })
  await Promise.all([
    waitForClose(openState.logFileStream),
    waitForClose(openState.chatLogFileStream)
  ])
  assert.strictEqual(logger.getState().logFileStream, null)
  assert.strictEqual(logger.getState().chatLogFileStream, null)
  assert(fs.readFileSync(path.join(runtimeTempDir, 'bot.log'), 'utf8').includes('hello'))
  assert(fs.readFileSync(path.join(runtimeTempDir, 'chat.log'), 'utf8').includes('[CHAT]'))
  fs.rmSync(runtimeTempDir, { recursive: true, force: true })

  console.log('runtime-logger tests passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

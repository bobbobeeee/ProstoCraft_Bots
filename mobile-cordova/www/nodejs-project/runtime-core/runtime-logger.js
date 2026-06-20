const fs = require('fs')
const path = require('path')

const DEFAULT_MAX_LOG_SIZE = 50 * 1024 * 1024

function initAppendOnlyLogFile(filePath, title) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const stream = fs.createWriteStream(filePath, { flags: 'w' })

    const startMsg = `${'='.repeat(80)}\n[${new Date().toISOString()}] === ${title} ===\n${'='.repeat(80)}\n`
    stream.write(startMsg)
    return {
      stream,
      size: Buffer.byteLength(startMsg)
    }
  } catch (error) {
    console.error(`Ошибка инициализации лог-файла ${filePath}:`, error.message)
    return {
      stream: null,
      size: 0
    }
  }
}

function writeAppendOnlyLogLine(
  filePath,
  streamRef,
  currentSize,
  setCurrentSize,
  line,
  options = {}
) {
  if (!streamRef.current) return

  const maxLogSize = Math.max(1, Number(options.maxLogSize) || DEFAULT_MAX_LOG_SIZE)

  try {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${line}\n`
    const byteLength = Buffer.byteLength(logLine)

    if (currentSize + byteLength > maxLogSize) {
      streamRef.current.end()

      const backupPath = filePath + '.old'
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
      if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, backupPath)
      }

      streamRef.current = fs.createWriteStream(filePath, { flags: 'a' })
      currentSize = 0

      const rotationMsg = `[${timestamp}] === РОТАЦИЯ ЛОГА (превышен размер ${maxLogSize} байт) ===\n`
      streamRef.current.write(rotationMsg)
      currentSize += Buffer.byteLength(rotationMsg)
    }

    streamRef.current.write(logLine)
    setCurrentSize(currentSize + byteLength)
  } catch (_error) {}
}

function formatChatLogLine(entry, normalizeChatText) {
  const botName = String(entry.botName || 'SERVER')
  const source = String(entry.source || 'chat')
  const position = entry.position ? `/${entry.position}` : ''
  const sender = entry.sender ? `/${entry.sender}` : ''
  const message =
    typeof normalizeChatText === 'function'
      ? normalizeChatText(entry.message || entry.rawMessage)
      : String(entry.message || entry.rawMessage || '').trim()

  if (!message) return ''
  return `[CHAT] [${botName.padEnd(20)}] [${source}${position}${sender}] ${message}`
}

function createRuntimeLogger(options = {}) {
  const logFilePath = options.logFilePath
  const chatLogFilePath = options.chatLogFilePath
  const maxLogSize = Math.max(1, Number(options.maxLogSize) || DEFAULT_MAX_LOG_SIZE)
  const normalizeChatText = options.normalizeChatText
  const state = {
    logFileStream: null,
    currentLogSize: 0,
    chatLogFileStream: null,
    currentChatLogSize: 0
  }

  function init() {
    const mainLog = initAppendOnlyLogFile(logFilePath, 'НОВАЯ СЕССИЯ')
    state.logFileStream = mainLog.stream
    state.currentLogSize = mainLog.size

    const chatLog = initAppendOnlyLogFile(chatLogFilePath, 'НОВАЯ СЕССИЯ ЧАТА')
    state.chatLogFileStream = chatLog.stream
    state.currentChatLogSize = chatLog.size
  }

  function writeToLogFile(message) {
    writeAppendOnlyLogLine(
      logFilePath,
      {
        get current() {
          return state.logFileStream
        },
        set current(value) {
          state.logFileStream = value
        }
      },
      state.currentLogSize,
      value => {
        state.currentLogSize = value
      },
      message,
      { maxLogSize }
    )
  }

  function writeToChatLogFile(entry) {
    const line = formatChatLogLine(entry, normalizeChatText)
    if (!line) return

    writeAppendOnlyLogLine(
      chatLogFilePath,
      {
        get current() {
          return state.chatLogFileStream
        },
        set current(value) {
          state.chatLogFileStream = value
        }
      },
      state.currentChatLogSize,
      value => {
        state.currentChatLogSize = value
      },
      line,
      { maxLogSize }
    )
  }

  function closeMainLog() {
    if (!state.logFileStream) return
    try {
      state.logFileStream.end()
    } catch (_error) {}
    state.logFileStream = null
  }

  function closeChatLog() {
    if (!state.chatLogFileStream) return
    try {
      state.chatLogFileStream.end()
    } catch (_error) {}
    state.chatLogFileStream = null
  }

  function closeAll(options = {}) {
    if (state.logFileStream) {
      if (options.writeExitMessage !== false) {
        state.logFileStream.write(`[${new Date().toISOString()}] === ЗАВЕРШЕНИЕ СЕССИИ ===\n`)
      }
      closeMainLog()
    }
    if (state.chatLogFileStream) {
      if (options.writeExitMessage !== false) {
        state.chatLogFileStream.write(
          `[${new Date().toISOString()}] === ЗАВЕРШЕНИЕ СЕССИИ ЧАТА ===\n`
        )
      }
      closeChatLog()
    }
  }

  return {
    init,
    writeToLogFile,
    writeToChatLogFile,
    closeMainLog,
    closeChatLog,
    closeAll,
    getState: () => ({ ...state })
  }
}

module.exports = {
  DEFAULT_MAX_LOG_SIZE,
  createRuntimeLogger,
  formatChatLogLine,
  initAppendOnlyLogFile,
  writeAppendOnlyLogLine
}

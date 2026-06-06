const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const mc = require('minecraft-protocol')
const Vec3 = require('vec3')
const {
  LIMBO_FILTER_DEFAULTS,
  getMinimumCheckMs,
  validateFallPacket
} = require('../limbo-filter')

const projectRoot = path.resolve(__dirname, '..')
const userConfigPath = process.env.BOT_TEST_SOURCE_CONFIG ||
  path.join(process.env.APPDATA || '', 'autominerv2', 'runtime', 'config.json')
const testRoot = path.join(projectRoot, '.codex-temp', 'local-bot-test')
const testConfigPath = path.join(testRoot, 'config.json')
const botLogPath = path.join(testRoot, 'bot.log')
const chatLogPath = path.join(testRoot, 'chat.log')
const port = Number(process.env.BOT_TEST_PORT || 25566)
const durationMs = Math.max(8000, Number(process.env.BOT_TEST_DURATION_MS || 22000) || 22000)
const version = process.env.BOT_TEST_VERSION || '1.16.5'
const scenario = process.env.BOT_TEST_SCENARIO || 'only_position'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function stripSecrets(config) {
  const copy = JSON.parse(JSON.stringify(config))
  copy.server = {
    ...(copy.server || {}),
    host: '127.0.0.1',
    port,
    version,
    password: ''
  }
  copy.features = {
    ...(copy.features || {}),
    enableMetrics: false,
    enablePeriodicRotation: false
  }
  copy.logging = {
    ...(copy.logging || {}),
    debugMode: true,
    detailedEvents: true,
    logServerMessages: true,
    diagnosticFullPacketDetails: true
  }
  copy.maintenance = {
    ...(copy.maintenance || {}),
    chatCaptchaReconnectMs: 30 * 60 * 1000
  }
  return copy
}

function firstStandPosition(config) {
  const firstBot = Array.isArray(config.bots) ? config.bots[0] : null
  const stand = firstBot?.standPosition || { x: 0, y: 80, z: 0 }
  return {
    x: Number.isFinite(Number(stand.x)) ? Number(stand.x) : 0,
    y: Number.isFinite(Number(stand.y)) ? Number(stand.y) : 80,
    z: Number.isFinite(Number(stand.z)) ? Number(stand.z) : 0
  }
}

function firstBotConfig(config) {
  return Array.isArray(config.bots) ? config.bots[0] : null
}

function miningTargets(config) {
  return firstBotConfig(config)?.blocksToMine || []
}

function localCoord(value) {
  const floored = Math.floor(Number(value) || 0)
  return ((floored % 16) + 16) % 16
}

function chatPacket(text, position = 0) {
  return {
    message: JSON.stringify({ text }),
    position,
    sender: '00000000-0000-0000-0000-000000000000'
  }
}

function createWorkChunkPacket(config, mcData) {
  const Chunk = require('prismarine-chunk')(version)
  const chunk = new Chunk()
  const botConfig = firstBotConfig(config)
  const stand = firstStandPosition(config)
  const chunkX = Math.floor(stand.x) >> 4
  const chunkZ = Math.floor(stand.z) >> 4
  const stoneId = mcData.blocksByName.stone.id
  const buttonStateId = mcData.blocksByName.stone_button.defaultState

  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 256; y++) {
        chunk.setSkyLight(new Vec3(x, y, z), 15)
      }
      chunk.setBlockType(new Vec3(x, Math.max(0, Math.floor(stand.y) - 1), z), stoneId)
    }
  }

  if (botConfig?.entryButton?.enabled) {
    const button = botConfig.entryButton
    chunk.setBlockStateId(new Vec3(localCoord(button.x), Math.floor(button.y), localCoord(button.z)), buttonStateId)
  }

  return {
    x: chunkX,
    z: chunkZ,
    groundUp: true,
    biomes: chunk.dumpBiomes !== undefined ? chunk.dumpBiomes() : undefined,
    heightmaps: {
      type: 'compound',
      name: '',
      value: {}
    },
    bitMap: chunk.getMask(),
    chunkData: chunk.dump(),
    blockEntities: []
  }
}

function startLocalServer(config) {
  const mcData = require('minecraft-data')(version)
  const stand = firstStandPosition(config)
  const fallingCoords = {
    x: Number(process.env.BOT_TEST_LIMBO_X ?? 0),
    y: Number(process.env.BOT_TEST_LIMBO_Y ?? LIMBO_FILTER_DEFAULTS.fallingCheckTicks * 4),
    z: Number(process.env.BOT_TEST_LIMBO_Z ?? 0),
    teleportId: Number(process.env.BOT_TEST_LIMBO_TELEPORT_ID ?? LIMBO_FILTER_DEFAULTS.fallbackTeleportId)
  }
  const workChunkPacket = createWorkChunkPacket(config, mcData)
  const events = []
  const fallCounters = new Map()
  const minedCounters = new Map()
  const limboStates = new Map()

  function sendGeneratorBlocks(client) {
    for (const target of miningTargets(config)) {
      client.write('block_change', {
        location: {
          x: Math.floor(target.x),
          y: Math.floor(target.y),
          z: Math.floor(target.z)
        },
        type: mcData.blocksByName.stone.defaultState
      })
    }
    events.push(`server-generator-blocks: ${miningTargets(config).length} targets`)
  }
  const server = mc.createServer({
    host: '127.0.0.1',
    port,
    version,
    'online-mode': false,
    motd: 'ProstoCraft local bot test',
    maxPlayers: Math.max(1, config.bots?.length || 1),
    keepAlive: true,
    hideErrors: true,
    errorHandler(client, error) {
      events.push(`server-client-error: ${client?.username || 'unknown'} ${error.message}`)
    }
  })

  server.on('error', error => {
    events.push(`server-error: ${error.message}`)
  })

  server.on('listening', () => {
    events.push(`server-listening: 127.0.0.1:${port}`)
  })

  server.on('login', client => {
    events.push(`client-login: ${client.username}`)
    const limboState = {
      scenario,
      joinAt: Date.now(),
      validX: fallingCoords.x,
      validY: fallingCoords.y,
      validZ: fallingCoords.z,
      teleportId: fallingCoords.teleportId,
      teleportConfirmed: false,
      startedListening: false,
      completed: false,
      failed: false,
      nonValidPacketsSize: 0,
      ignoredTicks: 0,
      tick: 1,
      lastY: fallingCoords.y,
      packetCount: 0
    }
    limboStates.set(client.username, limboState)

    function failLimbo(reason, details = {}) {
      if (limboState.completed || limboState.failed || client.ended) return
      limboState.failed = true
      events.push(`limbo-fail: ${client.username} ${reason} ${JSON.stringify(details)}`)
      if (scenario === 'captcha_on_position_failed') {
        client.write('chat', chatPacket('Сканер | Пожалуйста, введите капчу в чат. Осталось попыток: 3.', 0))
        return
      }
      client.write('kick_disconnect', {
        reason: JSON.stringify({ text: 'AntiBot\n\nFalling Check was failed.\nPlease, rejoin the server.' })
      })
      client.end('limbo-failed')
    }

    function finishLimbo(source) {
      if (limboState.completed || limboState.failed || client.ended) return
      limboState.completed = true
      events.push(`limbo-pass: ${client.username} source=${source} packets=${limboState.packetCount}`)
      client.write('chat', chatPacket('Проверка завершена. Игрок отслеживается', 0))
      client.write('position', {
        x: stand.x,
        y: stand.y,
        z: stand.z,
        yaw: 0,
        pitch: 0,
        flags: 0,
        teleportId: fallingCoords.teleportId + 1
      })
      events.push(`server-chat: tracked to ${client.username}`)
    }

    function handleFallPacket(packet, packetName) {
      if (limboState.completed || limboState.failed) return
      const x = Number(packet.x)
      const y = Number(packet.y)
      const z = Number(packet.z)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
      if (!limboState.teleportConfirmed) {
        failLimbo('missing-teleport-confirm', { packetName, teleportId: limboState.teleportId })
        return
      }

      if (!limboState.startedListening) {
        if (x === limboState.validX && z === limboState.validZ) {
          limboState.startedListening = true
          limboState.lastY = limboState.validY
          events.push(`limbo-started-listening: ${client.username} via=${packetName}`)
        } else {
          limboState.nonValidPacketsSize += 1
          if (limboState.nonValidPacketsSize > LIMBO_FILTER_DEFAULTS.nonValidPositionXzAttempts) {
            failLimbo('too-many-invalid-xz-before-start', { x, z })
          }
          return
        }
      }

      if (packet.onGround !== false) {
        failLimbo('on-ground', { packetName, onGround: packet.onGround })
        return
      }

      if (limboState.lastY - y === 0) {
        limboState.ignoredTicks += 1
        if (limboState.ignoredTicks > LIMBO_FILTER_DEFAULTS.nonValidPositionYAttempts) {
          failLimbo('too-many-zero-y-deltas', { y })
        }
        return
      }

      if (limboState.tick >= LIMBO_FILTER_DEFAULTS.fallingCheckTicks) {
        const elapsed = Date.now() - limboState.joinAt
        const minMs = getMinimumCheckMs(LIMBO_FILTER_DEFAULTS)
        if (elapsed < minMs) {
          failLimbo('finished-too-fast', { elapsed, minMs, tick: limboState.tick })
          return
        }
        finishLimbo(packetName)
        return
      }

      const validation = validateFallPacket(packet, {
        validX: limboState.validX,
        validZ: limboState.validZ,
        lastY: limboState.lastY,
        tick: limboState.tick
      }, LIMBO_FILTER_DEFAULTS)

      if (!validation.ok) {
        failLimbo(validation.reason, validation)
        return
      }

      limboState.lastY = y
      limboState.packetCount += 1
      limboState.tick += 1
    }

    const loginPacket = {
      ...mcData.loginPacket,
      entityId: Math.floor(Math.random() * 100000) + 1,
      gameMode: 1,
      previousGameMode: 255,
      maxPlayers: Math.max(1, config.bots?.length || 1),
      viewDistance: 2
    }
    client.write('login', loginPacket)
    client.write('spawn_position', {
      location: {
        x: Math.floor(stand.x),
        y: Math.floor(stand.y),
        z: Math.floor(stand.z)
      }
    })
    client.write('map_chunk', workChunkPacket)
    client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
    client.write('held_item_slot', { slot: 0 })

    setTimeout(() => {
      if (!client.ended) {
        client.write('position', {
          x: fallingCoords.x,
          y: fallingCoords.y,
          z: fallingCoords.z,
          yaw: 0,
          pitch: 0,
          flags: 0,
          teleportId: fallingCoords.teleportId
        })
        events.push(`server-position: limbo ${fallingCoords.x},${fallingCoords.y},${fallingCoords.z} to ${client.username}`)
      }
    }, 250)

    setTimeout(() => {
      if (client.ended) return
      if (scenario === 'immediate_chat_captcha') {
        client.write('chat', chatPacket('Сканер | Пожалуйста, введите капчу в чат. Осталось попыток: 3.', 0))
        events.push(`server-chat: immediate-captcha to ${client.username}`)
        return
      }
      client.write('chat', chatPacket('Сканер | Пожалуйста, дождитесь окончания проверки и не двигайтесь', 0))
      events.push(`server-chat: fall-wait to ${client.username}`)
    }, 500)

    setTimeout(() => {
      if (!client.ended && !limboState.completed && !limboState.failed && scenario === 'timeout') {
        client.write('kick_disconnect', {
          reason: JSON.stringify({ text: 'AntiBot\n\nYou have exceeded the maximum Bot-Filter check time.\nPlease, rejoin the server.' })
        })
        client.end('limbo-timeout')
        events.push(`limbo-timeout: ${client.username}`)
      }
    }, LIMBO_FILTER_DEFAULTS.timeoutMs)

    client.on('teleport_confirm', packet => {
      events.push(`client-teleport-confirm: ${client.username} #${packet.teleportId}`)
      if (packet.teleportId === fallingCoords.teleportId) {
        limboState.teleportConfirmed = true
      }
    })
    client.on('position', packet => {
      if (packet.y < 511.8) {
        const count = (fallCounters.get(client.username) || 0) + 1
        fallCounters.set(client.username, count)
        if (count <= 3 || count % 20 === 0) {
          events.push(`client-fall-position: ${client.username} y=${Number(packet.y).toFixed(2)} #${count}`)
        }
      }
      handleFallPacket(packet, 'position')
    })
    client.on('position_look', packet => {
      if (packet.y < 511.8) {
        const count = (fallCounters.get(client.username) || 0) + 1
        fallCounters.set(client.username, count)
        if (count <= 3 || count % 20 === 0) {
          events.push(`client-fall-position-look: ${client.username} y=${Number(packet.y).toFixed(2)} #${count}`)
        }
      }
      handleFallPacket(packet, 'position_look')
    })
    client.on('chat', packet => {
      events.push(`client-chat: ${client.username} ${packet.message}`)
    })
    client.on('block_place', packet => {
      events.push(`client-block-place: ${client.username} ${JSON.stringify(packet.location)}`)
      setTimeout(() => {
        if (!client.ended) sendGeneratorBlocks(client)
      }, 40)
    })
    client.on('block_dig', packet => {
      const location = packet.location || {}
      const key = `${location.x},${location.y},${location.z}`
      const count = (minedCounters.get(key) || 0) + 1
      minedCounters.set(key, count)
      if (count <= 3 || count % 20 === 0) {
        events.push(`client-block-dig: ${client.username} ${key} #${count}`)
      }
      client.write('block_change', {
        location,
        type: 0
      })
      setTimeout(() => {
        if (!client.ended) {
          client.write('block_change', {
            location,
            type: mcData.blocksByName.stone.defaultState
          })
        }
      }, 60)
    })
    client.on('end', reason => {
      events.push(`client-end: ${client.username} ${reason || ''}`)
      limboStates.delete(client.username)
    })
    client.on('error', error => {
      events.push(`client-error: ${client.username} ${error.message}`)
    })
  })

  return { server, events }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function tail(filePath, lines = 80) {
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-lines).join('\n')
}

function importantBotLogTail(filePath, lines = 80) {
  if (!fs.existsSync(filePath)) return ''
  const importantPattern = /\] \[(INFO|SUCC|WARN|ERR )\].*(Сервер:|Запуск|Подключен|BotFilter evidence|тип проверки|LimboFilter|Зашёл на подсервер|Кнопка генератора|Запускаю новый движок|Speed-guard|Нет доступных|Добыто|RATE\/MIN|ERR|WARN|Не удалось|Позиция подтверждена)/
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(line => importantPattern.test(line))
    .slice(-lines)
    .join('\n')
}

async function main() {
  fs.rmSync(testRoot, { recursive: true, force: true })
  fs.mkdirSync(testRoot, { recursive: true })

  const sourceConfig = readJson(userConfigPath)
  if (!Array.isArray(sourceConfig.bots) || sourceConfig.bots.length === 0) {
    throw new Error(`В конфиге нет ботов: ${userConfigPath}`)
  }
  const testConfig = stripSecrets(sourceConfig)
  writeJson(testConfigPath, testConfig)

  const { server, events } = startLocalServer(testConfig)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const botProcess = spawn(process.execPath, ['bot.js', '--headless'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      BOT_CONFIG_PATH: testConfigPath,
      BOT_LOG_PATH: botLogPath,
      BOT_CHAT_LOG_PATH: chatLogPath,
      BOT_TEST_LOCAL_SERVER: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  let stderr = ''
  botProcess.stdout.on('data', chunk => { stdout += chunk.toString() })
  botProcess.stderr.on('data', chunk => { stderr += chunk.toString() })

  await sleep(durationMs)

  if (!botProcess.killed) {
    botProcess.kill('SIGTERM')
  }
  await Promise.race([
    new Promise(resolve => botProcess.once('exit', resolve)),
    sleep(3000)
  ])
  if (!botProcess.killed) {
    try { botProcess.kill('SIGKILL') } catch (error) {}
  }

  await new Promise(resolve => {
    server.once('close', resolve)
    server.close()
  })

  const botLog = importantBotLogTail(botLogPath, 120)
  const chatLog = tail(chatLogPath, 120)
  const combined = `${botLog}\n${chatLog}\n${stdout}\n${stderr}`
  const chatCaptchaDetected = /чат-капча|chat-captcha|введите капчу в чат/i.test(combined)
  const limboPassed = events.some(event => event.startsWith('limbo-pass:'))
  const limboFailed = events.some(event => event.startsWith('limbo-fail:') || event.startsWith('limbo-timeout:'))

  console.log('=== LOCAL BOT TEST ===')
  console.log(`sourceConfig=${userConfigPath}`)
  console.log(`testConfig=${testConfigPath}`)
  console.log(`server=127.0.0.1:${port}`)
  console.log(`durationMs=${durationMs}`)
  console.log(`scenario=${scenario}`)
  console.log(`bots=${testConfig.bots.map(bot => bot.username).join(', ')}`)
  console.log(`chatCaptchaDetected=${chatCaptchaDetected}`)
  console.log(`limboPassed=${limboPassed}`)
  console.log(`limboFailed=${limboFailed}`)
  console.log('')
  console.log('=== SERVER EVENTS ===')
  console.log(events.join('\n') || '(empty)')
  console.log('')
  console.log('=== BOT LOG TAIL ===')
  console.log(botLog || '(empty)')
  console.log('')
  console.log('=== CHAT LOG TAIL ===')
  console.log(chatLog || '(empty)')

  if (chatCaptchaDetected) {
    process.exitCode = 2
  } else if (scenario === 'only_position' && !limboPassed) {
    process.exitCode = 3
  } else if (scenario === 'only_position' && limboFailed) {
    process.exitCode = 4
  }
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exit(1)
})

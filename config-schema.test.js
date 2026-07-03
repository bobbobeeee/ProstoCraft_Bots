const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  CONFIG_SCHEMA_VERSION,
  createRuntimeSettings,
  loadRuntimeConfig,
  mergeConfigDefaults,
  normalizeRuntimeConfig
} = require('./runtime-core/config-schema')

const defaults = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))

{
  assert.strictEqual(CONFIG_SCHEMA_VERSION, 1)
  assert.deepStrictEqual(mergeConfigDefaults({ a: 1, b: { c: 2 }, d: [1] }, { b: {} }), {
    a: 1,
    b: { c: 2 },
    d: [1]
  })
  assert.deepStrictEqual(mergeConfigDefaults({ d: [1] }, { d: [2, 3] }), { d: [2, 3] })
}

{
  const normalized = normalizeRuntimeConfig({}, defaults)
  assert.deepStrictEqual(normalized, defaults)
  const settings = createRuntimeSettings(normalized, { configDir: __dirname })

  assert.strictEqual(settings.SERVER_HOST, 'mc.prostocraft.com')
  assert.strictEqual(settings.SERVER_PORT, 25565)
  assert.strictEqual(settings.BURST_BREAK_INTERVAL_MS, 1)
  assert.strictEqual(settings.BREAK_PACKET_MAX_PER_SECOND, 350)
  assert.strictEqual(settings.LIMBO_FALL_TICKS, 128)
  assert.strictEqual(settings.LIMBO_FALL_PACKET_MS, 50)
  assert.strictEqual(settings.PAUSE_FILE_PATH, path.resolve(__dirname, 'pause.txt'))
  assert.deepStrictEqual(settings.botsConfigs, [])
}

{
  const legacy = normalizeRuntimeConfig(
    {
      timing: {
        burstBreakIntervalMs: 20,
        burstBreakRepeats: 3,
        breakPacketTargetCooldownMs: 25,
        breakPacketMinTargetCooldownMs: 75,
        breakPacketMaxPerSecond: 72,
        breakPacketBurstLimit: 18,
        breakPacketSafeMaxPerSecond: 42,
        breakPacketSafeBurstLimit: 10,
        reactiveBreakRepeats: 2,
        transientBreakRepeats: 2,
        startStagger: 30000,
        startStaggerJitter: 15000
      },
      antibot: {
        limboFallTicks: 96,
        limboFallPacketMs: 25
      }
    },
    defaults
  )
  const settings = createRuntimeSettings(legacy)

  assert.strictEqual(settings.BURST_BREAK_INTERVAL_MS, 1)
  assert.strictEqual(settings.BURST_BREAK_REPEATS, 2)
  assert.strictEqual(settings.BREAK_PACKET_TARGET_COOLDOWN_MS, 12)
  assert.strictEqual(settings.BREAK_PACKET_MIN_TARGET_COOLDOWN_MS, 6)
  assert.strictEqual(settings.BREAK_PACKET_MAX_PER_SECOND, 350)
  assert.strictEqual(settings.BREAK_PACKET_BURST_LIMIT, 96)
  assert.strictEqual(settings.REACTIVE_BREAK_REPEATS, 1)
  assert.strictEqual(settings.TRANSIENT_BREAK_REPEATS, 1)
  assert.strictEqual(settings.START_STAGGER, 1000)
  assert.strictEqual(settings.START_STAGGER_JITTER, 500)
  assert.strictEqual(settings.LIMBO_FALL_TICKS, 128)
  assert.strictEqual(settings.LIMBO_FALL_PACKET_MS, 50)
}

{
  const normalized = normalizeRuntimeConfig(
    {
      timing: {
        miningLoopIdleMs: '0'
      },
      position: {
        checkInterval: 1000
      },
      pause: {
        checkInterval: 500
      },
      logging: {
        debugMode: true,
        logServerMessages: false
      },
      bots: [{ username: 'test' }]
    },
    defaults
  )
  const desktop = createRuntimeSettings(normalized, {
    configDir: 'C:\\runtime',
    mobileRuntimeProfile: false
  })
  const mobile = createRuntimeSettings(normalized, {
    configDir: 'C:\\runtime',
    mobileRuntimeProfile: true
  })

  assert.strictEqual(desktop.MINING_LOOP_IDLE_MS, 0)
  assert.strictEqual(desktop.LOG_SERVER_MESSAGES, true)
  assert.deepStrictEqual(desktop.botsConfigs, [{ username: 'test' }])
  assert.strictEqual(desktop.POSITION_CHECK_INTERVAL, 1000)
  assert.strictEqual(mobile.POSITION_CHECK_INTERVAL, 15000)
  assert.strictEqual(mobile.SNAPSHOT_INTERVAL, 4000)
  assert.strictEqual(mobile.RESOURCE_INTERVAL, 5000)
  assert.strictEqual(mobile.PAUSE_CHECK_INTERVAL, 4000)
}

{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prostocraft-config-schema-'))
  const configPath = path.join(tempDir, 'config.json')
  const defaultsPath = path.join(tempDir, 'defaults.json')
  fs.writeFileSync(configPath, JSON.stringify({ server: { port: '25566' } }), 'utf8')
  fs.writeFileSync(defaultsPath, JSON.stringify(defaults), 'utf8')

  const loaded = loadRuntimeConfig(configPath, defaultsPath)
  assert.strictEqual(loaded.server.host, defaults.server.host)
  assert.strictEqual(loaded.server.port, '25566')
  assert.strictEqual(createRuntimeSettings(loaded).SERVER_PORT, 25566)

  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('config-schema tests passed')

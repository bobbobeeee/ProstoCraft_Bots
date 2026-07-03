const assert = require('assert')
const {
  cleanLogMessage,
  getServerMessageSource,
  isVisibleServerMessagePosition,
  normalizeChatText,
  normalizeDiagnosticValue,
  normalizeServerMessagePosition,
  stringifyDiagnostic,
  summarizeDiagnosticDetails,
  summarizeDiagnosticPacket,
  summarizeServerMessageJson
} = require('./runtime-core/runtime-formatters')

{
  assert.strictEqual(cleanLogMessage('+ OK ⚠ hello ▶'), 'hello')
  assert.strictEqual(normalizeServerMessagePosition(0), 'chat')
  assert.strictEqual(normalizeServerMessagePosition(1), 'system')
  assert.strictEqual(normalizeServerMessagePosition(2), 'game_info')
  assert.strictEqual(normalizeServerMessagePosition('action-bar'), 'game_info')
  assert.strictEqual(normalizeServerMessagePosition('custom source'), 'custom_source')
  assert.strictEqual(getServerMessageSource('game_info'), 'server-game-info')
  assert.strictEqual(isVisibleServerMessagePosition('chat'), true)
  assert.strictEqual(isVisibleServerMessagePosition('game_info'), false)
}

{
  assert.strictEqual(normalizeChatText(' §aHello\u0000\r\n'), 'Hello')
  assert.strictEqual(normalizeChatText('\u001b[31mRed\u001b[0m'), 'Red')
}

{
  const circular = { x: 1.23456, y: 2.34567, z: 3.45678 }
  circular.self = circular
  assert.deepStrictEqual(normalizeDiagnosticValue(circular), {
    x: 1.235,
    y: 2.346,
    z: 3.457
  })

  const error = new Error('boom')
  error.code = 'ECONNRESET'
  assert.strictEqual(normalizeDiagnosticValue(error).code, 'ECONNRESET')
}

{
  assert.deepStrictEqual(
    summarizeDiagnosticPacket('client-packet:position', {
      x: 1.23456,
      y: 70,
      z: -2.34567,
      yaw: 10,
      pitch: 20,
      flags: 0,
      teleportId: 7,
      onGround: true,
      ignored: true
    }),
    {
      x: 1.235,
      y: 70,
      z: -2.346,
      yaw: 10,
      pitch: 20,
      flags: 0,
      teleportId: 7,
      onGround: true
    }
  )
  assert.deepStrictEqual(summarizeServerMessageJson({ text: 'a'.repeat(250), extra: [1, 2] }), {
    text: `${'a'.repeat(240)}...`,
    color: undefined,
    extraCount: 2
  })
  assert.strictEqual(
    summarizeDiagnosticDetails(
      'server-message',
      { text: 'b'.repeat(510), json: { text: 'ok' }, error: new Error('bad') },
      {}
    ).text,
    `${'b'.repeat(500)}...`
  )
  assert.strictEqual(
    stringifyDiagnostic({ value: 'abcdef' }, { maxValueLength: 10 }),
    '{"value":"...'
  )
}

console.log('runtime-formatters tests passed')

const assert = require('assert')
const {
  createClientIdentityPackets,
  createTeleportConfirmPayload,
  encodeMinecraftString,
  encodeVarInt,
  summarizeClientPacketPayload
} = require('./runtime-core/client-packets')

{
  assert.strictEqual(encodeVarInt(0).toString('hex'), '00')
  assert.strictEqual(encodeVarInt(127).toString('hex'), '7f')
  assert.strictEqual(encodeVarInt(128).toString('hex'), '8001')
  assert.strictEqual(encodeMinecraftString('vanilla').toString('hex'), '0776616e696c6c61')
}

{
  const packets = createClientIdentityPackets()
  assert.strictEqual(packets[0].packetName, 'settings')
  assert.strictEqual(packets[0].payload.locale, 'ru_ru')
  assert.strictEqual(packets[1].packetName, 'custom_payload')
  assert.strictEqual(packets[1].payload.data.toString('hex'), '0776616e696c6c61')
}

{
  assert.deepStrictEqual(createTeleportConfirmPayload('12'), { teleportId: 12 })
  assert.strictEqual(createTeleportConfirmPayload('bad'), null)
  assert.deepStrictEqual(summarizeClientPacketPayload({ data: Buffer.from('abcdef') }), {
    data: {
      length: 6,
      hex: '616263646566'
    }
  })
}

console.log('client-packets tests passed')

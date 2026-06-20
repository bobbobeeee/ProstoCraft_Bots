const assert = require('assert')
const {
  classifyServerMenuWindow,
  flattenMinecraftText,
  getItemDisplayText,
  getMessageJson,
  getMinecraftMessageText,
  getWindowTitleText
} = require('./runtime-core/minecraft-text')
const { normalizeChatText } = require('./runtime-core/runtime-formatters')

{
  assert.strictEqual(flattenMinecraftText({ text: 'A', extra: [{ text: 'B' }] }), 'A B')
  assert.strictEqual(flattenMinecraftText('[{"text":"A"},{"text":"B"}]', { arrayJoiner: '' }), 'AB')
  assert.strictEqual(flattenMinecraftText({ fallback: 'fallback' }), 'fallback')
}

{
  const message = {
    toString: () => '[object Object]',
    json: { text: '§aHello', extra: [{ text: ' world' }] },
    unsigned: { json: { text: 'Unsigned' } }
  }
  assert.deepStrictEqual(getMessageJson(message), message.json)
  assert.strictEqual(getMinecraftMessageText(message, normalizeChatText), 'Hello world')
}

{
  const item = {
    nbt: {
      value: {
        display: {
          value: {
            Name: { value: '{"text":"SkyBlock"}' },
            Lore: { value: { value: [{ text: 'sb02' }] } }
          }
        }
      }
    }
  }
  assert.strictEqual(getItemDisplayText(item), 'SkyBlock sb02')
}

{
  const gameWindow = {
    title: { text: 'Выбор игры' },
    slots: []
  }
  assert.strictEqual(getWindowTitleText(gameWindow), 'Выбор игры')
  assert.strictEqual(
    classifyServerMenuWindow(gameWindow, { menuSlot1: 1, menuSlot2: 2 }).kind,
    'game'
  )

  const skyblockWindow = {
    title: 'Menu',
    slots: {
      2: {
        nbt: {
          value: {
            display: {
              value: {
                Name: { value: 'Второй скайблок' }
              }
            }
          }
        }
      },
      length: 3
    }
  }
  skyblockWindow.slots = Array.from(skyblockWindow.slots)
  assert.strictEqual(
    classifyServerMenuWindow(skyblockWindow, { menuSlot1: 1, menuSlot2: 2 }).kind,
    'skyblock'
  )
}

console.log('minecraft-text tests passed')

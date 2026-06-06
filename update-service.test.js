const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  buildUpdateInfoFromRelease,
  compareVersions,
  findChecksumForAsset,
  isNewerVersion,
  parseSha256Sums,
  selectUpdateAsset,
  verifyFileSha256
} = require('./update-service')

const release = {
  tag_name: 'v2.0.1',
  name: 'ProstoCraft Bot Studio 2.0.1',
  html_url: 'https://github.com/bobbobeeee/ProstoCraft_Bots/releases/tag/v2.0.1',
  published_at: '2026-06-06T12:00:00Z',
  body: 'Test release',
  assets: [
    {
      name: 'ProstoCraft.Bot.Studio-Setup-2.0.1.exe',
      size: 100,
      browser_download_url: 'https://example.test/setup.exe'
    },
    {
      name: 'ProstoCraft.Bot.Studio-Mobile-2.0.1.apk',
      size: 200,
      browser_download_url: 'https://example.test/mobile.apk'
    },
    {
      name: 'SHA256SUMS.txt',
      size: 180,
      browser_download_url: 'https://example.test/SHA256SUMS.txt'
    }
  ]
}

const checksumText = [
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  ProstoCraft.Bot.Studio-Setup-2.0.1.exe',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  ProstoCraft.Bot.Studio-Mobile-2.0.1.apk'
].join('\n')

{
  assert.strictEqual(compareVersions('v2.0.1', '2.0.0'), 1)
  assert.strictEqual(compareVersions('2.0.0', 'v2.0.0'), 0)
  assert.strictEqual(compareVersions('2.0.0-beta.1', '2.0.0'), -1)
  assert.strictEqual(isNewerVersion('v2.0.1', '2.0.0'), true)
  assert.strictEqual(isNewerVersion('v2.0.0', '2.0.0'), false)
}

{
  assert.strictEqual(selectUpdateAsset(release, 'desktop').name, 'ProstoCraft.Bot.Studio-Setup-2.0.1.exe')
  assert.strictEqual(selectUpdateAsset(release, 'android').name, 'ProstoCraft.Bot.Studio-Mobile-2.0.1.apk')
}

{
  const hashes = parseSha256Sums(checksumText)
  assert.strictEqual(hashes.get('prostocraft.bot.studio-setup-2.0.1.exe'), 'a'.repeat(64))
  assert.strictEqual(findChecksumForAsset(checksumText, 'ProstoCraft.Bot.Studio-Mobile-2.0.1.apk'), 'b'.repeat(64))
}

{
  const currentInfo = buildUpdateInfoFromRelease(release, {
    platform: 'desktop',
    currentVersion: '2.0.1',
    checksumText
  })
  assert.strictEqual(currentInfo.status, 'current')
  assert.strictEqual(currentInfo.updateAvailable, false)
  assert.strictEqual(currentInfo.checksum.hash, 'a'.repeat(64))
}

{
  const availableInfo = buildUpdateInfoFromRelease(release, {
    platform: 'android',
    currentVersion: '2.0.0',
    checksumText
  })
  assert.strictEqual(availableInfo.status, 'available')
  assert.strictEqual(availableInfo.updateAvailable, true)
  assert.strictEqual(availableInfo.asset.name, 'ProstoCraft.Bot.Studio-Mobile-2.0.1.apk')
  assert.strictEqual(availableInfo.checksum.hash, 'b'.repeat(64))
}

;(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prostocraft-update-test-'))
  const tempFile = path.join(tempDir, 'asset.bin')
  fs.writeFileSync(tempFile, 'broken update', 'utf8')

  await assert.rejects(
    () => verifyFileSha256(tempFile, 'c'.repeat(64)),
    /SHA256 mismatch/
  )

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('update-service tests passed')
})().catch(error => {
  console.error(error)
  process.exit(1)
})

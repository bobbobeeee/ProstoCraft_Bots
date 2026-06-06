const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

const DEFAULT_UPDATE_SOURCES = [
  {
    owner: 'bobbobeeee',
    repo: 'ProstoCraft_Bots',
    apiUrl: 'https://api.github.com/repos/bobbobeeee/ProstoCraft_Bots/releases/latest',
    releaseUrl: 'https://github.com/bobbobeeee/ProstoCraft_Bots/releases/latest'
  },
  {
    owner: 'merrobocop',
    repo: 'ProstoCraft_Bots',
    apiUrl: 'https://api.github.com/repos/merrobocop/ProstoCraft_Bots/releases/latest',
    releaseUrl: 'https://github.com/merrobocop/ProstoCraft_Bots/releases/latest'
  }
]

const USER_AGENT = 'ProstoCraft-Bot-Studio-Updater'
const DEFAULT_TIMEOUT_MS = 30000

function normalizeVersion(version) {
  return String(version || '0.0.0')
    .trim()
    .replace(/^v/i, '')
    .replace(/[^\dA-Za-z.+-].*$/, '')
}

function splitVersion(version) {
  const [core, prerelease = ''] = normalizeVersion(version).split('-', 2)
  const parts = core.split('.').map(part => {
    const parsed = Number.parseInt(part, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })

  while (parts.length < 3) parts.push(0)
  return { parts: parts.slice(0, 3), prerelease }
}

function compareVersions(leftVersion, rightVersion) {
  const left = splitVersion(leftVersion)
  const right = splitVersion(rightVersion)

  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] > right.parts[index]) return 1
    if (left.parts[index] < right.parts[index]) return -1
  }

  if (left.prerelease && !right.prerelease) return -1
  if (!left.prerelease && right.prerelease) return 1
  return left.prerelease.localeCompare(right.prerelease)
}

function isNewerVersion(latestVersion, currentVersion) {
  return compareVersions(latestVersion, currentVersion) > 0
}

function getPlatformAssetPattern(platform) {
  if (platform === 'android') {
    return /^ProstoCraft\.Bot\.Studio-Mobile-.+\.apk$/i
  }

  return /^ProstoCraft\.Bot\.Studio-Setup-.+\.exe$/i
}

function getAssets(release) {
  return Array.isArray(release?.assets) ? release.assets : []
}

function selectUpdateAsset(release, platform) {
  const pattern = getPlatformAssetPattern(platform)
  const match = getAssets(release).find(asset => pattern.test(String(asset?.name || '')))
  if (!match) return null

  return {
    name: match.name,
    size: Number(match.size) || 0,
    downloadUrl: match.browser_download_url || match.url || '',
    contentType: match.content_type || ''
  }
}

function selectChecksumAsset(release) {
  const match = getAssets(release).find(asset => /^SHA256SUMS\.txt$/i.test(String(asset?.name || '')))
  if (!match) return null

  return {
    name: match.name,
    size: Number(match.size) || 0,
    downloadUrl: match.browser_download_url || match.url || ''
  }
}

function parseSha256Sums(text) {
  const hashes = new Map()

  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (!match) continue
    hashes.set(path.basename(match[2].trim()).toLowerCase(), match[1].toLowerCase())
  }

  return hashes
}

function findChecksumForAsset(checksumText, assetName) {
  const hashes = parseSha256Sums(checksumText)
  return hashes.get(path.basename(assetName || '').toLowerCase()) || null
}

function getReleaseVersion(release) {
  return normalizeVersion(release?.tag_name || release?.name || '0.0.0')
}

function buildUpdateInfoFromRelease(release, options = {}) {
  const platform = options.platform || 'desktop'
  const currentVersion = normalizeVersion(options.currentVersion)
  const latestVersion = getReleaseVersion(release)
  const asset = selectUpdateAsset(release, platform)
  const checksumAsset = selectChecksumAsset(release)
  const checksumHash = asset && options.checksumText
    ? findChecksumForAsset(options.checksumText, asset.name)
    : null
  const updateAvailable = isNewerVersion(latestVersion, currentVersion)

  return {
    status: asset ? (updateAvailable ? 'available' : 'current') : 'unavailable',
    updateAvailable,
    currentVersion,
    latestVersion,
    tagName: release?.tag_name || '',
    releaseName: release?.name || release?.tag_name || '',
    releaseUrl: release?.html_url || options.source?.releaseUrl || '',
    publishedAt: release?.published_at || release?.created_at || '',
    body: release?.body || '',
    source: options.source || null,
    asset,
    checksum: checksumHash
      ? {
          algorithm: 'sha256',
          hash: checksumHash,
          assetName: checksumAsset?.name || 'SHA256SUMS.txt'
        }
      : null,
    checksumAsset
  }
}

function requestBuffer(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS
  const maxRedirects = Number(options.maxRedirects ?? 5)
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    ...(options.headers || {})
  }

  return new Promise((resolve, reject) => {
    const client = String(url).startsWith('http://') ? http : https
    const request = client.get(url, { headers }, response => {
      const statusCode = Number(response.statusCode) || 0
      const redirectUrl = response.headers.location

      if ([301, 302, 303, 307, 308].includes(statusCode) && redirectUrl) {
        response.resume()
        if (maxRedirects <= 0) {
          reject(new Error(`Too many redirects while requesting ${url}`))
          return
        }

        const nextUrl = new URL(redirectUrl, url).toString()
        requestBuffer(nextUrl, { ...options, maxRedirects: maxRedirects - 1 })
          .then(resolve, reject)
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`HTTP ${statusCode} while requesting ${url}`))
        return
      }

      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${url}`))
    })
    request.on('error', reject)
  })
}

async function fetchJson(url, options = {}) {
  const buffer = await requestBuffer(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      ...(options.headers || {})
    }
  })
  return JSON.parse(buffer.toString('utf8'))
}

async function fetchText(url, options = {}) {
  const buffer = await requestBuffer(url, options)
  return buffer.toString('utf8')
}

async function checkForUpdates(options = {}) {
  const sources = Array.isArray(options.sources) && options.sources.length
    ? options.sources
    : DEFAULT_UPDATE_SOURCES
  const errors = []

  for (const source of sources) {
    try {
      const release = await fetchJson(source.apiUrl, options)
      const checksumAsset = selectChecksumAsset(release)
      const checksumText = checksumAsset?.downloadUrl
        ? await fetchText(checksumAsset.downloadUrl, options)
        : ''

      return buildUpdateInfoFromRelease(release, {
        platform: options.platform || 'desktop',
        currentVersion: options.currentVersion,
        checksumText,
        source
      })
    } catch (error) {
      errors.push(`${source.owner || source.apiUrl}: ${error.message || String(error)}`)
    }
  }

  return {
    status: 'error',
    updateAvailable: false,
    currentVersion: normalizeVersion(options.currentVersion),
    latestVersion: '',
    error: errors.join('; ') || 'Unable to check for updates.'
  }
}

function sanitizeFileName(fileName) {
  return path.basename(String(fileName || 'update.bin')).replace(/[^\w.\-()+ ]/g, '_')
}

function hashFile(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()))
  })
}

async function verifyFileSha256(filePath, expectedHash) {
  const expected = String(expectedHash || '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('SHA256 checksum is missing for this update asset.')
  }

  const actual = await hashFile(filePath, 'sha256')
  if (actual !== expected) {
    throw new Error(`SHA256 mismatch: expected ${expected}, got ${actual}`)
  }

  return actual
}

function downloadToFile(url, filePath, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS
  const maxRedirects = Number(options.maxRedirects ?? 5)
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    ...(options.headers || {})
  }

  return new Promise((resolve, reject) => {
    const client = String(url).startsWith('http://') ? http : https
    const request = client.get(url, { headers }, response => {
      const statusCode = Number(response.statusCode) || 0
      const redirectUrl = response.headers.location

      if ([301, 302, 303, 307, 308].includes(statusCode) && redirectUrl) {
        response.resume()
        if (maxRedirects <= 0) {
          reject(new Error(`Too many redirects while downloading ${url}`))
          return
        }

        const nextUrl = new URL(redirectUrl, url).toString()
        downloadToFile(nextUrl, filePath, { ...options, maxRedirects: maxRedirects - 1 })
          .then(resolve, reject)
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`HTTP ${statusCode} while downloading ${url}`))
        return
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      const totalBytes = Number(response.headers['content-length']) || Number(options.totalBytes) || 0
      let receivedBytes = 0
      const output = fs.createWriteStream(filePath)

      response.on('data', chunk => {
        receivedBytes += chunk.length
        if (typeof options.onProgress === 'function') {
          options.onProgress({ receivedBytes, totalBytes })
        }
      })

      response.pipe(output)
      output.on('finish', () => output.close(() => resolve({ receivedBytes, totalBytes })))
      output.on('error', reject)
    })

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Download timeout after ${timeoutMs}ms: ${url}`))
    })
    request.on('error', reject)
  })
}

async function downloadUpdate(updateInfo, options = {}) {
  if (!updateInfo?.asset?.downloadUrl) {
    throw new Error('Update asset is not available.')
  }

  if (!updateInfo?.checksum?.hash) {
    throw new Error('SHA256 checksum is required before downloading an update.')
  }

  const outputDir = options.outputDir
  if (!outputDir) {
    throw new Error('Update output directory is required.')
  }

  const fileName = sanitizeFileName(updateInfo.asset.name)
  const finalPath = path.join(outputDir, fileName)
  const tempPath = `${finalPath}.download`

  fs.mkdirSync(outputDir, { recursive: true })
  fs.rmSync(tempPath, { force: true })

  await downloadToFile(updateInfo.asset.downloadUrl, tempPath, {
    totalBytes: updateInfo.asset.size,
    onProgress: options.onProgress,
    timeoutMs: options.timeoutMs
  })
  const hash = await verifyFileSha256(tempPath, updateInfo.checksum.hash)

  fs.rmSync(finalPath, { force: true })
  fs.renameSync(tempPath, finalPath)

  return {
    filePath: finalPath,
    fileName,
    size: fs.statSync(finalPath).size,
    sha256: hash
  }
}

module.exports = {
  DEFAULT_UPDATE_SOURCES,
  buildUpdateInfoFromRelease,
  checkForUpdates,
  compareVersions,
  downloadUpdate,
  findChecksumForAsset,
  getPlatformAssetPattern,
  isNewerVersion,
  normalizeVersion,
  parseSha256Sums,
  selectUpdateAsset,
  verifyFileSha256
}

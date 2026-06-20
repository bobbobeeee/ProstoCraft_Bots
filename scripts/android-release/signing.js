// @ts-check

const fs = require('fs')
const path = require('path')
const { ensurePathExists } = require('./fs-utils')
const { toAndroidPath } = require('./versioning')

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @param {Pick<AndroidReleaseContext, 'releaseKeystore' | 'cordovaBuildJson' | 'releaseSigningProperties'>} context
 */
function syncSigningConfigPaths(context) {
  if (!fs.existsSync(context.releaseKeystore)) return

  let releaseConfig = null
  if (fs.existsSync(context.cordovaBuildJson)) {
    const buildConfig = JSON.parse(fs.readFileSync(context.cordovaBuildJson, 'utf8'))
    releaseConfig = buildConfig.android?.release || null
    if (releaseConfig?.keystore) {
      releaseConfig.keystore = toAndroidPath(context.releaseKeystore)
      fs.writeFileSync(context.cordovaBuildJson, `${JSON.stringify(buildConfig, null, 2)}\n`)
    }
  }

  if (releaseConfig?.alias && releaseConfig?.storePassword && releaseConfig?.password) {
    fs.mkdirSync(path.dirname(context.releaseSigningProperties), { recursive: true })
    const signingLines = [
      `key.store=${toAndroidPath(context.releaseKeystore)}`,
      `key.alias=${releaseConfig.alias}`,
      `key.store.password=${releaseConfig.storePassword}`,
      `key.alias.password=${releaseConfig.password}`
    ]

    if (releaseConfig.keystoreType) {
      signingLines.push(`key.store.type=${releaseConfig.keystoreType}`)
    }

    fs.writeFileSync(context.releaseSigningProperties, `${signingLines.join('\n')}\n`)
    return
  }

  if (fs.existsSync(context.releaseSigningProperties)) {
    const keystoreLine = `key.store=${toAndroidPath(context.releaseKeystore)}`
    const current = fs.readFileSync(context.releaseSigningProperties, 'utf8')
    const next = /^key\.store=.*$/m.test(current)
      ? current.replace(/^key\.store=.*$/m, keystoreLine)
      : `${current.trimEnd()}\n${keystoreLine}\n`
    fs.writeFileSync(context.releaseSigningProperties, next)
  }
}

/**
 * @param {string} releaseOutputDir
 * @returns {string}
 */
function findBuiltReleaseApk(releaseOutputDir) {
  ensurePathExists(releaseOutputDir, 'Release APK directory')

  const apks = fs
    .readdirSync(releaseOutputDir)
    .filter(fileName => /\.apk$/i.test(fileName))
    .map(fileName => path.join(releaseOutputDir, fileName))

  const preferredNames = ['app-release.apk', 'app-release-signed.apk', 'app-release-unsigned.apk']

  for (const preferredName of preferredNames) {
    const match = apks.find(apkPath => path.basename(apkPath).toLowerCase() === preferredName)
    if (match) return match
  }

  if (apks.length > 0) return apks[0]
  throw new Error(`No release APK was found in ${releaseOutputDir}`)
}

/**
 * @param {string} sourceApk
 * @param {string} [_androidSdkRoot]
 * @param {string} [_javaHome]
 * @param {NodeJS.ProcessEnv} [_env]
 * @returns {string}
 */
function signUnsignedApkIfNeeded(sourceApk, _androidSdkRoot, _javaHome, _env) {
  if (!/-unsigned\.apk$/i.test(path.basename(sourceApk))) {
    return sourceApk
  }

  throw new Error(
    'Release APK is unsigned. Refusing to create a fallback/CI-signed APK because Android updates require the stable release key. ' +
      'Check android-signing/prostocraft-release.keystore and mobile-cordova/build.json release signing settings.'
  )
}

module.exports = {
  findBuiltReleaseApk,
  signUnsignedApkIfNeeded,
  syncSigningConfigPaths
}

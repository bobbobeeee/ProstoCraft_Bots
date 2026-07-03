// @ts-check

const fs = require('fs')
const path = require('path')
const { ensurePathExists } = require('./fs-utils')

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @param {Pick<AndroidReleaseContext, 'projectRoot'>} context
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform | string }} [options]
 * @returns {string | null}
 */
function resolveJavaHome(context, { env = process.env, platform = process.platform } = {}) {
  /** @type {string[]} */
  const candidates = [
    path.join(context.projectRoot, 'tools', 'jdk-17'),
    path.join(context.projectRoot, 'tools', 'jdk-21'),
    'C:\\Program Files\\Java\\jdk-17',
    'C:\\Program Files\\Java\\jdk-21'
  ]
  if (env.JAVA_HOME) {
    candidates.push(env.JAVA_HOME)
  }

  return candidates.find(candidatePath => isSupportedJavaHome(candidatePath, platform)) || null
}

/**
 * @param {string} candidatePath
 * @param {NodeJS.Platform | string} [platform]
 * @returns {boolean}
 */
function isSupportedJavaHome(candidatePath, platform = process.platform) {
  if (!fs.existsSync(candidatePath)) return false

  const javaExecutable = path.join(candidatePath, 'bin', platform === 'win32' ? 'java.exe' : 'java')
  if (!fs.existsSync(javaExecutable)) return false

  const releaseFile = path.join(candidatePath, 'release')
  if (!fs.existsSync(releaseFile)) {
    return /jdk-(17|21)/i.test(candidatePath)
  }

  const release = fs.readFileSync(releaseFile, 'utf8')
  const versionMatch = release.match(/^JAVA_VERSION="(\d+)/m)
  return versionMatch ? ['17', '21'].includes(versionMatch[1]) : false
}

/**
 * @param {string} dirPath
 * @param {string} baseName
 * @param {NodeJS.Platform | string} [platform]
 * @returns {string | null}
 */
function findExecutableInDir(dirPath, baseName, platform = process.platform) {
  const executableName = platform === 'win32' ? `${baseName}.bat` : baseName
  const candidatePath = path.join(dirPath, executableName)
  return fs.existsSync(candidatePath) ? candidatePath : null
}

/**
 * @param {string} androidSdkRoot
 * @param {string} baseName
 * @param {NodeJS.Platform | string} [platform]
 * @returns {string}
 */
function resolveAndroidBuildTool(androidSdkRoot, baseName, platform = process.platform) {
  const buildToolsRoot = path.join(androidSdkRoot, 'build-tools')
  ensurePathExists(buildToolsRoot, 'Android build-tools')

  const versions = fs
    .readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))

  for (const version of versions) {
    const executablePath = findExecutableInDir(
      path.join(buildToolsRoot, version),
      baseName,
      platform
    )
    if (executablePath) return executablePath
  }

  throw new Error(`${baseName} was not found in Android build-tools: ${buildToolsRoot}`)
}

/**
 * @param {string} javaHome
 * @param {NodeJS.Platform | string} [platform]
 * @returns {string}
 */
function resolveKeytool(javaHome, platform = process.platform) {
  const executableName = platform === 'win32' ? 'keytool.exe' : 'keytool'
  const keytoolPath = path.join(javaHome, 'bin', executableName)
  ensurePathExists(keytoolPath, 'Java keytool')
  return keytoolPath
}

module.exports = {
  findExecutableInDir,
  isSupportedJavaHome,
  resolveAndroidBuildTool,
  resolveJavaHome,
  resolveKeytool
}

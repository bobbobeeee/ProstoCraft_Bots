// @ts-check

const fs = require('fs')
const path = require('path')

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @param {string} targetPath
 * @param {string} description
 */
function ensurePathExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} was not found: ${targetPath}`)
  }
}

/**
 * @param {string} filePath
 * @param {string} contents
 */
function writeFileIfMissing(filePath, contents) {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

/**
 * @param {string} filePath
 * @param {string} contents
 */
function writeFileIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return
  fs.writeFileSync(filePath, contents)
}

/**
 * @param {Pick<AndroidReleaseContext, 'buildDirsToClean'>} context
 */
function cleanBuildDirectories(context) {
  for (const targetPath of context.buildDirsToClean) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
}

/**
 * @param {Pick<AndroidReleaseContext, 'defaultOutputDir'>} context
 */
function cleanOutputApks(context) {
  fs.mkdirSync(context.defaultOutputDir, { recursive: true })
  for (const fileName of fs.readdirSync(context.defaultOutputDir)) {
    if (/\.apk$/i.test(fileName)) {
      fs.rmSync(path.join(context.defaultOutputDir, fileName), { force: true })
    }
  }
}

module.exports = {
  cleanBuildDirectories,
  cleanOutputApks,
  ensurePathExists,
  writeFileIfChanged,
  writeFileIfMissing
}

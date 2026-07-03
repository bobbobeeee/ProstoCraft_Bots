// @ts-check

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @param {string} targetPath
 * @returns {string}
 */
function toAndroidPath(targetPath) {
  return targetPath.replace(/\\/g, '/')
}

/**
 * @param {string} version
 * @returns {number}
 */
function toAndroidVersionCode(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return 1

  const major = Number(match[1]) || 0
  const minor = Number(match[2]) || 0
  const patch = Number(match[3]) || 0
  return Math.max(1, major * 10000 + minor * 100 + patch)
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {string} xml
 * @param {string} tagName
 * @param {string} attributeName
 * @param {string | number} attributeValue
 * @returns {string}
 */
function setRootXmlAttribute(xml, tagName, attributeName, attributeValue) {
  const tagPattern = new RegExp(`(<${escapeRegex(tagName)}\\b[^>]*)(>)`, 'i')
  const attributePattern = new RegExp(`\\s${escapeRegex(attributeName)}=["'][^"']*["']`, 'i')
  const nextAttribute = ` ${attributeName}="${attributeValue}"`

  return xml.replace(tagPattern, (_match, start, end) => {
    if (attributePattern.test(start)) {
      return `${start.replace(attributePattern, nextAttribute)}${end}`
    }

    return `${start}${nextAttribute}${end}`
  })
}

/**
 * @param {string} configXml
 * @param {Pick<AndroidReleaseContext, 'appVersion' | 'androidVersionCode'>} context
 * @returns {string}
 */
function ensureCordovaConfigVersion(configXml, context) {
  let nextConfig = setRootXmlAttribute(configXml, 'widget', 'version', context.appVersion)
  nextConfig = setRootXmlAttribute(
    nextConfig,
    'widget',
    'android-versionCode',
    String(context.androidVersionCode)
  )
  return nextConfig
}

/**
 * @param {string} manifestXml
 * @param {Pick<AndroidReleaseContext, 'appVersion' | 'androidVersionCode'>} context
 * @returns {string}
 */
function ensureAndroidManifestVersion(manifestXml, context) {
  let nextManifest = setRootXmlAttribute(
    manifestXml,
    'manifest',
    'android:versionName',
    context.appVersion
  )
  nextManifest = setRootXmlAttribute(
    nextManifest,
    'manifest',
    'android:versionCode',
    String(context.androidVersionCode)
  )
  return nextManifest
}

/**
 * @param {string} manifestXml
 * @returns {string}
 */
function ensureAndroidManifestNativeLibPackaging(manifestXml) {
  return manifestXml.replace(/\sandroid:extractNativeLibs=["'][^"']*["']/i, '')
}

/**
 * @param {string} manifestXml
 * @param {string} permissionName
 * @returns {string}
 */
function ensureAndroidManifestPermission(manifestXml, permissionName) {
  if (manifestXml.includes(`android.permission.${permissionName}`)) {
    return manifestXml
  }

  return manifestXml.replace(
    /(<manifest\b[^>]*>\s*)/i,
    `$1\n    <uses-permission android:name="android.permission.${permissionName}" />\n`
  )
}

/**
 * @param {string} configXml
 * @returns {string}
 */
function ensureNodeJsFeature(configXml) {
  if (/<feature\s+name=["']NodeJS["']/i.test(configXml)) {
    return configXml
  }

  const nodeFeature = `    <feature name="NodeJS">
        <param name="android-package" value="com.janeasystems.cdvnodejsmobile.NodeJS" />
    </feature>
`

  if (/<content\b[^>]*\/>/i.test(configXml)) {
    return configXml.replace(/(<content\b[^>]*\/>\s*)/i, `$1${nodeFeature}`)
  }

  return configXml.replace(/(<name>[\s\S]*?<\/name>\s*)/i, `$1${nodeFeature}`)
}

/**
 * @param {string} source
 * @param {string} importLine
 * @returns {string}
 */
function ensureJavaImport(source, importLine) {
  return source.includes(importLine)
    ? source
    : source.replace(/(import android\.[\s\S]*?;\r?\n)/, `$1${importLine}\n`)
}

module.exports = {
  ensureAndroidManifestNativeLibPackaging,
  ensureAndroidManifestPermission,
  ensureAndroidManifestVersion,
  ensureCordovaConfigVersion,
  ensureJavaImport,
  ensureNodeJsFeature,
  escapeRegex,
  setRootXmlAttribute,
  toAndroidPath,
  toAndroidVersionCode
}

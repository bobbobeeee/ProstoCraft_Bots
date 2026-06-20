// @ts-check

const fs = require('fs')
const path = require('path')
const { toAndroidVersionCode } = require('./versioning')

/**
 * @param {{ projectRoot?: string, platform?: NodeJS.Platform | string }} [options]
 * @returns {import('./types').AndroidReleaseContext}
 */
function createAndroidReleaseContext({
  projectRoot = path.resolve(__dirname, '..', '..'),
  platform = process.platform
} = {}) {
  const cordovaRoot = path.join(projectRoot, 'mobile-cordova')
  const gradleProjectRoot = path.join(cordovaRoot, 'platforms', 'android')
  const gradleWrapperName = platform === 'win32' ? 'gradlew.bat' : 'gradlew'
  const gradleExecutableName = platform === 'win32' ? 'gradle.bat' : 'gradle'
  const gradleWrapperCandidates = [
    path.join(gradleProjectRoot, 'tools', gradleWrapperName),
    path.join(gradleProjectRoot, gradleWrapperName),
    path.join(projectRoot, 'tools', 'gradle-8.14.2', 'bin', gradleExecutableName)
  ]
  const gradleCommand =
    gradleWrapperCandidates.find(candidatePath => fs.existsSync(candidatePath)) ||
    gradleExecutableName
  const gradleUserHome = path.join(projectRoot, '.gradle-home')
  const defaultAndroidSdkRoot = path.join(projectRoot, 'tools', 'android-sdk')
  const defaultOutputDir = path.join(projectRoot, 'dist-android')
  const appVersion =
    JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version || '0.0.0'
  const androidVersionCode = toAndroidVersionCode(appVersion)
  const defaultOutputApk = path.join(
    defaultOutputDir,
    `ProstoCraft.Bot.Studio-Mobile-${appVersion}.apk`
  )
  const releaseKeystore = path.join(projectRoot, 'android-signing', 'prostocraft-release.keystore')
  const cordovaBuildJson = path.join(cordovaRoot, 'build.json')
  const releaseSigningProperties = path.join(gradleProjectRoot, 'release-signing.properties')
  const appBuildExtrasGradle = path.join(gradleProjectRoot, 'app', 'build-extras.gradle')
  const buildDirsToClean = [
    path.join(gradleProjectRoot, 'build'),
    path.join(gradleProjectRoot, 'app', 'build'),
    path.join(gradleProjectRoot, 'app', '.cxx'),
    path.join(gradleProjectRoot, 'CordovaLib', 'build')
  ]

  return {
    androidVersionCode,
    appBuildExtrasGradle,
    appVersion,
    buildDirsToClean,
    cordovaBuildJson,
    cordovaRoot,
    defaultAndroidSdkRoot,
    defaultOutputApk,
    defaultOutputDir,
    gradleCommand,
    gradleProjectRoot,
    gradleUserHome,
    projectRoot,
    releaseKeystore,
    releaseSigningProperties
  }
}

module.exports = {
  createAndroidReleaseContext
}

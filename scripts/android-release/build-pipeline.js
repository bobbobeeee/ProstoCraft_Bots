// @ts-check

const fs = require('fs')
const path = require('path')
const { resolveJavaHome } = require('./android-tools')
const {
  ensureCordovaAndroidBuildExtras,
  ensureCordovaAndroidManifest,
  ensureCordovaAndroidResources,
  ensureCordovaAndroidSources
} = require('./cordova-android-project')
const { createAndroidReleaseContext } = require('./context')
const { cleanBuildDirectories, cleanOutputApks, ensurePathExists } = require('./fs-utils')
const { patchNodeJsMobilePlugin } = require('./nodejs-plugin-patcher')
const { run, stopGradle } = require('./process-runner')
const {
  findBuiltReleaseApk,
  signUnsignedApkIfNeeded,
  syncSigningConfigPaths
} = require('./signing')

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @param {AndroidReleaseContext} context
 * @param {{ env?: NodeJS.ProcessEnv, javaHome: string, androidSdkRoot: string }} options
 * @returns {NodeJS.ProcessEnv}
 */
function createAndroidReleaseEnv(context, { env = process.env, javaHome, androidSdkRoot }) {
  return {
    ...env,
    GRADLE_USER_HOME: context.gradleUserHome,
    JAVA_HOME: javaHome,
    ANDROID_SDK_ROOT: androidSdkRoot,
    ANDROID_HOME: androidSdkRoot,
    CORDOVA_TELEMETRY: 'off',
    CI: '1'
  }
}

/**
 * @param {{ context?: AndroidReleaseContext, env?: NodeJS.ProcessEnv, processRef?: NodeJS.Process }} [options]
 * @returns {string}
 */
function buildCordovaAndroidRelease({
  context = createAndroidReleaseContext(),
  env = process.env,
  processRef = process
} = {}) {
  ensurePathExists(context.cordovaRoot, 'Cordova project')
  if (path.isAbsolute(context.gradleCommand)) {
    ensurePathExists(context.gradleCommand, 'Gradle command')
  }

  const androidSdkRoot = env.ANDROID_SDK_ROOT || env.ANDROID_HOME || context.defaultAndroidSdkRoot
  const javaHome = resolveJavaHome(context, { env, platform: processRef.platform })

  ensurePathExists(androidSdkRoot, 'Android SDK')

  if (!javaHome) {
    throw new Error('JAVA_HOME is not set and no supported local JDK was found.')
  }

  const releaseEnv = createAndroidReleaseEnv(context, {
    androidSdkRoot,
    env,
    javaHome
  })

  run(processRef.execPath, [path.join(context.projectRoot, 'scripts', 'sync-cordova-app.js')], {
    cwd: context.projectRoot,
    env: releaseEnv
  })

  syncSigningConfigPaths(context)
  ensureCordovaAndroidResources(context)
  ensureCordovaAndroidManifest(context)
  ensureCordovaAndroidBuildExtras(context)
  ensureCordovaAndroidSources(context)
  patchNodeJsMobilePlugin(context)
  stopGradle(context, releaseEnv)
  cleanBuildDirectories(context)

  run(
    context.gradleCommand,
    ['-p', context.gradleProjectRoot, 'cdvBuildRelease', '--console=plain'],
    {
      cwd: context.projectRoot,
      env: releaseEnv
    }
  )

  const releaseOutputDir = path.join(
    context.gradleProjectRoot,
    'app',
    'build',
    'outputs',
    'apk',
    'release'
  )

  const sourceApk = signUnsignedApkIfNeeded(
    findBuiltReleaseApk(releaseOutputDir),
    androidSdkRoot,
    javaHome,
    releaseEnv
  )

  cleanOutputApks(context)
  fs.copyFileSync(sourceApk, context.defaultOutputApk)

  console.log(`Functional Android APK copied to ${context.defaultOutputApk}`)
  return context.defaultOutputApk
}

module.exports = {
  buildCordovaAndroidRelease,
  createAndroidReleaseEnv
}

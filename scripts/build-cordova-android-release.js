const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const cordovaRoot = path.join(projectRoot, 'mobile-cordova')
const gradleProjectRoot = path.join(cordovaRoot, 'platforms', 'android')
const gradleWrapper = path.join(
  gradleProjectRoot,
  'tools',
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
)
const gradleUserHome = path.join(projectRoot, '.gradle-home')
const defaultAndroidSdkRoot = path.join(projectRoot, 'tools', 'android-sdk')
const defaultOutputDir = path.join(projectRoot, 'dist-android')
const defaultOutputApk = path.join(defaultOutputDir, 'ProstoCraft Bot Studio Mobile-runtime.apk')
const buildDirsToClean = [
  path.join(gradleProjectRoot, 'build'),
  path.join(gradleProjectRoot, 'app', 'build'),
  path.join(gradleProjectRoot, 'CordovaLib', 'build')
]

function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    'C:\\Program Files\\Java\\jdk-17',
    'C:\\Program Files\\Java\\jdk-21'
  ].filter(Boolean)

  return candidates.find(candidatePath => fs.existsSync(candidatePath)) || null
}

function ensurePathExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} was not found: ${targetPath}`)
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(' ')}), exit code ${result.status}`)
  }
}

function stopGradle(env) {
  const result = spawnSync(
    gradleWrapper,
    ['-p', gradleProjectRoot, '--stop', '--console=plain'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env
    }
  )

  if (result.status !== 0) {
    console.warn('Gradle stop returned non-zero status, continuing with build cleanup.')
  }
}

function cleanBuildDirectories() {
  for (const targetPath of buildDirsToClean) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
}

function main() {
  ensurePathExists(cordovaRoot, 'Cordova project')
  ensurePathExists(gradleWrapper, 'Gradle wrapper')

  const androidSdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || defaultAndroidSdkRoot
  const javaHome = resolveJavaHome()

  ensurePathExists(androidSdkRoot, 'Android SDK')

  if (!javaHome) {
    throw new Error('JAVA_HOME is not set and no supported local JDK was found.')
  }

  const env = {
    ...process.env,
    GRADLE_USER_HOME: gradleUserHome,
    JAVA_HOME: javaHome,
    ANDROID_SDK_ROOT: androidSdkRoot,
    ANDROID_HOME: androidSdkRoot,
    CORDOVA_TELEMETRY: 'off',
    CI: '1'
  }

  run(process.execPath, [path.join(projectRoot, 'scripts', 'sync-cordova-app.js')], {
    cwd: projectRoot,
    env
  })

  stopGradle(env)
  cleanBuildDirectories()

  run(
    gradleWrapper,
    ['-p', gradleProjectRoot, 'cdvBuildRelease', '--console=plain'],
    {
      cwd: projectRoot,
      env
    }
  )

  const sourceApk = path.join(
    gradleProjectRoot,
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk'
  )

  ensurePathExists(sourceApk, 'Release APK')

  fs.mkdirSync(defaultOutputDir, { recursive: true })
  fs.copyFileSync(sourceApk, defaultOutputApk)

  console.log(`Functional Android APK copied to ${defaultOutputApk}`)
}

main()

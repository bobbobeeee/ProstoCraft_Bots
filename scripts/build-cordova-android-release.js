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
const releaseKeystore = path.join(projectRoot, 'android-signing', 'prostocraft-release.keystore')
const cordovaBuildJson = path.join(cordovaRoot, 'build.json')
const releaseSigningProperties = path.join(gradleProjectRoot, 'release-signing.properties')
const buildDirsToClean = [
  path.join(gradleProjectRoot, 'build'),
  path.join(gradleProjectRoot, 'app', 'build'),
  path.join(gradleProjectRoot, 'app', '.cxx'),
  path.join(gradleProjectRoot, 'CordovaLib', 'build')
]

function resolveJavaHome() {
  const candidates = [
    path.join(projectRoot, 'tools', 'jdk-17'),
    path.join(projectRoot, 'tools', 'jdk-21'),
    'C:\\Program Files\\Java\\jdk-17',
    'C:\\Program Files\\Java\\jdk-21',
    process.env.JAVA_HOME
  ].filter(Boolean)

  return candidates.find(isSupportedJavaHome) || null
}

function isSupportedJavaHome(candidatePath) {
  if (!fs.existsSync(candidatePath)) return false

  const javaExecutable = path.join(candidatePath, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  if (!fs.existsSync(javaExecutable)) return false

  const releaseFile = path.join(candidatePath, 'release')
  if (!fs.existsSync(releaseFile)) {
    return /jdk-(17|21)/i.test(candidatePath)
  }

  const release = fs.readFileSync(releaseFile, 'utf8')
  const versionMatch = release.match(/^JAVA_VERSION="(\d+)/m)
  return versionMatch ? ['17', '21'].includes(versionMatch[1]) : false
}

function ensurePathExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} was not found: ${targetPath}`)
  }
}

function normalizeSpawn(command, args) {
  if (process.platform !== 'win32' || !/\.(bat|cmd)$/i.test(command)) {
    return { command, args }
  }

  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/c', 'call', command, ...args]
  }
}

function spawnChecked(command, args, options = {}) {
  const normalized = normalizeSpawn(command, args)
  const result = spawnSync(normalized.command, normalized.args, {
    stdio: 'inherit',
    shell: false,
    ...options
  })

  if (result.error) {
    throw result.error
  }

  return result
}

function run(command, args, options = {}) {
  const result = spawnChecked(command, args, options)

  if (result.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(' ')}), exit code ${result.status}`)
  }
}

function stopGradle(env) {
  const result = spawnChecked(
    gradleWrapper,
    ['-p', gradleProjectRoot, '--stop', '--console=plain'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
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

function cleanOutputApks() {
  fs.mkdirSync(defaultOutputDir, { recursive: true })
  for (const fileName of fs.readdirSync(defaultOutputDir)) {
    if (/\.apk$/i.test(fileName)) {
      fs.rmSync(path.join(defaultOutputDir, fileName), { force: true })
    }
  }
}

function toAndroidPath(targetPath) {
  return targetPath.replace(/\\/g, '/')
}

function syncSigningConfigPaths() {
  if (!fs.existsSync(releaseKeystore)) return

  if (fs.existsSync(cordovaBuildJson)) {
    const buildConfig = JSON.parse(fs.readFileSync(cordovaBuildJson, 'utf8'))
    if (buildConfig.android?.release?.keystore) {
      buildConfig.android.release.keystore = toAndroidPath(releaseKeystore)
      fs.writeFileSync(cordovaBuildJson, `${JSON.stringify(buildConfig, null, 2)}\n`)
    }
  }

  if (fs.existsSync(releaseSigningProperties)) {
    const keystoreLine = `key.store=${toAndroidPath(releaseKeystore)}`
    const current = fs.readFileSync(releaseSigningProperties, 'utf8')
    const next = /^key\.store=.*$/m.test(current)
      ? current.replace(/^key\.store=.*$/m, keystoreLine)
      : `${current.trimEnd()}\n${keystoreLine}\n`
    fs.writeFileSync(releaseSigningProperties, next)
  }
}

function writeFileIfMissing(filePath, contents) {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function writeFileIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return
  fs.writeFileSync(filePath, contents)
}

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

function ensureCordovaAndroidResources() {
  const resRoot = path.join(gradleProjectRoot, 'app', 'src', 'main', 'res')
  const cordovaConfigXml = path.join(cordovaRoot, 'config.xml')

  writeFileIfChanged(path.join(resRoot, 'values', 'strings.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">ProstoCraft Bot Studio Mobile</string>
  <string name="activity_name">ProstoCraft Bot Studio Mobile</string>
  <string name="launcher_name">ProstoCraft Bot Studio</string>
</resources>
`)

  writeFileIfChanged(path.join(resRoot, 'values', 'colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="color_background">#091524</color>
  <color name="cdv_splashscreen_background">#091524</color>
</resources>
`)

  writeFileIfChanged(path.join(resRoot, 'values', 'themes.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="Theme.App.SplashScreen" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:windowNoTitle">true</item>
    <item name="android:windowActionBar">false</item>
    <item name="android:windowBackground">@color/cdv_splashscreen_background</item>
    <item name="android:statusBarColor">@color/color_background</item>
    <item name="android:navigationBarColor">@color/color_background</item>
    <item name="android:windowLightStatusBar">false</item>
    <item name="android:windowLightNavigationBar">false</item>
  </style>
</resources>
`)

  writeFileIfChanged(path.join(resRoot, 'xml', 'cdv_core_file_provider_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <files-path name="files" path="." />
  <cache-path name="cache" path="." />
  <external-files-path name="external_files" path="." />
  <external-cache-path name="external_cache" path="." />
</paths>
`)

  writeFileIfChanged(
    path.join(resRoot, 'xml', 'config.xml'),
    fs.existsSync(cordovaConfigXml)
      ? ensureNodeJsFeature(fs.readFileSync(cordovaConfigXml, 'utf8'))
      : `<?xml version="1.0" encoding="utf-8"?>
<widget id="com.prostocraft.botstudio.mobile" version="1.0.0" xmlns="http://www.w3.org/ns/widgets">
  <name>ProstoCraft Bot Studio Mobile</name>
  <content src="index.html" />
  <feature name="NodeJS">
    <param name="android-package" value="com.janeasystems.cdvnodejsmobile.NodeJS" />
  </feature>
</widget>
`
  )
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

  syncSigningConfigPaths()
  ensureCordovaAndroidResources()
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

  cleanOutputApks()
  fs.copyFileSync(sourceApk, defaultOutputApk)

  console.log(`Functional Android APK copied to ${defaultOutputApk}`)
}

main()

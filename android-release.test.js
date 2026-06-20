const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  findExecutableInDir,
  isSupportedJavaHome
} = require('./scripts/android-release/android-tools')
const { createAndroidReleaseEnv } = require('./scripts/android-release/build-pipeline')
const {
  getRuntimeKeepAliveServiceSource
} = require('./scripts/android-release/runtime-keepalive-service-source')
const { normalizeSpawn } = require('./scripts/android-release/process-runner')
const {
  findBuiltReleaseApk,
  signUnsignedApkIfNeeded
} = require('./scripts/android-release/signing')
const {
  ensureAndroidManifestNativeLibPackaging,
  ensureAndroidManifestPermission,
  ensureAndroidManifestVersion,
  ensureCordovaConfigVersion,
  ensureJavaImport,
  ensureNodeJsFeature,
  setRootXmlAttribute,
  toAndroidPath,
  toAndroidVersionCode
} = require('./scripts/android-release/versioning')
const { patchNodeJsMobilePluginSource } = require('./scripts/android-release/nodejs-plugin-patcher')

function withTempDir(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-release-test-'))
  try {
    return fn(tempDir)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

assert.strictEqual(toAndroidVersionCode('3.2.9'), 30209)
assert.strictEqual(toAndroidVersionCode('0.0.0'), 1)
assert.strictEqual(toAndroidVersionCode('bad'), 1)
assert.strictEqual(toAndroidPath('C:\\tmp\\app.apk'), 'C:/tmp/app.apk')

assert.strictEqual(
  setRootXmlAttribute('<widget id="x"></widget>', 'widget', 'version', '3.0.0'),
  '<widget id="x" version="3.0.0"></widget>'
)
assert.strictEqual(
  setRootXmlAttribute('<widget version="1"></widget>', 'widget', 'version', '3.0.0'),
  '<widget version="3.0.0"></widget>'
)

const context = {
  androidVersionCode: 30000,
  appVersion: '3.0.0',
  gradleUserHome: 'gradle-home'
}
assert.strictEqual(
  ensureCordovaConfigVersion('<widget id="x"></widget>', context),
  '<widget id="x" version="3.0.0" android-versionCode="30000"></widget>'
)
assert.strictEqual(
  ensureAndroidManifestVersion('<manifest package="x"></manifest>', context),
  '<manifest package="x" android:versionName="3.0.0" android:versionCode="30000"></manifest>'
)
assert.strictEqual(
  ensureAndroidManifestNativeLibPackaging(
    '<manifest android:extractNativeLibs="true" package="x"></manifest>'
  ),
  '<manifest package="x"></manifest>'
)
assert.ok(
  ensureAndroidManifestPermission('<manifest>\n</manifest>', 'REQUEST_INSTALL_PACKAGES').includes(
    'android.permission.REQUEST_INSTALL_PACKAGES'
  )
)
assert.strictEqual(
  ensureNodeJsFeature('<widget><name>App</name><content src="index.html" /></widget>').includes(
    '<feature name="NodeJS">'
  ),
  true
)
assert.strictEqual(
  ensureJavaImport('import android.content.Intent;\n\nclass X {}', 'import android.net.Uri;'),
  'import android.content.Intent;\nimport android.net.Uri;\n\nclass X {}'
)

assert.deepStrictEqual(
  normalizeSpawn('gradlew.bat', ['assemble'], {
    env: { ComSpec: 'cmd-custom.exe' },
    platform: 'win32'
  }),
  {
    command: 'cmd-custom.exe',
    args: ['/d', '/c', 'call', 'gradlew.bat', 'assemble']
  }
)
assert.deepStrictEqual(normalizeSpawn('gradle', ['assemble'], { platform: 'linux' }), {
  command: 'gradle',
  args: ['assemble']
})

assert.deepStrictEqual(
  createAndroidReleaseEnv(
    {
      gradleUserHome: '.gradle-home'
    },
    {
      androidSdkRoot: 'sdk',
      env: { KEEP: '1' },
      javaHome: 'jdk'
    }
  ),
  {
    ANDROID_HOME: 'sdk',
    ANDROID_SDK_ROOT: 'sdk',
    CI: '1',
    CORDOVA_TELEMETRY: 'off',
    GRADLE_USER_HOME: '.gradle-home',
    JAVA_HOME: 'jdk',
    KEEP: '1'
  }
)

withTempDir(tempDir => {
  const releaseDir = path.join(tempDir, 'release')
  fs.mkdirSync(releaseDir)
  fs.writeFileSync(path.join(releaseDir, 'z.apk'), '')
  fs.writeFileSync(path.join(releaseDir, 'app-release-signed.apk'), '')
  assert.strictEqual(path.basename(findBuiltReleaseApk(releaseDir)), 'app-release-signed.apk')
  assert.strictEqual(
    signUnsignedApkIfNeeded(path.join(releaseDir, 'app-release.apk')),
    path.join(releaseDir, 'app-release.apk')
  )
  assert.throws(
    () => signUnsignedApkIfNeeded(path.join(releaseDir, 'app-release-unsigned.apk')),
    /stable release key/
  )
})

withTempDir(tempDir => {
  const jdk = path.join(tempDir, 'jdk-17')
  const bin = path.join(jdk, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'java.exe'), '')
  assert.strictEqual(isSupportedJavaHome(jdk, 'win32'), true)
  fs.writeFileSync(path.join(bin, 'tool.bat'), '')
  assert.strictEqual(findExecutableInDir(bin, 'tool', 'win32'), path.join(bin, 'tool.bat'))
})

const serviceSource = getRuntimeKeepAliveServiceSource()
assert.ok(serviceSource.includes('class RuntimeKeepAliveService extends Service'))
assert.ok(serviceSource.includes('ACTION_UPDATE_PROGRESS'))
assert.ok(serviceSource.includes('ACTION_INSTALL_APK'))

const nodeJsSource = `package com.janeasystems.cdvnodejsmobile;

import android.content.Intent;

class NodeJS {
  static Object context;
  static Object activity;
  static String LOGTAG = "NodeJS";

  private static void sendMessageToPort(String msg) {
    if (msg.startsWith("runtime-keepalive|")) {
      setRuntimeKeepAlive(msg.endsWith("|1"));
    }

    if (msg.equals("open-install-settings")) {
      openInstallUnknownAppsSettings();
    }
  }

  private static synchronized void setRuntimeKeepAlive(boolean enabled) {
  }
}
`
const patchedSource = patchNodeJsMobilePluginSource(nodeJsSource)
assert.ok(patchedSource.includes('import android.net.Uri;'))
assert.ok(patchedSource.includes('msg.startsWith("install-apk|")'))
assert.ok(patchedSource.includes('private static void sendUpdateServiceCommand'))
assert.ok(patchedSource.includes('private static Intent createApkInstallIntent'))
assert.strictEqual(patchNodeJsMobilePluginSource(patchedSource), patchedSource)

console.log('android release tests passed')

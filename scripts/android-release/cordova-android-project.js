// @ts-check

const fs = require('fs')
const path = require('path')
const {
  ensureAndroidManifestNativeLibPackaging,
  ensureAndroidManifestPermission,
  ensureAndroidManifestVersion,
  ensureCordovaConfigVersion,
  ensureNodeJsFeature
} = require('./versioning')
const { getRuntimeKeepAliveServiceSource } = require('./runtime-keepalive-service-source')
const { writeFileIfChanged } = require('./fs-utils')

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @param {AndroidReleaseContext} context
 */
function ensureCordovaAndroidResources(context) {
  const resRoot = path.join(context.gradleProjectRoot, 'app', 'src', 'main', 'res')
  const cordovaConfigXml = path.join(context.cordovaRoot, 'config.xml')

  writeFileIfChanged(
    path.join(resRoot, 'values', 'strings.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">ProstoCraft Bot Studio Mobile</string>
  <string name="activity_name">ProstoCraft Bot Studio Mobile</string>
  <string name="launcher_name">ProstoCraft Bot Studio</string>
</resources>
`
  )

  writeFileIfChanged(
    path.join(resRoot, 'values', 'colors.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="color_background">#091524</color>
  <color name="cdv_splashscreen_background">#091524</color>
</resources>
`
  )

  writeFileIfChanged(
    path.join(resRoot, 'values', 'themes.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
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
`
  )

  writeFileIfChanged(
    path.join(resRoot, 'xml', 'cdv_core_file_provider_paths.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <files-path name="files" path="." />
  <cache-path name="cache" path="." />
  <external-files-path name="external_files" path="." />
  <external-cache-path name="external_cache" path="." />
</paths>
`
  )

  writeFileIfChanged(
    path.join(resRoot, 'xml', 'config.xml'),
    fs.existsSync(cordovaConfigXml)
      ? ensureCordovaConfigVersion(
          ensureNodeJsFeature(fs.readFileSync(cordovaConfigXml, 'utf8')),
          context
        )
      : `<?xml version="1.0" encoding="utf-8"?>
<widget id="com.prostocraft.botstudio.mobile" version="${context.appVersion}" android-versionCode="${context.androidVersionCode}" xmlns="http://www.w3.org/ns/widgets">
  <name>ProstoCraft Bot Studio Mobile</name>
  <content src="index.html" />
  <feature name="NodeJS">
    <param name="android-package" value="com.janeasystems.cdvnodejsmobile.NodeJS" />
  </feature>
</widget>
`
  )
}

/**
 * @param {AndroidReleaseContext} context
 */
function ensureCordovaAndroidManifest(context) {
  const manifestPath = path.join(
    context.gradleProjectRoot,
    'app',
    'src',
    'main',
    'AndroidManifest.xml'
  )
  if (!fs.existsSync(manifestPath)) return

  let manifestXml = fs.readFileSync(manifestPath, 'utf8')
  manifestXml = ensureAndroidManifestVersion(manifestXml, context)
  manifestXml = ensureAndroidManifestNativeLibPackaging(manifestXml)
  manifestXml = ensureAndroidManifestPermission(manifestXml, 'REQUEST_INSTALL_PACKAGES')
  writeFileIfChanged(manifestPath, manifestXml)
}

/**
 * @param {AndroidReleaseContext} context
 */
function ensureCordovaAndroidBuildExtras(context) {
  writeFileIfChanged(
    context.appBuildExtrasGradle,
    `android {
    packagingOptions {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}
`
  )
}

/**
 * @param {AndroidReleaseContext} context
 */
function ensureCordovaAndroidSources(context) {
  const javaRoot = path.join(
    context.gradleProjectRoot,
    'app',
    'src',
    'main',
    'java',
    'com',
    'prostocraft',
    'botstudio',
    'mobile'
  )

  writeFileIfChanged(
    path.join(javaRoot, 'RuntimeKeepAliveService.java'),
    getRuntimeKeepAliveServiceSource()
  )
}

module.exports = {
  ensureCordovaAndroidBuildExtras,
  ensureCordovaAndroidManifest,
  ensureCordovaAndroidResources,
  ensureCordovaAndroidSources
}

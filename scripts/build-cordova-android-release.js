const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const cordovaRoot = path.join(projectRoot, 'mobile-cordova')
const gradleProjectRoot = path.join(cordovaRoot, 'platforms', 'android')
const gradleWrapperName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
const gradleExecutableName = process.platform === 'win32' ? 'gradle.bat' : 'gradle'
const gradleWrapperCandidates = [
  path.join(gradleProjectRoot, 'tools', gradleWrapperName),
  path.join(gradleProjectRoot, gradleWrapperName),
  path.join(projectRoot, 'tools', 'gradle-8.14.2', 'bin', gradleExecutableName)
]
const gradleCommand = gradleWrapperCandidates.find(candidatePath => fs.existsSync(candidatePath)) || gradleExecutableName
const gradleUserHome = path.join(projectRoot, '.gradle-home')
const defaultAndroidSdkRoot = path.join(projectRoot, 'tools', 'android-sdk')
const defaultOutputDir = path.join(projectRoot, 'dist-android')
const appVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version || '0.0.0'
const androidVersionCode = toAndroidVersionCode(appVersion)
const defaultOutputApk = path.join(defaultOutputDir, `ProstoCraft.Bot.Studio-Mobile-${appVersion}.apk`)
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

function findExecutableInDir(dirPath, baseName) {
  const executableName = process.platform === 'win32' ? `${baseName}.bat` : baseName
  const candidatePath = path.join(dirPath, executableName)
  return fs.existsSync(candidatePath) ? candidatePath : null
}

function resolveAndroidBuildTool(androidSdkRoot, baseName) {
  const buildToolsRoot = path.join(androidSdkRoot, 'build-tools')
  ensurePathExists(buildToolsRoot, 'Android build-tools')

  const versions = fs.readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))

  for (const version of versions) {
    const executablePath = findExecutableInDir(path.join(buildToolsRoot, version), baseName)
    if (executablePath) return executablePath
  }

  throw new Error(`${baseName} was not found in Android build-tools: ${buildToolsRoot}`)
}

function resolveKeytool(javaHome) {
  const executableName = process.platform === 'win32' ? 'keytool.exe' : 'keytool'
  const keytoolPath = path.join(javaHome, 'bin', executableName)
  ensurePathExists(keytoolPath, 'Java keytool')
  return keytoolPath
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
    gradleCommand,
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

function toAndroidVersionCode(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return 1

  const major = Number(match[1]) || 0
  const minor = Number(match[2]) || 0
  const patch = Number(match[3]) || 0
  return Math.max(1, major * 10000 + minor * 100 + patch)
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function setRootXmlAttribute(xml, tagName, attributeName, attributeValue) {
  const tagPattern = new RegExp(`(<${escapeRegex(tagName)}\\b[^>]*)(>)`, 'i')
  const attributePattern = new RegExp(`\\s${escapeRegex(attributeName)}=["'][^"']*["']`, 'i')
  const nextAttribute = ` ${attributeName}="${attributeValue}"`

  return xml.replace(tagPattern, (match, start, end) => {
    if (attributePattern.test(start)) {
      return `${start.replace(attributePattern, nextAttribute)}${end}`
    }

    return `${start}${nextAttribute}${end}`
  })
}

function ensureCordovaConfigVersion(configXml) {
  let nextConfig = setRootXmlAttribute(configXml, 'widget', 'version', appVersion)
  nextConfig = setRootXmlAttribute(nextConfig, 'widget', 'android-versionCode', String(androidVersionCode))
  return nextConfig
}

function ensureAndroidManifestVersion(manifestXml) {
  let nextManifest = setRootXmlAttribute(manifestXml, 'manifest', 'android:versionName', appVersion)
  nextManifest = setRootXmlAttribute(nextManifest, 'manifest', 'android:versionCode', String(androidVersionCode))
  return nextManifest
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

function findBuiltReleaseApk(releaseOutputDir) {
  ensurePathExists(releaseOutputDir, 'Release APK directory')

  const apks = fs.readdirSync(releaseOutputDir)
    .filter(fileName => /\.apk$/i.test(fileName))
    .map(fileName => path.join(releaseOutputDir, fileName))

  const preferredNames = [
    'app-release.apk',
    'app-release-signed.apk',
    'app-release-unsigned.apk'
  ]

  for (const preferredName of preferredNames) {
    const match = apks.find(apkPath => path.basename(apkPath).toLowerCase() === preferredName)
    if (match) return match
  }

  if (apks.length > 0) return apks[0]
  throw new Error(`No release APK was found in ${releaseOutputDir}`)
}

function signUnsignedApkIfNeeded(sourceApk, androidSdkRoot, javaHome, env) {
  if (!/-unsigned\.apk$/i.test(path.basename(sourceApk))) {
    return sourceApk
  }

  const fallbackKeystore = path.join(gradleUserHome, 'prostocraft-ci-release.keystore')
  const signedApk = path.join(path.dirname(sourceApk), 'app-release-ci-signed.apk')
  const fallbackAlias = 'prostocraft-ci-release'
  const fallbackPassword = 'prostocraft-ci-release'
  const keytool = resolveKeytool(javaHome)
  const apksigner = resolveAndroidBuildTool(androidSdkRoot, 'apksigner')

  fs.mkdirSync(path.dirname(fallbackKeystore), { recursive: true })

  if (!fs.existsSync(fallbackKeystore)) {
    run(keytool, [
      '-genkeypair',
      '-v',
      '-keystore', fallbackKeystore,
      '-storepass', fallbackPassword,
      '-keypass', fallbackPassword,
      '-alias', fallbackAlias,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-dname', 'CN=ProstoCraft Bot Studio CI,O=ProstoCraft Bot Studio,C=US'
    ], { cwd: projectRoot, env })
  }

  run(apksigner, [
    'sign',
    '--ks', fallbackKeystore,
    '--ks-key-alias', fallbackAlias,
    '--ks-pass', `pass:${fallbackPassword}`,
    '--key-pass', `pass:${fallbackPassword}`,
    '--out', signedApk,
    sourceApk
  ], { cwd: projectRoot, env })

  return signedApk
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
      ? ensureCordovaConfigVersion(ensureNodeJsFeature(fs.readFileSync(cordovaConfigXml, 'utf8')))
      : `<?xml version="1.0" encoding="utf-8"?>
<widget id="com.prostocraft.botstudio.mobile" version="${appVersion}" android-versionCode="${androidVersionCode}" xmlns="http://www.w3.org/ns/widgets">
  <name>ProstoCraft Bot Studio Mobile</name>
  <content src="index.html" />
  <feature name="NodeJS">
    <param name="android-package" value="com.janeasystems.cdvnodejsmobile.NodeJS" />
  </feature>
</widget>
`
  )
}

function ensureAndroidManifestPermission(manifestXml, permissionName) {
  if (manifestXml.includes(`android.permission.${permissionName}`)) {
    return manifestXml
  }

  return manifestXml.replace(
    /(<manifest\b[^>]*>\s*)/i,
    `$1\n    <uses-permission android:name="android.permission.${permissionName}" />\n`
  )
}

function ensureCordovaAndroidManifest() {
  const manifestPath = path.join(gradleProjectRoot, 'app', 'src', 'main', 'AndroidManifest.xml')
  if (!fs.existsSync(manifestPath)) return

  let manifestXml = fs.readFileSync(manifestPath, 'utf8')
  manifestXml = ensureAndroidManifestVersion(manifestXml)
  manifestXml = ensureAndroidManifestPermission(manifestXml, 'REQUEST_INSTALL_PACKAGES')
  writeFileIfChanged(manifestPath, manifestXml)
}

function ensureCordovaAndroidSources() {
  const javaRoot = path.join(
    gradleProjectRoot,
    'app',
    'src',
    'main',
    'java',
    'com',
    'prostocraft',
    'botstudio',
    'mobile'
  )

  writeFileIfChanged(path.join(javaRoot, 'RuntimeKeepAliveService.java'), `package com.prostocraft.botstudio.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.util.List;

public class RuntimeKeepAliveService extends Service {
    public static final String ACTION_START = "com.prostocraft.botstudio.mobile.action.START_RUNTIME_SERVICE";
    public static final String ACTION_STOP = "com.prostocraft.botstudio.mobile.action.STOP_RUNTIME_SERVICE";
    public static final String ACTION_UPDATE_PROGRESS = "com.prostocraft.botstudio.mobile.action.UPDATE_PROGRESS";
    public static final String ACTION_UPDATE_READY = "com.prostocraft.botstudio.mobile.action.UPDATE_READY";
    public static final String ACTION_UPDATE_INSTALLING = "com.prostocraft.botstudio.mobile.action.UPDATE_INSTALLING";
    public static final String ACTION_INSTALL_APK = "com.prostocraft.botstudio.mobile.action.INSTALL_APK";
    public static final String ACTION_UPDATE_CLEAR = "com.prostocraft.botstudio.mobile.action.UPDATE_CLEAR";

    public static final String EXTRA_PERCENT = "percent";
    public static final String EXTRA_RECEIVED_BYTES = "receivedBytes";
    public static final String EXTRA_TOTAL_BYTES = "totalBytes";
    public static final String EXTRA_FILE_NAME = "fileName";
    public static final String EXTRA_APK_PATH = "apkPath";

    private static final String CHANNEL_ID = "prostocraft_runtime_keepalive";
    private static final String CHANNEL_NAME = "ProstoCraft Runtime";
    private static final String CHANNEL_DESCRIPTION = "Keeps the mobile runtime and update tasks active in the background.";
    private static final int NOTIFICATION_ID = 41027;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;

        if (ACTION_STOP.equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        ensureNotificationChannel();

        if (ACTION_UPDATE_PROGRESS.equals(action)) {
            startInForeground(buildUpdateProgressNotification(intent));
            return START_STICKY;
        }

        if (ACTION_UPDATE_READY.equals(action)) {
            startInForeground(buildUpdateReadyNotification(intent));
            return START_STICKY;
        }

        if (ACTION_UPDATE_INSTALLING.equals(action)) {
            startInForeground(buildUpdateInstallingNotification(intent));
            return START_STICKY;
        }

        if (ACTION_INSTALL_APK.equals(action)) {
            startInForeground(buildUpdateInstallingNotification(intent));
            openApkInstallerOrSettings(intent != null ? intent.getStringExtra(EXTRA_APK_PATH) : null);
            return START_STICKY;
        }

        if (ACTION_UPDATE_CLEAR.equals(action)) {
            startInForeground(buildRuntimeNotification());
            return START_STICKY;
        }

        startInForeground(buildRuntimeNotification());
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        ensureNotificationChannel();
        startInForeground(buildRuntimeNotification());
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopForeground(true);
        super.onDestroy();
    }

    private void startInForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            return;
        }

        startForeground(NOTIFICATION_ID, notification);
    }

    private Notification buildRuntimeNotification() {
        NotificationCompat.Builder builder = createBaseBuilder()
            .setContentTitle("ProstoCraft runtime работает")
            .setContentText("Боты продолжают работать в фоне.")
            .setProgress(0, 0, false)
            .setOngoing(true);

        PendingIntent contentIntent = createLaunchPendingIntent();
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        return builder.build();
    }

    private Notification buildUpdateProgressNotification(Intent intent) {
        int percent = clampPercent(intent != null ? intent.getIntExtra(EXTRA_PERCENT, 0) : 0);
        long receivedBytes = intent != null ? intent.getLongExtra(EXTRA_RECEIVED_BYTES, 0L) : 0L;
        long totalBytes = intent != null ? intent.getLongExtra(EXTRA_TOTAL_BYTES, 0L) : 0L;
        String fileName = intent != null ? intent.getStringExtra(EXTRA_FILE_NAME) : null;

        NotificationCompat.Builder builder = createBaseBuilder()
            .setContentTitle("Скачивание обновления")
            .setContentText(percent + "% • " + formatBytes(receivedBytes) + " / " + formatBytes(totalBytes))
            .setSubText(fileName != null ? fileName : "APK")
            .setProgress(100, percent, totalBytes <= 0)
            .setOngoing(true);

        PendingIntent contentIntent = createLaunchPendingIntent();
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        return builder.build();
    }

    private Notification buildUpdateReadyNotification(Intent intent) {
        String apkPath = intent != null ? intent.getStringExtra(EXTRA_APK_PATH) : null;
        String fileName = intent != null ? intent.getStringExtra(EXTRA_FILE_NAME) : null;

        NotificationCompat.Builder builder = createBaseBuilder()
            .setContentTitle("Обновление готово")
            .setContentText("Нажмите, чтобы открыть установку APK.")
            .setSubText(fileName != null ? fileName : "APK")
            .setProgress(0, 0, false)
            .setOngoing(true);

        PendingIntent installIntent = createInstallPendingIntent(apkPath);
        if (installIntent != null) {
            builder.setContentIntent(installIntent)
                .addAction(R.mipmap.ic_launcher, "Установить", installIntent);
        } else {
            PendingIntent launchIntent = createLaunchPendingIntent();
            if (launchIntent != null) {
                builder.setContentIntent(launchIntent);
            }
        }

        return builder.build();
    }

    private Notification buildUpdateInstallingNotification(Intent intent) {
        NotificationCompat.Builder builder = createBaseBuilder()
            .setContentTitle("Установка обновления")
            .setContentText("Подтвердите установку в системном окне Android.")
            .setProgress(0, 0, true)
            .setOngoing(true);

        PendingIntent contentIntent = createLaunchPendingIntent();
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        return builder.build();
    }

    private Notification buildInstallPermissionNotification(String apkPath) {
        NotificationCompat.Builder builder = createBaseBuilder()
            .setContentTitle("Нужно разрешение Android")
            .setContentText("Включите установку из этого источника, затем нажмите Установить.")
            .setProgress(0, 0, false)
            .setOngoing(true);

        PendingIntent installIntent = createInstallPendingIntent(apkPath);
        if (installIntent != null) {
            builder.setContentIntent(installIntent)
                .addAction(R.mipmap.ic_launcher, "Установить", installIntent);
        } else {
            PendingIntent launchIntent = createLaunchPendingIntent();
            if (launchIntent != null) {
                builder.setContentIntent(launchIntent);
            }
        }

        return builder.build();
    }

    private NotificationCompat.Builder createBaseBuilder() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOnlyAlertOnce(true)
            .setShowWhen(false);
    }

    private PendingIntent createLaunchPendingIntent() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            return null;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, launchIntent, pendingIntentFlags());
    }

    private PendingIntent createInstallPendingIntent(String apkPath) {
        try {
            if (apkPath == null || apkPath.length() == 0) {
                return null;
            }

            File apkFile = new File(apkPath);
            if (!apkFile.exists()) {
                return null;
            }

            Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".cdv.core.file.provider",
                apkFile
            );
            Intent installIntent = new Intent(this, RuntimeKeepAliveService.class);
            installIntent.setAction(ACTION_INSTALL_APK);
            installIntent.putExtra(EXTRA_APK_PATH, apkPath);
            return PendingIntent.getService(this, 1, installIntent, pendingIntentFlags());
        } catch (Throwable ignored) {
            return null;
        }
    }

    private boolean canInstallFromThisSource() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }

        return getPackageManager().canRequestPackageInstalls();
    }

    private void openApkInstallerOrSettings(String apkPath) {
        try {
            if (apkPath == null || apkPath.length() == 0) {
                return;
            }

            File apkFile = new File(apkPath);
            if (!apkFile.exists()) {
                return;
            }

            if (!canInstallFromThisSource()) {
                startInForeground(buildInstallPermissionNotification(apkPath));
                openInstallUnknownAppsSettings();
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".cdv.core.file.provider",
                apkFile
            );
            Intent installIntent = createApkInstallIntent(apkUri);
            grantPackageInstallerReadAccess(installIntent, apkUri);
            startActivity(installIntent);
        } catch (Throwable ignored) {}
    }

    private Intent createApkInstallIntent(Uri apkUri) {
        Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        installIntent.setData(apkUri);
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        installIntent.putExtra(Intent.EXTRA_RETURN_RESULT, false);
        return installIntent;
    }

    private void grantPackageInstallerReadAccess(Intent installIntent, Uri apkUri) {
        try {
            List<ResolveInfo> installers = getPackageManager().queryIntentActivities(
                installIntent,
                PackageManager.MATCH_DEFAULT_ONLY
            );

            for (ResolveInfo installer : installers) {
                if (installer.activityInfo == null || installer.activityInfo.packageName == null) {
                    continue;
                }

                grantUriPermission(
                    installer.activityInfo.packageName,
                    apkUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            }
        } catch (Throwable ignored) {}
    }

    private void openInstallUnknownAppsSettings() {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(
                    android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())
                );
            } else {
                intent = new Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Throwable ignored) {}
    }

    private int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    private int clampPercent(int percent) {
        if (percent < 0) return 0;
        if (percent > 100) return 100;
        return percent;
    }

    private String formatBytes(long bytes) {
        if (bytes <= 0) return "0 MB";
        double value = bytes / 1024.0 / 1024.0;
        return String.format(java.util.Locale.US, "%.1f MB", value);
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel existingChannel = manager.getNotificationChannel(CHANNEL_ID);
        if (existingChannel != null) {
            if (existingChannel.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT) {
                return;
            }

            manager.deleteNotificationChannel(CHANNEL_ID);
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}
`)
}

function ensureJavaImport(source, importLine) {
  return source.includes(importLine)
    ? source
    : source.replace(/(import android\.[\s\S]*?;\r?\n)/, `$1${importLine}\n`)
}

function patchNodeJsMobilePlugin() {
  const nodeJsPath = path.join(
    gradleProjectRoot,
    'app',
    'src',
    'main',
    'java',
    'com',
    'janeasystems',
    'cdvnodejsmobile',
    'NodeJS.java'
  )

  if (!fs.existsSync(nodeJsPath)) return

  let source = fs.readFileSync(nodeJsPath, 'utf8')
  source = ensureJavaImport(source, 'import android.net.Uri;')
  source = ensureJavaImport(source, 'import android.provider.Settings;')
  source = ensureJavaImport(source, 'import android.content.pm.PackageManager;')
  source = ensureJavaImport(source, 'import android.content.pm.ResolveInfo;')
  source = ensureJavaImport(source, 'import androidx.core.content.FileProvider;')
  source = ensureJavaImport(source, 'import java.util.List;')

  const oldMessageBlock = `    if (msg.startsWith("runtime-keepalive|")) {
      setRuntimeKeepAlive(msg.endsWith("|1"));
    }
`
  const newMessageBlock = `    if (msg.startsWith("runtime-keepalive|")) {
      setRuntimeKeepAlive(msg.endsWith("|1"));
      return;
    }

    if (msg.startsWith("install-apk|")) {
      installDownloadedApk(msg.substring("install-apk|".length()));
      return;
    }

    if (msg.startsWith("update-download-progress|")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.startsWith("update-ready|")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.startsWith("update-installing|")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.equals("update-clear")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.equals("open-install-settings")) {
      openInstallUnknownAppsSettings();
    }
`

  if (source.includes(oldMessageBlock) && !source.includes('installDownloadedApk(')) {
    source = source.replace(oldMessageBlock, newMessageBlock)
  } else if (source.includes(oldMessageBlock) && !source.includes('msg.startsWith("install-apk|")')) {
    source = source.replace(oldMessageBlock, newMessageBlock)
  }

  if (!source.includes('msg.startsWith("update-download-progress|")')) {
    source = source.replace(
      `    if (msg.equals("open-install-settings")) {
      openInstallUnknownAppsSettings();
    }
`,
      `    if (msg.startsWith("update-download-progress|")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.startsWith("update-ready|")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.startsWith("update-installing|")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.equals("update-clear")) {
      sendUpdateServiceCommand(msg);
      return;
    }

    if (msg.equals("open-install-settings")) {
      openInstallUnknownAppsSettings();
    }
`
    )
  }

  if (!source.includes('private static void installDownloadedApk')) {
    const installMethods = `
  private static void installDownloadedApk(String apkPath) {
    try {
      if (context == null || activity == null) return;

      File apkFile = new File(apkPath);
      if (!apkFile.exists()) {
        Log.w(LOGTAG, "Downloaded APK does not exist: " + apkPath);
        return;
      }

      if (!canInstallFromThisSource()) {
        sendUpdateServiceCommand(
          "update-ready|" + Uri.encode(apkPath) + "|" + Uri.encode(apkFile.getName())
        );
        openInstallUnknownAppsSettings();
        return;
      }

      Uri apkUri = FileProvider.getUriForFile(
        context,
        context.getPackageName() + ".cdv.core.file.provider",
        apkFile
      );
      Intent intent = createApkInstallIntent(apkUri);
      grantPackageInstallerReadAccess(intent, apkUri);
      activity.startActivity(intent);
    } catch (Throwable throwable) {
      Log.w(LOGTAG, "Unable to open APK installer", throwable);
      openInstallUnknownAppsSettings();
    }
  }

  private static boolean canInstallFromThisSource() {
    if (context == null) return false;
    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return true;

    try {
      return context.getPackageManager().canRequestPackageInstalls();
    } catch (Throwable throwable) {
      return false;
    }
  }

  private static void openInstallUnknownAppsSettings() {
    try {
      if (context == null || activity == null) return;

      Intent intent;
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        intent = new Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:" + context.getPackageName())
        );
      } else {
        intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity.startActivity(intent);
    } catch (Throwable throwable) {
      Log.w(LOGTAG, "Unable to open install settings", throwable);
    }
  }

`
    source = source.replace(
      /(\s+private static synchronized void setRuntimeKeepAlive\(boolean enabled\) \{)/,
      `${installMethods}$1`
    )
  }

  const oldInstallIntentBlock = `      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      activity.startActivity(intent);
`
  const newInstallIntentBlock = `      Intent intent = createApkInstallIntent(apkUri);
      grantPackageInstallerReadAccess(intent, apkUri);
      activity.startActivity(intent);
`

  if (source.includes(oldInstallIntentBlock)) {
    source = source.replace(oldInstallIntentBlock, newInstallIntentBlock)
  }

  if (!source.includes('private static Intent createApkInstallIntent')) {
    const installIntentMethods = `
  private static Intent createApkInstallIntent(Uri apkUri) {
    Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
    intent.setData(apkUri);
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
    intent.putExtra(Intent.EXTRA_RETURN_RESULT, false);
    return intent;
  }

  private static void grantPackageInstallerReadAccess(Intent intent, Uri apkUri) {
    try {
      if (context == null) return;

      List<ResolveInfo> installers = context.getPackageManager().queryIntentActivities(
        intent,
        PackageManager.MATCH_DEFAULT_ONLY
      );

      for (ResolveInfo installer : installers) {
        if (installer.activityInfo == null || installer.activityInfo.packageName == null) {
          continue;
        }

        context.grantUriPermission(
          installer.activityInfo.packageName,
          apkUri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION
        );
      }
    } catch (Throwable throwable) {
      Log.w(LOGTAG, "Unable to grant APK read permission", throwable);
    }
  }

`
    source = source.replace(
      /(\s+private static void installDownloadedApk\(String apkPath\) \{)/,
      `${installIntentMethods}$1`
    )
  }

  if (source.includes('private static void installDownloadedApk') && !source.includes('canInstallFromThisSource()')) {
    source = source.replace(
      `      Uri apkUri = FileProvider.getUriForFile(
`,
      `      if (!canInstallFromThisSource()) {
        sendUpdateServiceCommand(
          "update-ready|" + Uri.encode(apkPath) + "|" + Uri.encode(apkFile.getName())
        );
        openInstallUnknownAppsSettings();
        return;
      }

      Uri apkUri = FileProvider.getUriForFile(
`
    )
  }

  if (!source.includes('private static boolean canInstallFromThisSource()')) {
    source = source.replace(
      `  private static void openInstallUnknownAppsSettings() {
`,
      `  private static boolean canInstallFromThisSource() {
    if (context == null) return false;
    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return true;

    try {
      return context.getPackageManager().canRequestPackageInstalls();
    } catch (Throwable throwable) {
      return false;
    }
  }

  private static void openInstallUnknownAppsSettings() {
`
    )
  }

  if (!source.includes('private static void sendUpdateServiceCommand')) {
    const updateMethods = `
  private static String decodeUpdateField(String value) {
    try {
      return Uri.decode(value == null ? "" : value);
    } catch (Throwable throwable) {
      return value == null ? "" : value;
    }
  }

  private static int parseIntField(String value, int fallback) {
    try {
      return Integer.parseInt(value);
    } catch (Throwable throwable) {
      return fallback;
    }
  }

  private static long parseLongField(String value, long fallback) {
    try {
      return Long.parseLong(value);
    } catch (Throwable throwable) {
      return fallback;
    }
  }

  private static void sendUpdateServiceCommand(String msg) {
    try {
      if (context == null) return;

      Intent serviceIntent = new Intent();
      serviceIntent.setClassName(context, context.getPackageName() + ".RuntimeKeepAliveService");

      if (msg.startsWith("update-download-progress|")) {
        String[] parts = msg.split("\\\\|", 5);
        serviceIntent.setAction("com.prostocraft.botstudio.mobile.action.UPDATE_PROGRESS");
        serviceIntent.putExtra("percent", parts.length > 1 ? parseIntField(parts[1], 0) : 0);
        serviceIntent.putExtra("receivedBytes", parts.length > 2 ? parseLongField(parts[2], 0L) : 0L);
        serviceIntent.putExtra("totalBytes", parts.length > 3 ? parseLongField(parts[3], 0L) : 0L);
        serviceIntent.putExtra("fileName", parts.length > 4 ? decodeUpdateField(parts[4]) : "update.apk");
      } else if (msg.startsWith("update-ready|")) {
        String[] parts = msg.split("\\\\|", 3);
        serviceIntent.setAction("com.prostocraft.botstudio.mobile.action.UPDATE_READY");
        serviceIntent.putExtra("apkPath", parts.length > 1 ? decodeUpdateField(parts[1]) : "");
        serviceIntent.putExtra("fileName", parts.length > 2 ? decodeUpdateField(parts[2]) : "update.apk");
      } else if (msg.startsWith("update-installing|")) {
        String[] parts = msg.split("\\\\|", 2);
        serviceIntent.setAction("com.prostocraft.botstudio.mobile.action.UPDATE_INSTALLING");
        serviceIntent.putExtra("apkPath", parts.length > 1 ? decodeUpdateField(parts[1]) : "");
      } else if (msg.equals("update-clear")) {
        serviceIntent.setAction("com.prostocraft.botstudio.mobile.action.UPDATE_CLEAR");
      } else {
        return;
      }

      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent);
      } else {
        context.startService(serviceIntent);
      }
    } catch (Throwable throwable) {
      Log.w(LOGTAG, "Unable to update Android notification", throwable);
    }
  }

`
    source = source.replace(
      /(\s+private static void installDownloadedApk\(String apkPath\) \{)/,
      `${updateMethods}$1`
    )
  }

  writeFileIfChanged(nodeJsPath, source)
}

function main() {
  ensurePathExists(cordovaRoot, 'Cordova project')
  if (path.isAbsolute(gradleCommand)) {
    ensurePathExists(gradleCommand, 'Gradle command')
  }

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
  ensureCordovaAndroidManifest()
  ensureCordovaAndroidSources()
  patchNodeJsMobilePlugin()
  stopGradle(env)
  cleanBuildDirectories()

  run(
    gradleCommand,
    ['-p', gradleProjectRoot, 'cdvBuildRelease', '--console=plain'],
    {
      cwd: projectRoot,
      env
    }
  )

  const releaseOutputDir = path.join(
    gradleProjectRoot,
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
    env
  )

  cleanOutputApks()
  fs.copyFileSync(sourceApk, defaultOutputApk)

  console.log(`Functional Android APK copied to ${defaultOutputApk}`)
}

main()

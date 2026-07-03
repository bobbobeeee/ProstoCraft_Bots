// @ts-check

const fs = require('fs')
const path = require('path')
const { writeFileIfChanged } = require('./fs-utils')
const { ensureJavaImport } = require('./versioning')

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @param {Pick<AndroidReleaseContext, 'gradleProjectRoot'>} context
 */
function patchNodeJsMobilePlugin(context) {
  const nodeJsPath = path.join(
    context.gradleProjectRoot,
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

  const source = patchNodeJsMobilePluginSource(fs.readFileSync(nodeJsPath, 'utf8'))
  writeFileIfChanged(nodeJsPath, source)
}

/**
 * @param {string} inputSource
 * @returns {string}
 */
function patchNodeJsMobilePluginSource(inputSource) {
  let source = inputSource
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
  } else if (
    source.includes(oldMessageBlock) &&
    !source.includes('msg.startsWith("install-apk|")')
  ) {
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

  if (
    source.includes('private static void installDownloadedApk') &&
    !source.includes('canInstallFromThisSource()')
  ) {
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

  return source
}

module.exports = {
  patchNodeJsMobilePlugin,
  patchNodeJsMobilePluginSource
}

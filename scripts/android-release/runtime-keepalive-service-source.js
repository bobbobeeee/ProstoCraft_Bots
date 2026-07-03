// @ts-check

/**
 * @returns {string}
 */
function getRuntimeKeepAliveServiceSource() {
  return `package com.prostocraft.botstudio.mobile;

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
`
}

module.exports = {
  getRuntimeKeepAliveServiceSource
}

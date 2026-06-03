package com.prostocraft.botstudio;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class BotStudioBridge {
  private static final String CONFIG_FILE_NAME = "config.json";
  private static final String SETTINGS_FILE_NAME = "desktop-settings.json";

  private final Context context;
  private final WebView webView;
  private JSONObject runtimeState;

  public BotStudioBridge(Context context, WebView webView) {
    this.context = context.getApplicationContext();
    this.webView = webView;
    this.runtimeState = createEmptyRuntime();
    appendLog(
      "warning",
      "ANDROID",
      "Android-сборка хранит конфиг локально и показывает адаптивный UI, но не запускает встроенный Node.js / mineflayer runtime."
    );
  }

  @JavascriptInterface
  public String getBootstrap() {
    try {
      JSONObject payload = new JSONObject();
      payload.put("platform", "android");
      payload.put("capabilities", createCapabilities());
      payload.put("config", readConfig());
      payload.put("desktopSettings", readDesktopSettings());
      payload.put("runtime", cloneJson(runtimeState));
      return payload.toString();
    } catch (Exception error) {
      return "{}";
    }
  }

  @JavascriptInterface
  public String saveDesktopSettings(String rawSettings) {
    try {
      JSONObject settings = rawSettings == null || rawSettings.isEmpty()
        ? createDefaultDesktopSettings()
        : new JSONObject(rawSettings);
      writeJson(getSettingsFile(), settings);
      return settings.toString();
    } catch (Exception error) {
      return createDefaultDesktopSettings().toString();
    }
  }

  @JavascriptInterface
  public String saveConfig(String rawConfig) {
    try {
      JSONObject config = new JSONObject(rawConfig);
      writeJson(getConfigFile(), config);
      appendLog("success", "ANDROID", "Конфиг сохранен во внутреннее хранилище Android.");
      notifyRuntimeState();

      JSONObject payload = new JSONObject();
      payload.put("config", config);
      payload.put("runtime", cloneJson(runtimeState));
      return payload.toString();
    } catch (Exception error) {
      appendLog("error", "ANDROID", "Не удалось сохранить конфиг: " + error.getMessage());
      notifyRuntimeState();
      return "{}";
    }
  }

  @JavascriptInterface
  public String resetConfig() {
    try {
      JSONObject config = readDefaultConfig();
      writeJson(getConfigFile(), config);
      appendLog("warning", "ANDROID", "Конфиг сброшен к шаблону Android-сборки.");
      notifyRuntimeState();

      JSONObject payload = new JSONObject();
      payload.put("config", config);
      payload.put("runtime", cloneJson(runtimeState));
      return payload.toString();
    } catch (Exception error) {
      return "{}";
    }
  }

  @JavascriptInterface
  public String importConfig() {
    return canceledResult("not_supported");
  }

  @JavascriptInterface
  public String exportConfig(String rawConfig) {
    return canceledResult("not_supported");
  }

  @JavascriptInterface
  public String startRuntime() {
    appendLog("warning", "ANDROID", "Локальный запуск runtime недоступен в APK без отдельного Node.js слоя.");
    notifyRuntimeState();
    return cloneJson(runtimeState).toString();
  }

  @JavascriptInterface
  public String stopRuntime() {
    notifyRuntimeState();
    return cloneJson(runtimeState).toString();
  }

  @JavascriptInterface
  public String restartRuntime() {
    appendLog("warning", "ANDROID", "Перезапуск runtime доступен только в desktop-сборке.");
    notifyRuntimeState();
    return cloneJson(runtimeState).toString();
  }

  @JavascriptInterface
  public String setPaused(String nextPaused) {
    try {
      runtimeState.put("isPaused", Boolean.parseBoolean(nextPaused));
      JSONObject snapshot = runtimeState.optJSONObject("snapshot");
      if (snapshot != null) {
        snapshot.put("paused", Boolean.parseBoolean(nextPaused));
      }
    } catch (JSONException ignored) {
    }

    notifyRuntimeState();
    return cloneJson(runtimeState).toString();
  }

  @JavascriptInterface
  public String openRuntimeDir() {
    return cloneJson(runtimeState).toString();
  }

  private JSONObject createCapabilities() throws JSONException {
    JSONObject capabilities = new JSONObject();
    capabilities.put("runtimeControl", false);
    capabilities.put("runtimeStreaming", false);
    capabilities.put("fileImport", false);
    capabilities.put("fileExport", false);
    capabilities.put("openRuntimeDir", false);
    return capabilities;
  }

  private JSONObject createDefaultDesktopSettings() {
    try {
      JSONObject settings = new JSONObject();
      settings.put("launchOnStartup", false);
      settings.put("startMinimized", false);
      settings.put("minimizeToTray", false);
      settings.put("closeToTray", false);
      return settings;
    } catch (JSONException error) {
      return new JSONObject();
    }
  }

  private JSONObject createEmptyRuntime() {
    try {
      JSONObject runtime = new JSONObject();
      runtime.put("status", "stopped");
      runtime.put("isPaused", false);
      runtime.put("resources", new JSONObject()
        .put("cpuPercent", 0)
        .put("memoryMb", 0));
      runtime.put("snapshot", new JSONObject()
        .put("totalBlocks", 0)
        .put("uptimeMs", 0)
        .put("activeBots", 0)
        .put("totalBots", 0)
        .put("paused", false)
        .put("currentRatePerMinute", 0)
        .put("currentRatePerSecond", 0)
        .put("bots", new JSONObject()));
      runtime.put("logs", new JSONArray());
      runtime.put("configPath", getConfigFile().getAbsolutePath());
      runtime.put("logPath", context.getFilesDir().getAbsolutePath() + File.separator + "android-runtime.log");
      runtime.put("runtimeDir", context.getFilesDir().getAbsolutePath());
      return runtime;
    } catch (JSONException error) {
      return new JSONObject();
    }
  }

  private JSONObject readConfig() throws IOException, JSONException {
    File configFile = getConfigFile();
    if (!configFile.exists()) {
      JSONObject defaultConfig = readDefaultConfig();
      writeJson(configFile, defaultConfig);
      return defaultConfig;
    }
    return new JSONObject(readFile(configFile));
  }

  private JSONObject readDesktopSettings() throws IOException, JSONException {
    File settingsFile = getSettingsFile();
    if (!settingsFile.exists()) {
      JSONObject defaults = createDefaultDesktopSettings();
      writeJson(settingsFile, defaults);
      return defaults;
    }
    return new JSONObject(readFile(settingsFile));
  }

  private JSONObject readDefaultConfig() throws IOException, JSONException {
    try (InputStream inputStream = context.getAssets().open("default-config.json")) {
      return new JSONObject(readStream(inputStream));
    }
  }

  private File getConfigFile() {
    return new File(context.getFilesDir(), CONFIG_FILE_NAME);
  }

  private File getSettingsFile() {
    return new File(context.getFilesDir(), SETTINGS_FILE_NAME);
  }

  private void writeJson(File targetFile, JSONObject value) throws IOException {
    File parent = targetFile.getParentFile();
    if (parent != null && !parent.exists()) {
      parent.mkdirs();
    }

    try (FileOutputStream outputStream = new FileOutputStream(targetFile, false)) {
      outputStream.write(value.toString().getBytes(StandardCharsets.UTF_8));
    }
  }

  private String readFile(File file) throws IOException {
    try (FileInputStream inputStream = new FileInputStream(file)) {
      return readStream(inputStream);
    }
  }

  private String readStream(InputStream inputStream) throws IOException {
    StringBuilder builder = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        builder.append(line).append('\n');
      }
    }
    return builder.toString();
  }

  private synchronized void appendLog(String level, String botName, String message) {
    try {
      JSONArray currentLogs = runtimeState.optJSONArray("logs");
      if (currentLogs == null) {
        currentLogs = new JSONArray();
      }

      JSONArray nextLogs = new JSONArray();
      nextLogs.put(new JSONObject()
        .put("level", level)
        .put("botName", botName)
        .put("message", message)
        .put("rawMessage", message)
        .put("time", java.text.DateFormat.getTimeInstance().format(new java.util.Date()))
        .put("timestamp", java.time.Instant.now().toString()));

      for (int index = 0; index < currentLogs.length() && index < 139; index += 1) {
        nextLogs.put(currentLogs.get(index));
      }

      runtimeState.put("logs", nextLogs);
    } catch (JSONException ignored) {
    }
  }

  private void notifyRuntimeState() {
    final String runtimeJson = cloneJson(runtimeState).toString();
    webView.post(() -> webView.evaluateJavascript(
      "window.__BOT_STUDIO_PUSH_RUNTIME && window.__BOT_STUDIO_PUSH_RUNTIME(" + JSONObject.quote(runtimeJson) + ");",
      null
    ));
  }

  private JSONObject cloneJson(JSONObject source) {
    try {
      return new JSONObject(source.toString());
    } catch (JSONException error) {
      return new JSONObject();
    }
  }

  private String canceledResult(String reason) {
    try {
      JSONObject payload = new JSONObject();
      payload.put("canceled", true);
      payload.put("reason", reason);
      return payload.toString();
    } catch (JSONException error) {
      return "{\"canceled\":true}";
    }
  }
}

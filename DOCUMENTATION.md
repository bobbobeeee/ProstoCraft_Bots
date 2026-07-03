# ProstoCraft Bot Studio — Полная документация проекта

## Содержание

1. [Обзор проекта](#1-обзор-проекта)
2. [Файловая структура](#2-файловая-структура)
3. [Зависимости](#3-зависимости)
4. [Скрипты запуска и сборки](#4-скрипты-запуска-и-сборки)
5. [Система конфигурации](#5-система-конфигурации)
6. [Жизненный цикл бота](#6-жизненный-цикл-бота)
7. [Система майнинга](#7-система-майнинга)
8. [Анти-бот меры](#8-анти-бот-меры)
9. [Десктопное приложение (Electron)](#9-десктопное-приложение-electron)
10. [Системы событий и диагностики](#10-системы-событий-и-диагностики)
11. [Управление процессами](#11-управление-процессами)
12. [Ключевые функции и экспорты](#12-ключевые-функции-и-экспорты)

---

## 1. Обзор проекта

**ProstoCraft Bot Studio** — автоматизированный майнинг-бот для Minecraft сервера ProstoCraft. Бот подключается к серверу, навигирует по меню, заходит на подсерверы и автоматически добывает блоки.

- **Язык:** JavaScript (Node.js)
- **Версия:** 3.0.1
- **Пакет:** `autominerv2`
- **Minecraft версия:** 1.16.5
- **Библиотека:** mineflayer ^4.34.0
- **Платформы:** Windows (Electron), Android (Cordova), CLI

---

## 2. Файловая структура

### Корневые файлы

| Файл | Строк | Назначение |
|------|-------|------------|
| `bot.js` | 702 | Главная точка входа. Создаёт runtime manager, UI, логгер. Управляет жизненным циклом процесса. |
| `bot-filter.js` | 130 | Классифицирует сообщения сервера для детекции бот-фильтра (chat captcha / fall-wait scanner). |
| `config-migrations.js` | 145 | Миграция устаревших конфигов. Трансформирует старые значения в новые. |
| `config.json` | 169 | Файл конфигурации по умолчанию. |
| `limbo-filter.js` | 162 | Симуляция физики падения Vanilla Minecraft для прохождения анти-бот проверок. |
| `monitoring.js` | 44 | Вычисление скорости майнинга и форматирование. |
| `package.json` | 141 | Метаданные проекта, зависимости, скрипты, конфигурация сборки. |
| `reconnect-policy.js` | 271 | Движок принятия решений о переподключении на основе типов событий. |
| `stability-center.js` | 258 | Машина состояний здоровья бота, статистика скорости, детекция зависаний. |
| `update-service.js` | 495 | Проверка GitHub релизов, SHA256 верификация, скачивание обновлений. |
| `eslint.config.js` | 1 | Конфигурация ESLint. |

### runtime-core/ — Ядро бота

| Файл | Строк | Назначение |
|------|-------|------------|
| `bot-session.js` | ~4587 | **Главная логика сессии**: подключение, навигация по меню, цикл майнинга, анти-бот, переподключение. |
| `config-schema.js` | 424 | Читает config.json, применяет миграции, нормализует настройки в плоский объект. |
| `runtime-manager.js` | 565 | Управляет всеми экземплярами ботов: старт с задержкой, ротация, пауза, глобальные ошибки. |
| `runtime-state.js` | 280 | Центральное состояние мониторинга: скорость, здоровье, таймлайн, снимки. |
| `runtime-logger.js` | 196 | Файловое логирование с ротацией при достижении макс. размера. |
| `runtime-formatters.js` | 216 | Очистка текста, нормализация/суммирование диагностических значений. |
| `runtime-ui.js` | 137 | Отрисовка терминального UI через blessed/blessed-contrib. |
| `packet-break-tracker.js` | 166 | Трекинг бюджета брейк-пакетов (в секунду и burst), кулдауны целей, ожидание подтверждений. |
| `packet-governor.js` | 26 | Нормализация лимитов брейк-пакетов. |
| `lifecycle-state.js` | 74 | Машина состояний жизненного цикла: connecting, botfilter, joining, mining, recovering, waiting-reconnect, held. |
| `event-timeline.js` | 91 | Ограниченный таймлайн событий с дедупликацией. |
| `captcha-evidence.js` | 95 | Детектирует chat captcha и fall-wait паттерны в сообщениях сервера. |
| `client-packets.js` | 67 | VarInt кодирование, Minecraft строки, пакеты идентификации клиента, подтверждение телепорта. |
| `minecraft-text.js` | 149 | Преобразует Minecraft JSON чат-компоненты в обычный текст. Классифицирует окна меню. |
| `position-guard.js` | 36 | Форматирование координат, проверка рабочей зоны, проверка дальности. |
| `process-guard.js` | 161 | Фильтрация шума консоли, трекинг таймеров/интервалов, обработчики сигналов процесса. |

### desktop/ — Electron приложение

| Файл | Строк | Назначение |
|------|-------|------------|
| `main.js` | 3 | Точка входа Electron. |
| `preload.js` | 28 | Context bridge, экспортирует `window.botStudio`. |
| `main/app-bootstrap.js` | 181 | Сборка всех подсистем десктопа (конфиг, runtime, трей, обновления, окно). |
| `main/constants.js` | 36 | Константы приложения: версия, источник обновлений, пороги. |
| `main/paths.js` | 85 | Разрешение всех путей файловой системы. |
| `main/config-store.js` | 72 | Чтение/запись/сброс config.json с миграциями. |
| `main/desktop-settings.js` | 59 | Управление настройками десктопа (автозапуск, поведение трея). |
| `main/runtime-controller.js` | 438 | Запуск дочернего процесса bot.js, парсинг JSON событий из stdout. |
| `main/ipc-handlers.js` | 91 | Реестр IPC обработчиков для коммуникации renderer → main. |
| `main/ipc-security.js` | 89 | Белый список IPC каналов, валидаторы типов payload. |
| `main/json-store.js` | 16 | Атомарное чтение/запись JSON файлов. |
| `main/dialog-actions.js` | 52 | Импорт/экспорт конфига через нативные диалоги. |
| `main/tray-controller.js` | 98 | Иконка в системном трее и контекстное меню. |
| `main/update-controller.js` | 200 | Проверка обновлений, скачивание инсталлятора, запуск установки. |
| `main/window-controller.js` | 149 | Создание BrowserWindow, навигационные гварды. |
| `renderer/bridge.js` | ~735 | Абстракция слоя bridge для рендерера. |
| `renderer/app-settings-schema.js` | 272 | Схема настроек UI: секции, поля, лейблы. |
| `renderer/app-settings-timing.js` | — | Timing-секция настроек. |

### Сценарии сборки

| Путь | Назначение |
|------|------------|
| `scripts/after-pack-icons.js` | Хук после упаковки для иконок. |
| `scripts/build-cordova-android-release.js` | Сборка Cordova Android релиза. |
| `scripts/sync-android-assets.js` | Синхронизация веб-ресурсов в Android проект. |
| `scripts/sync-cordova-app.js` | Синхронизация веб-ресурсов в Cordova проект. |
| `scripts/run-local-bot-test.js` | Локальный тест бота. |
| `scripts/android-release/*` | Модули пайплайна Android релиза. |

---

## 3. Зависимости

### Runtime

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `mineflayer` | ^4.34.0 | Minecraft бот библиотека. Создание бота, протокол, движение, копание, инвентарь. |
| `vec3` | ^0.1.10 | 3D векторная математика. |
| `blessed` | ^0.1.81 | Терминальный UI (лог, инфо, таблица ботов). |
| `blessed-contrib` | ^4.11.0 | Grid-раскладка для blessed виджетов. |
| `mineflayer-physics` | ^0.0.9 | Плагин физики (опционально). |

### Dev

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `electron` | ^37.2.1 | Десктопный фреймворк. |
| `electron-builder` | ^26.0.12 | Сборка дистрибутивов (NSIS). |
| `eslint` | ^10.5.0 | Линтинг. |
| `prettier` | ^3.8.4 | Форматирование. |
| `typescript` | ^6.0.3 | Проверка типов через JSDoc. |
| `cordova` | ^12.0.0 | Сборка мобильного приложения. |

---

## 4. Скрипты запуска и сборки

| Скрипт | Команда | Описание |
|--------|---------|----------|
| `start` | `electron .` | Запуск десктопного приложения. |
| `start:cli` | `node bot.js` | Запуск из CLI (головной режим). |
| `start:headless` | `node bot.js --headless` | Принудительный headless режим. |
| `test:local-bot` | `node scripts/run-local-bot-test.js` | Локальный тест бота. |
| `check` | `node --check *.js runtime-core/*.js` | Проверка синтаксиса всех файлов. |
| `typecheck` | `tsc -p tsconfig.checkjs.json` | Проверка типов TypeScript. |
| `lint` | `eslint . --cache` | Запуск линтера. |
| `format` | `prettier . --write` | Форматирование кода. |
| `dist:win` | `electron-builder --win nsis` | Сборка Windows установщика. |

**CLI аргументы:**
- `--headless` — отключает blessed UI, выводит JSON события на stdout
- `--emit-json` — включает вывод `@@BOT_EVENT@@` в stdout
- `--config=<path>` — указать путь к config.json

---

## 5. Система конфигурации

### 5.1 Структура config.json

```json
{
  "server":     { "host", "port", "version", "password" },
  "timing":     { /* 80+ параметров таймингов */ },
  "antibot":    { /* 14 параметров */ },
  "menu":       { "slot1", "slot2", "hotbarSlot", "toolSwitchSlots", "toolSwitchThreshold" },
  "globalRestart": { "errorThreshold", "timeWindowMs", "stopOnNoInternet", "noInternetThreshold", "memoryLimitMB" },
  "position":   { "checkInterval", "returnTimeout", "farDistance", "recheckSamples", "nearMiningExtraReach", ... },
  "ui":         { "renderIntervalMs", "graphUpdateMs" },
  "monitor":    { "historyLength", "cpuRamHistoryLength" },
  "maintenance":{ /* 10 параметров */ },
  "metrics":    { "port" },
  "log":        { "maxSizeBytes" },
  "features":   { "enableAggressiveMining", "enableSoftRestart", "enableHeapSnapshot", ... },
  "logging":    { "level", "debugMode", "logServerMessages", "toFile", ... },
  "pause":      { "file", "checkInterval" },
  "bots":       [ /* конфигурация каждого бота */ ]
}
```

### 5.2 Обработка конфига (`config-schema.js`)

**Поток:**
1. `loadRuntimeConfig(filePath, defaultsPath)` — читает JSON, применяет миграции
2. `normalizeRuntimeConfig(input, defaults)` — глубокое слияние с дефолтами
3. `createRuntimeSettings(config, options)` — нормализует значения (типы, границы)

**Ключевые поведения:**
- Все числовые поля ограничены через `Math.max`/`Math.min`
- Устаревшие значения автоматически заменяются (например, `breakPacketMaxPerSecond: 72` → `300`)
- `debugMode=true` включает `DETAILED_EVENT_LOGGING` и `LOG_SERVER_MESSAGES`
- Мобильный профиль переопределяет интервалы снимков/ресурсов/паузы/позиции
- `MENU_ACTION_INTERVAL_MS` = 350ms (hardcoded)
- `MENU_WINDOW_TRANSITION_WAIT_MS` = 2200ms (hardcoded)
- `MENU_SUBSERVER_JOIN_WAIT_MS` = 10000ms (hardcoded)

### 5.3 Все настройки

#### Сервер

| Ключ | Тип | Дефолт | Описание |
|------|-----|--------|----------|
| `server.host` | string | — | Хост Minecraft сервера |
| `server.port` | number | 25565 | Порт |
| `server.version` | string | — | Версия Minecraft (например "1.16.5") |
| `server.password` | string | "" | Пароль для /login |

#### Тайминги майнинга

| Путь в config.json | Тип | Дефолт | Описание |
|---|---|---|---|
| `timing.digDelay` | ms | 0 | Задержка между копаниями |
| `timing.emptyScanDelayMs` | ms | 0 | Задержка когда нет целей |
| `timing.emptyTargetRecheckMs` | ms | 5 | Интервал перепроверки пустых целей |
| `timing.miningLoopIdleMs` | ms | 2 | Ожидание когда нечего копать |
| `timing.miningBatchSize` | int | 96 | Размер пачки целей |
| `timing.restartIfIdleMs` | ms | 120000 | Перезапуск если простой |
| `timing.stuckThreshold` | ms | 30000 | Порог застревания |
| `timing.digActionTimeoutMs`* | ms | auto | Таймаут копания (min 5000, макс = min(stuckThreshold, restartIfIdleMs)) |

#### Кнопка входа (Entry Button)

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `timing.entryButtonAfterPressWaitMs` | ms | 0 | Ожидание после нажатия |
| `timing.entryButtonRetryIntervalMs` | ms | 250 | Интервал между попытками |
| `timing.entryButtonStartupAttempts` | int | 4 | Попыток при старте |
| `timing.entryButtonStartupRetryMs` | ms | 350 | Пауза между стартовыми попытками |
| `timing.entryButtonConfirmMs` | ms | 900 | Ожидание подтверждения |
| `timing.entryButtonWatchdogMs` | ms | 3000 | Watchdog кнопки после входа |
| `timing.emptyTargetButtonRetryMs` | ms | 20000 | Простой перед аварийной кнопкой |
| `timing.emptyTargetButtonRetryCooldownMs` | ms | 60000 | Кулдаун аварийной кнопки |
| `timing.emptyTargetButtonRetryLimit` | int | 2 | Лимит аварийных нажатий |

#### Система Break Packet

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `timing.packetOnlyMining` | bool | true | Только пакетный режим |
| `timing.packetOnlyFallbackMs` | ms | 1200 | Откат к vanilla dig если нет подтверждения |
| `timing.packetBreakConfirmWindowMs` | ms | 1500 | Окно обнаружения подтверждения |
| `timing.preemptiveBreakTargets` | bool | false | Посылать пакеты даже если блок — воздух |
| `timing.breakPacketTargetCooldownMs` | ms | 12 | Кулдаун на цель |
| `timing.breakPacketPendingRetryMs` | ms | 32 | Задержка повтора для ожидающих |
| `timing.breakPacketMinTargetCooldownMs` | ms | 8 | Мин. кулдаун на цель |
| `timing.breakPacketMaxPerSecond` | int | 300 | Макс. пакетов в секунду |
| `timing.breakPacketBurstWindowMs` | ms | 250 | Окно burst |
| `timing.breakPacketBurstLimit` | int | 84 | Лимит в burst окне |
| `timing.burstBreakWindowMs` | ms | 1500 | Длительность burst окна |
| `timing.burstBreakIntervalMs` | ms | 1 | Интервал между burst итерациями |
| `timing.burstBreakRepeats` | int | 2 | Пар пакетов за burst |
| `timing.burstBreakReach` | number | 5.1 | Макс. дистанция для пакетов |
| `timing.burstLookRefreshMs` | ms | 3000 | Интервал обновления взгляда |
| `timing.blockCountDedupeMs` | ms | 75 | Окно дедупликации подсчёта блоков |
| `timing.reactiveBreakRepeats` | int | 1 | Пакетов для реактивного брейка |
| `timing.transientBreakRepeats` | int | 1 | Пакетов для transient блоков |
| `timing.fastDigConfirmMs` | ms | 15 | Ожидание подтверждения fast dig |
| `timing.fastDigRetryMs` | ms | 5 | Интервал повтора fast dig |
| `timing.fastDigMinVanillaTimeMs` | ms | 0 | Мин. время vanilla dig для fast dig |

#### Меню и слоты

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `menu.slot1` | int | 10 | Первый слот меню |
| `menu.slot2` | int | 13 | Второй слот меню |
| `menu.hotbarSlot` | int (0-8) | 0 | Активный слот хотбара |
| `menu.toolSwitchSlots` | int[] | [1-8] | Слоты для авто-переключения инструментов |
| `menu.toolSwitchThreshold` | % | 5 | Порог прочности для переключения |
| `timing.menuAttemptLimit` | int | 6 | Попыток клика до восстановления |
| `timing.menuRecoveryBaseMs` | ms | 3500 | Базовая задержка восстановления |
| `timing.menuRecoveryStepMs` | ms | 2500 | Шаг наращивания |
| `timing.menuRecoveryMaxMs` | ms | 18000 | Макс. задержка |
| `timing.menuRecoveryJitterMs` | ms | 2500 | Джиттер |

#### Анти-бот

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `antibot.minInterval` | ms | 3000 | Мин. интервал анти-бот движений |
| `antibot.maxInterval` | ms | 12000 | Макс. интервал |
| `antibot.shortMoveMs` | ms | 150 | Длительность короткого движения |
| `antibot.fallCheckEnabled` | bool | false | Включить fall check |
| `antibot.fallCheckTimeout` | ms | 3000 | Таймаут fall check |
| `antibot.limboFallTicks` | int | 128 | Тиков симуляции падения |
| `antibot.limboFallPacketMs` | ms | 50 | Интервал пакетов падения |
| `antibot.limboDetectionTimeoutMs` | ms | 4500 | Таймаут детекции лимбо |
| `antibot.limboCompletionGraceMs` | ms | 900 | Grace после падения |
| `antibot.limboPostFallJoinMs` | ms | 900 | Ожидание после падения |
| `antibot.limboMenuWaitMs` | ms | 12000 | Ожидание меню лимбо |
| `antibot.scannerPassiveWaitMs` | ms | 60000 | Пассивное ожидание сканера |
| `antibot.scannerRecentPositionMs` | ms | 5000 | Окно недавней позиции |
| `antibot.scannerPositionWaitMs` | ms | 2500 | Ожидание пакета позиции |
| `antibot.limboServerTimeoutMs` | ms | 15000 | Таймаут сервера лимбо |
| `features.enableActiveFallCheck` | bool | true | Включить активный fall check |
| `features.enableAggressiveMining` | bool | true | Агрессивный майнинг |

#### Позиции

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `position.checkInterval` | ms | 10000 | Интервал проверки позиции |
| `position.returnTimeout` | ms | 8000 | Таймаут возврата на стенд |
| `position.farReconnectIdleMs` | ms | 30000 | Перезапуск при далёкой позиции |
| `position.farDistance` | number | 500 | Дистанция считающаяся "далеко" |
| `position.recheckSamples` | int | 3 | Сэмплов перед подтверждением |
| `position.recheckDelayMs` | ms | 700 | Задержка между сэмплами |
| `position.nearMiningExtraReach` | number | 1 | Доп. reach для near проверки |

#### Глобальный рестарт

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `globalRestart.errorThreshold` | int | 15 | Ошибок до глобального рестарта |
| `globalRestart.timeWindowMs` | ms | 600000 | Окно подсчёта ошибок |
| `globalRestart.stopOnNoInternet` | bool | false | Остановить если нет интернета |
| `globalRestart.noInternetThreshold` | int | 8 | Ошибок интернета до останова |
| `globalRestart.memoryLimitMB` | int | 1024 | Лимит памяти RSS до рестарта |

#### Обслуживание

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `maintenance.chatCaptchaReconnectMs` | ms | 1800000 | Удержание после chat captcha |
| `maintenance.offlineWatchdogMs` | ms | 180000 | Watchdog для оффлайн ботов |
| `maintenance.offlineWatchdogIntervalMs` | ms | 60000 | Интервал watchdog |
| `maintenance.onlineMiningStallMs` | ms | 180000 | Детекция застоя онлайн |
| `maintenance.botFilterRetryBaseMs` | ms | 8000 | Базовая задержка повтора |
| `maintenance.botFilterRetryMaxMs` | ms | 120000 | Макс. задержка повтора |
| `maintenance.botFilterFallAttemptsBeforeHold` | int | 2 | Падений до длительного удержания |
| `maintenance.botFilterFallHoldMs` | ms | 1800000 | Длительное удержание |

#### Прочие

| Путь | Тип | Дефолт | Описание |
|---|---|---|---|
| `logging.debugMode` | bool | false | Режим отладки (включает DIAG) |
| `logging.logServerMessages` | bool | false | Логировать сообщения сервера |
| `logging.diagnosticMaxValueLength` | int | 1400 | Макс. длина диагностических значений |
| `logging.diagnosticPositionIntervalMs` | ms | 30000 | Интервал позиционной диагностики |
| `logging.diagnosticRepeatSummaryMs` | ms | 30000 | Интервал сводки повторов |
| `logging.diagnosticFullPacketDetails` | bool | false | Полные детали пакетов |
| `log.maxSizeBytes` | int | 52428800 | Макс. размер лог-файла (50MB) |
| `pause.file` | string | pause.txt | Путь к файлу паузы |
| `pause.checkInterval` | ms | 1000 | Интервал проверки паузы |
| `ui.renderIntervalMs` | ms | 1000 | Интервал рендера UI |

#### Настройки, доступные ТОЛЬКО в config.json (нет в UI)

- Все `antibot.*` (14 полей)
- Большинство `timing.*` (60+ полей)
- `features.enableHeapSnapshot`, `features.enableActiveFallCheck`, `features.enableMetrics`, `features.enablePerBotLogs`
- `logging.*` кроме `debugMode`
- `menu.toolSwitchSlots`
- `globalRestart.noInternetThreshold`
- `metrics.port`, `log.maxSizeBytes`
- `ui.*`, `monitor.*`
- `pause.*`
- `maintenance.*` кроме offlineWatchdogMs/offlineWatchdogIntervalMs

### 5.4 Система миграций (`config-migrations.js`)

**25+ правил** замены устаревших значений (`LEGACY_CONFIG_RULES`, строка 63):
- Детектит старые числа и заменяет новыми дефолтами
- Пример: `breakPacketMaxPerSecond: 72` → `300`, `breakPacketBurstLimit: 18` → `84`

**5 путей** для удаления (`OBSOLETE_CONFIG_PATHS`, строка 100):
- `emptyTargetButtonCooldownMs`, ключи с `speedGuard`/`speedguard`, `features.enableSpeedGuard`

**Специальные миграции:**
- `logging.debugMode` → каскад: включает `DETAILED_EVENT_LOGGING`, `LOG_SERVER_MESSAGES`, гарантирует boolean

---

## 6. Жизненный цикл бота

### 6.1 Стартовый поток

```
bot.js (точка входа)
  |
  +-- Загрузка mineflayer, blessed, contrib
  +-- Создание process lifecycle (process-guard.js)
  +-- Установка фильтров шума консоли
  +-- Парсинг CLI аргументов (--headless, --emit-json, --config=)
  +-- Создание runtimeLogger (лог + чат лог, max 50MB)
  +-- Загрузка конфига: loadRuntimeConfig() → normalizeRuntimeConfig() → applyLegacyConfigMigrations()
  +-- createRuntimeSettings() → плоский объект настроек
  +-- Создание blessed screen (если не headless)
  +-- Создание runtimeState, runtimeManager, runtimeUi
  +-- Создание botSessionFactory (настройки + контекст с зависимостями)
  +-- setCreateBot(botSessionFactory) на runtimeManager
  +-- Регистрация горячих клавиш (Q/ESC/R/P/SPACE)
  +-- Запуск maintenance: checkAndRestartStuckBots (offlineWatchdogIntervalMs)
  +-- Запуск обновления UI
  +-- Запуск статистики (каждые 5 мин)
  +-- Регистрация SIGINT/SIGTERM
  +-- Если host-controlled: регистрация, автозапуск если BOT_AUTOSTART=1
  +-- Иначе: startRuntimeManager() немедленно
```

### 6.2 Runtime Manager (`runtime-manager.js`)

```
startRuntimeManager()
  +-- startAllBots():
      +-- Для каждого бота: планирование создания с задержкой (stagger)
      +-- Каждый: createManagedBot(cfg) → createBot(cfg) → botHandle
      +-- Пушит в activeBots[]
  +-- startRotationScheduler() (если включено)
  +-- updateUI()
```

### 6.3 Сессия бота (`bot-session.js`)

#### Поток подключения

```
createBot(cfg) → botHandle
  +-- Запуск клиента: mineflayer.createBot(host, port, username, version)
  +-- Загрузка physics plugin
  +-- Регистрация packet listeners:
      - 'login', 'respawn' → handleMidSessionWorldReset()
      - 'position' → rememberLimboPositionPacket() + handleLimboPositionPacket()
      - 'keep_alive' → обновление lastKeepAlive
      - 'connect'/'end'/'error' → диагностика
      - socket события (error, close, end, timeout) → диагностика
  +-- Регистрация bot event listeners:
      - 'blockUpdate' → handleBlockUpdate()
      - 'windowOpen' → queueMenuFlow()
      - 'windowClose' → queueMenuFlow()
      - 'spawn' → главный пост-спавн поток
      - 'message' → обработка сообщений сервера (captcha, bot filter, etc.)
      - 'kicked' → решение о переподключении
      - 'end' → решение о переподключении
      - 'error' → решение о переподключении
  +-- Запуск menuLoop() (каждые 1-1.75s, пытается открыть меню)
  +-- Возврат botHandle
```

#### Поток после спавна

```
bot.once('spawn'):
  +-- setLifecycleState(connecting)
  +-- isOnline=true, spawnGraceUntil=now+20s
  +-- Загрузка физики гравитации
  +-- startKeepAliveMonitor() (каждые 5s)
  +-- startLimboFilterBypass() (отправка identity пакетов)
  +-- Ожидание initialDelay (800-2000ms)
  +-- waitForLimboBeforeMenu() (если ожидание fall check)
  +-- driveMenuFlow('spawn-flow')
  +-- backoff = RECONNECT_REGULAR
```

#### Навигация по меню

```
driveMenuFlow(source, options):
  +-- Если joinedSubserver == false:
      +-- Если currentWindow нет:
          +-- Использовать предмет в хотбаре для открытия меню (use_item packet)
          +-- Запланировать повтор через 300ms
      +-- Если окно открыто:
          +-- classifyServerMenuWindow(window):
              - 'game' (title содержит "выбор игры"/"game")
              - 'skyblock' (title содержит "выбор скайблока"/"skyblock")
              - 'unknown'
          +-- Если game window: клик slot1 → stage='game-clicked'
          +-- Если skyblock window: клик slot2 → stage='skyblock-clicked'
          +-- Если unknown: закрыть окно и повторить
      +-- skyblock-clicked → beginSubserverJoin() → joinedSubserver=true
          → schedulePostJoinFlow()
```

#### Поток после входа на подсервер

```
schedulePostJoinFlow():
  +-- startPositionCheck() (периодическая проверка позиции)
  +-- scheduleEntryButtonWatchdog() (кнопка входа)
  +-- Через POST_JOIN_DIG_START_MS:
      +-- runEntryButtonFlow() (нажать кнопку входа)
      +-- startDiggingLoop()
```

#### Цикл майнинга

```
startDiggingLoop(expectedSessionEpoch):
  +-- Ожидание готовности сессии
  +-- Ожидание пост-джойн позиции (если standPosition)
  +-- returnToStandPosition() если нужно
  +-- ensureMiningLookAt(true)
  +-- setLifecycleState(mining)
  +-- Цикл пока сессия активна:
      +-- Проверка паузы, возврата на позицию
      +-- checkAndSwitchTool() (авто-переключение по прочности)
      +-- Каждые 5s: чистка packet tracking, проверка idle рестарта
      +-- buildMiningSnapshot(cursor) — категоризация целей
      +-- Если нет mineable целей:
          - recoverTransient() (moving_piston)
          - recoverUnreachable()
          - recoverEmpty() (burst break, entry button, far reconnect)
      +-- Если есть mineable:
          - Пакетный брейк (если fast mining разрешён)
          - Если packet-only и idle < fallback → continue
          - Если idle ≥ fallback → recoverPacketOnlyPipeline() или vanilla dig
          - Vanilla dig: для каждой цели в batch:
              * tryFastDigBlock() сначала (пакетный)
              * Если не получилось: digBlockWithTimeout() (vanilla dig с таймаутом)
              * recordMinedBlock() при успехе
      +-- sleep(MINING_LOOP_IDLE_MS) если ничего не добыто
```

#### Поток переподключения

```
scheduleReconnectLocal(delay, forced, reason):
  +-- Проверка на shutdown/rotation
  +-- setLifecycleState(waiting-reconnect)
  +-- Проверка grace периода
  +-- Добавление джиттера
  +-- setTimeout:
      +-- setLifecycleState(connecting)
      +-- cleanupTimers(), сброс состояния сессии
      +-- Удаление старых listener'ов, quit бота
      +-- Создание нового бота через createBot(cfg)
      +-- Замена в activeBots[]
```

#### Обработка ошибок (bot.js, строки 150-202)

- `uncaughtException` → лог, fullRestart через 100ms
- `unhandledRejection` → лог, fullRestart через 100ms
- Фильтрация через `isIgnorableProcessError()` для сетевого шума
- `SIGINT`/`SIGTERM` → gracefulShutdown()
- Сетевые ошибки фильтруются через console noise filters
- Глобальный порог ошибок в runtimeManager
- Детекция потери интернета

---

## 7. Система майнинга

### 7.1 Пакетный vs Vanilla Dig

**Пакетный майнинг (fast path):**
- Отправляет `block_dig` пакеты напрямую (status 0 = start, status 2 = cancel/complete)
- Используется когда `isFastMiningAllowed()` = true
- Контролируется `packet-break-tracker.js` (бюджеты в секунду и burst)
- Кулдауны целей предотвращают спам на один блок
- Режим `PACKET_ONLY_MINING` — только пакеты, без `bot.dig()`

**Vanilla Dig (запасной):**
- Использует `bot.dig()` с таймаутом через `Promise.race()`
- Защищён `DIG_ACTION_TIMEOUT_MS`
- Ошибки классифицируются: 'timeout', 'unreachable', 'stale', 'error'
- При timeout: вызов `bot.stopDigging()`

### 7.2 Break Packet Tracker (`packet-break-tracker.js`)

**Состояния:**
- `secondWindowCount` — пакетов в текущем 1-секундном окне
- `burstWindowCount` — пакетов в burst окне (дефолт 250ms)
- `lastBreakPacketByTarget` — кулдауны по целям
- `pendingPacketBreaks` — карта позиция→время (ожидание подтверждения)
- `lastCountedBlockByTarget` — дедупликация подсчёта блоков

**Ключевые функции:**
- `reserveBreakPacketBudget(count)` — проверка бюджетов, false если превышен
- `canSendBreakPacketForTarget(position, cooldownMs)` — проверка кулдауна цели
- `canRetryPendingBreak(position, retryMs)` — проверка повтора ожидающего
- `hasRecentPacketBreak(position, now, confirmWindowMs)` — проверка недавнего пакета
- `shouldCountBlock(key, now, dedupeMs)` — дедупликация подсчёта
- `prune(now, options)` — очистка устаревших состояний

### 7.3 Burst Break System

`sendBreakPacketToTarget(target, options)` (bot-session.js строка 769):
- Отправляет пары `block_dig` (status 0, затем status 2)
- Учитывает кулдаун цели и кулдаун повтора
- Использует настраиваемое количество повторов (BURST_BREAK_REPEATS, REACTIVE_BREAK_REPEATS, TRANSIENT_BREAK_REPEATS)
- Пропускает если блок — воздух (если не PREEMPTIVE_BREAK_TARGETS)

`runBurstBreakWindow(expectedSessionEpoch, timeoutMs)` (строка 887):
- Отправляет break пакеты в плотном цикле
- Каждая итерация сканирует все цели в reach
- Отправляет пакеты на все валидные цели
- Спит BURST_BREAK_INTERVAL_MS между итерациями

### 7.4 Обработка батчей

Цикл майнинга обрабатывает цели пачками `MINING_BATCH_SIZE` (дефолт 96):
- `buildMiningSnapshot(cursor)` — строит категоризированный список целей
- Категории: mineable, unreachable, transient (moving_piston), empty (air), unloaded
- Сначала пакетный брейк для всей пачки, затем vanilla dig для каждой цели
- Курсор продвигается по модулю общего числа целей

### 7.5 Авто-переключение инструментов (`checkAndSwitchTool`)

**Функции:**
- `isDurableItem(item)` — проверяет наличие `maxDurability` у предмета
- `getItemDurabilityPercent(item)` — вычисляет % оставшейся прочности
- `switchToNextTool()` — перебирает `TOOL_SWITCH_SLOTS` в поисках инструмента с прочностью > threshold; если такого нет — берёт любой инструмент
- `checkAndSwitchTool()` — вызывается в mining loop раз в секунду

**Поведение:**
1. Проверяет текущий `bot.heldItem`
2. Если слот пуст → переключает на следующий инструмент
3. Если прочность ≤ `TOOL_SWITCH_THRESHOLD` % (дефолт 5%) → переключает
4. Сначала ищет инструмент с прочностью > threshold
5. Если не нашёл — берёт любой инструмент с durability

---

## 8. Анти-бот меры

### 8.1 Fall Checks (`limbo-filter.js`)

Симуляция физики падения Vanilla Minecraft:
```
fallSpeed(tick) = -(0.98^tick - 1) * 3.92
```

**Функции:**
- `createFallPacket(start, tick)` — вычисляет Y после N тиков свободного падения
- `createFallSequence(start, options)` — генерирует полную последовательность падения
- `validateFallPacket(packet, state, options)` — валидирует пакет позиции
- `getLoadedChunkSpeed(tick)` — формула скорости

### 8.2 Limbo Filter (`bot-session.js`)

**Полный поток:**
1. **Детекция:** сервер присылает сообщение с текстом сканера/fall-wait
2. **`handleScannerWaitChallenge()`** (строка 3244):
   - setLifecycleState('botfilter')
   - `scannerWaitChallengeActive = true`
   - Ожидание пакета позиции от сервера
   - Если недавняя позиция есть → немедленно старт active fall
3. **`handleLimboPositionPacket()`** (строка 2677):
   - Если Y < 128: откат к открытию меню
   - Если Y >= 128: вызов `startActiveFallCheck()`
4. **`startActiveFallCheck()`** (строка 2474):
   - Пауза физики бота
   - Отправка identity пакетов
   - Подтверждение телепорта
   - Отправка пакетов с симуляцией падения с интервалом `LIMBO_FALL_PACKET_MS`
   - На `LIMBO_FALL_TICKS` итераций (дефолт 128)
   - Ожидание ответа сервера с grace периодом

### 8.3 Bot Filter (`bot-filter.js`)

Классификация сообщений сервера:
- `'chat-captcha'` — капча в чате (ключевые слова: капч, captcha, введите чат, enter chat)
- `'fall-wait'` — сканер/fall check (ключевые слова: сканер, scanner, antibot, botfilter, дождитесь проверки, don't move)
- `'none'` — не обнаружено

**Расчёт задержки переподключения:**
- Экспоненциальный backoff: `retryBaseMs * 2^(retryCount-1)`
- Ограничен `retryMaxMs`
- После `fallAttemptsBeforeHold` падений → `fallHoldMs` (30 мин)
- Джиттер на все задержки

### 8.4 Captcha Handling (`captcha-evidence.js`)

**Паттерны:** русские и английские паттерны капчи, fall wait
- `classifyCaptchaEvidence(text)` → 'chat-captcha' | 'fall-wait' | 'none'
- `createCaptchaEvidence(options)` → объект evidence
- `validateCaptchaEvidence(evidence, requiredKind)` — валидация источника, видимости, текста

**Поток chat captcha** (`handleChatCaptchaChallenge()`, строка 3357):
1. setLifecycleState('held')
2. Установка здоровья 'chat-captcha-hold' на 30 мин
3. `scannerHoldUntil = now + CHAT_CAPTCHA_RECONNECT_MS`
4. Планирование переподключения с задержкой
5. Очистка сессии, закрытие соединения

---

## 9. Десктопное приложение (Electron)

### 9.1 Main Process

```
desktop/main.js → createDesktopApp() → start()
  |
  +-- paths (createDesktopPaths) — разрешение путей
  +-- configStore (createConfigStore) — чтение/запись/миграция config.json
  +-- desktopSettingsStore — настройки десктопа (автозапуск, трей)
  +-- runtimeController — запуск bot.js как дочернего процесса
      - Парсинг @@BOT_EVENT@@ из stdout
      - Watchdog: рестарт если нет событий 10 мин
  +-- updateController — проверка релизов, SHA256, установка
  +-- windowController — BrowserWindow с кастомным titlebar, гварды
  +-- trayController — иконка в трее
  +-- dialogActions — импорт/экспорт конфига
  +-- IPC handlers — 15 каналов, валидация типов
```

### 9.2 IPC Security (`ipc-security.js`)

- 15 whitelist invoke каналов
- 2 send канала (runtime:state, updates:state)
- Валидаторы: `noPayload`, `plainObject`, `boolean`
- Защита от дублирования обработчиков

### 9.3 Renderer API (`preload.js`)

`window.botStudio` предоставляет:
- `getBootstrap()`, `saveDesktopSettings()`, `saveConfig()`, `resetConfig()`
- `importConfig()`, `exportConfig()`
- `startRuntime()`, `stopRuntime()`, `restartRuntime()`
- `setPaused()`, `checkUpdates()`, `downloadUpdate()`, `installUpdate()`
- `openRuntimeDir()`, `onRuntimeState()`, `onUpdateState()`

### 9.4 Настройки UI

**Desktop settings** (5 bool): `launchOnStartup`, `autoStartBotsOnLaunch`, `startMinimized`, `minimizeToTray`, `closeToTray`

**Секции конфига в UI:**
| Секция | Поля |
|--------|------|
| Server | `server.host`, `server.version`, `server.password` |
| Timing | параметры таймингов |
| Recovery | `stuckThreshold`, `position.*`, `globalRestart.*`, `maintenance.offline*` |
| Menu | `slot1`, `slot2`, `hotbarSlot`, `toolSwitchThreshold` |
| Features | `enableAggressiveMining`, `enableSoftRestart`, `enablePeriodicRotation` |
| Debug | `debugMode` |

---

## 10. Системы событий и диагностики

### 10.1 Runtime Events

`emitRuntimeEvent(type, payload)` (bot.js строка 137):
- Отправляет событие host-эмиттеру (если зарегистрирован)
- В GUI режиме: пишет `@@BOT_EVENT@@<json>\n` в stdout
- Типы: `'log'`, `'chat'`, `'snapshot'`, `'resources'`, `'host-shutdown'`

### 10.2 Diagnostic Events (`diagEvent`)

Когда `DETAILED_EVENT_LOGGING` = true:
- Формат: `[DIAG] #N eventName {details}`
- Шумные события (position, throttling) подавляются и группируются
- Дедупликация повторов: одинаковые события в окне `DIAGNOSTIC_REPEAT_SUMMARY_MS` считаются но логируются разово
- Позиционная диагностика каждые `DIAGNOSTIC_POSITION_INTERVAL_MS`

### 10.3 Timeline (`event-timeline.js`)

- Ограниченный таймлайн (дефолт 100 записей)
- Дедупликация: одинаковые события в 30s окне увеличивают `repeatCount`
- Фильтрация по severity: важные события (warning, error, recovery)
- Санитизация (очистка email, токенов, путей)

### 10.4 Система здоровья (`stability-center.js`)

**Состояния здоровья:**

| Причина | Состояние | Severity | Описание |
|---------|-----------|----------|----------|
| `mining-ok` | healthy | ok | Нормальный майнинг |
| `network-reset` | recovering | warning | Сброс сокета |
| `dns-failure` | recovering | error | DNS ошибка |
| `connect-timeout` | recovering | warning | Таймаут подключения |
| `server-world-reset` | recovering | warning | Сброс мира сервером |
| `runtime-stale` | recovering | error | Нет событий от runtime |
| `mining-confirmation` | degraded | warning | Плохое подтверждение брейков |
| `packet-budget` | recovering | warning | Адаптация лимитов пакетов |
| `fallback-dig` | degraded | warning | Запасной dig активен |
| `joining` | recovering | ok | Вход на подсервер |
| `botfilter-hold` | blocked | warning | Пауза бот-фильтра |
| `chat-captcha-hold` | blocked | error | Пауза капчи |

### 10.5 Runtime State (`runtime-state.js`)

- `refreshBotRates()` — вычисление эффективной и сырой скорости
- `updateBotStatus()` — трекинг состояния, блоков, окон скорости
- `buildRuntimeSnapshot()` — полный снимок для UI (здоровье, скорость, статусы, бюджет пакетов)

### 10.6 Фильтрация шума консоли (`process-guard.js`)

Фильтруются:
- Сетевые ошибки: `ECONNRESET`, `ETIMEDOUT`, `ECONNABORTED`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ECONNREFUSED`, `socket hang up`
- Предупреждения: `Ignoring block entities`, `chunk failed to load`, `deprecated`
- `console.log` полностью подавлен
- `console.warn`, `console.error`, `process.stderr.write` фильтруются

---

## 11. Управление процессами (`process-guard.js`)

`createProcessLifecycle()` (строка 71):
- Трекинг всех `setTimeout`/`setInterval` для очистки
- `clearTrackedTimers()` — очистка всех таймеров
- `registerProcessHandler(event, handler)` — регистрация с трекингом
- `removeProcessHandlers()` — удаление всех обработчиков
- Обеспечивает чистый shutdown под Electron

---

## 12. Ключевые функции и экспорты

### bot.js
- `exports.start`, `exports.stop`, `exports.restart`, `exports.setPaused`
- `exports.getRuntimeSnapshot`, `exports.shutdownForHost`

### bot-session.js
- `createBotSessionFactory(options)` → `createBot(cfg)` → bot handle
- `sendBreakPacketToTarget(target, options)` → boolean
- `runBurstBreakWindow(epoch, timeoutMs)` → int
- `startDiggingLoop(epoch)` → async
- `driveMenuFlow(source, options)` → boolean
- `scheduleReconnectLocal(delay, forced, reason)` → void
- `checkAndSwitchTool()` → boolean (авто-переключение инструментов)
- `startActiveFallCheck(start)` → boolean
- `handleScannerWaitChallenge(text, source, evidence)` → void
- `handleChatCaptchaChallenge(text, source, evidence)` → void

### runtime-manager.js
- `createRuntimeManager(options)` → manager
- `{ fullRestart, gracefulShutdown, startAllBots, stopAllBots, startRuntimeManager, rotateBots }`

### config-schema.js
- `loadRuntimeConfig(filePath, defaultsPath)` → config object
- `createRuntimeSettings(config, options)` → flat settings
- `mergeConfigDefaults(defaultValue, currentValue)` → deep merge

### packet-break-tracker.js
- `createPacketBreakTracker(options)` → tracker
- `{ reserveBreakPacketBudget, canSendBreakPacketForTarget, markBreakPacketTargetSent, prune }`

### limbo-filter.js
- `createFallPacket(start, tick)` → packet
- `createFallSequence(start, options)` → packet[]
- `validateFallPacket(packet, state, options)` → result
- `getLoadedChunkSpeed(tick)` → number

### reconnect-policy.js
- `getReconnectDecision(event, options)` → { action, delay, ... }
- `isTooManyPacketsText(text)` → boolean

### stability-center.js
- `createHealthState(now)` → initial
- `updateHealthState(current, event, now)` → updated
- `computeSmartRateStats(options)` → stats
- `getRuntimeRecoveryDecision(options)` → decision

### update-service.js
- `checkForUpdates(options)` → update info
- `downloadUpdate(updateInfo, options)` → { filePath, sha256, size }
- `verifyFileSha256(filePath, expectedHash)` → actual hash

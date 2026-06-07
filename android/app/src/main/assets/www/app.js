const DESKTOP_SETTINGS_FIELDS_V2 = [
  {
    path: 'launchOnStartup',
    kind: 'boolean',
    label: 'Запускать вместе с Windows',
    help: 'Добавляет приложение в автозапуск Windows, чтобы студия могла подниматься сразу после входа в систему.'
  },
  {
    path: 'autoStartBotsOnLaunch',
    kind: 'boolean',
    label: 'Автозапуск ботов при входе',
    help: 'После открытия программы backend сразу запускает ботов без ручного нажатия кнопки старт.'
  },
  {
    path: 'startMinimized',
    kind: 'boolean',
    label: 'Стартовать свернутым',
    help: 'Открывает окно уже свернутым, чтобы приложение не мешало на рабочем столе после запуска.'
  },
  {
    path: 'minimizeToTray',
    kind: 'boolean',
    label: 'Сворачивать в трей',
    help: 'При обычном сворачивании окно будет уходить в системный трей вместо панели задач.'
  },
  {
    path: 'closeToTray',
    kind: 'boolean',
    label: 'Закрывать в трей',
    help: 'Кнопка закрытия не завершает приложение, а скрывает его в трей для фоновой работы.'
  }
]

const BOT_SETTINGS_SECTIONS_V2 = [
  {
    eyebrow: 'Server',
    title: 'Подключение к серверу',
    description: 'Адрес сервера, версия клиента и пароль quick-login, если вход на сервер требует его сразу после подключения.',
    fields: [
      {
        path: 'server.host',
        kind: 'string',
        label: 'Адрес сервера',
        help: 'Например `mc.prostocraft.com`. Можно указать домен или IP-адрес Minecraft-сервера.'
      },
      {
        path: 'server.version',
        kind: 'string',
        label: 'Версия клиента',
        help: 'Версия Minecraft, с которой должен заходить бот, например `1.16.5`.'
      },
      {
        path: 'server.password',
        kind: 'string',
        inputType: 'password',
        label: 'Пароль quick-login',
        help: 'Используется для автоматического ввода после подключения, если сервер ожидает quick-login или похожую команду.'
      }
    ]
  },
  {
    eyebrow: 'Timing',
    title: 'Задержки и переподключение',
    description: 'Скорость добычи, паузы при простое и интервалы reconnect/rejoin, которые влияют на стабильность всего пула.',
    fields: [
      {
        path: 'timing.digDelay',
        kind: 'number',
        label: 'Задержка между ударами (мс)',
        help: 'Пауза между попытками копания. Увеличьте значение, если сервер плохо переносит слишком частые действия.'
      },
      {
        path: 'timing.fastDigConfirmMs',
        kind: 'number',
        label: 'Ожидание быстрого break (мс)',
        help: 'Сколько runtime ждёт подтверждения после быстрых packet-break команд перед обычным mineflayer.dig().'
      },
      {
        path: 'timing.fastDigMinVanillaTimeMs',
        kind: 'number',
        label: 'Порог быстрого break (мс)',
        help: 'Быстрый break включается для блоков, у которых обычное mineflayer-время копания выше этого значения.'
      },
      {
        path: 'timing.emptyTargetRecheckMs',
        kind: 'number',
        label: 'Перепроверка пустых точек (мс)',
        help: 'Интервал быстрой перепроверки координат, когда все цели временно air или ещё не загружены.'
      },
      {
        path: 'timing.emptyTargetLogAfterIdleMs',
        kind: 'number',
        label: 'Лог пустой шахты после (мс)',
        help: 'Показывать предупреждение о пустых air-точках только если бот не добывал блоки дольше этого времени.'
      },
      {
        path: 'timing.emptyTargetLogIntervalMs',
        kind: 'number',
        label: 'Интервал логов пустой шахты (мс)',
        help: 'Минимальная пауза между повторными предупреждениями о пустых точках при долгом простое.'
      },
      {
        path: 'timing.entryButtonAfterPressWaitMs',
        kind: 'number',
        label: 'Ожидание после кнопки (мс)',
        help: 'Пауза после нажатия кнопки генератора, чтобы сервер успел создать или обновить блоки.'
      },
      {
        path: 'timing.entryButtonRetryIntervalMs',
        kind: 'number',
        label: 'Retry кнопки генератора (мс)',
        help: 'Минимальная пауза между попытками нажать кнопку. Для быстрой шахты держите значение низким.'
      },
      {
        path: 'timing.entryButtonStartupAttempts',
        kind: 'number',
        label: 'Попыток кнопки на входе',
        help: 'Сколько раз максимум повторить кнопку только при входе, если шахта не показала реакцию.'
      },
      {
        path: 'timing.entryButtonStartupRetryMs',
        kind: 'number',
        label: 'Пауза повтора кнопки (мс)',
        help: 'Пауза между стартовыми повторами кнопки, если генератор не подтвердил появление блоков.'
      },
      {
        path: 'timing.entryButtonConfirmMs',
        kind: 'number',
        label: 'Подтверждение кнопки (мс)',
        help: 'Сколько ждать реакции шахты после стартового нажатия кнопки перед повтором.'
      },
      {
        path: 'timing.entryButtonWatchdogMs',
        kind: 'number',
        label: 'Watchdog кнопки (мс)',
        help: 'Через сколько проверить, что post-join кнопка действительно была нажата, и повторить только если нажатия не было.'
      },
      {
        path: 'timing.emptyTargetButtonRetryMs',
        kind: 'number',
        label: 'Кнопка при пустой шахте (мс)',
        help: 'Если после входа все цели остаются воздухом дольше этого времени, runtime аварийно повторит кнопку генератора.'
      },
      {
        path: 'timing.emptyTargetButtonRetryCooldownMs',
        kind: 'number',
        label: 'Кулдаун пустой кнопки (мс)',
        help: 'Минимальная пауза между аварийными повторами кнопки при пустой шахте.'
      },
      {
        path: 'timing.emptyTargetButtonRetryLimit',
        kind: 'number',
        label: 'Лимит пустой кнопки',
        help: 'Сколько аварийных повторов кнопки разрешено за один вход на подсервер.'
      },
      {
        path: 'timing.postJoinPositionGraceMs',
        kind: 'number',
        label: 'Ожидание позиции после входа (мс)',
        help: 'Сколько ждать телепорт на шахту после сообщения входа, прежде чем считать большую дистанцию телепортом на спавн.'
      },
      {
        path: 'timing.stabilityCooldownMs',
        kind: 'number',
        label: 'Стабильный режим (мс)',
        help: '0 = максимальная скорость. Если поставить значение выше 0, после мягких сбоев временно отключается только burst после кнопки.'
      },
      {
        path: 'timing.connectionStabilityCooldownMs',
        kind: 'number',
        label: 'Стабильный режим сети (мс)',
        help: '0 = максимальная скорость. Если поставить значение выше 0, после ECONNRESET/internal error временно отключается только burst после кнопки.'
      },
      {
        path: 'timing.stabilityCooldownMaxMs',
        kind: 'number',
        label: 'Макс. стабильный режим (мс)',
        help: 'Верхний лимит накопленного спокойного режима, если ошибки идут подряд.'
      },
      {
        path: 'timing.miningDiagnosticIntervalMs',
        kind: 'number',
        label: 'Интервал диагностик добычи (мс)',
        help: 'Минимальная пауза между повторяющимися предупреждениями добычи.'
      },
      {
        path: 'timing.movingPistonWaitMs',
        kind: 'number',
        label: 'Пауза moving_piston (мс)',
        help: '1 = максимальная скорость. Короткая пауза после одного packet-pass по временным moving_piston-блокам.'
      },
      {
        path: 'timing.movingPistonLogAfterIdleMs',
        kind: 'number',
        label: 'Лог moving_piston после (мс)',
        help: 'Писать moving_piston в лог только если добыча действительно простаивает дольше этого времени.'
      },
      {
        path: 'timing.miningLoopIdleMs',
        kind: 'number',
        label: 'Пауза движка добычи (мс)',
        help: 'Минимальная пауза после прохода, где ни один блок не был добыт. Низкое значение делает цикл отзывчивее.'
      },
      {
        path: 'timing.miningBatchSize',
        kind: 'number',
        label: 'Блоков за проход',
        help: 'Сколько найденных доступных блоков новый движок пытается добыть перед следующим полным сканированием целей.'
      },
      {
        path: 'timing.burstBreakWindowMs',
        kind: 'number',
        label: 'Burst после кнопки (мс)',
        help: 'Окно после кнопки, когда runtime быстро шлёт break-пакеты по всей колонке, включая краткие moving_piston-состояния.'
      },
      {
        path: 'timing.burstBreakIntervalMs',
        kind: 'number',
        label: 'Интервал burst (мс)',
        help: 'Частота повторения break-пакетов внутри burst-окна. Меньше значение быстрее, но шумнее для сервера.'
      },
      {
        path: 'timing.burstBreakRepeats',
        kind: 'number',
        label: 'Повторов break за тик',
        help: 'Сколько пар start/finish отправлять по каждой цели за один проход burst-а.'
      },
      {
        path: 'timing.breakPacketTargetCooldownMs',
        kind: 'number',
        label: 'Кулдаун packet-break цели (мс)',
        help: 'Минимальная пауза перед повторным packet-break по той же координате. Снижает ECONNRESET без общего замедления.'
      },
      {
        path: 'timing.breakPacketPendingRetryMs',
        kind: 'number',
        label: 'Retry pending-цели (мс)',
        help: 'Минимальная пауза перед повторным ударом по блоку, по которому уже отправлен packet-break и ждётся ответ сервера.'
      },
      {
        path: 'timing.breakPacketMaxPerSecond',
        kind: 'number',
        label: 'Лимит block_dig/сек',
        help: 'Верхний предел исходящих block_dig пакетов в быстром режиме. Защищает от кика too many packets.'
      },
      {
        path: 'timing.breakPacketBurstLimit',
        kind: 'number',
        label: 'Burst-лимит block_dig',
        help: 'Максимум block_dig пакетов за короткое окно burst. Сдерживает резкие пики без полного отключения скорости.'
      },
      {
        path: 'timing.breakPacketSafeMaxPerSecond',
        kind: 'number',
        label: 'Safe block_dig/сек',
        help: 'Более спокойный лимит после кика too many packets.'
      },
      {
        path: 'timing.breakPacketSafeModeMs',
        kind: 'number',
        label: 'Packet-safe режим (мс)',
        help: 'Сколько держать спокойный packet-режим после кика за слишком много пакетов.'
      },
      {
        path: 'timing.loginCommandCooldownMs',
        kind: 'number',
        label: 'Кулдаун /login (мс)',
        help: 'Минимальная пауза между командами /login, чтобы не зациклиться на ответе уже авторизован.'
      },
      {
        path: 'timing.reactiveBreakRepeats',
        kind: 'number',
        label: 'Повторов на blockUpdate',
        help: 'Сколько break-пар отправлять при серверном обновлении целевого блока.'
      },
      {
        path: 'timing.transientBreakRepeats',
        kind: 'number',
        label: 'Повторов moving_piston',
        help: 'Сколько break-пар отправлять по временным moving_piston-блокам за один быстрый проход.'
      },
      {
        path: 'timing.packetBreakConfirmWindowMs',
        kind: 'number',
        label: 'Окно подтверждения packet (мс)',
        help: 'Сколько времени после packet-break считать исчезновение блока подтверждённой добычей.'
      },
      {
        path: 'timing.blockCountDedupeMs',
        kind: 'number',
        label: 'Дедуп счётчика (мс)',
        help: 'Защита от двойного счёта, если один блок подтвердился и через blockUpdate, и через обычный dig.'
      },
      {
        path: 'timing.packetOnlyMining',
        kind: 'boolean',
        label: 'Packet-only конвейер',
        help: 'В быстром режиме копать пакетами без ожидания обычного dig; dig включается только как запасной вариант.'
      },
      {
        path: 'timing.packetOnlyFallbackMs',
        kind: 'number',
        label: 'Fallback на dig (мс)',
        help: 'Если packet-only не подтверждает добычу дольше этого времени, бот пробует обычный dig для восстановления.'
      },
      {
        path: 'timing.burstBreakReach',
        kind: 'number',
        label: 'Радиус packet-break',
        help: 'Максимальная дистанция до цели, по которой runtime может слать быстрые break-пакеты.'
      },
      {
        path: 'timing.burstLookRefreshMs',
        kind: 'number',
        label: 'Обновление взгляда (мс)',
        help: 'Как часто бот заново смотрит в центр колонны перед packet-break; 0 отключает обновление.'
      },
      {
        path: 'timing.preemptiveBreakTargets',
        kind: 'boolean',
        label: 'Pre-fire по air-точкам',
        help: 'Рискованный режим для экспериментов: может ускорить короткие блоки, но на сервере уже вызывал телепорт на спавн.'
      },
      {
        path: 'timing.startStagger',
        kind: 'number',
        label: 'Старт между ботами (мс)',
        help: 'Пауза между запуском соседних ботов. Уменьшите, чтобы весь пул стартовал почти одновременно.'
      },
      {
        path: 'timing.startStaggerJitter',
        kind: 'number',
        label: 'Случайный разброс старта (мс)',
        help: 'Дополнительная случайная задержка старта каждого бота.'
      },
      {
        path: 'timing.restartIfIdleMs',
        kind: 'number',
        label: 'Рестарт при простое (мс)',
        help: 'Если бот слишком долго ничего не добывает, runtime считает его зависшим и перезапускает логику.'
      },
      {
        path: 'timing.reconnectRegular',
        kind: 'number',
        label: 'Обычный reconnect (мс)',
        help: 'Пауза перед повторным входом после стандартного дисконнекта или мягкого рестарта.'
      },
      {
        path: 'timing.reconnectOnInternetLoss',
        kind: 'number',
        label: 'Reconnect без интернета (мс)',
        help: 'Интервал повторных попыток входа, если приложение считает, что интернет временно пропал.'
      },
      {
        path: 'timing.periodicRejoinMs',
        kind: 'number',
        label: 'Периодический rejoin (мс)',
        help: 'Раз в указанный интервал бот полностью переподключается к серверу для профилактики долгих зависаний.'
      },
      {
        path: 'timing.rotationDelayBetweenBots',
        kind: 'number',
        label: 'Пауза между ботами (мс)',
        help: 'Задержка между последовательным запуском или ротацией ботов, чтобы не создавать резких пиков нагрузки.'
      },
      {
        path: 'timing.speedGuardAllowedDropPercent',
        kind: 'number',
        label: 'Максимальная просадка скорости (%)',
        help: 'На сколько процентов скорость может упасть от адаптивной нормы перед восстановлением. 10%: 750 б/м -> порог 675 б/м.'
      }
    ]
  },
  {
    eyebrow: 'Recovery',
    title: 'Защита от зависаний',
    description: 'Проверка позиции, лимит памяти и условия глобального рестарта, если пул перестал добывать стабильно.',
    fields: [
      {
        path: 'timing.stuckThreshold',
        kind: 'number',
        label: 'Порог зависания (мс)',
        help: 'Если бот не сдвигается и не прогрессирует дольше этого времени, включается сценарий восстановления.'
      },
      {
        path: 'position.checkInterval',
        kind: 'number',
        label: 'Интервал проверки позиции (мс)',
        help: 'Как часто runtime сравнивает текущую позицию бота с ожидаемой зоной работы возле стенда.'
      },
      {
        path: 'position.returnTimeout',
        kind: 'number',
        label: 'Таймаут возврата к стенду (мс)',
        help: 'Сколько времени дается боту на возврат к рабочей точке, прежде чем сработает более жесткое восстановление.'
      },
      {
        path: 'position.farReconnectIdleMs',
        kind: 'number',
        label: 'Дальний перезаход после простоя (мс)',
        help: 'Если позиция выглядит далёкой, но добыча недавно шла, runtime откладывает перезаход на это время.'
      },
      {
        path: 'position.farDistance',
        kind: 'number',
        label: 'Дальняя позиция (м)',
        help: 'Дистанция, после которой координаты считаются сильно неверными и требуют повторной проверки.'
      },
      {
        path: 'position.recheckSamples',
        kind: 'number',
        label: 'Повторных замеров позиции',
        help: 'Сколько раз перепроверить дальнюю позицию перед перезаходом.'
      },
      {
        path: 'position.recheckDelayMs',
        kind: 'number',
        label: 'Пауза замера позиции (мс)',
        help: 'Пауза между повторными замерами координат перед перезаходом.'
      },
      {
        path: 'position.nearMiningExtraReach',
        kind: 'number',
        label: 'Запас зоны блоков (м)',
        help: 'Дополнительный запас к радиусу packet-break: если бот рядом с блоками, позиция считается рабочей.'
      },
      {
        path: 'globalRestart.memoryLimitMB',
        kind: 'number',
        label: 'Лимит памяти RSS (MB)',
        help: 'Если backend расходует больше памяти, срабатывает защитный глобальный рестарт процесса.'
      },
      {
        path: 'globalRestart.errorThreshold',
        kind: 'number',
        label: 'Ошибок до глобального рестарта',
        help: 'Сколько ошибок допускается в пределах окна наблюдения, прежде чем весь runtime перезапустится.'
      },
      {
        path: 'globalRestart.timeWindowMs',
        kind: 'number',
        label: 'Окно ошибок (мс)',
        help: 'Временное окно, внутри которого считается количество ошибок для глобального рестарта.'
      },
      {
        path: 'globalRestart.stopOnNoInternet',
        kind: 'boolean',
        label: 'Останавливать пул без интернета',
        help: 'Полностью останавливает пул, если runtime уверен, что соединение с интернетом отсутствует слишком долго.'
      },
      {
        path: 'maintenance.offlineWatchdogMs',
        kind: 'number',
        label: 'Watchdog оффлайна (мс)',
        help: 'Через сколько времени без активного reconnect принудительно пересоздавать зависшего оффлайн-бота.'
      },
      {
        path: 'maintenance.offlineWatchdogIntervalMs',
        kind: 'number',
        label: 'Проверка оффлайна (мс)',
        help: 'Как часто проверять, не завис ли бот оффлайн без рабочего reconnect-таймера.'
      }
    ]
  },
  {
    eyebrow: 'Menu',
    title: 'Слоты меню и кнопок',
    description: 'Слоты, которые бот нажимает в игровом меню после входа и при навигации по интерфейсу сервера.',
    fields: [
      {
        path: 'menu.slot1',
        kind: 'number',
        label: 'Слот меню 1',
        help: 'Первый слот, который бот использует в меню сервера или подсерверов.'
      },
      {
        path: 'menu.slot2',
        kind: 'number',
        label: 'Слот меню 2',
        help: 'Второй слот для дополнительного шага навигации по меню или подтверждения выбора.'
      },
      {
        path: 'menu.hotbarSlot',
        kind: 'number',
        label: 'Слот хотбара',
        help: 'Активный слот на панели быстрого доступа, который бот выбирает перед рабочими действиями.'
      }
    ]
  },
  {
    eyebrow: 'Features',
    title: 'Автоматические функции',
    description: 'Флаги поведения, которые включают более активную добычу, мягкие перезапуски и периодическую ротацию ботов.',
    fields: [
      {
        path: 'features.enableAggressiveMining',
        kind: 'boolean',
        label: 'Агрессивная добыча',
        help: 'Позволяет runtime активнее добирать блоки и быстрее реагировать на новые цели в пределах маршрута.'
      },
      {
        path: 'features.enableSoftRestart',
        kind: 'boolean',
        label: 'Мягкий рестарт',
        help: 'При проблемах runtime сначала пытается восстановиться без полного холодного перезапуска процесса.'
      },
      {
        path: 'features.enablePeriodicRotation',
        kind: 'boolean',
        label: 'Периодическая ротация',
        help: 'Регулярно переключает или переподключает ботов по расписанию rotation/rejoin для профилактики зависаний.'
      }
    ]
  }
]

const VISIBLE_CONFIG_SETTING_PATHS = new Set([
  'server.host',
  'server.version',
  'server.password',
  'timing.periodicRejoinMs',
  'timing.rotationDelayBetweenBots',
  'timing.speedGuardAllowedDropPercent',
  'menu.slot1',
  'menu.slot2',
  'menu.hotbarSlot',
  'features.enablePeriodicRotation',
  'logging.debugMode'
])

const EXTRA_SETTINGS_SECTIONS = [
  {
    eyebrow: 'Debug',
    title: 'Отладка',
    description: 'В обычном режиме подробные [DIAG] события скрыты. Включайте только когда нужно понять причину вылета или зависания.',
    fields: [
      {
        path: 'logging.debugMode',
        kind: 'boolean',
        label: 'Режим отладки',
        help: 'Показывает подробные [DIAG] события, packet-позиции, серверные сообщения и внутренние причины reconnect. По умолчанию выключен.'
      }
    ]
  }
]

const TOP_LEVEL_TABS = new Set(['dashboard', 'bots', 'logs', 'more'])
const LOG_VIEW_LABELS = {
  events: 'События',
  chat: 'Чат'
}
const MORE_VIEW_LABELS = {
  settings: 'Настройки',
  updates: 'Обновления',
  files: 'Файлы',
  about: 'О приложении'
}

const state = {
  config: null,
  desktopSettings: createDefaultDesktopSettings(),
  runtime: createEmptyRuntime(),
  platform: 'desktop',
  capabilities: {
    runtimeControl: true,
    runtimeStreaming: true,
    fileImport: true,
    fileExport: true,
    openRuntimeDir: true,
    updates: false
  },
  appVersion: '0.0.0',
  updateSource: null,
  updates: createEmptyUpdateState(),
  activeTab: 'dashboard',
  activeLogView: 'events',
  activeMoreView: 'settings',
  selectedBotIndex: 0,
  isDirty: false,
  coordinateModalOpen: false,
  unsubscribeRuntime: null,
  unsubscribeUpdates: null,
  updateAutoCheckStarted: false
}

const bridge = window.botStudioBridge || window.botStudio
const elements = {}
const renderQueue = new Set()
let renderFrameId = null

function createEmptyRuntime() {
  return {
    status: 'stopped',
    isPaused: false,
    resources: { cpuPercent: 0, memoryMb: 0 },
    snapshot: {
      totalBlocks: 0,
      uptimeMs: 0,
      activeBots: 0,
      totalBots: 0,
      paused: false,
      currentRatePerMinute: 0,
      currentRatePerSecond: 0,
      bots: {}
    },
    logs: [],
    chatLogs: [],
    configPath: '-',
    logPath: '-',
    chatLogPath: '-',
    runtimeDir: '-'
  }
}

function createDefaultDesktopSettings() {
  return {
    launchOnStartup: false,
    autoStartBotsOnLaunch: false,
    startMinimized: false,
    minimizeToTray: false,
    closeToTray: false
  }
}

function createEmptyUpdateState() {
  return {
    status: 'idle',
    currentVersion: '0.0.0',
    latestVersion: '',
    updateAvailable: false,
    checkedAt: '',
    publishedAt: '',
    releaseName: '',
    releaseUrl: '',
    body: '',
    asset: null,
    checksum: null,
    progress: null,
    downloadedFilePath: '',
    downloadedFileName: '',
    downloadedSize: 0,
    error: ''
  }
}

function createDefaultEntryButton() {
  return {
    enabled: false,
    x: 0,
    y: 0,
    z: 0
  }
}

function normalizeCapabilities(capabilities = {}) {
  return {
    runtimeControl: true,
    runtimeStreaming: true,
    fileImport: true,
    fileExport: true,
    openRuntimeDir: true,
    updates: false,
    ...capabilities
  }
}

function queueRender(...parts) {
  const nextParts = parts.flat().filter(Boolean)
  if (!nextParts.length) {
    nextParts.push('all')
  }

  nextParts.forEach(part => renderQueue.add(part))

  if (document.hidden) {
    return
  }

  if (renderFrameId != null) {
    return
  }

  renderFrameId = window.requestAnimationFrame(() => {
    renderFrameId = null
    flushRenderQueue()
  })
}

function isTextEntryElement(element) {
  if (!element || typeof element.matches !== 'function') {
    return false
  }

  if (element.matches('textarea, [contenteditable]:not([contenteditable="false"])')) {
    return true
  }

  if (!element.matches('input')) {
    return false
  }

  const inputType = (element.getAttribute('type') || 'text').toLowerCase()
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(inputType)
}

function flushRenderQueue() {
  if (document.hidden || !renderQueue.size) {
    return
  }

  const nextParts = new Set(renderQueue)
  renderQueue.clear()

  if (nextParts.has('all')) {
    renderAll()
    return
  }

  if (nextParts.has('tabs')) renderTabs()
  if (nextParts.has('chrome')) renderChrome()
  if (nextParts.has('dashboard')) renderDashboard()
  if (nextParts.has('botList')) renderBotList()
  if (nextParts.has('botEditor')) renderBotEditor()
  if (nextParts.has('settings')) renderSettingsV2()
  if (nextParts.has('validation')) renderValidation()
  if (nextParts.has('logs')) renderLogs()
  if (nextParts.has('updates')) renderUpdates()
  if (nextParts.has('chat')) renderChatLogs()
  if (nextParts.has('about')) renderAbout()
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeVector3(vector, fallback = 0) {
  const source = vector && typeof vector === 'object' ? vector : {}
  return {
    x: toFiniteNumber(source.x, fallback),
    y: toFiniteNumber(source.y, fallback),
    z: toFiniteNumber(source.z, fallback)
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeBotShape(sourceBot = {}) {
  const nextBot = sourceBot && typeof sourceBot === 'object' ? clone(sourceBot) : {}
  const rawEntryButton = nextBot.entryButton && typeof nextBot.entryButton === 'object'
    ? nextBot.entryButton
    : {}

  nextBot.standPosition = normalizeVector3(nextBot.standPosition)
  nextBot.maxDistanceFromStand = toFiniteNumber(nextBot.maxDistanceFromStand, 0.6)
  nextBot.blocksToMine = Array.isArray(nextBot.blocksToMine) && nextBot.blocksToMine.length > 0
    ? nextBot.blocksToMine.map(coordinate => normalizeVector3(coordinate))
    : [{ x: 0, y: 0, z: 0 }]
  nextBot.entryButton = {
    enabled: Boolean(rawEntryButton.enabled),
    ...normalizeVector3(rawEntryButton)
  }

  return nextBot
}

function normalizeConfigShape(config) {
  const nextConfig = {
    ...(config || {})
  }
  if (!Array.isArray(nextConfig.bots)) {
    nextConfig.bots = []
  } else {
    nextConfig.bots = nextConfig.bots.map(bot => normalizeBotShape(bot))
  }
  return nextConfig
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value) {
  return escapeHtml(value)
}

function humanizeKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, char => char.toUpperCase())
    .replace(/\bMs\b/g, 'ms')
    .replace(/\bMB\b/g, 'MB')
}

function formatStatus(status) {
  const map = {
    stopped: { label: 'Остановлен', className: 'status-pill--idle' },
    starting: { label: 'Запуск', className: 'status-pill--starting' },
    running: { label: 'Работает', className: 'status-pill--running' },
    stopping: { label: 'Остановка', className: 'status-pill--stopping' },
    error: { label: 'Ошибка', className: 'status-pill--error' }
  }
  return map[status] || map.stopped
}

function getRuntimeHealth(snapshot = state.runtime.snapshot || {}) {
  return snapshot.health || state.runtime.health || {
    state: 'healthy',
    reason: 'mining-ok',
    severity: 'ok',
    since: '',
    downtimeMs: 0,
    diagnosis: 'Скорость нормальная, копание активно.',
    lastNetworkError: '',
    lastReconnectReason: '',
    lastRecoveryAction: ''
  }
}

function formatHealthReason(reason) {
  const map = {
    'mining-ok': 'Скорость нормальная',
    'network-reset': 'Сеть: сброс',
    'dns-failure': 'Сеть: DNS',
    'connect-timeout': 'Сеть: таймаут',
    'server-world-reset': 'Сервер сбросил мир',
    'runtime-stale': 'Runtime завис',
    'speed-drop': 'Просадка скорости',
    'botfilter-hold': 'BotFilter hold',
    'chat-captcha-hold': 'Чат-капча'
  }
  return map[reason] || String(reason || 'Неизвестно')
}

function getHealthClass(health) {
  const severity = health?.severity || 'ok'
  if (severity === 'error') return 'health-card--error'
  if (severity === 'warning') return 'health-card--warning'
  return 'health-card--ok'
}

function renderHealthDashboardCard(snapshot = state.runtime.snapshot || {}) {
  const health = getRuntimeHealth(snapshot)
  const rawRate = snapshot.currentRawRatePerMinute || 0
  const effectiveRate = snapshot.currentEffectiveRatePerMinute ?? snapshot.currentRatePerMinute ?? 0
  const downtime = formatDuration(health.downtimeMs || 0)
  const lastNetworkError = health.lastNetworkError || 'нет'
  const reconnectReason = health.lastReconnectReason || 'нет'
  const recoveryAction = health.lastRecoveryAction || 'ожидание событий'

  return `
    <article class="dashboard-card dashboard-card--health ${getHealthClass(health)}">
      <div class="panel-header panel-header--spread">
        <div>
          <p class="eyebrow">Состояние</p>
          <h4>${escapeHtml(formatHealthReason(health.reason))}</h4>
        </div>
        <span class="chip health-chip">${escapeHtml(health.state || 'healthy')}</span>
      </div>
      <p class="health-diagnosis">${escapeHtml(health.diagnosis || '')}</p>
      <div class="dashboard-meta">
        <div class="dashboard-meta-row"><span>Effective</span><strong>${formatNumber(effectiveRate, 1)} б/м</strong></div>
        <div class="dashboard-meta-row"><span>Raw с простоями</span><strong>${formatNumber(rawRate, 1)} б/м</strong></div>
        <div class="dashboard-meta-row"><span>Простой</span><strong>${escapeHtml(downtime)}</strong></div>
        <div class="dashboard-meta-row"><span>Reconnect</span><strong>${escapeHtml(reconnectReason)}</strong></div>
        <div class="dashboard-meta-row"><span>Сеть</span><strong>${escapeHtml(lastNetworkError)}</strong></div>
        <div class="dashboard-meta-row"><span>Действие</span><strong>${escapeHtml(recoveryAction)}</strong></div>
      </div>
    </article>
  `
}

function formatLiveStatus(status) {
  const map = {
    stopped: 'Остановлен',
    stopping: 'Останавливается',
    starting: 'Запускается',
    running: 'Работает',
    paused: 'На паузе',
    idle: 'Ожидает',
    reconnecting: 'Переподключается',
    offline: 'Оффлайн',
    online: 'Онлайн',
    mining: 'Добывает',
    'копает': 'Добывает',
    'ожидание': 'Ожидает',
    'оффлайн': 'Оффлайн',
    'подключается': 'Подключается',
    'возврат': 'Возврат',
    error: 'Ошибка'
  }

  if (!status) return 'Неизвестно'
  return map[status] || String(status)
}

function getLiveStatusClass(status) {
  const map = {
    mining: 'bot-live--good',
    running: 'bot-live--good',
    online: 'bot-live--good',
    starting: 'bot-live--busy',
    stopping: 'bot-live--busy',
    reconnecting: 'bot-live--busy',
    'подключается': 'bot-live--busy',
    paused: 'bot-live--warn',
    idle: 'bot-live--warn',
    'ожидание': 'bot-live--warn',
    error: 'bot-live--bad',
    offline: 'bot-live--idle',
    'оффлайн': 'bot-live--idle',
    'копает': 'bot-live--good',
    stopped: 'bot-live--idle'
  }

  return map[status] || 'bot-live--idle'
}

function formatCoordinateTriplet(coordinate) {
  if (!coordinate) return '0, 0, 0'
  return `${coordinate.x ?? 0}, ${coordinate.y ?? 0}, ${coordinate.z ?? 0}`
}

function formatEntryButtonLabel(bot) {
  if (!bot?.entryButton?.enabled) return 'выключена'
  return `${bot.entryButton.x ?? 0}, ${bot.entryButton.y ?? 0}, ${bot.entryButton.z ?? 0}`
}

function formatLastBlockLabel(liveBot) {
  if (!liveBot?.lastBlockTime) return 'нет данных'
  return `${formatDuration(Date.now() - liveBot.lastBlockTime)} назад`
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0с'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}ч ${minutes}м`
  if (minutes > 0) return `${minutes}м ${seconds}с`
  return `${seconds}с`
}

function formatNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits
  }).format(value)
}

function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${formatNumber(size, unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function createSummaryCard(label, value, note) {
  return `
    <article class="summary-card">
      <span class="summary-label">${label}</span>
      <div class="summary-value">${value}</div>
      <div class="summary-note">${note}</div>
    </article>
  `
}

function createCompactSummaryCard(label, value, note) {
  return `
    <article class="mini-summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(note)}</span>
    </article>
  `
}

function getRuntimeUiState() {
  const supportsDesktopFiles = state.platform === 'desktop'

  return {
    supportsRuntimeControl: state.capabilities.runtimeControl !== false,
    supportsImport: supportsDesktopFiles && state.capabilities.fileImport !== false,
    supportsExport: supportsDesktopFiles && state.capabilities.fileExport !== false,
    supportsRuntimeFolder: state.capabilities.openRuntimeDir !== false,
    isRunning: state.runtime.status === 'running' || state.runtime.status === 'starting',
    isBusy: state.runtime.status === 'starting' || state.runtime.status === 'stopping'
  }
}

function getActiveTabTitle() {
  if (state.activeTab === 'bots') {
    const selectedBot = getSelectedBot()
    return selectedBot ? `Бот: ${selectedBot.username}` : 'Боты и маршруты'
  }

  if (state.activeTab === 'logs') {
    return state.activeLogView === 'chat' ? 'Чат сервера' : 'Логи runtime'
  }

  if (state.activeTab === 'more') {
    return MORE_VIEW_LABELS[state.activeMoreView] || 'Ещё'
  }

  return 'Пульт добычи'
}

function buildTopbarSubtitle({ configuredBots, activeBots, runtimeTotalBots, isRunning, supportsRuntimeControl }) {
  if (state.activeTab === 'bots') {
    const selectedBot = getSelectedBot()
    if (!selectedBot) {
      return 'Создайте первого бота, затем задайте ему позицию, кнопку входа и маршрут добычи.'
    }

    return `Профиль ${selectedBot.username}: ${selectedBot.blocksToMine.length} точек, стенд ${selectedBot.standPosition.x}/${selectedBot.standPosition.y}/${selectedBot.standPosition.z}, радиус ${formatNumber(selectedBot.maxDistanceFromStand, 2)} м.`
  }

  if (state.activeTab === 'logs') {
    return state.activeLogView === 'chat'
      ? `Сообщения сервера и чата: ${formatNumber((state.runtime.chatLogs || []).length)} записей.`
      : `Последние события runtime: ${formatNumber((state.runtime.logs || []).length)} записей.`
  }

  if (state.activeTab === 'more' && state.activeMoreView === 'settings') {
    return 'Базовые настройки запуска, слотов, ротации, speed guard и отладки.'
  }

  if (state.activeTab === 'more' && state.activeMoreView === 'updates') {
    if (state.updates.status === 'available') {
      return `Доступна версия ${state.updates.latestVersion}. Скачивание и установка запускаются только вручную.`
    }

    if (state.updates.status === 'current') {
      return `Установлена актуальная версия ${state.updates.currentVersion || state.appVersion}.`
    }

    return 'Приложение проверяет обновления на GitHub и показывает установку только по вашему нажатию.'
  }

  if (state.activeTab === 'more' && state.activeMoreView === 'files') {
    return 'Пути к config.json, runtime-логу, chat.log и папке данных.'
  }

  if (state.activeTab === 'more' && state.activeMoreView === 'about') {
    return `Версия приложения: ${state.appVersion}.`
  }

  if (supportsRuntimeControl && isRunning) {
    return `Активных ботов: ${formatNumber(activeBots)}/${formatNumber(runtimeTotalBots)}. Живые события и телеметрия обновляются прямо на устройстве.`
  }

  if (state.platform === 'android' && supportsRuntimeControl) {
    return `APK хранит конфиг локально на телефоне и может запускать runtime прямо здесь. Профилей ботов: ${formatNumber(configuredBots)}.`
  }

  if (!supportsRuntimeControl) {
    return `Профилей ботов: ${formatNumber(configuredBots)}. Экран подготовлен под локальный конфиг, маршруты и просмотр логов без тяжёлых фоновых задач.`
  }

  return `Профилей ботов: ${formatNumber(configuredBots)}. Отсюда удобно запускать весь пул и следить за стабильностью runtime.`
}

function renderMobileActionButton(action) {
  return `
    <button
      class="button button--${action.variant || 'secondary'}"
      type="button"
      data-mobile-action="${escapeAttribute(action.id)}"
      ${action.disabled ? 'disabled' : ''}
    >
      ${escapeHtml(action.label)}
    </button>
  `
}

function getBots() {
  return Array.isArray(state.config?.bots) ? state.config.bots : []
}

function ensureSelectedBot() {
  const bots = getBots()
  if (!bots.length) {
    state.selectedBotIndex = 0
    return
  }

  if (state.selectedBotIndex >= bots.length) {
    state.selectedBotIndex = bots.length - 1
  }

  if (state.selectedBotIndex < 0) {
    state.selectedBotIndex = 0
  }
}

function getSelectedBot() {
  ensureSelectedBot()
  return getBots()[state.selectedBotIndex] || null
}

function buildUniqueBotName(baseName = 'Bot') {
  const existing = new Set(getBots().map(bot => bot.username))
  if (!existing.has(baseName)) return baseName

  let index = 2
  while (existing.has(`${baseName}_${index}`)) {
    index += 1
  }
  return `${baseName}_${index}`
}

function createBotTemplate(source = null) {
  const bot = normalizeBotShape(source ? clone(source) : {
    username: buildUniqueBotName('NewMiner'),
    standPosition: { x: 0, y: 0, z: 0 },
    maxDistanceFromStand: 0.6,
    blocksToMine: [{ x: 0, y: 0, z: 0 }],
    entryButton: createDefaultEntryButton()
  })

  bot.username = buildUniqueBotName(bot.username || 'NewMiner')
  if (!Array.isArray(bot.blocksToMine) || bot.blocksToMine.length === 0) {
    bot.blocksToMine = [{ x: 0, y: 0, z: 0 }]
  }
  bot.entryButton = {
    ...createDefaultEntryButton(),
    ...(bot.entryButton || {})
  }
  return bot
}

function showToast(message, variant = 'success') {
  const toast = document.createElement('div')
  toast.className = `toast toast--${variant}`
  toast.textContent = message
  elements.toastStack.appendChild(toast)

  window.setTimeout(() => {
    toast.remove()
  }, 3200)
}

function closeCoordinateModal() {
  state.coordinateModalOpen = false
  elements.coordinateModal.hidden = true
  elements.coordinateModal.style.display = 'none'
}


function markDirty(nextDirty = true) {
  state.isDirty = nextDirty
  queueRender('chrome', 'validation')
}

function setValueByPath(target, path, nextValue) {
  const parts = path.split('.')
  let cursor = target

  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor[parts[index]]
  }

  cursor[parts[parts.length - 1]] = nextValue
}

function getValueByPath(target, path) {
  return path.split('.').reduce((cursor, segment) => cursor?.[segment], target)
}

const DISPLAY_SLOT_PATHS = new Set(['menu.slot1', 'menu.slot2', 'menu.hotbarSlot'])

function isDisplaySlotPath(path) {
  return DISPLAY_SLOT_PATHS.has(path)
}

function toDisplayValue(path, value) {
  if (!isDisplaySlotPath(path) || value == null || value === '') {
    return value
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue + 1 : value
}

function toStoredSettingsValue(path, kind, rawValue) {
  const parsedValue = parsePrimitiveValue(kind, rawValue)

  if (!isDisplaySlotPath(path) || kind !== 'number') {
    return parsedValue
  }

  const numericValue = Number(parsedValue)
  return Number.isFinite(numericValue) ? Math.max(0, Math.trunc(numericValue) - 1) : 0
}

function parsePrimitiveValue(kind, rawValue) {
  if (kind === 'boolean') return Boolean(rawValue)
  if (kind === 'number') {
    const parsed = Number(rawValue)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return rawValue
}




function getActivePanelName() {
  if (state.activeTab === 'logs') {
    return state.activeLogView === 'chat' ? 'chat' : 'logs'
  }

  if (state.activeTab === 'more') {
    return state.activeMoreView || 'settings'
  }

  return state.activeTab
}

function getTopLevelTabForRequest(tabName) {
  if (TOP_LEVEL_TABS.has(tabName)) return tabName
  if (tabName === 'chat') return 'logs'
  if (['settings', 'updates', 'files', 'about'].includes(tabName)) return 'more'
  return 'dashboard'
}

function renderContextSwitcher() {
  if (!elements.contextSwitcher) return

  if (state.activeTab === 'logs') {
    const logCount = (state.runtime.logs || []).length
    const chatCount = (state.runtime.chatLogs || []).length
    elements.contextSwitcher.hidden = false
    elements.contextSwitcher.innerHTML = `
      <button class="context-tab ${state.activeLogView === 'events' ? 'is-active' : ''}" type="button" data-log-view="events">
        ${escapeHtml(LOG_VIEW_LABELS.events)} <span>${formatNumber(logCount)}</span>
      </button>
      <button class="context-tab ${state.activeLogView === 'chat' ? 'is-active' : ''}" type="button" data-log-view="chat">
        ${escapeHtml(LOG_VIEW_LABELS.chat)} <span>${formatNumber(chatCount)}</span>
      </button>
    `
    return
  }

  if (state.activeTab === 'more') {
    elements.contextSwitcher.hidden = false
    elements.contextSwitcher.innerHTML = Object.entries(MORE_VIEW_LABELS).map(([view, label]) => `
      <button class="context-tab ${state.activeMoreView === view ? 'is-active' : ''}" type="button" data-more-view="${escapeAttribute(view)}">
        ${escapeHtml(label)}
      </button>
    `).join('')
    return
  }

  elements.contextSwitcher.hidden = true
  elements.contextSwitcher.innerHTML = ''
}

function renderTabs() {
  const topLevelTab = getTopLevelTabForRequest(state.activeTab)
  const activePanelName = getActivePanelName()

  state.activeTab = topLevelTab
  elements.workspace.classList.toggle('workspace--dashboard', topLevelTab === 'dashboard')
  ;['bots', 'logs', 'more', 'settings', 'updates', 'files', 'about', 'chat'].forEach(tabName => {
    const isActive = tabName === topLevelTab || tabName === activePanelName
    elements.workspace.classList.toggle(`workspace--${tabName}`, isActive)
  })

  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('is-active', button.dataset.tab === topLevelTab)
  })

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.panel === activePanelName)
  })

  renderContextSwitcher()
}





function renderHelpBadge(helpText) {
  return `
    <span class="help-wrap" tabindex="0" aria-label="${escapeAttribute(helpText)}">
      <span class="help-badge">?</span>
      <span class="help-popover">${escapeHtml(helpText)}</span>
    </span>
  `
}

function renderSettingsField(targetName, field) {
  const source = targetName === 'desktop' ? state.desktopSettings : state.config
  const value = targetName === 'config'
    ? toDisplayValue(field.path, getValueByPath(source, field.path))
    : getValueByPath(source, field.path)
  const inputType = field.inputType || (field.kind === 'number' ? 'number' : 'text')
  const isSlotField = targetName === 'config' && isDisplaySlotPath(field.path)

  if (field.kind === 'boolean') {
    return `
      <label class="field--checkbox field--checkbox-rich">
        <div class="field-checkbox-copy">
          <div class="field-label field-label--rich">
            <span>${escapeHtml(field.label)}</span>
            ${renderHelpBadge(field.help)}
          </div>
        </div>
        <input
          type="checkbox"
          ${value ? 'checked' : ''}
          data-settings-target="${targetName}"
          data-settings-path="${field.path}"
          data-settings-kind="${field.kind}"
        />
      </label>
    `
  }

  return `
    <label class="field settings-field">
      <span class="field-label field-label--rich">
        <span>${escapeHtml(field.label)}</span>
        ${renderHelpBadge(field.help)}
      </span>
      <input
        type="${inputType}"
        step="${field.kind === 'number' ? (isSlotField ? '1' : 'any') : ''}"
        ${isSlotField ? 'min="1"' : ''}
        value="${escapeAttribute(String(value ?? ''))}"
        data-settings-target="${targetName}"
        data-settings-path="${field.path}"
        data-settings-kind="${field.kind}"
      />
    </label>
  `
}











function renderAll() {
  renderQueue.clear()
  renderTabs()
  renderChrome()
  renderDashboard()
  renderBotList()
  renderBotEditor()
  renderSettingsV2()
  renderValidation()
  renderUpdates()
  renderLogs()
  renderChatLogs()
  renderAbout()
}

function cacheElements() {
  elements.workspace = document.getElementById('workspace')
  elements.dashboardTopbar = document.getElementById('dashboard-topbar')
  elements.dashboardHero = document.getElementById('dashboard-hero')
  elements.platformLabel = document.getElementById('platform-label')
  elements.topbarTitle = document.getElementById('topbar-title')
  elements.sidebarStatusPill = document.getElementById('sidebar-status-pill')
  elements.sidebarStatusCopy = document.getElementById('sidebar-status-copy')
  elements.topbarSubtitle = document.getElementById('topbar-subtitle')
  elements.summaryCards = document.getElementById('summary-cards')
  elements.contextSwitcher = document.getElementById('context-switcher')
  elements.mobileOverview = document.getElementById('mobile-overview')
  elements.mobileActionBar = document.getElementById('mobile-action-bar')
  elements.startStopButton = document.getElementById('start-stop-btn')
  elements.restartButton = document.getElementById('restart-btn')
  elements.pauseButton = document.getElementById('pause-btn')
  elements.saveConfigButton = document.getElementById('save-config-btn')
  elements.openRuntimeDirButton = document.getElementById('open-runtime-dir-btn')
  elements.dashboardBotGrid = document.getElementById('dashboard-bot-grid')
  elements.botList = document.getElementById('bot-list')
  elements.botEditor = document.getElementById('bot-editor')
  elements.saveBotsButton = document.getElementById('save-bots-btn')
  elements.settingsSections = document.getElementById('settings-sections')
  elements.saveSettingsButton = document.getElementById('save-settings-btn')
  elements.validationBanner = document.getElementById('validation-banner')
  elements.logStream = document.getElementById('log-stream')
  elements.logCounter = document.getElementById('log-counter')
  elements.chatLogStream = document.getElementById('chat-log-stream')
  elements.chatLogCounter = document.getElementById('chat-log-counter')
  elements.updatesContent = document.getElementById('updates-content')
  elements.checkUpdatesButton = document.getElementById('check-updates-btn')
  elements.downloadUpdateButton = document.getElementById('download-update-btn')
  elements.installUpdateButton = document.getElementById('install-update-btn')
  elements.openReleaseButton = document.getElementById('open-release-btn')
  elements.aboutContent = document.getElementById('about-content')
  elements.configPathLabel = document.getElementById('config-path-label')
  elements.logPathLabel = document.getElementById('log-path-label')
  elements.chatLogPathLabel = document.getElementById('chat-log-path-label')
  elements.runtimePathLabel = document.getElementById('runtime-path-label')
  elements.addBotButton = document.getElementById('add-bot-btn')
  elements.duplicateBotButton = document.getElementById('duplicate-bot-btn')
  elements.removeBotButton = document.getElementById('remove-bot-btn')
  elements.importConfigButton = document.getElementById('import-config-btn')
  elements.exportConfigButton = document.getElementById('export-config-btn')
  elements.resetConfigButton = document.getElementById('reset-config-btn')
  elements.coordinateModal = document.getElementById('coordinate-modal')
  elements.coordinateModal.style.display = elements.coordinateModal.hidden ? 'none' : 'grid'
  elements.coordinateModalTarget = document.getElementById('coordinate-modal-target')
  elements.coordinateTextarea = document.getElementById('coordinate-textarea')
  elements.closeCoordinateModalButton = document.getElementById('close-coordinate-modal-btn')
  elements.replaceCoordinatesButton = document.getElementById('replace-coordinates-btn')
  elements.appendCoordinatesButton = document.getElementById('append-coordinates-btn')
  elements.toastStack = document.getElementById('toast-stack')
}

async function bootstrap() {
  cacheElements()
  attachStaticListeners()

  const bootstrapPayload = await bridge.getBootstrap()
  state.config = normalizeConfigShape(bootstrapPayload.config)
  state.desktopSettings = {
    ...createDefaultDesktopSettings(),
    ...(bootstrapPayload.desktopSettings || {})
  }
  state.platform = bootstrapPayload.platform || 'desktop'
  state.appVersion = bootstrapPayload.appVersion || bootstrapPayload.updates?.currentVersion || '0.0.0'
  state.updateSource = bootstrapPayload.updateSource || null
  state.capabilities = normalizeCapabilities(bootstrapPayload.capabilities)
  state.runtime = {
    ...createEmptyRuntime(),
    ...(bootstrapPayload.runtime || {})
  }
  state.updates = {
    ...createEmptyUpdateState(),
    currentVersion: state.appVersion,
    ...(bootstrapPayload.updates || {})
  }
  state.selectedBotIndex = 0

  document.body.dataset.platform = state.platform

  if (state.unsubscribeRuntime) {
    state.unsubscribeRuntime()
  }

  state.unsubscribeRuntime = bridge.onRuntimeState(nextRuntime => {
    state.runtime = {
      ...createEmptyRuntime(),
      ...(nextRuntime || {})
    }

    const runtimeParts = ['chrome']

    if (state.activeTab === 'dashboard') {
      runtimeParts.push('dashboard')
    } else if (state.activeTab === 'bots') {
      runtimeParts.push('botList', 'botEditor')
    } else if (state.activeTab === 'logs') {
      runtimeParts.push(state.activeLogView === 'chat' ? 'chat' : 'logs')
    } else if (state.activeTab === 'more' && state.activeMoreView === 'about') {
      runtimeParts.push('about')
    }

    queueRender(runtimeParts)
  })

  if (state.unsubscribeUpdates) {
    state.unsubscribeUpdates()
  }

  state.unsubscribeUpdates = bridge.onUpdateState(nextUpdates => {
    state.updates = {
      ...createEmptyUpdateState(),
      currentVersion: state.appVersion,
      ...(nextUpdates || {})
    }
    queueRender(state.activeTab === 'more' && state.activeMoreView === 'updates' ? 'updates' : null, 'chrome', 'about')
  })

  renderAll()
  startAutoUpdateCheck()
}

function openCoordinateModal() {
  const selectedBot = getSelectedBot()
  state.coordinateModalOpen = true
  elements.coordinateModal.hidden = false
  elements.coordinateModal.style.display = 'grid'
  elements.coordinateModalTarget.textContent = selectedBot
    ? `Бот: ${selectedBot.username}`
    : 'Бот не выбран'
}

function validateConfig(config) {
  const issues = []
  const usernames = new Set()

  if (!config?.server?.host) issues.push('Заполните `server.host`.')
  if (!config?.server?.version) issues.push('Заполните `server.version`.')

  if (!Array.isArray(config?.bots) || config.bots.length === 0) {
    issues.push('Добавьте хотя бы одного бота в конфиг.')
    return issues
  }

  config.bots.forEach((bot, index) => {
    const label = bot.username || `Бот #${index + 1}`

    if (!bot.username) {
      issues.push(`У бота #${index + 1} не заполнен username.`)
    }

    if (bot.username && usernames.has(bot.username)) {
      issues.push(`Username "${bot.username}" повторяется. Для каждого бота нужен уникальный username.`)
    }
    usernames.add(bot.username)

    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isFinite(Number(bot?.standPosition?.[axis]))) {
        issues.push(`${label}: standPosition.${axis} должно быть числом.`)
      }
    }

    if (!Number.isFinite(Number(bot?.maxDistanceFromStand))) {
      issues.push(`${label}: maxDistanceFromStand должно быть числом.`)
    }

    if (!Array.isArray(bot.blocksToMine) || bot.blocksToMine.length === 0) {
      issues.push(`${label}: список blocksToMine пуст. Добавьте хотя бы одну координату для добычи.`)
      return
    }

    if (bot?.entryButton?.enabled) {
      for (const axis of ['x', 'y', 'z']) {
        if (!Number.isFinite(Number(bot?.entryButton?.[axis]))) {
          issues.push(`${label}: entryButton.${axis} должно быть числом.`)
        }
      }
    }

    bot.blocksToMine.forEach((coordinate, coordinateIndex) => {
      for (const axis of ['x', 'y', 'z']) {
        if (!Number.isFinite(Number(coordinate?.[axis]))) {
          issues.push(`${label}: blocksToMine[${coordinateIndex + 1}].${axis} должно быть числом.`)
        }
      }
    })
  })

  return issues
}

function formatCoordinateValue(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? String(numberValue) : '0'
}

function formatCoordinatesText(coordinates = []) {
  return coordinates
    .map(coordinate => ['x', 'y', 'z']
      .map(axis => formatCoordinateValue(coordinate?.[axis]))
      .join(' '))
    .join('\n')
}

function expandCoordinateRange(start, end) {
  if (start === end) return [start]

  const step = start < end ? 1 : -1
  const values = []
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    values.push(value)
  }
  return values
}

function parseCoordinateToken(token) {
  const normalized = token.trim().replace(',', '.')
  const rangeMatch = normalized.match(/^(-?\d+(?:\.\d+)?)(?:\.\.|-)(-?\d+(?:\.\d+)?)$/)
  if (rangeMatch) {
    const start = Number(rangeMatch[1])
    const end = Number(rangeMatch[2])
    if (Number.isInteger(start) && Number.isInteger(end)) {
      return expandCoordinateRange(start, end)
    }
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    return null
  }
  return [value]
}

function expandCoordinateSegment(numbers) {
  const start = numbers.slice(0, 3)
  const end = numbers.slice(3, 6)
  const deltas = end.map((value, index) => value - start[index])
  const distance = Math.max(...deltas.map(delta => Math.abs(delta)))

  if (!Number.isInteger(distance) || distance === 0) {
    return [
      { x: start[0], y: start[1], z: start[2] },
      { x: end[0], y: end[1], z: end[2] }
    ]
  }

  if (!deltas.every(delta => delta === 0 || Math.abs(delta) === distance)) {
    return [
      { x: start[0], y: start[1], z: start[2] },
      { x: end[0], y: end[1], z: end[2] }
    ]
  }

  return Array.from({ length: distance + 1 }, (_, index) => ({
    x: start[0] + Math.sign(deltas[0]) * index,
    y: start[1] + Math.sign(deltas[1]) * index,
    z: start[2] + Math.sign(deltas[2]) * index
  }))
}

function uniqueCoordinates(coordinates) {
  const seen = new Set()
  const result = []

  for (const coordinate of coordinates) {
    const key = `${coordinate.x}:${coordinate.y}:${coordinate.z}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(coordinate)
  }

  return result
}

function parseCoordinatesText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/(?:#|\/\/).*$/, ''))
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    throw new Error('Вставьте хотя бы одну строку с координатами.')
  }

  const parsedCoordinates = []

  lines.forEach((line, index) => {
    const tokenLine = line
      .replace(/[xyzXYZ]\s*[:=]\s*/g, '')
      .replace(/[;,|]/g, ' ')
      .replace(/[()[\]{}]/g, ' ')
      .trim()
    const tokens = tokenLine.split(/\s+/).filter(Boolean)

    if (tokens.length === 3) {
      const ranges = tokens.map(parseCoordinateToken)
      if (ranges.every(Boolean)) {
        for (const x of ranges[0]) {
          for (const y of ranges[1]) {
            for (const z of ranges[2]) {
              parsedCoordinates.push({ x, y, z })
            }
          }
        }
        return
      }
    }

    const numbers = line.match(/-?\d+(?:[.,]\d+)?/g)?.map(value => Number(value.replace(',', '.'))) || []
    if (numbers.length === 6 && /(?:->|=>|\bto\b|\bдо\b)/i.test(line)) {
      parsedCoordinates.push(...expandCoordinateSegment(numbers))
      return
    }

    if (numbers.length >= 3 && numbers.length % 3 === 0) {
      for (let numberIndex = 0; numberIndex < numbers.length; numberIndex += 3) {
        parsedCoordinates.push({
          x: numbers[numberIndex],
          y: numbers[numberIndex + 1],
          z: numbers[numberIndex + 2]
        })
      }
      return
    }

    if (numbers.length < 3) {
      throw new Error(`Не удалось разобрать строку ${index + 1}: "${line}"`)
    }

    parsedCoordinates.push({ x: numbers[0], y: numbers[1], z: numbers[2] })
  })

  return uniqueCoordinates(parsedCoordinates)
}

function syncMobileStickyMetrics() {
  const rootStyle = document.documentElement.style
  const suppressTopStickyChrome = state.platform === 'android'
  const isAndroidCompactLayout = suppressTopStickyChrome && window.matchMedia('(max-width: 1080px)').matches
  const topbarHeight = suppressTopStickyChrome ? 0 : Math.ceil(elements.dashboardTopbar?.offsetHeight || 0)
  const mobileOverviewCard = elements.mobileOverview?.querySelector('.mini-status-card')
  const mobileOverviewHeight = suppressTopStickyChrome ? 0 : Math.ceil(mobileOverviewCard?.offsetHeight || 0)

  rootStyle.setProperty('--mobile-topbar-height', `${topbarHeight}px`)
  rootStyle.setProperty('--mobile-overview-sticky-height', `${mobileOverviewHeight}px`)
}

function renderChrome() {
  const runtimeStatus = formatStatus(state.runtime.status)
  const configuredBots = getBots().length
  const snapshot = state.runtime.snapshot || {}
  const health = getRuntimeHealth(snapshot)
  const runtimeTotalBots = snapshot.totalBots || configuredBots
  const activeBots = snapshot.activeBots || 0
  const {
    supportsRuntimeControl,
    supportsImport,
    supportsExport,
    supportsRuntimeFolder,
    isRunning,
    isBusy
  } = getRuntimeUiState()
  const platformLabel = state.platform === 'android'
    ? (supportsRuntimeControl ? 'Android local runtime' : 'Android config shell')
    : 'Desktop runtime shell'
  const isAndroidCompactLayout = state.platform === 'android' && window.matchMedia('(max-width: 1080px)').matches

  const statusCopy = !supportsRuntimeControl
    ? 'Конфиг хранится локально в Android/WebView-оболочке. Кнопки запуска backend скрыты, чтобы не тратить батарею на неработающий процесс.'
    : state.isDirty
      ? 'Есть несохраненные изменения. Сначала сохраните конфиг, чтобы запустить backend с новыми параметрами.'
      : 'Локальная конфигурация загружена и готова к запуску.'

  if (elements.platformLabel) {
    elements.platformLabel.textContent = platformLabel
  }
  const logsPanelHeading = document.querySelector('#logs-panel .panel-header h3')
  if (logsPanelHeading) {
    logsPanelHeading.textContent = 'Логи runtime'
  }
  const logsPanelEyebrow = document.querySelector('#logs-panel .panel-header .eyebrow')
  if (logsPanelEyebrow) {
    logsPanelEyebrow.textContent = 'Логи'
  }
  if (elements.dashboardTopbar) {
    elements.dashboardTopbar.hidden = state.platform === 'android'
  }
  if (elements.topbarTitle) {
    elements.topbarTitle.textContent = getActiveTabTitle()
  }
  elements.sidebarStatusPill.className = `status-pill ${runtimeStatus.className}`
  elements.sidebarStatusPill.textContent = runtimeStatus.label
  elements.sidebarStatusCopy.textContent = statusCopy
  document.body.dataset.platform = state.platform

  elements.topbarSubtitle.textContent = state.isDirty
    ? 'Сначала сохраните изменения, затем продолжайте работу с runtime.'
    : supportsRuntimeControl
      ? `Конфиг готов к запуску. Ботов в профиле: ${configuredBots}.`
      : `Мобильная сборка готова к редактированию. Ботов в профиле: ${configuredBots}.`

  elements.topbarSubtitle.textContent = state.isDirty
    ? 'Сначала сохраните изменения, затем продолжайте работу с runtime.'
    : buildTopbarSubtitle({
      configuredBots,
      activeBots,
      runtimeTotalBots,
      isRunning,
      supportsRuntimeControl
    })

  elements.summaryCards.innerHTML = [
    createSummaryCard(
      'Runtime',
      escapeHtml(runtimeStatus.label),
      `${formatNumber(activeBots)}/${formatNumber(runtimeTotalBots)} активных · ${formatNumber(configuredBots)} в конфиге`
    ),
    createSummaryCard(
      'Текущий темп добычи',
      `${formatNumber(snapshot.currentRatePerMinute || 0, 1)} блок/мин`,
      `${formatNumber(snapshot.currentRatePerSecond || 0, 2)} блок/с · raw ${formatNumber(snapshot.currentRawRatePerMinute || 0, 1)} б/м`
    ),
    createSummaryCard(
      'Добыто',
      formatNumber(snapshot.totalBlocks || 0),
      `Аптайм ${formatDuration(snapshot.uptimeMs || 0)}`
    ),
    createSummaryCard(
      'Состояние',
      escapeHtml(formatHealthReason(health.reason)),
      escapeHtml(health.diagnosis || '')
    )
  ].join('')

  if (elements.mobileOverview) {
    const showMobileOverview = state.activeTab === 'dashboard'
    elements.mobileOverview.hidden = !showMobileOverview
    elements.mobileOverview.innerHTML = showMobileOverview
      ? buildMobileOverviewMarkup({
        runtimeStatus,
        configuredBots,
        activeBots,
        runtimeTotalBots,
        snapshot
      })
      : ''
  }

  if (elements.mobileActionBar) {
    const actions = buildMobileActions({
      supportsRuntimeControl,
      supportsImport,
      supportsExport,
      isRunning,
      isBusy
    })
    elements.mobileActionBar.hidden = actions.length === 0
    elements.mobileActionBar.innerHTML = actions.map(renderMobileActionButton).join('')
  }

  elements.startStopButton.hidden = !supportsRuntimeControl
  elements.restartButton.hidden = !supportsRuntimeControl
  elements.pauseButton.hidden = !supportsRuntimeControl
  elements.openRuntimeDirButton.hidden = !supportsRuntimeFolder
  elements.importConfigButton.hidden = !supportsImport
  elements.exportConfigButton.hidden = !supportsExport

  elements.startStopButton.textContent = isRunning ? 'Остановить' : 'Запустить'
  elements.startStopButton.disabled = !supportsRuntimeControl || isBusy
  elements.restartButton.disabled = !supportsRuntimeControl || !isRunning
  elements.pauseButton.disabled = !supportsRuntimeControl || !isRunning
  elements.pauseButton.textContent = state.runtime.isPaused ? 'Снять паузу' : 'Пауза'

  elements.saveConfigButton.disabled = !state.isDirty
  if (elements.saveBotsButton) {
    elements.saveBotsButton.disabled = !state.isDirty
  }
  if (elements.saveSettingsButton) {
    elements.saveSettingsButton.disabled = !state.isDirty
  }

  elements.logCounter.textContent = `${(state.runtime.logs || []).length} записей`
  if (elements.chatLogCounter) {
    elements.chatLogCounter.textContent = `${(state.runtime.chatLogs || []).length} записей`
  }
  if (elements.configPathLabel) elements.configPathLabel.textContent = state.runtime.configPath || '-'
  if (elements.logPathLabel) elements.logPathLabel.textContent = state.runtime.logPath || '-'
  if (elements.chatLogPathLabel) elements.chatLogPathLabel.textContent = state.runtime.chatLogPath || '-'
  if (elements.runtimePathLabel) elements.runtimePathLabel.textContent = state.runtime.runtimeDir || '-'
  renderContextSwitcher()
  syncMobileStickyMetrics()
}

function renderDashboard() {
  const snapshotBots = state.runtime.snapshot?.bots || {}
  const snapshot = state.runtime.snapshot || {}
  const configBots = getBots()
  const configuredNames = new Set(configBots.map(bot => bot.username))
  const cards = []
  const supportsRuntimeControl = state.capabilities.runtimeControl !== false
  const health = getRuntimeHealth(snapshot)

  if (health.reason && health.reason !== 'mining-ok') {
    cards.push(renderHealthDashboardCard(snapshot))
  }

  if (Object.keys(snapshotBots).length > 0) {
    const orderedBots = [
      ...configBots
        .map(bot => [bot.username, snapshotBots[bot.username]])
        .filter(([, botData]) => Boolean(botData)),
      ...Object.entries(snapshotBots).filter(([botName]) => !configuredNames.has(botName))
    ]

    orderedBots.forEach(([botName, botData]) => {
      const lastBlockLabel = botData?.lastBlockTime
        ? `${formatDuration(Date.now() - botData.lastBlockTime)} назад`
        : 'Еще нет данных'

      cards.push(`
        <article class="dashboard-card">
          <div class="panel-header panel-header--spread">
            <div>
              <p class="eyebrow">Live bot</p>
              <h4>${escapeHtml(botName)}</h4>
            </div>
            <span class="chip">${escapeHtml(formatLiveStatus(botData?.status))}</span>
          </div>
          <div class="dashboard-meta">
            <div class="dashboard-meta-row"><span>Добыто блоков</span><strong>${formatNumber(botData?.blocksTotal || 0)}</strong></div>
            <div class="dashboard-meta-row"><span>Effective</span><strong>${formatNumber(botData?.effectiveBlocksLastMinute ?? botData?.blocksLastMinute ?? 0, 1)} б/м</strong></div>
            <div class="dashboard-meta-row"><span>Raw</span><strong>${formatNumber(botData?.rawBlocksLastMinute || 0, 1)} б/м</strong></div>
            <div class="dashboard-meta-row"><span>Последний блок</span><strong>${escapeHtml(lastBlockLabel)}</strong></div>
          </div>
        </article>
      `)
    })
  } else if (configBots.length > 0) {
    configBots.forEach(bot => {
      const buttonLabel = bot.entryButton?.enabled
        ? `${bot.entryButton.x}, ${bot.entryButton.y}, ${bot.entryButton.z}`
        : 'выкл'

      cards.push(`
        <article class="dashboard-card">
          <div class="panel-header panel-header--spread">
            <div>
              <p class="eyebrow">Профиль бота</p>
              <h4>${escapeHtml(bot.username)}</h4>
            </div>
            <span class="chip">Живой runtime еще не запущен</span>
          </div>
          <div class="dashboard-meta">
            <div class="dashboard-meta-row"><span>Позиция стенда</span><strong>${bot.standPosition.x}, ${bot.standPosition.y}, ${bot.standPosition.z}</strong></div>
            <div class="dashboard-meta-row"><span>Точек добычи</span><strong>${formatNumber(bot.blocksToMine.length)}</strong></div>
            <div class="dashboard-meta-row"><span>Макс. дистанция</span><strong>${formatNumber(bot.maxDistanceFromStand, 2)} м</strong></div>
            <div class="dashboard-meta-row"><span>Кнопка входа</span><strong>${escapeHtml(buttonLabel)}</strong></div>
          </div>
        </article>
      `)
    })
  } else {
    cards.push(supportsRuntimeControl
      ? '<div class="dashboard-empty">Добавьте бота, сохраните конфиг и запустите runtime.</div>'
      : '<div class="dashboard-empty">Добавьте бота, чтобы настроить маршрут и сохранить конфиг на устройстве.</div>'
    )
  }

  elements.dashboardBotGrid.innerHTML = cards.join('')
}

function renderBotList() {
  const bots = getBots()
  ensureSelectedBot()

  if (!bots.length) {
    elements.botList.innerHTML = '<div class="empty-state">Список ботов пока пуст. Нажмите "Добавить бота", чтобы создать первый профиль.</div>'
    return
  }

  const snapshotBots = state.runtime.snapshot?.bots || {}
  const activeCount = bots.filter(bot => {
    const status = snapshotBots[bot.username]?.status
    return status && !['offline', 'stopped', 'error'].includes(status)
  }).length

  const headerMarkup = `
    <div class="bot-list__header">
      <div>
        <p class="eyebrow">Profiles</p>
        <h4>Профили</h4>
      </div>
      <span class="chip">${formatNumber(bots.length)} бота · ${formatNumber(activeCount)} активн.</span>
    </div>
  `

  const cardMarkup = bots.map((bot, index) => {
    const liveBot = snapshotBots[bot.username]
    const liveStatus = liveBot ? formatLiveStatus(liveBot.status) : 'Не запущен'
    const liveStatusClass = getLiveStatusClass(liveBot?.status)
    const routePoints = bot.blocksToMine?.length || 0

    return `
      <button class="bot-card ${liveStatusClass} ${index === state.selectedBotIndex ? 'is-active' : ''}" type="button" data-bot-index="${index}">
        <div class="bot-card__top">
          <span class="bot-card__index">${String(index + 1).padStart(2, '0')}</span>
          <div class="bot-card__identity">
            <strong>${escapeHtml(bot.username)}</strong>
            <span>Стенд: ${escapeHtml(formatCoordinateTriplet(bot.standPosition))}</span>
          </div>
          <span class="bot-status-dot" aria-hidden="true"></span>
        </div>
        <p class="bot-card__line">${escapeHtml(liveStatus)} · ${formatNumber(liveBot?.blocksLastMinute || 0, 1)} б/м · ${formatNumber(routePoints)} точек</p>
      </button>
    `
  }).join('')

  elements.botList.innerHTML = headerMarkup + cardMarkup

  elements.botList.querySelectorAll('[data-bot-index]').forEach(button => {
    button.addEventListener('click', () => {
      selectBot(Number(button.dataset.botIndex))
    })
  })
}

function renderBotEditor() {
  const bot = getSelectedBot()
  if (!bot) {
    elements.botEditor.innerHTML = '<div class="empty-state">Выберите бота в списке сверху или создайте нового, чтобы настроить маршрут добычи и параметры входа.</div>'
    return
  }

  const liveBot = state.runtime.snapshot?.bots?.[bot.username]
  const liveStatus = liveBot ? formatLiveStatus(liveBot.status) : 'Не запущен'
  const liveStatusClass = getLiveStatusClass(liveBot?.status)
  const liveBlocks = liveBot?.blocksTotal || 0
  const liveRate = liveBot?.blocksLastMinute || 0
  const standLabel = formatCoordinateTriplet(bot.standPosition)
  const buttonLabel = formatEntryButtonLabel(bot)
  const lastBlockLabel = formatLastBlockLabel(liveBot)
  const routePointsCount = (bot.blocksToMine || []).length

  elements.botEditor.innerHTML = `
    <article class="bot-control-panel ${liveStatusClass}">
      <div class="bot-control-panel__main">
        <p class="eyebrow">Selected</p>
        <h3>${escapeHtml(bot.username)}</h3>
        <div class="bot-control-panel__meta">
          <span>Стенд: ${escapeHtml(standLabel)}</span>
          <span>Кнопка: ${escapeHtml(buttonLabel)}</span>
        </div>
      </div>
      <div class="bot-live-grid bot-live-grid--compact">
        <div class="bot-stat">
          <span>Статус</span>
          <strong>${escapeHtml(liveStatus)}</strong>
        </div>
        <div class="bot-stat">
          <span>Скорость</span>
          <strong>${formatNumber(liveRate, 1)} б/м</strong>
        </div>
        <div class="bot-stat">
          <span>Добыто</span>
          <strong>${formatNumber(liveBlocks)}</strong>
        </div>
      </div>
    </article>

    <div class="bot-editor-sections">
      <article class="bot-editor-card bot-editor-card--profile">
        <div class="bot-card-section">
          <div class="panel-header panel-header--spread">
            <div>
              <p class="eyebrow">Profile</p>
              <h3>Основное</h3>
            </div>
            <span class="chip">Блок: ${escapeHtml(lastBlockLabel)}</span>
          </div>
          <div class="field-grid bot-field-grid--two">
            <label class="field">
              <span class="field-label">Имя бота</span>
              <input type="text" value="${escapeAttribute(bot.username)}" data-bot-field="username" />
            </label>
            <label class="field">
              <span class="field-label">Макс. дистанция от стенда</span>
              <input type="number" inputmode="decimal" step="any" value="${bot.maxDistanceFromStand}" data-bot-field="maxDistanceFromStand" />
            </label>
          </div>
        </div>

        <div class="bot-card-section">
          <div>
            <p class="eyebrow">Stand position</p>
            <h3>Точка стояния</h3>
          </div>
          <div class="field-grid bot-axis-grid">
            ${['x', 'y', 'z'].map(axis => `
              <label class="field">
                <span class="field-label">${axis.toUpperCase()}</span>
                <input type="number" inputmode="decimal" step="any" value="${bot.standPosition[axis]}" data-stand-axis="${axis}" />
              </label>
            `).join('')}
          </div>
        </div>

        <details class="bot-details" ${bot.entryButton?.enabled ? 'open' : ''}>
          <summary>
            <span>Кнопка после входа</span>
            <span class="chip">${escapeHtml(buttonLabel)}</span>
          </summary>
          <label class="field--checkbox field--checkbox-rich">
            <div class="field-checkbox-copy">
              <div class="field-label field-label--rich">
                <span>Нажимать кнопку автоматически</span>
              </div>
            </div>
            <input type="checkbox" ${bot.entryButton?.enabled ? 'checked' : ''} data-entry-button-enabled="true" />
          </label>
          <div class="field-grid bot-axis-grid">
            ${['x', 'y', 'z'].map(axis => `
              <label class="field">
                <span class="field-label">Кнопка ${axis.toUpperCase()}</span>
                <input
                  type="number"
                  inputmode="decimal"
                  step="any"
                  value="${bot.entryButton?.[axis] ?? 0}"
                  data-entry-button-axis="${axis}"
                  ${bot.entryButton?.enabled ? '' : 'disabled'}
                />
              </label>
            `).join('')}
          </div>
        </details>
      </article>

      <article class="bot-editor-card bot-editor-card--route">
        <div class="panel-header panel-header--spread">
          <div>
            <p class="eyebrow">Mining route</p>
            <h3>Маршрут добычи</h3>
          </div>
          <span class="chip">${routePointsCount} точек</span>
        </div>
        <div class="coordinate-bulk-editor coordinate-bulk-editor--primary">
          <div class="coordinates-toolbar coordinates-toolbar--compact">
            <button class="button button--primary" type="button" id="apply-coordinate-list-btn">Применить список</button>
            <button class="button button--secondary" type="button" id="copy-coordinate-list-btn">Копировать</button>
            <button class="button button--secondary" type="button" id="open-coordinate-modal-btn">Открыть крупно</button>
          </div>
          <label class="field">
            <span class="field-label">Список координат блоков</span>
            <textarea id="coordinate-list-textarea" class="coordinate-textarea coordinate-textarea--inline" spellcheck="false">${escapeHtml(formatCoordinatesText(bot.blocksToMine))}</textarea>
          </label>
        </div>
      </article>
    </div>
  `

  elements.botEditor.querySelectorAll('[data-bot-field]').forEach(input => {
    input.addEventListener('input', event => {
      const fieldName = event.currentTarget.dataset.botField
      const rawValue = event.currentTarget.value
      bot[fieldName] = fieldName === 'username' ? rawValue : parsePrimitiveValue('number', rawValue)
      markDirty()
      queueRender('botList', 'dashboard')
    })
  })

  elements.botEditor.querySelectorAll('[data-stand-axis]').forEach(input => {
    input.addEventListener('input', event => {
      const axis = event.currentTarget.dataset.standAxis
      bot.standPosition[axis] = parsePrimitiveValue('number', event.currentTarget.value)
      markDirty()
      queueRender('botList', 'dashboard')
    })
  })

  elements.botEditor.querySelectorAll('[data-entry-button-enabled]').forEach(input => {
    input.addEventListener('change', event => {
      bot.entryButton.enabled = event.currentTarget.checked
      markDirty()
      queueRender('botEditor', 'botList', 'dashboard')
    })
  })

  elements.botEditor.querySelectorAll('[data-entry-button-axis]').forEach(input => {
    input.addEventListener('input', event => {
      const axis = event.currentTarget.dataset.entryButtonAxis
      bot.entryButton[axis] = parsePrimitiveValue('number', event.currentTarget.value)
      markDirty()
      queueRender('botList', 'dashboard')
    })
  })

  const coordinateListTextarea = elements.botEditor.querySelector('#coordinate-list-textarea')
  const applyCoordinateListButton = elements.botEditor.querySelector('#apply-coordinate-list-btn')
  const copyCoordinateListButton = elements.botEditor.querySelector('#copy-coordinate-list-btn')

  const applyCoordinateList = () => {
    try {
      const parsed = parseCoordinatesText(coordinateListTextarea.value)
      bot.blocksToMine = parsed
      markDirty()
      queueRender('botEditor', 'botList', 'dashboard')
      showToast(`Маршрут обновлен: ${parsed.length} точек.`, 'success')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  coordinateListTextarea.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      applyCoordinateList()
    }
  })

  applyCoordinateListButton.addEventListener('click', applyCoordinateList)

  copyCoordinateListButton.addEventListener('click', async () => {
    const text = formatCoordinatesText(bot.blocksToMine)
    try {
      await navigator.clipboard.writeText(text)
      showToast('Список координат скопирован.', 'success')
    } catch (error) {
      coordinateListTextarea.focus()
      coordinateListTextarea.select()
      showToast('Список выделен, можно скопировать вручную.', 'warning')
    }
  })

  elements.botEditor.querySelector('#open-coordinate-modal-btn').addEventListener('click', () => {
    openCoordinateModal()
    elements.coordinateTextarea.value = formatCoordinatesText(bot.blocksToMine)
    elements.coordinateTextarea.focus()
  })
}

function getVisibleSettingsSections() {
  const baseSections = BOT_SETTINGS_SECTIONS_V2
    .map(section => ({
      ...section,
      fields: section.fields.filter(field => VISIBLE_CONFIG_SETTING_PATHS.has(field.path))
    }))
    .filter(section => section.fields.length > 0)

  const extraSections = state.platform === 'desktop' ? EXTRA_SETTINGS_SECTIONS : []
  return [...baseSections, ...extraSections]
}

function renderSettingsV2() {
  const visibleSections = getVisibleSettingsSections()

  const desktopSettingsCard = state.platform === 'desktop'
    ? `
      <article class="settings-card settings-card--section">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Desktop</p>
            <h4>Приложение</h4>
          </div>
        </div>
        <div class="settings-card-grid settings-card-grid--single">
          ${DESKTOP_SETTINGS_FIELDS_V2.map(field => renderSettingsField('desktop', field)).join('')}
        </div>
      </article>
    `
    : ''

  elements.settingsSections.innerHTML = `
    ${desktopSettingsCard}

    <article class="settings-card settings-card--section">
      <div class="settings-section-stack">
        ${visibleSections.map((section, index) => `
          <section class="settings-subsection" id="settings-section-${index + 1}">
            <div class="panel-header">
              <div>
                <p class="eyebrow">${escapeHtml(section.eyebrow)}</p>
                <h4>${escapeHtml(section.title)}</h4>
              </div>
            </div>
            <div class="settings-card-grid">
              ${section.fields.map(field => renderSettingsField('config', field)).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </article>
  `

  elements.settingsSections.querySelectorAll('[data-settings-path]').forEach(input => {
    const eventName = input.type === 'checkbox' ? 'change' : 'input'
    input.addEventListener(eventName, event => {
      const targetName = event.currentTarget.dataset.settingsTarget
      const path = event.currentTarget.dataset.settingsPath
      const kind = event.currentTarget.dataset.settingsKind
      const rawValue = event.currentTarget.type === 'checkbox'
        ? event.currentTarget.checked
        : event.currentTarget.value

      if (targetName === 'desktop') {
        setValueByPath(state.desktopSettings, path, parsePrimitiveValue(kind, rawValue))
      } else {
        setValueByPath(state.config, path, toStoredSettingsValue(path, kind, rawValue))
      }

      markDirty()
    })
  })
}

function renderValidation() {
  const issues = validateConfig(state.config)
  if (!issues.length) {
    elements.validationBanner.hidden = true
    elements.validationBanner.innerHTML = ''
    return
  }

  elements.validationBanner.hidden = false
  elements.validationBanner.innerHTML = `
    <strong>Найдены проблемы в конфиге:</strong><br />
    ${issues.slice(0, 8).map(issue => escapeHtml(issue)).join('<br />')}
  `
}

function formatUpdateStatus(status) {
  const map = {
    idle: { label: 'Не проверялось', className: 'status-pill--idle' },
    checking: { label: 'Проверка', className: 'status-pill--starting' },
    current: { label: 'Актуальная', className: 'status-pill--running' },
    available: { label: 'Доступно', className: 'status-pill--starting' },
    downloading: { label: 'Скачивание', className: 'status-pill--starting' },
    ready: { label: 'Готово к установке', className: 'status-pill--running' },
    installing: { label: 'Установка', className: 'status-pill--starting' },
    unavailable: { label: 'Нет файла', className: 'status-pill--error' },
    error: { label: 'Ошибка', className: 'status-pill--error' }
  }
  return map[status] || map.idle
}

function getUpdateProgress(updates = state.updates) {
  const progress = updates.progress || {}
  const receivedBytes = Number(progress.receivedBytes) || 0
  const totalBytes = Number(progress.totalBytes) || Number(updates.asset?.size) || 0
  const percent = Number.isFinite(Number(progress.percent))
    ? Math.max(0, Math.min(100, Number(progress.percent)))
    : totalBytes > 0
      ? Math.max(0, Math.min(100, (receivedBytes / totalBytes) * 100))
      : 0

  return { receivedBytes, totalBytes, percent }
}

function renderUpdates() {
  if (!elements.updatesContent) return

  const updates = {
    ...createEmptyUpdateState(),
    currentVersion: state.appVersion,
    ...state.updates
  }
  const status = formatUpdateStatus(updates.status)
  const progress = getUpdateProgress(updates)
  const supportsUpdates = state.capabilities.updates === true
  const canCheck = supportsUpdates && !['checking', 'downloading', 'installing'].includes(updates.status)
  const canDownload = supportsUpdates && updates.status === 'available' && updates.updateAvailable && updates.asset
  const canInstall = supportsUpdates && updates.status === 'ready' && updates.downloadedFilePath
  const releaseUrl = updates.releaseUrl || state.updateSource?.releaseUrl || ''
  const releaseBody = String(updates.body || '').trim()
  const assetName = updates.asset?.name || '-'
  const assetSize = updates.asset?.size || updates.downloadedSize || 0

  if (elements.checkUpdatesButton) elements.checkUpdatesButton.disabled = !canCheck
  if (elements.downloadUpdateButton) elements.downloadUpdateButton.disabled = !canDownload
  if (elements.installUpdateButton) elements.installUpdateButton.disabled = !canInstall
  if (elements.openReleaseButton) elements.openReleaseButton.disabled = !releaseUrl

  if (!supportsUpdates) {
    elements.updatesContent.innerHTML = `
      <div class="empty-state">Центр обновления недоступен в этой оболочке приложения.</div>
    `
    return
  }

  elements.updatesContent.innerHTML = `
    <div class="updates-grid">
      <article class="updates-card updates-card--main">
        <div class="updates-card__top">
          <div>
            <p class="eyebrow">Состояние</p>
            <h4>${escapeHtml(status.label)}</h4>
          </div>
          <span class="status-pill ${status.className}">${escapeHtml(status.label)}</span>
        </div>
        <p class="muted-copy">${escapeHtml(getUpdateStatusCopy(updates))}</p>
        ${updates.status === 'downloading' || updates.status === 'ready'
          ? `
            <div class="update-progress" aria-label="Прогресс скачивания">
              <div class="update-progress__bar">
                <span style="width: ${escapeAttribute(String(progress.percent))}%"></span>
              </div>
              <div class="update-progress__meta">
                <span>${formatNumber(progress.percent, 0)}%</span>
                <span>${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes || assetSize)}</span>
              </div>
            </div>
          `
          : ''
        }
        ${updates.error ? `<div class="validation-banner">${escapeHtml(updates.error)}</div>` : ''}
      </article>

      <article class="updates-card">
        <span class="summary-label">Текущая версия</span>
        <strong class="summary-value">${escapeHtml(updates.currentVersion || state.appVersion)}</strong>
        <span class="summary-note">Установлена сейчас</span>
      </article>

      <article class="updates-card">
        <span class="summary-label">Последняя версия</span>
        <strong class="summary-value">${escapeHtml(updates.latestVersion || '-')}</strong>
        <span class="summary-note">${escapeHtml(formatDateTime(updates.publishedAt))}</span>
      </article>

      <article class="updates-card">
        <span class="summary-label">Файл обновления</span>
        <strong class="updates-file-name">${escapeHtml(assetName)}</strong>
        <span class="summary-note">${formatBytes(assetSize)}</span>
      </article>

      <article class="updates-card">
        <span class="summary-label">Проверка файла</span>
        <strong>${updates.checksum?.hash ? 'SHA256 готов' : 'SHA256 не найден'}</strong>
        <span class="summary-note">${updates.checksum?.hash ? escapeHtml(updates.checksum.hash.slice(0, 12)) : 'Скачивание будет заблокировано'}</span>
      </article>
    </div>

    <article class="updates-card updates-card--notes">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Release notes</p>
          <h4>${escapeHtml(updates.releaseName || updates.tagName || 'Описание версии')}</h4>
        </div>
      </div>
      <pre class="update-notes">${escapeHtml(releaseBody || 'Описание появится после проверки обновлений.')}</pre>
    </article>
  `
}

function getUpdateStatusCopy(updates) {
  if (updates.status === 'checking') return 'Проверяю последнюю версию на странице скачивания.'
  if (updates.status === 'current') return 'У вас уже установлена последняя доступная версия.'
  if (updates.status === 'available') return 'Найдена новая версия. Скачивание начнётся только после нажатия кнопки.'
  if (updates.status === 'downloading') return 'Скачиваю файл обновления и затем проверю SHA256.'
  if (updates.status === 'ready') return state.platform === 'android'
    ? 'APK скачан и проверен. Нажмите установку, затем подтвердите её в Android.'
    : 'Установщик скачан и проверен. При установке runtime будет остановлен.'
  if (updates.status === 'installing') return 'Открываю системную установку. Подтвердите действие в системе.'
  if (updates.status === 'unavailable') return 'Релиз найден, но файл для этой платформы не прикреплён.'
  if (updates.status === 'error') return 'Проверка или скачивание завершились ошибкой.'
  return 'Автопроверка запускается при старте приложения. Установка всегда только по вашему нажатию.'
}

function renderLogs() {
  const totalLogs = state.runtime.logs || []
  const logs = totalLogs.slice(-140).reverse()
  if (!logs.length) {
    elements.logStream.innerHTML = state.capabilities.runtimeControl !== false
      ? '<div class="empty-state">Логи появятся после запуска backend. Здесь будут события по ботам, таймингам и ошибкам соединения.</div>'
      : '<div class="empty-state">В Android-сборке здесь будут локальные служебные сообщения и будущие события удаленного runtime, если вы подключите его отдельно.</div>'
    return
  }

  elements.logStream.innerHTML = logs.map(entry => `
    <article class="log-entry" data-level="${entry.level || 'info'}">
      <div class="log-entry__top">
        <span>${escapeHtml(entry.time || '-')}</span>
        <span>${escapeHtml(entry.botName || 'SYSTEM')}</span>
        <span>${escapeHtml(entry.level || 'info')}</span>
      </div>
      <pre class="log-entry__message">${escapeHtml(entry.message || entry.rawMessage || '')}</pre>
    </article>
  `).join('')

  if (totalLogs.length > logs.length) {
    elements.logStream.insertAdjacentHTML(
      'beforeend',
      `<div class="log-trim-note">Показаны последние ${logs.length} записей из ${totalLogs.length}; свежие записи находятся сверху.</div>`
    )
  }
}

function formatChatSource(entry = {}) {
  const position = String(entry.position || '').toLowerCase()
  const labels = {
    chat: 'чат',
    system: 'система',
    game_info: 'actionbar',
    unknown: 'неизвестно'
  }
  const label = labels[position] || entry.source || 'чат'
  return entry.sender ? `${label} / ${entry.sender}` : label
}

function renderChatLogs() {
  if (!elements.chatLogStream) return

  const totalChatLogs = state.runtime.chatLogs || []
  const chatLogs = totalChatLogs.slice(-180).reverse()
  if (!chatLogs.length) {
    elements.chatLogStream.innerHTML = state.capabilities.runtimeControl !== false
      ? '<div class="empty-state">Чат появится после запуска backend. Здесь будут сообщения сервера, сканера и игроков отдельно от runtime-логов.</div>'
      : '<div class="empty-state">В Android-сборке здесь появятся сообщения чата, если подключить локальный runtime.</div>'
    return
  }

  elements.chatLogStream.innerHTML = chatLogs.map(entry => `
    <article class="log-entry chat-entry" data-level="chat">
      <div class="log-entry__top">
        <span>${escapeHtml(entry.time || '-')}</span>
        <span>${escapeHtml(entry.botName || 'SERVER')}</span>
        <span>${escapeHtml(formatChatSource(entry))}</span>
      </div>
      <pre class="log-entry__message">${escapeHtml(entry.message || entry.rawMessage || '')}</pre>
    </article>
  `).join('')

  if (totalChatLogs.length > chatLogs.length) {
    elements.chatLogStream.insertAdjacentHTML(
      'beforeend',
      `<div class="log-trim-note">Показаны последние ${chatLogs.length} сообщений из ${totalChatLogs.length}; свежие сообщения находятся сверху.</div>`
    )
  }
}

function renderAbout() {
  if (!elements.aboutContent) return

  const updates = state.updates || {}
  const updateLabel = updates.latestVersion
    ? `${updates.latestVersion}${updates.updateAvailable ? ' доступна' : ' актуальна'}`
    : 'Ещё не проверялось'

  elements.aboutContent.innerHTML = `
    <article class="about-card">
      <span class="summary-label">Приложение</span>
      <strong>ProstoCraft Bot Studio</strong>
      <span class="summary-note">Версия ${escapeHtml(state.appVersion || '0.0.0')}</span>
    </article>
    <article class="about-card">
      <span class="summary-label">Платформа</span>
      <strong>${escapeHtml(state.platform === 'android' ? 'Android' : 'Windows')}</strong>
      <span class="summary-note">${state.capabilities.runtimeControl === false ? 'Конфиг и мониторинг' : 'Локальный runtime'}</span>
    </article>
    <article class="about-card">
      <span class="summary-label">Обновления</span>
      <strong>${escapeHtml(updateLabel)}</strong>
      <span class="summary-note">${escapeHtml(formatDateTime(updates.checkedAt || updates.publishedAt))}</span>
    </article>
    <article class="about-card">
      <span class="summary-label">Runtime</span>
      <strong>${escapeHtml(formatStatus(state.runtime.status).label)}</strong>
      <span class="summary-note">Ботов: ${formatNumber(state.runtime.snapshot?.activeBots || 0)}/${formatNumber(state.runtime.snapshot?.totalBots || getBots().length)}</span>
    </article>
  `
}

async function persistConfig(showSuccessToast = true) {
  const issues = validateConfig(state.config)
  if (issues.length) {
    state.activeTab = 'more'
    state.activeMoreView = 'settings'
    queueRender('tabs', 'chrome', 'settings', 'validation')
    throw new Error('Сначала исправьте ошибки в конфиге на вкладке настроек.')
  }

  const nextDesktopSettings = await bridge.saveDesktopSettings(state.desktopSettings)
  const result = await bridge.saveConfig(state.config)
  state.desktopSettings = {
    ...createDefaultDesktopSettings(),
    ...nextDesktopSettings
  }
  state.config = normalizeConfigShape(result.config)
  state.runtime = {
    ...createEmptyRuntime(),
    ...(result.runtime || {})
  }
  state.isDirty = false
  renderAll()

  if (showSuccessToast) {
    showToast('Конфиг и настройки приложения сохранены.', 'success')
  }
}

async function handleStartStopClick() {
  if (state.capabilities.runtimeControl === false) {
    showToast('В этой Android/WebView-сборке локальный runtime не запускается.', 'warning')
    return
  }

  const isRunning = state.runtime.status === 'running' || state.runtime.status === 'starting'
  if (isRunning) {
    await bridge.stopRuntime()
    return
  }

  await persistConfig(false)
  await bridge.startRuntime()
  showToast('Backend запущен.', 'success')
}

async function handleRestartClick() {
  if (state.capabilities.runtimeControl === false) {
    showToast('Перезапуск runtime доступен только в desktop-сборке.', 'warning')
    return
  }

  await persistConfig(false)
  await bridge.restartRuntime()
  showToast('Backend перезапускается с новым конфигом.', 'success')
}

async function handlePauseToggle() {
  if (state.capabilities.runtimeControl === false) {
    showToast('Пауза runtime доступна только в desktop-сборке.', 'warning')
    return
  }

  const nextPaused = !state.runtime.isPaused
  await bridge.setPaused(nextPaused)
  showToast(nextPaused ? 'Пауза включена.' : 'Пауза снята.', 'success')
}

async function handleImportConfig() {
  const result = await bridge.importConfig()
  if (result.canceled) {
    if (result.reason === 'not_supported') {
      showToast('Импорт конфигурации недоступен на текущей платформе.', 'warning')
    }
    return
  }

  state.config = normalizeConfigShape(result.config)
  state.selectedBotIndex = 0
  state.isDirty = false
  renderAll()
  showToast(`Конфиг импортирован из ${result.importedFrom}.`, 'success')
}

async function handleExportConfig() {
  await persistConfig(false)
  const result = await bridge.exportConfig(state.config)
  if (!result.canceled) {
    showToast(`Конфиг экспортирован в ${result.exportedTo}.`, 'success')
  } else if (result.reason === 'not_supported') {
    showToast('Экспорт конфигурации недоступен на текущей платформе.', 'warning')
  }
}

async function refreshUpdates(showResultToast = false) {
  if (state.capabilities.updates !== true) {
    showToast('Центр обновления недоступен на текущей платформе.', 'warning')
    return
  }

  state.updates = {
    ...state.updates,
    status: 'checking',
    error: ''
  }
  queueRender('updates', 'chrome')

  const result = await bridge.checkUpdates()
  state.updates = {
    ...createEmptyUpdateState(),
    currentVersion: state.appVersion,
    ...(result || {})
  }
  queueRender('updates', 'chrome')

  if (!showResultToast) return
  if (state.updates.status === 'available') {
    showToast(`Доступна версия ${state.updates.latestVersion}.`, 'success')
  } else if (state.updates.status === 'current') {
    showToast('Установлена актуальная версия.', 'success')
  } else if (state.updates.status === 'error') {
    showToast(state.updates.error || 'Не удалось проверить обновления.', 'error')
  }
}

function startAutoUpdateCheck() {
  if (state.updateAutoCheckStarted || state.capabilities.updates !== true) return
  state.updateAutoCheckStarted = true

  window.setTimeout(() => {
    refreshUpdates(false).catch(error => {
      state.updates = {
        ...state.updates,
        status: 'error',
        error: error.message || String(error)
      }
      queueRender('updates', 'chrome')
    })
  }, 1200)
}

async function handleDownloadUpdate() {
  if (state.capabilities.updates !== true) {
    showToast('Центр обновления недоступен на текущей платформе.', 'warning')
    return
  }

  const result = await bridge.downloadUpdate()
  state.updates = {
    ...createEmptyUpdateState(),
    currentVersion: state.appVersion,
    ...(result || {})
  }
  queueRender('updates', 'chrome')
  showToast('Обновление скачано и проверено.', 'success')
}

async function handleInstallUpdate() {
  if (state.capabilities.updates !== true) {
    showToast('Центр обновления недоступен на текущей платформе.', 'warning')
    return
  }

  if (state.platform === 'desktop' && !window.confirm('Остановить runtime и запустить установщик обновления?')) {
    return
  }

  const result = await bridge.installUpdate()
  state.updates = {
    ...createEmptyUpdateState(),
    currentVersion: state.appVersion,
    ...(result || {})
  }
  queueRender('updates', 'chrome')
  showToast(
    state.platform === 'android'
      ? 'Открыл установку APK. Если Android попросит разрешение источника, включите его для приложения.'
      : 'Запускаю установщик обновления.',
    'success'
  )
}

function openUpdateReleasePage() {
  const releaseUrl = state.updates.releaseUrl || state.updateSource?.releaseUrl
  if (!releaseUrl) {
    showToast('Страница версии пока неизвестна. Сначала проверьте обновления.', 'warning')
    return
  }

  window.open(releaseUrl, '_blank', 'noopener')
}

function switchTab(nextTab) {
  if (!nextTab) {
    return
  }

  const previousTab = state.activeTab
  const previousPanel = getActivePanelName()

  if (nextTab === 'chat') {
    state.activeLogView = 'chat'
  } else if (nextTab === 'logs') {
    state.activeLogView = state.activeLogView || 'events'
  } else if (['settings', 'updates', 'files', 'about'].includes(nextTab)) {
    state.activeMoreView = nextTab
  } else if (nextTab === 'more') {
    state.activeMoreView = state.activeMoreView || 'settings'
  }

  const nextTopLevelTab = getTopLevelTabForRequest(nextTab)
  state.activeTab = nextTopLevelTab
  const nextPanel = getActivePanelName()

  if (previousTab === nextTopLevelTab && previousPanel === nextPanel) {
    return
  }

  queueRender(
    'tabs',
    'chrome',
    nextPanel === 'dashboard' ? 'dashboard' : null,
    nextPanel === 'bots' ? ['botList', 'botEditor'] : null,
    nextPanel === 'settings' ? ['settings', 'validation'] : null,
    nextPanel === 'updates' ? 'updates' : null,
    nextPanel === 'logs' ? 'logs' : null,
    nextPanel === 'chat' ? 'chat' : null,
    nextPanel === 'about' ? 'about' : null
  )
}

function selectBot(index, openBotsTab = false) {
  const bots = getBots()
  if (!bots[index]) {
    return
  }

  state.selectedBotIndex = index
  if (openBotsTab) {
    state.activeTab = 'bots'
  }

  queueRender(
    openBotsTab ? 'tabs' : null,
    'chrome',
    'botList',
    'botEditor'
  )
}

function addBot() {
  state.config.bots.push(createBotTemplate())
  state.selectedBotIndex = state.config.bots.length - 1
  state.activeTab = 'bots'
  markDirty()
  queueRender('tabs', 'chrome', 'botList', 'botEditor', 'dashboard')
}

function duplicateSelectedBot() {
  const selectedBot = getSelectedBot()
  if (!selectedBot) return

  state.config.bots.splice(state.selectedBotIndex + 1, 0, createBotTemplate(selectedBot))
  state.selectedBotIndex += 1
  state.activeTab = 'bots'
  markDirty()
  queueRender('tabs', 'chrome', 'botList', 'botEditor', 'dashboard')
}

function removeSelectedBot() {
  const selectedBot = getSelectedBot()
  if (!selectedBot) return
  if (!window.confirm(`Удалить бота "${selectedBot.username}"?`)) return

  state.config.bots.splice(state.selectedBotIndex, 1)
  ensureSelectedBot()
  markDirty()
  queueRender('chrome', 'botList', 'botEditor', 'dashboard')
}

async function handleMobileAction(action) {
  if (action === 'save-config') {
    await persistConfig()
    return
  }

  if (action === 'toggle-runtime') {
    await handleStartStopClick()
    return
  }

  if (action === 'restart-runtime') {
    await handleRestartClick()
    return
  }

  if (action === 'toggle-pause') {
    await handlePauseToggle()
    return
  }

  if (action === 'add-bot') {
    addBot()
    return
  }

  if (action === 'duplicate-bot') {
    duplicateSelectedBot()
    return
  }

  if (action === 'remove-bot') {
    removeSelectedBot()
    return
  }

  if (action === 'import-config') {
    await handleImportConfig()
    return
  }

  if (action === 'export-config') {
    await handleExportConfig()
    return
  }

  if (action === 'reset-config') {
    if (!window.confirm('Сбросить config.json к базовому шаблону? Несохранённые изменения будут потеряны.')) return
    const result = await bridge.resetConfig()
    state.config = normalizeConfigShape(result.config)
    state.selectedBotIndex = 0
    state.isDirty = false
    renderAll()
    showToast('Конфиг сброшен к базовому шаблону.', 'success')
    return
  }

  if (action === 'open-bots') {
    switchTab('bots')
  }
}

function attachStaticListeners() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab)
    })
  })

  elements.contextSwitcher.addEventListener('click', event => {
    const logViewButton = event.target.closest('[data-log-view]')
    if (logViewButton) {
      state.activeLogView = logViewButton.dataset.logView === 'chat' ? 'chat' : 'events'
      state.activeTab = 'logs'
      queueRender('tabs', 'chrome', state.activeLogView === 'chat' ? 'chat' : 'logs')
      return
    }

    const moreViewButton = event.target.closest('[data-more-view]')
    if (!moreViewButton) return

    state.activeMoreView = moreViewButton.dataset.moreView || 'settings'
    state.activeTab = 'more'
    const activePanel = getActivePanelName()
    queueRender(
      'tabs',
      'chrome',
      activePanel === 'settings' ? ['settings', 'validation'] : null,
      activePanel === 'updates' ? 'updates' : null,
      activePanel === 'about' ? 'about' : null
    )
  })

  elements.saveConfigButton.addEventListener('click', async () => {
    try {
      await persistConfig()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  if (elements.saveBotsButton) {
    elements.saveBotsButton.addEventListener('click', async () => {
      try {
        await persistConfig()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })
  }

  if (elements.saveSettingsButton) {
    elements.saveSettingsButton.addEventListener('click', async () => {
      try {
        await persistConfig()
      } catch (error) {
        showToast(error.message, 'error')
      }
    })
  }

  elements.startStopButton.addEventListener('click', async () => {
    try {
      await handleStartStopClick()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.restartButton.addEventListener('click', async () => {
    try {
      await handleRestartClick()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.pauseButton.addEventListener('click', async () => {
    try {
      await handlePauseToggle()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.openRuntimeDirButton.addEventListener('click', async () => {
    if (state.capabilities.openRuntimeDir === false) {
      showToast('Папка runtime недоступна на текущей платформе.', 'warning')
      return
    }

    await bridge.openRuntimeDir()
  })

  elements.importConfigButton.addEventListener('click', async () => {
    try {
      await handleImportConfig()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.exportConfigButton.addEventListener('click', async () => {
    try {
      await handleExportConfig()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.resetConfigButton.addEventListener('click', async () => {
    if (!window.confirm('Сбросить config.json к базовому шаблону? Несохраненные изменения будут потеряны.')) return
    const result = await bridge.resetConfig()
    state.config = normalizeConfigShape(result.config)
    state.selectedBotIndex = 0
    state.isDirty = false
    renderAll()
    showToast('Конфиг сброшен к базовому шаблону.', 'success')
  })

  elements.checkUpdatesButton.addEventListener('click', async () => {
    try {
      await refreshUpdates(true)
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.downloadUpdateButton.addEventListener('click', async () => {
    try {
      await handleDownloadUpdate()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.installUpdateButton.addEventListener('click', async () => {
    try {
      await handleInstallUpdate()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.openReleaseButton.addEventListener('click', () => {
    openUpdateReleasePage()
  })

  elements.addBotButton.addEventListener('click', () => {
    addBot()
  })

  elements.duplicateBotButton.addEventListener('click', () => {
    duplicateSelectedBot()
  })

  elements.removeBotButton.addEventListener('click', () => {
    removeSelectedBot()
  })

  elements.mobileOverview.addEventListener('click', async event => {
    const actionButton = event.target.closest('[data-mobile-action]')
    if (actionButton) {
      try {
        await handleMobileAction(actionButton.dataset.mobileAction)
      } catch (error) {
        showToast(error.message, 'error')
      }
      return
    }

    const botButton = event.target.closest('[data-select-bot-index]')
    if (!botButton) return
    selectBot(Number(botButton.dataset.selectBotIndex), true)
  })

  elements.mobileActionBar.addEventListener('click', async event => {
    const actionButton = event.target.closest('[data-mobile-action]')
    if (!actionButton) return

    try {
      await handleMobileAction(actionButton.dataset.mobileAction)
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  elements.settingsSections.addEventListener('click', event => {
    const jumpButton = event.target.closest('[data-settings-jump]')
    if (!jumpButton) return

    const target = document.getElementById(jumpButton.dataset.settingsJump)
    if (!target) return

    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    })
  })

  elements.closeCoordinateModalButton.addEventListener('click', () => {
    closeCoordinateModal()
  })

  elements.coordinateModal.addEventListener('click', event => {
    if (event.target === elements.coordinateModal) {
      closeCoordinateModal()
    }
  })

  const applyCoordinates = appendMode => {
    try {
      const selectedBot = getSelectedBot()
      if (!selectedBot) return

      const parsed = parseCoordinatesText(elements.coordinateTextarea.value)
      selectedBot.blocksToMine = appendMode
        ? uniqueCoordinates([...selectedBot.blocksToMine, ...parsed])
        : parsed

      closeCoordinateModal()
      markDirty()
      queueRender('botEditor', 'botList', 'dashboard')
      showToast(
        appendMode
          ? 'Координаты добавлены к текущему маршруту.'
          : 'Маршрут координат заменен.',
        'success'
      )
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  elements.replaceCoordinatesButton.addEventListener('click', () => applyCoordinates(false))
  elements.appendCoordinatesButton.addEventListener('click', () => applyCoordinates(true))

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      queueRender('all')
    }
  })

  let resizeFrameId = null
  let lastViewportWidth = window.innerWidth
  let lastViewportHeight = window.innerHeight

  window.addEventListener('resize', () => {
    const nextViewportWidth = window.innerWidth
    const nextViewportHeight = window.innerHeight
    const widthChanged = Math.abs(nextViewportWidth - lastViewportWidth) > 2
    const heightChanged = Math.abs(nextViewportHeight - lastViewportHeight) > 2

    lastViewportWidth = nextViewportWidth
    lastViewportHeight = nextViewportHeight

    // On Android, opening the soft keyboard changes viewport height and used to
    // recreate the form, immediately dropping focus from the active field.
    if (state.platform === 'android' && !widthChanged && heightChanged && isTextEntryElement(document.activeElement)) {
      return
    }

    if (resizeFrameId != null) {
      return
    }

    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = null
      const resizeParts = ['chrome']

      if (state.activeTab === 'dashboard') {
        resizeParts.push('dashboard')
      } else if (state.activeTab === 'bots') {
        resizeParts.push('botList', 'botEditor')
      } else if (state.activeTab === 'logs') {
        resizeParts.push(state.activeLogView === 'chat' ? 'chat' : 'logs')
      } else if (state.activeTab === 'more') {
        resizeParts.push(getActivePanelName())
      }

      queueRender(resizeParts)
    })
  })
}

function buildMobileActions({ supportsRuntimeControl, supportsImport, supportsExport, isRunning, isBusy }) {
  const selectedBot = getSelectedBot()
  const actions = []

  if (supportsRuntimeControl && state.activeTab === 'dashboard') {
    actions.push({
      id: 'toggle-runtime',
      label: isRunning ? 'Остановить' : 'Запустить',
      variant: isRunning ? 'danger' : 'primary',
      disabled: isBusy
    })

    if (isRunning) {
      actions.push({
        id: 'toggle-pause',
        label: state.runtime.isPaused ? 'Снять паузу' : 'Пауза',
        variant: 'secondary'
      })
      actions.push({ id: 'restart-runtime', label: 'Рестарт', variant: 'ghost' })
    }
  }

  if (state.activeTab === 'bots') {
    actions.push({ id: 'add-bot', label: 'Добавить', variant: 'primary' })
    if (selectedBot) actions.push({ id: 'duplicate-bot', label: 'Дубль', variant: 'secondary' })
    if (selectedBot) actions.push({ id: 'remove-bot', label: 'Удалить', variant: 'danger' })
  } else if (state.activeTab === 'more' && state.activeMoreView === 'settings') {
    if (supportsImport) actions.push({ id: 'import-config', label: 'Импорт', variant: 'secondary' })
    if (supportsExport) actions.push({ id: 'export-config', label: 'Экспорт', variant: 'secondary' })
    actions.push({ id: 'reset-config', label: 'Сбросить', variant: 'ghost' })
  }

  if (state.isDirty) {
    actions.push({
      id: 'save-config',
      label: 'Сохранить',
      variant: 'primary',
      disabled: false
    })
  }

  return actions.filter((action, index, list) => (
    list.findIndex(candidate => candidate.id === action.id) === index
  ))
}

function buildMobileHeaderActions() {
  const { supportsRuntimeControl, isRunning, isBusy } = getRuntimeUiState()
  const actions = []

  if (supportsRuntimeControl) {
    actions.push({
      id: 'toggle-runtime',
      label: isRunning ? 'Остановить runtime' : 'Запустить runtime',
      variant: isRunning ? 'danger' : 'primary',
      disabled: isBusy
    })
  }

  actions.push({
    id: 'save-config',
    label: state.isDirty ? 'Сохранить изменения' : 'Конфиг сохранён',
    variant: state.isDirty ? 'secondary' : 'ghost',
    disabled: !state.isDirty
  })

  return actions
}

function renderActionButtons(actions) {
  return actions.map(renderMobileActionButton).join('')
}

function buildMobileOverviewMarkup({ runtimeStatus, configuredBots, activeBots, runtimeTotalBots, snapshot }) {
  const selectedBot = getSelectedBot()
  const snapshotBots = state.runtime.snapshot?.bots || {}
  const health = getRuntimeHealth(snapshot)

  const botStrip = getBots().length
    ? `
      <div class="mobile-bot-strip">
        ${getBots().map((bot, index) => {
          const liveBot = snapshotBots[bot.username]
          const liveLabel = liveBot ? formatLiveStatus(liveBot.status) : 'Готов к запуску'
          return `
            <button
              class="mobile-bot-pill ${index === state.selectedBotIndex ? 'is-active' : ''}"
              type="button"
              data-select-bot-index="${index}"
            >
              <strong>${escapeHtml(bot.username)}</strong>
              <span>${escapeHtml(liveLabel)}</span>
              <span>${formatNumber(bot.blocksToMine.length)} точек • ${bot.standPosition.x}, ${bot.standPosition.y}, ${bot.standPosition.z}</span>
            </button>
          `
        }).join('')}
      </div>
    `
    : `
      <div class="empty-state">
        Боты ещё не добавлены. Откройте вкладку "Боты" и создайте первый профиль.
      </div>
    `

  return `
    <article class="mini-status-card">
      <div class="mini-status-card__top">
        <div>
          <p class="eyebrow">${state.platform === 'android' ? 'Android local runtime' : 'Compact overview'}</p>
          <strong>${escapeHtml(getActiveTabTitle())}</strong>
        </div>
        <span class="status-pill ${runtimeStatus.className}">${escapeHtml(runtimeStatus.label)}</span>
      </div>
      <div class="mini-status-card__meta">
        <span>Ботов: ${formatNumber(configuredBots)}</span>
        <span>Активных: ${formatNumber(activeBots)}/${formatNumber(runtimeTotalBots)}</span>
        <span>${selectedBot ? `Выбран: ${escapeHtml(selectedBot.username)}` : 'Бот не выбран'}</span>
      </div>
      <div class="mobile-status-actions">
        ${renderActionButtons(buildMobileHeaderActions())}
      </div>
    </article>

    <div class="mini-summary-grid">
      ${createCompactSummaryCard('Effective', `${formatNumber(snapshot.currentRatePerMinute || 0, 1)} бл/мин`, `Raw ${formatNumber(snapshot.currentRawRatePerMinute || 0, 1)} б/м`)}
      ${createCompactSummaryCard('Добыто', formatNumber(snapshot.totalBlocks || 0), `Аптайм ${formatDuration(snapshot.uptimeMs || 0)}`)}
      ${createCompactSummaryCard('Состояние', formatHealthReason(health.reason), health.diagnosis || '')}
    </div>

    ${botStrip}
  `
}

window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(error => {
    console.error(error)
    document.body.innerHTML = `
      <div style="padding: 32px; color: white; font-family: sans-serif;">
        <h1>Не удалось запустить интерфейс</h1>
        <pre>${error.message}</pre>
      </div>
    `
  })
})

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.coordinateModalOpen) {
    closeCoordinateModal()
  }
})

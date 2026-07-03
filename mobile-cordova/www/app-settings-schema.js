;(function initBotStudioSettingsSchema() {
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

  const SERVER_SETTINGS_SECTION = {
    eyebrow: 'Server',
    title: 'Подключение к серверу',
    description:
      'Адрес сервера, версия клиента и пароль quick-login, если вход на сервер требует его сразу после подключения.',
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
  }
  const RECOVERY_SETTINGS_SECTION = {
    eyebrow: 'Recovery',
    title: 'Защита от зависаний',
    description:
      'Проверка позиции, лимит памяти и условия глобального рестарта, если пул перестал добывать стабильно.',
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
  }
  const MENU_SETTINGS_SECTION = {
    eyebrow: 'Menu',
    title: 'Слоты меню и кнопок',
    description:
      'Слоты, которые бот нажимает в игровом меню после входа и при навигации по интерфейсу сервера.',
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
      },
      {
        path: 'menu.toolSwitchThreshold',
        kind: 'number',
        label: 'Порог прочности инструмента',
        help: 'При остатке прочности ниже этого значения (в %) бот автоматически переключится на следующий инструмент в toolSwitchSlots. 0 = отключено.'
      }
    ]
  }
  const FEATURES_SETTINGS_SECTION = {
    eyebrow: 'Features',
    title: 'Автоматические функции',
    description:
      'Флаги поведения, которые включают более активную добычу, мягкие перезапуски и периодическую ротацию ботов.',
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

  const BOT_SETTINGS_SECTIONS_V2 = [
    SERVER_SETTINGS_SECTION,
    window.BotStudioSettingsTimingSection,
    RECOVERY_SETTINGS_SECTION,
    MENU_SETTINGS_SECTION,
    FEATURES_SETTINGS_SECTION
  ]

  const VISIBLE_CONFIG_SETTING_PATHS = new Set([
    'server.host',
    'server.version',
    'server.password',
    'timing.periodicRejoinMs',
    'timing.rotationDelayBetweenBots',
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
      description:
        'В обычном режиме подробные [DIAG] события скрыты. Включайте только когда нужно понять причину вылета или зависания.',
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

  window.BotStudioSettingsSchema = {
    DESKTOP_SETTINGS_FIELDS_V2,
    BOT_SETTINGS_SECTIONS_V2,
    VISIBLE_CONFIG_SETTING_PATHS,
    EXTRA_SETTINGS_SECTIONS,
    TOP_LEVEL_TABS,
    LOG_VIEW_LABELS,
    MORE_VIEW_LABELS
  }
})()

;(function initBotStudioSettingsTiming() {
  window.BotStudioSettingsTimingSection = {
    eyebrow: 'Timing',
    title: 'Задержки и переподключение',
    description:
      'Скорость добычи, паузы при простое и интервалы reconnect/rejoin, которые влияют на стабильность всего пула.',
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
    ]
  }
})()

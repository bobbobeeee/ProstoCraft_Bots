;(function initBotStudioViewUtils() {
  const app = window.BotStudioApp
  const { state } = app

  function getRuntimeHealth(snapshot = state.runtime.snapshot || {}) {
    return (
      snapshot.health ||
      state.runtime.health || {
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
    )
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
      'mining-confirmation': 'Подтверждения добычи',
      'packet-budget': 'Packet budget',
      'fallback-dig': 'Fallback dig',
      joining: 'Вход на подсервер',
      'botfilter-hold': 'BotFilter hold',
      'chat-captcha-hold': 'Чат-капча'
    }
    return map[reason] || String(reason || 'Неизвестно')
  }

  function formatPacketMode(mode) {
    const map = {
      fast: 'быстрый',
      safe: 'safe',
      recovering: 'восстановление',
      fixed: 'фиксированный'
    }
    return map[mode] || String(mode || 'быстрый')
  }

  function getHealthClass(health) {
    const severity = health?.severity || 'ok'
    if (severity === 'error') return 'health-card--error'
    if (severity === 'warning') return 'health-card--warning'
    return 'health-card--ok'
  }

  Object.assign(app, {
    getRuntimeHealth,
    formatHealthReason,
    formatPacketMode,
    getHealthClass
  })
})()

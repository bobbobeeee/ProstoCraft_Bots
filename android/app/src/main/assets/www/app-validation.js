;(function initBotStudioValidation() {
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
        issues.push(
          `Username "${bot.username}" повторяется. Для каждого бота нужен уникальный username.`
        )
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
        issues.push(
          `${label}: список blocksToMine пуст. Добавьте хотя бы одну координату для добычи.`
        )
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
            issues.push(
              `${label}: blocksToMine[${coordinateIndex + 1}].${axis} должно быть числом.`
            )
          }
        }
      })
    })

    return issues
  }

  window.BotStudioValidation = {
    validateConfig
  }
})()

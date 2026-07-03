const { createHealthState } = require('../stability-center')
const { formatBlocksPerMinute, formatBlocksPerSecond } = require('../monitoring')

function createRuntimeUi(options = {}) {
  const boxes = options.boxes || {}
  const monitorData = options.monitorData
  const getRuntimeManager = options.getRuntimeManager
  const getHeadlessMode = options.getHeadlessMode || (() => false)
  const emitRuntimeEvent = options.emitRuntimeEvent || (() => {})
  const getHealthLogLabel = options.getHealthLogLabel
  const periodicRejoinMs = Number(options.periodicRejoinMs) || 0
  let lastCpuUsage = process.cpuUsage()
  let lastCpuTime = Date.now()

  function safeRender() {
    const screen = boxes.screen
    if (!screen || getHeadlessMode()) return
    try {
      screen.render()
    } catch (e) {}
  }

  function updateInfoBox() {
    const infoBox = boxes.infoBox
    if (!infoBox) return
    const diggingPaused = getRuntimeManager()?.isDiggingPaused?.() || false

    const uptime = Date.now() - monitorData.startTime
    const hours = Math.floor(uptime / 3600000)
    const minutes = Math.floor((uptime % 3600000) / 60000)
    const seconds = Math.floor((uptime % 60000) / 1000)
    const activeBots = Object.values(monitorData.bots).filter(b => b.status === 'копает').length
    const totalBots = Object.keys(monitorData.bots).length
    const avgRate =
      monitorData.totalBlocks > 0 && uptime > 0
        ? (monitorData.totalBlocks / (uptime / 3600000)).toFixed(1)
        : '0.0'
    const currentRate = Object.values(monitorData.bots).reduce(
      (sum, bot) => sum + (bot.blocksPerSecond || 0),
      0
    )
    const currentRatePerMinute = Object.values(monitorData.bots).reduce(
      (sum, bot) => sum + (bot.blocksLastMinute || 0),
      0
    )
    const rawRatePerMinute = Object.values(monitorData.bots).reduce(
      (sum, bot) => sum + (bot.rawBlocksLastMinute || 0),
      0
    )
    const health = monitorData.health || createHealthState()

    infoBox.setContent(
      [
        `  {cyan-fg}  Время работы:{/cyan-fg}  {bold}${hours}ч ${minutes}м ${seconds}с{/bold}`,
        `  {green-fg} Боты активны:{/green-fg}  {bold}${activeBots}/${totalBots}{/bold}`,
        `  {yellow-fg} Добыто блоков:{/yellow-fg}  {bold}${monitorData.totalBlocks}{/bold}`,
        `  {magenta-fg} Средняя скорость:{/magenta-fg}  {bold}${avgRate} блоков/час{/bold}`,
        `  {white-fg} Effective:{/white-fg}  {bold}${formatBlocksPerSecond(currentRate)} | ${formatBlocksPerMinute(currentRatePerMinute)}{/bold}`,
        `  {white-fg} Raw:{/white-fg}  {bold}${formatBlocksPerMinute(rawRatePerMinute)}{/bold}`,
        `  {${health.severity === 'error' ? 'red' : health.severity === 'warning' ? 'yellow' : 'green'}-fg} Health:{/}  {bold}${getHealthLogLabel(health.reason)}{/bold}`,
        `  {blue-fg} Ротация:{/blue-fg}  {bold}каждые ${Math.round(periodicRejoinMs / 60000)} мин{/bold}`,
        `  {${diggingPaused ? 'red' : 'green'}-fg} Копание:{/}  {bold}${diggingPaused ? 'ПАУЗА' : 'АКТИВНО'}{/bold}`
      ].join('\n')
    )
  }

  function updateScriptResources() {
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1)
    const currentCpuUsage = process.cpuUsage()
    const currentTime = Date.now()
    const elapsedTime = currentTime - lastCpuTime
    const elapsedCpu =
      (currentCpuUsage.user - lastCpuUsage.user + currentCpuUsage.system - lastCpuUsage.system) /
      1000
    const cpuPercent =
      elapsedTime > 0 ? Math.min(100, (elapsedCpu / elapsedTime) * 100).toFixed(1) : '0.0'

    lastCpuUsage = currentCpuUsage
    lastCpuTime = currentTime

    emitRuntimeEvent('resources', {
      cpuPercent: Number(cpuPercent),
      memoryMb: Number(memUsage)
    })

    const resourcesBox = boxes.resourcesBox
    if (!resourcesBox) return

    resourcesBox.setContent(`
  {yellow-fg} CPU:{/yellow-fg}  {bold}${cpuPercent}%{/bold}
  {cyan-fg} RAM:{/cyan-fg}  {bold}${memUsage} MB{/bold}
  `)

    safeRender()
  }

  function updateBotsTable() {
    const botsTable = boxes.botsTable
    if (!botsTable) return
    const diggingPaused = getRuntimeManager()?.isDiggingPaused?.() || false

    const headers = ['Имя бота', 'Статус', 'Добыто', 'Скорость']
    const data = []
    headers[3] = 'Speed (b/m)'
    const statusColors = {
      копает: '{green-fg}',
      ожидание: '{yellow-fg}',
      оффлайн: '{red-fg}',
      подключается: '{cyan-fg}',
      ротация: '{magenta-fg}',
      пауза: '{red-fg}',
      возврат: '{blue-fg}'
    }
    for (const [botName, botData] of Object.entries(monitorData.bots)) {
      const color = statusColors[botData.status] || '{white-fg}'
      const displayStatus = diggingPaused && botData.status === 'копает' ? 'пауза' : botData.status
      data.push([
        botName,
        `${statusColors[displayStatus] || color}${displayStatus}{/}`,
        String(botData.blocksTotal || 0),
        formatBlocksPerMinute(botData.blocksLastMinute || 0)
      ])
    }
    botsTable.setData({ headers, data })
  }

  return {
    safeRender,
    updateInfoBox,
    updateScriptResources,
    updateBotsTable
  }
}

module.exports = {
  createRuntimeUi
}

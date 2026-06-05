const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

module.exports = async function afterPackIcons(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const projectDir = context.projectDir || context.packager?.projectDir || process.cwd()
  const iconPath = path.join(projectDir, 'build', 'icon.ico')
  const exePath = path.join(context.appOutDir, 'ProstoCraft Bot Studio.exe')
  const rceditPath = path.join(projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')

  if (!fs.existsSync(iconPath) || !fs.existsSync(exePath) || !fs.existsSync(rceditPath)) {
    throw new Error(`Не удалось вшить иконку: icon=${fs.existsSync(iconPath)}, exe=${fs.existsSync(exePath)}, rcedit=${fs.existsSync(rceditPath)}`)
  }

  const result = spawnSync(rceditPath, [exePath, '--set-icon', iconPath], {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true
  })

  if (result.status !== 0) {
    throw new Error(`rcedit не смог вшить иконку, код ${result.status}`)
  }
}

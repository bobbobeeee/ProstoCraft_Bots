const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const rendererSource = path.join(projectRoot, 'desktop', 'renderer')
const androidAssetsRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets')
const androidWebRoot = path.join(androidAssetsRoot, 'www')
const defaultConfigSource = path.join(projectRoot, 'config.json')
const defaultConfigTarget = path.join(androidAssetsRoot, 'default-config.json')

function ensureWorkspacePath(targetPath) {
  const normalizedRoot = path.resolve(projectRoot)
  const normalizedTarget = path.resolve(targetPath)

  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw new Error(`Refusing to write outside of project root: ${normalizedTarget}`)
  }
}

function ensureDirectory(targetPath) {
  ensureWorkspacePath(targetPath)
  fs.mkdirSync(targetPath, { recursive: true })
}

function copyRecursive(sourcePath, targetPath) {
  const stats = fs.statSync(sourcePath)

  if (stats.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true })
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(
        path.join(sourcePath, entry),
        path.join(targetPath, entry)
      )
    }
    return
  }

  fs.copyFileSync(sourcePath, targetPath)
}

function main() {
  ensureDirectory(androidWebRoot)
  copyRecursive(rendererSource, androidWebRoot)

  ensureWorkspacePath(defaultConfigTarget)
  fs.mkdirSync(path.dirname(defaultConfigTarget), { recursive: true })
  fs.copyFileSync(defaultConfigSource, defaultConfigTarget)

  console.log(`Synced renderer assets to ${androidWebRoot}`)
}

main()

const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const cordovaRoot = path.join(projectRoot, 'mobile-cordova')
const rendererSource = path.join(projectRoot, 'desktop', 'renderer')
const rendererTarget = path.join(cordovaRoot, 'www')
const platformRendererTarget = path.join(cordovaRoot, 'platforms', 'android', 'app', 'src', 'main', 'assets', 'www')
const platformAssetsRoot = path.join(cordovaRoot, 'platforms', 'android', 'app', 'src', 'main', 'assets')
const platformWwwSource = path.join(cordovaRoot, 'platforms', 'android', 'platform_www')
const runtimeSource = path.join(projectRoot, 'mobile-cordova-src', 'nodejs-project')
const runtimeTarget = path.join(rendererTarget, 'nodejs-project')
const platformRuntimeTarget = path.join(platformRendererTarget, 'nodejs-project')
const runtimeInstallSource = path.join(cordovaRoot, 'nodejs-project')
const rootRuntimeFiles = ['bot.js', 'bot-filter.js', 'limbo-filter.js', 'reconnect-policy.js', 'speed-guard.js', 'stability-center.js', 'monitoring.js', 'update-service.js', 'config.json']
const cordovaWebRuntimeFiles = ['cordova.js', 'cordova_plugins.js']
const runtimePrunedDirectories = new Set([
  '.bin',
  '.github',
  '.vscode',
  '@types',
  'coverage',
  'doc',
  'docs',
  'example',
  'examples',
  'sample',
  'samples',
  'test',
  'tests'
])
const runtimePrunedFilePatterns = [
  /\.d\.ts$/i,
  /\.gz$/i,
  /\.map$/i,
  /\.ts$/i
]

function ensureProjectExists() {
  if (!fs.existsSync(cordovaRoot)) {
    throw new Error('Cordova project was not found. Create it first with the mobile setup command.')
  }
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true })
}

function removeRecursive(targetPath) {
  const resolvedTargetPath = path.resolve(targetPath)
  const allowedRoot = `${path.resolve(cordovaRoot)}${path.sep}`

  if (!resolvedTargetPath.startsWith(allowedRoot)) {
    throw new Error(`Refusing to remove path outside Cordova root: ${resolvedTargetPath}`)
  }

  fs.rmSync(resolvedTargetPath, { recursive: true, force: true })
}

function tryRemoveRecursive(targetPath) {
  try {
    if (fs.existsSync(targetPath)) {
      removeRecursive(targetPath)
    }
  } catch (error) {
    console.warn(`Skipping cleanup for ${targetPath}: ${error.message}`)
  }
}

function copyRecursive(sourcePath, targetPath) {
  const stats = fs.statSync(sourcePath)

  if (stats.isDirectory()) {
    ensureDirectory(targetPath)
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(
        path.join(sourcePath, entry),
        path.join(targetPath, entry)
      )
    }
    return
  }

  ensureDirectory(path.dirname(targetPath))
  fs.copyFileSync(sourcePath, targetPath)
}

function pruneRuntimeNodeModules(targetPath) {
  if (!fs.existsSync(targetPath)) return

  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const entryPath = path.join(targetPath, entry.name)

    if (entry.name.startsWith('.')) {
      fs.rmSync(entryPath, { recursive: entry.isDirectory(), force: true })
      continue
    }

    if (entry.isDirectory()) {
      if (runtimePrunedDirectories.has(entry.name)) {
        fs.rmSync(entryPath, { recursive: true, force: true })
        continue
      }

      pruneRuntimeNodeModules(entryPath)
      continue
    }

    if (entry.isFile() && runtimePrunedFilePatterns.some(pattern => pattern.test(entry.name))) {
      fs.rmSync(entryPath, { force: true })
    }
  }
}

function toAssetPath(targetPath) {
  return targetPath.replace(/\\/g, '/')
}

function collectRuntimeAssetLists(assetsRoot, sourcePath, dirs, files) {
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue

    const entryPath = path.join(sourcePath, entry.name)
    const assetPath = toAssetPath(path.relative(assetsRoot, entryPath))

    if (entry.isDirectory()) {
      dirs.push(assetPath)
      collectRuntimeAssetLists(assetsRoot, entryPath, dirs, files)
      continue
    }

    if (entry.isFile()) {
      files.push(assetPath)
    }
  }
}

function writeRuntimeAssetLists(assetsRoot) {
  const runtimeAssetsRoot = path.join(assetsRoot, 'www', 'nodejs-project')
  const dirs = []
  const files = []

  if (fs.existsSync(runtimeAssetsRoot)) {
    collectRuntimeAssetLists(assetsRoot, runtimeAssetsRoot, dirs, files)
  }

  fs.writeFileSync(path.join(assetsRoot, 'dir.list'), `${dirs.sort().join('\n')}\n`)
  fs.writeFileSync(path.join(assetsRoot, 'file.list'), `${files.sort().join('\n')}\n`)
}

function resolveExistingPath(paths) {
  return paths.find(candidatePath => fs.existsSync(candidatePath)) || null
}

function syncRuntimeDependencies() {
  const runtimeModulesSource = resolveExistingPath([
    path.join(runtimeSource, 'node_modules'),
    path.join(runtimeInstallSource, 'node_modules')
  ])
  const runtimeLockfileSource = resolveExistingPath([
    path.join(runtimeSource, 'package-lock.json'),
    path.join(runtimeInstallSource, 'package-lock.json')
  ])
  const runtimeModulesTarget = path.join(runtimeTarget, 'node_modules')
  const runtimeLockfileTarget = path.join(runtimeTarget, 'package-lock.json')

  tryRemoveRecursive(runtimeModulesTarget)

  if (runtimeModulesSource) {
    copyRecursive(runtimeModulesSource, runtimeModulesTarget)
    pruneRuntimeNodeModules(runtimeModulesTarget)
  } else {
    console.warn(
      `Runtime node_modules were not found in ${runtimeSource} or ${runtimeInstallSource}. ` +
      'Android runtime may fail to resolve packages until dependencies are installed.'
    )
  }

  if (runtimeLockfileSource) {
    fs.copyFileSync(runtimeLockfileSource, runtimeLockfileTarget)
  }
}

function syncCordovaWebRuntime(targetRoot) {
  if (!fs.existsSync(platformWwwSource)) {
    return
  }

  for (const fileName of cordovaWebRuntimeFiles) {
    const sourceFile = path.join(platformWwwSource, fileName)
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, path.join(targetRoot, fileName))
    }
  }

  const pluginsSource = path.join(platformWwwSource, 'plugins')
  const pluginsTarget = path.join(targetRoot, 'plugins')

  tryRemoveRecursive(pluginsTarget)

  if (fs.existsSync(pluginsSource)) {
    copyRecursive(pluginsSource, pluginsTarget)
  }
}

function main() {
  ensureProjectExists()

  tryRemoveRecursive(rendererTarget)
  copyRecursive(rendererSource, rendererTarget)
  ensureDirectory(runtimeTarget)
  copyRecursive(runtimeSource, runtimeTarget)

  for (const fileName of rootRuntimeFiles) {
    fs.copyFileSync(
      path.join(projectRoot, fileName),
      path.join(runtimeTarget, fileName)
    )
  }

  syncRuntimeDependencies()
  syncCordovaWebRuntime(rendererTarget)

  if (fs.existsSync(path.dirname(platformRendererTarget))) {
    tryRemoveRecursive(platformRendererTarget)
    copyRecursive(rendererTarget, platformRendererTarget)
    ensureDirectory(platformRuntimeTarget)

    for (const fileName of rootRuntimeFiles) {
      fs.copyFileSync(
        path.join(projectRoot, fileName),
        path.join(platformRuntimeTarget, fileName)
      )
    }

    syncCordovaWebRuntime(platformRendererTarget)
    writeRuntimeAssetLists(platformAssetsRoot)
  }

  console.log(`Synced Cordova app assets into ${cordovaRoot}`)
}

main()

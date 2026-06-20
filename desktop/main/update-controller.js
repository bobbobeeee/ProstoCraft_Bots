const { spawn: defaultSpawn } = require('child_process')
const fs = require('fs')
const { APP_VERSION, UPDATE_SOURCE } = require('./constants')
const { checkForUpdates, downloadUpdate } = require('../../update-service')

function createEmptyUpdateState() {
  return {
    status: 'idle',
    currentVersion: APP_VERSION,
    latestVersion: '',
    updateAvailable: false,
    checkedAt: '',
    publishedAt: '',
    releaseName: '',
    releaseUrl: UPDATE_SOURCE.releaseUrl,
    body: '',
    asset: null,
    checksum: null,
    sourceMode: 'idle',
    signatureStatus: '',
    installResumeState: '',
    progress: null,
    downloadedFilePath: '',
    downloadedFileName: '',
    downloadedSize: 0,
    error: ''
  }
}

function createUpdateController({
  app,
  paths,
  runtimeController,
  publishUpdateState,
  setIsQuitting,
  spawnProcess = defaultSpawn
}) {
  let latestUpdateInfo = null
  let updateState = createEmptyUpdateState()

  function buildUpdatePayload() {
    return {
      ...createEmptyUpdateState(),
      ...updateState,
      currentVersion: APP_VERSION,
      releaseUrl: updateState.releaseUrl || UPDATE_SOURCE.releaseUrl
    }
  }

  function publishState() {
    publishUpdateState(buildUpdatePayload())
  }

  function applyUpdateInfo(updateInfo) {
    latestUpdateInfo = updateInfo
    updateState = {
      ...createEmptyUpdateState(),
      ...updateInfo,
      checkedAt: new Date().toISOString(),
      error: updateInfo?.error || '',
      progress: null,
      downloadedFilePath: '',
      downloadedFileName: '',
      downloadedSize: 0
    }
    return buildUpdatePayload()
  }

  async function checkAppUpdates() {
    updateState = {
      ...buildUpdatePayload(),
      status: 'checking',
      error: '',
      progress: null
    }
    publishState()

    const updateInfo = await checkForUpdates({
      platform: 'desktop',
      currentVersion: APP_VERSION,
      cachePath: paths.getUpdateCachePath()
    })
    const payload = applyUpdateInfo(updateInfo)
    publishState()
    return payload
  }

  async function downloadAppUpdate() {
    if (!latestUpdateInfo?.asset) {
      await checkAppUpdates()
    }

    if (!latestUpdateInfo?.updateAvailable) {
      throw new Error('Доступного обновления нет.')
    }

    updateState = {
      ...buildUpdatePayload(),
      status: 'downloading',
      error: '',
      progress: {
        receivedBytes: 0,
        totalBytes: latestUpdateInfo.asset.size || 0,
        percent: 0
      }
    }
    publishState()

    try {
      const downloaded = await downloadUpdate(latestUpdateInfo, {
        outputDir: paths.getUpdatesDir(),
        onProgress(progress) {
          const totalBytes = progress.totalBytes || latestUpdateInfo.asset.size || 0
          const percent =
            totalBytes > 0
              ? Math.min(100, Math.round((progress.receivedBytes / totalBytes) * 100))
              : 0

          updateState = {
            ...buildUpdatePayload(),
            status: 'downloading',
            progress: {
              receivedBytes: progress.receivedBytes,
              totalBytes,
              percent
            }
          }
          publishState()
        }
      })

      updateState = {
        ...buildUpdatePayload(),
        status: 'ready',
        progress: {
          receivedBytes: downloaded.size,
          totalBytes: downloaded.size,
          percent: 100
        },
        downloadedFilePath: downloaded.filePath,
        downloadedFileName: downloaded.fileName,
        downloadedSize: downloaded.size,
        error: ''
      }
      publishState()
      return buildUpdatePayload()
    } catch (error) {
      updateState = {
        ...buildUpdatePayload(),
        status: 'error',
        error: error.message || String(error)
      }
      publishState()
      throw error
    }
  }

  function installDownloadedUpdate() {
    const installerPath = updateState.downloadedFilePath
    if (!installerPath || !fs.existsSync(installerPath)) {
      throw new Error('Сначала скачайте обновление.')
    }

    updateState = {
      ...buildUpdatePayload(),
      status: 'installing',
      error: ''
    }
    publishState()

    runtimeController.stopRuntime()
    const child = spawnProcess(installerPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.unref()

    setTimeout(() => {
      setIsQuitting(true)
      app.quit()
    }, 800)

    return buildUpdatePayload()
  }

  return {
    applyUpdateInfo,
    buildUpdatePayload,
    checkAppUpdates,
    createEmptyUpdateState,
    downloadAppUpdate,
    installDownloadedUpdate
  }
}

module.exports = {
  createEmptyUpdateState,
  createUpdateController
}

// @ts-check

const { spawnSync } = require('child_process')

/** @typedef {import('./types').AndroidReleaseContext} AndroidReleaseContext */

/**
 * @typedef {object} SpawnOptions
 * @property {NodeJS.Platform | string} [platform]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {string} [cwd]
 * @property {'inherit' | 'pipe' | 'ignore'} [stdio]
 */

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ platform?: NodeJS.Platform | string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ command: string, args: string[] }}
 */
function normalizeSpawn(command, args, { platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32' || !/\.(bat|cmd)$/i.test(command)) {
    return { command, args }
  }

  return {
    command: env.ComSpec || 'cmd.exe',
    args: ['/d', '/c', 'call', command, ...args]
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {SpawnOptions} [options]
 * @returns {import('child_process').SpawnSyncReturns<Buffer>}
 */
function spawnChecked(command, args, options = {}) {
  const normalized = normalizeSpawn(command, args, {
    env: options.env || process.env,
    platform: options.platform || process.platform
  })
  const result = spawnSync(normalized.command, normalized.args, {
    stdio: 'inherit',
    shell: false,
    ...options
  })

  if (result.error) {
    throw result.error
  }

  return result
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {SpawnOptions} [options]
 */
function run(command, args, options = {}) {
  const result = spawnChecked(command, args, options)

  if (result.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(' ')}), exit code ${result.status}`)
  }
}

/**
 * @param {Pick<AndroidReleaseContext, 'gradleCommand' | 'gradleProjectRoot' | 'projectRoot'>} context
 * @param {NodeJS.ProcessEnv} env
 */
function stopGradle(context, env) {
  const result = spawnChecked(
    context.gradleCommand,
    ['-p', context.gradleProjectRoot, '--stop', '--console=plain'],
    {
      cwd: context.projectRoot,
      stdio: 'inherit',
      env
    }
  )

  if (result.status !== 0) {
    console.warn('Gradle stop returned non-zero status, continuing with build cleanup.')
  }
}

module.exports = {
  normalizeSpawn,
  run,
  spawnChecked,
  stopGradle
}

export interface AndroidReleaseContext {
  androidVersionCode: number
  appBuildExtrasGradle: string
  appVersion: string
  buildDirsToClean: string[]
  cordovaBuildJson: string
  cordovaRoot: string
  defaultAndroidSdkRoot: string
  defaultOutputApk: string
  defaultOutputDir: string
  gradleCommand: string
  gradleProjectRoot: string
  gradleUserHome: string
  projectRoot: string
  releaseKeystore: string
  releaseSigningProperties: string
}

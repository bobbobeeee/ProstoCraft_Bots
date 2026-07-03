This directory is kept only as a Cordova runtime dependency cache.

The Android runtime source is generated from:

- `bot.js`
- `monitoring.js`
- `config.json`
- `mobile-cordova-src/nodejs-project/mobile-runtime.js`

`scripts/sync-cordova-app.js` copies those files into
`mobile-cordova/www/nodejs-project` before the Android build.

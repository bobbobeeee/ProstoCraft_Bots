# Android shell

1. Run `npm run android:sync` from the project root to copy the shared UI into `app/src/main/assets/www`.
2. Open the `android` folder in Android Studio.
3. Let Android Studio install the required Android SDK / Gradle components.
4. Build the APK from Android Studio or with Gradle once the SDK is available.

Important: this `android/` project is a lightweight WebView shell. It stores `config.json` locally and exposes the UI bridge, but it does not embed the Node.js / mineflayer runtime.

If you need a fully functional Android build with the local mining runtime included, use the Cordova pipeline instead:

1. Run `npm run android:build:release` from the project root.
2. Install the resulting APK from `dist-android/ProstoCraft Bot Studio Mobile-runtime.apk`.

That Cordova release is the production Android build for this repository.

# ProstoCraft Bot Studio 3.0.1

Версия `3.0.1` закрепляет большой внутренний рефакторинг без изменения формата `config.json`, UI и пользовательского поведения.

## Что нового

- Добавлены ESLint, Prettier, CI-проверки и JSDoc/checkJs typecheck для релизных модулей.
- Конфигурация вынесена в единую runtime-схему с сохранением legacy fallback/clamp поведения.
- `bot.js` сокращён до оркестратора, а runtime-логика разнесена по модулям `runtime-core/`.
- Renderer разбит на модули по экранам и действиям без изменения UI и JSON-формата настроек.
- Electron main-процесс разнесён по модулям, IPC-проверки усилены без смены публичного API.
- Android/Cordova release tooling разделён на проверяемые модули и покрыт тестами.
- Синхронизация Android assets и Cordova runtime обновлена под новые runtime-core модули.

## Что скачать

- `ProstoCraft.Bot.Studio-Setup-3.0.1.exe` - обычный установщик Windows.
- `ProstoCraft.Bot.Studio-Mobile-3.0.1.apk` - Android APK.
- `SHA256SUMS.txt` - контрольные суммы файлов.

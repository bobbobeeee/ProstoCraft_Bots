# Инструкция релиза

## Локальная проверка

Перед публикацией запусти:

```powershell
npm install
npm test
npm run dist:win:installer
npm run android:build:release
```

После сборки файлы будут лежать в папках `dist` и `dist-android`.

## Публикация на GitHub

GitHub Release создаётся автоматически, когда в репозиторий отправляется тег вида `v*`.

Пример для версии `2.0.1`:

```powershell
git status
git tag v2.0.1
git push origin v2.0.1
```

GitHub Actions соберёт:

- установщик `ProstoCraft.Bot.Studio-Setup-2.0.1.exe`;
- Android APK `ProstoCraft.Bot.Studio-Mobile-2.0.1.apk`;
- файл `SHA256SUMS.txt`.

Готовый релиз появится здесь:

https://github.com/bobbobeeee/ProstoCraft_Bots/releases

В workflow `electron-builder` запускается с `--publish never`, а загрузку файлов в GitHub Release делает отдельный шаг `softprops/action-gh-release`.

## Если нужно обновить релиз

1. Удали старый тег на GitHub или создай новый тег, например `v2.0.1`.
2. Обнови `CHANGELOG.md` и `RELEASE_NOTES.md`.
3. Запушь новый тег.

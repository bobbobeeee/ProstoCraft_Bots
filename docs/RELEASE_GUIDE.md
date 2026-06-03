# Инструкция релиза

## Локальная проверка

Перед публикацией запусти:

```powershell
npm install
npm test
npm run dist:win:release
```

После сборки файлы будут лежать в папке `dist`.

## Публикация на GitHub

GitHub Release создаётся автоматически, когда в репозиторий отправляется тег вида `v*`.

Пример для версии `1.0.1`:

```powershell
git status
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions соберёт:

- установщик `ProstoCraft Bot Studio-Setup-1.0.1.exe`;
- portable `ProstoCraft Bot Studio-Portable-1.0.1.exe`;
- файл `SHA256SUMS.txt`.

Готовый релиз появится здесь:

https://github.com/merrobocop/ProstoCraft_Bots/releases

В workflow `electron-builder` запускается с `--publish never`, а загрузку файлов в GitHub Release делает отдельный шаг `softprops/action-gh-release`.

## Если нужно обновить релиз

1. Удали старый тег на GitHub или создай новый тег, например `v1.0.1`.
2. Обнови `CHANGELOG.md` и `RELEASE_NOTES.md`.
3. Запушь новый тег.

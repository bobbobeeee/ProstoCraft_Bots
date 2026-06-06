# ProstoCraft Bot Studio

Desktop launcher and config studio for ProstoCraft mining bots.

## Скачать

Готовые Windows-сборки лежат в GitHub Releases:

https://github.com/merrobocop/ProstoCraft_Bots/releases

В релизе доступны два отдельных файла:

- `ProstoCraft.Bot.Studio-Setup-2.0.0.exe` - установщик Windows.
- `ProstoCraft.Bot.Studio-Mobile-2.0.0.apk` - Android APK.

## Документация

- [Инструкция пользователя](docs/USER_GUIDE.md)
- [Инструкция релиза](docs/RELEASE_GUIDE.md)
- [Новости версии](CHANGELOG.md)
- [Заметки текущего релиза](RELEASE_NOTES.md)

## Структура проекта

```text
bot.js                         Основная логика бота
config.json                    Дефолтный конфиг приложения
desktop/                       Electron-приложение
desktop/renderer/              Интерфейс настроек, логов и управления
scripts/                       Проверки, синхронизация и сборочные утилиты
android/                       Android assets
mobile-cordova/                Cordova-копия приложения
mobile-cordova-src/            Исходники мобильного runtime
docs/                          Инструкции
.github/workflows/release.yml  Автоматическая сборка GitHub Release
```

## Локальный запуск

```powershell
npm install
npm start
```

Headless-режим:

```powershell
npm run start:headless
```

## Проверка

```powershell
npm test
npm run check
```

## Сборка Windows

Собрать установщик:

```powershell
npm run dist:win:installer
```

Собрать Android APK:

```powershell
npm run android:build:release
```

Собрать только установщик:

```powershell
npm run dist:win:installer
```

## GitHub Release

Чтобы GitHub сам собрал и прикрепил файлы к Releases:

```powershell
git tag v2.0.0
git push origin v2.0.0
```

Локальные логи, сборки, сертификаты, keystore-файлы и runtime-настройки не должны попадать в репозиторий.

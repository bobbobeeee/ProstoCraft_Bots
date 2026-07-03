# ProstoCraft Bot Studio 3.0.2

Версия 3.0.2 — исправление бага в механизме обновлений (Update Center).

## Исправлено

- **Update Center**: починена ошибка "SHA256 checksum is required before downloading an update". При успешном ответе от GitHub API, но отсутствии SHA256SUMS.txt в релизе, апдейтер больше не падает с этой ошибкой — теперь корректно переходит к проверке манифеста.
- **Источник обновлений**: переключён с offline (локальный latest-release.json) на online — GitHub API (`bobbobeeee/ProstoCraft_Bots).

## Ассеты

- ProstoCraft.Bot.Studio-Setup-3.0.2.exe — установщик Windows.
- ProstoCraft.Bot.Studio-Mobile-3.0.2.apk — Android APK.
- SHA256SUMS.txt — контрольные суммы.
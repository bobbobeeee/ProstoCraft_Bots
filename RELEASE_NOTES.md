# ProstoCraft Bot Studio 2.0.2

Версия `2.0.2` добавляет Stability Center 24/7: бот лучше отличает реальную просадку копания от сетевого простоя и понятнее объясняет, что произошло.

## Что нового

- Добавлен центр состояния: причина просадки, severity, простой, последняя ошибка сети и действие восстановления.
- Скорость разделена на `Effective` и `Raw`: активное копание отдельно от простоев reconnect/offline.
- После reconnect короткое окно скорости сбрасывается, чтобы не показывать ложные провалы.
- Speed guard ждёт новый grace-период активного копания после восстановления.
- Добавлен watchdog runtime: если backend жив, но перестал отдавать события, приложение перезапускает его.
- Android держит foreground-service активным во время reconnect и восстановления.
- Логи получили короткие диагнозы: `NETWORK DNS`, `NETWORK RESET`, `SERVER RESET`, `BOT STALE`, `MINING SPEED`.

## Что скачать

- `ProstoCraft.Bot.Studio-Setup-2.0.2.exe` - обычный установщик Windows.
- `ProstoCraft.Bot.Studio-Mobile-2.0.2.apk` - Android APK.
- `SHA256SUMS.txt` - контрольные суммы файлов.

# ProstoCraft Bot Studio 2.0.4

Версия `2.0.4` исправляет восстановление после серверного кика `You are sending too many packets!`.

## Что нового

- Packet-safe режим теперь включается даже если уже был запланирован быстрый mid-session reconnect.
- Reconnect после `too many packets` переносится на безопасную задержку, чтобы бот не возвращался тем же темпом и не ловил повторный кик.
- Добавлен тест reconnect-policy для server-system notice `too many packets`.
- Сохранены быстрые настройки добычи и минимальный UI из версии `2.0.3`.

## Что скачать

- `ProstoCraft.Bot.Studio-Setup-2.0.4.exe` - обычный установщик Windows.
- `ProstoCraft.Bot.Studio-Mobile-2.0.4.apk` - Android APK.
- `SHA256SUMS.txt` - контрольные суммы файлов.

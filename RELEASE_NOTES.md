# ProstoCraft Bot Studio 2.1.0

Версия `2.1.0` делает крупный апгрейд стабильности, диагностики и обновлений без снижения быстрых настроек копания.

## Что нового

- Добавлен адаптивный packet governor: после реального `too many packets` бот временно уходит в safe/recovery режим и затем плавно возвращает быстрые лимиты.
- Добавлен adaptive mining controller: бот подбирает устойчивый packet-break предел по подтверждениям сервера, чистит stale pending и сначала восстанавливает mining loop без полного reconnect.
- Runtime snapshot теперь отдаёт `performance`: effective/raw скорость, peak, packet mode и последнюю причину просадки.
- BotFilter/chat-captcha события получили evidence с source/position/timestamp, чтобы не ловить ложную чат-капчу.
- Центр обновлений получил online/fallback/cache режимы и понятный источник данных.
- UI показывает компактный диагноз на пульте и фильтр логов `Важное / Всё`.
- Android release build больше не создаёт fallback/CI-signed APK вместо стабильной подписи.

## Что скачать

- `ProstoCraft.Bot.Studio-Setup-2.1.0.exe` - обычный установщик Windows.
- `ProstoCraft.Bot.Studio-Mobile-2.1.0.apk` - Android APK.
- `SHA256SUMS.txt` - контрольные суммы файлов.

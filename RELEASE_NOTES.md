# ProstoCraft Bot Studio 3.0.0

Версия `3.0.0` закрепляет стабильную быструю добычу на реальном сервере и снижает риск киков за packet-break без урезания быстрых настроек.

## Что нового

- Safe packet-профиль стал действительно безопаснее и теперь тоже масштабируется adaptive mining controller.
- Speed guard получил гистерезис: он не дёргает восстановление из-за мелких колебаний рядом с целью, но быстро реагирует на реальные просадки.
- При низких подтверждениях packet-break бот профилактически включает packet-safe режим до кика `too many packets`.
- Offline watchdog больше не перебивает активный reconnect поверх свежей попытки подключения.
- Проверено на реальном сервере с рабочим конфигом: 15 минут без `too many packets`, без reconnect, скорость держалась около `732-748 б/м`.
- Runtime snapshot теперь отдаёт `performance`: effective/raw скорость, peak, packet mode и последнюю причину просадки.
- BotFilter/chat-captcha события получили evidence с source/position/timestamp, чтобы не ловить ложную чат-капчу.
- Центр обновлений получил online/fallback/cache режимы и понятный источник данных.
- UI показывает компактный диагноз на пульте и фильтр логов `Важное / Всё`.
- Android release build больше не создаёт fallback/CI-signed APK вместо стабильной подписи.

## Что скачать

- `ProstoCraft.Bot.Studio-Setup-3.0.0.exe` - обычный установщик Windows.
- `ProstoCraft.Bot.Studio-Mobile-3.0.0.apk` - Android APK.
- `SHA256SUMS.txt` - контрольные суммы файлов.

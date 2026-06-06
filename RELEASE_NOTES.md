# ProstoCraft Bot Studio 2.0.0

Крупный релиз со стабильным входом через LimboFilter 1.1.18, desktop installer и Android APK.

## Что нового

- Бот адаптирован под реальную fall-проверку LimboFilter 1.1.18.
- Координаты проверки берутся строго из server `position` packet, включая реальный `Y=1024`.
- Добавлен строгий локальный emulator LimboFilter для тестов.
- Чат/карта-капча не решается автоматически: событие логируется, бот уходит в 30-минутную паузу.
- Windows релиз теперь публикуется как installer без portable.
- Android релиз публикуется отдельным APK.

## Что скачать

- `ProstoCraft.Bot.Studio-Setup-2.0.0.exe` - обычный установщик Windows.
- `ProstoCraft.Bot.Studio-Mobile-2.0.0.apk` - Android APK.
- `SHA256SUMS.txt` - контрольные суммы файлов.

## Проверка перед публикацией

- `npm test`
- `npm run dist:win:installer`
- `npm run android:build:release`

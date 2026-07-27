# SAFR Web и Telegram Mini App

## Что разворачивается

Один frontend обслуживает:

- `/` — публичный сайт;
- `/mini-app` — кабинет внутри Telegram;
- `/privacy` — политика конфиденциальности.

Mini App получает профиль, SAFR Points, сеть и заявки из общего backend.
Авторизация выполняется по подписанному Telegram `initData`; service-token
никогда не передаётся в браузер.

## Переменные

Frontend:

- `NEXT_PUBLIC_SITE_URL=https://<domain>`;
- `NEXT_PUBLIC_API_BASE_URL=https://api.<domain>`.

Backend:

- `TELEGRAM_BOT_TOKEN` — тот же токен, что у production-бота;
- `TELEGRAM_BOT_USERNAME=safr_bali_bot`;
- `MINI_APP_ORIGINS=https://<domain>`.

Bot:

- `MINI_APP_URL=https://<domain>/mini-app`.

## DNS

- основной домен направляется на frontend;
- `api.<domain>` направляется на VPS;
- backend публикуется только через HTTPS reverse proxy;
- порт PostgreSQL наружу не открывается.

## Порядок выпуска

1. Создать backup production.
2. Опубликовать frontend и подключить основной домен.
3. Настроить HTTPS для `api.<domain>` и проверить `/health`.
4. Добавить production-переменные без вывода секретов в журнал.
5. Перезапустить backend и проверить `/mini-app/me` с невалидной подписью:
   ожидается `401`.
6. Перезапустить bot и проверить кнопку `Открыть SAFR App`.
7. Повторно запустить мигратор пользователей для переноса нейтральных
   реферальных кодов в PostgreSQL.
8. Пройти Telegram smoke-test реальным аккаунтом.

## Команды BotFather

После появления публичного HTTPS URL:

- в `@BotFather` открыть `/mybots`;
- выбрать `@safr_bali_bot`;
- `Bot Settings` → `Menu Button`;
- указать `https://<domain>/mini-app`.

Кнопка в личном кабинете также появляется автоматически при настроенном
`MINI_APP_URL`.

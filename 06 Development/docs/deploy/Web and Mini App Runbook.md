# SAFR Web и Telegram Mini App

## Текущий production

- сайт: `https://safrway.online`;
- `www`: redirect на `https://safrway.online`;
- Mini App: `https://app.safrway.online`;
- API: `https://api.safrway.online`;
- Cloudflare zone: `safrway.online`;
- Tunnel: `safrway-production`;
- Tunnel ID: `595a6d1c-97fd-45eb-898c-ac775aa9c30f`;
- origin: `http://127.0.0.1:8081`;
- systemd: `cloudflared-safrway.service`;
- NS: `brit.ns.cloudflare.com`, `jim.ns.cloudflare.com`;
- DNSSEC: выключен, DS отсутствует.

Не изменять Tunnel `mdt618-production` и существующий `cloudflared.service`.

## Что разворачивается

Один frontend обслуживает:

- `/` — публичный сайт;
- `/directions/*` — отдельные страницы каталога;
- `/account` — web-кабинет;
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
- `TELEGRAM_OIDC_CLIENT_ID` и `TELEGRAM_OIDC_CLIENT_SECRET` из BotFather;
- `TELEGRAM_OIDC_REDIRECT_URI=https://safrway.online/api/web/auth/callback`;
- `WEBSITE_URL=https://safrway.online`;
- `WEB_COOKIE_SECURE=true`;
- `DEFAULT_ADMIN_TELEGRAM_ID=<главный админ>`.

Bot:

- `MINI_APP_URL=https://app.safrway.online`.

## DNS

- apex, `www`, `app` и `api` являются proxied Tunnel/CNAME-записями;
- все четыре hostname ведут на отдельный Tunnel SAFR;
- Cloudflare принимает HTTPS и передаёт запрос на локальный Nginx;
- backend и PostgreSQL напрямую наружу не открываются.

## Порядок выпуска

1. Создать backup production.
2. Опубликовать frontend и подключить основной домен.
3. Настроить HTTPS для `api.<domain>` и проверить `/health`.
4. Добавить production-переменные без вывода секретов в журнал.
5. Применить Alembic-миграцию `4d2f7a9b8c10`.
6. Перезапустить backend и проверить `/mini-app/me` с невалидной подписью:
   ожидается `401`.
7. Перезапустить bot и проверить кнопку `Открыть SAFR App` в главном меню.
8. Повторно запустить мигратор пользователей для переноса нейтральных
   реферальных кодов в PostgreSQL.
9. Пройти Telegram и web smoke-test реальным аккаунтом.

## Обязательный smoke после frontend deploy

1. Открыть Mini App из Telegram, а не обычной вкладкой.
2. Нажать `Бали`.
3. Нажать `Сделать визу`.
4. Убедиться, что список виз открылся отдельным экраном внутри Mini App.
5. Открыть E33G и проверить полный текст и пагинацию.
6. Проверить BackButton и локальную кнопку «Назад».
7. Открыть Таиланд, Россию и Непал.
8. Убедиться, что в чат бота не отправился `/start`.
9. Явная кнопка менеджера может открыть обычный чат без автоматической команды.
10. Проверить `/mini-app/me`: без валидного `initData` ожидается `401`.
11. Переключить все четыре нижних экрана; прокрутка должна оставаться обычной.
12. На сайте открыть отдельные URL страны, услуги и подуслуги.
13. Войти через Telegram, отправить сообщение с сайта и получить ответ.
14. Добавить внутреннюю заметку и проверить, что клиент её не видит.

## Команды BotFather

После появления публичного HTTPS URL:

- в `@BotFather` открыть `/mybots`;
- выбрать `@safr_bali_bot`;
- `Bot Settings` → `Menu Button`;
- указать `https://<domain>/mini-app`.

Кнопка в личном кабинете также появляется автоматически при настроенном
`MINI_APP_URL`.

Для Web Login в `@BotFather` открыть `Bot Settings → Web Login`, добавить:

- allowed origin `https://safrway.online`;
- redirect URI `https://safrway.online/api/web/auth/callback`.

Client Secret хранить только в backend environment.

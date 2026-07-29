# SAFR Web и Telegram Mini App

## Закрытый B4 preview

Рабочая ветка опубликована. На VPS отдельно от production развёрнут full-stack
preview:

- `/var/www/safr-preview/releases/bfe3466`;
- origin сайта `127.0.0.1:8082`;
- origin React-приложения `127.0.0.1:8083`;
- backend `127.0.0.1:8002`;
- PostgreSQL cluster `safrpreview` на `127.0.0.1:5433`;
- Basic Auth сайта;
- закрытый входной gate Mini App с `Secure`/`HttpOnly` cookie;
- временные HTTPS Quick Tunnel;
- `noindex`;
- API и Mini App session endpoints используют только preview database.

Точные временные URL и пароль передаются владельцу вне репозитория.

End-to-end Mini App auth, replay guard, dashboard, chat, internal-note
isolation и logout подтверждены синтетически и реальным Telegram WebView на
iPhone. Browser OIDC остаётся закрытым до получения отдельных Telegram
credentials.

## B4 production target — активен

Production release:

- `/var/www/safr/releases/5bb1626/astro-site` — `45/45` публичных HTML;
- `/var/www/safr/releases/3405560/react-app` — Mini App и account;
- `06 Development/shared/content/generated/catalog-runtime.v1.json` — общий
  content-addressed catalog snapshot.

Production config:

- `deploy/nginx/safr-target-production.conf`;
- Astro symlink `/var/www/safr/astro-site`;
- React symlink `/var/www/safr/react-app`.

Legacy `/directions/*` использует `308`, source `/account/` пока использует
временный `307`. Не менять его на `308` до подтверждения стабильного account
URL и настройки OIDC.

Полный журнал: `06 Development/docs/B4 Production Cutover Report.md`.

## B3 target — проверен только в закрытом preview

Целевой application frontend находится в `06 Development/react-app`:

- `https://app.safrway.online/` — Telegram Mini App;
- `https://app.safrway.online/account/` — browser account;
- один origin и один React/Vite build;
- same-origin `/mini-app/*` и `/api/web/*` проксируются в FastAPI;
- оба HTML entry имеют `noindex`;
- `https://safrway.online/account/` в preview делает один `307` redirect;
- production `308` пока запрещён.

Preview-конфигурация:
`06 Development/deploy/nginx/safr-react-app.preview.conf`.

Отдельная закрытая preview-конфигурация установлена только на origin `8083`.
Alembic candidate `b3f28c7a91d0_add_mini_app_auth_replay_guard.py` применён
только к isolated cluster `safrpreview:5433`. Production не изменялся.

Целевой production OIDC callback после отдельного cutover:
`https://app.safrway.online/api/web/auth/callback`.

Target backend environment после отдельного cutover:

- `APPLICATION_URL=https://app.safrway.online`;
- `TELEGRAM_OIDC_REDIRECT_URI=https://app.safrway.online/api/web/auth/callback`.

## Next/Vinext reference — не разворачивать как target

Текущий Next/Vinext сохраняется как эталон сравнения до cutover. Целевой
публичный сайт создаёт Astro, а Mini App и account — React/Vite. До релиза
обязательны:

1. отдельное подтверждение владельца;
2. свежий backup и проверка восстановления;
3. push и зелёный CI;
4. offline SQL review миграции `7f6a1c2d3e40`;
5. применение миграции только перед совместимым backend;
6. сборка из точного commit с
   `NEXT_PUBLIC_SITE_URL=https://safrway.online` и
   `NEXT_PUBLIC_API_BASE_URL=https://api.safrway.online`;
7. immutable web release и атомарное переключение symlink;
8. проверка 47 URL, одного canonical redirect, 404, cookies, Mini App и
   rollback.

Нельзя публиковать новый frontend до совместимого backend и таблицы
`mini_app_sessions`. Нельзя применять миграцию отдельно от согласованного
release.

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

## Что будет развёрнуто после cutover

Два независимых frontend build:

- Astro на `safrway.online`: `/`, `/catalog/`, `/<страна>/*`, `/privacy/`
  и остальные 45 публичных HTML routes;
- `/account/` на основном домене: один временный `307` в React account;
- React/Vite на `app.safrway.online`: Mini App `/` и browser account
  `/account/`.

Mini App получает профиль, SAFR Points, сеть и заявки из общего backend.
Авторизация выполняется по подписанному Telegram `initData`; service-token
никогда не передаётся в браузер.

## Переменные

Frontend:

- Astro генерируется статически из shared catalog без runtime secrets;
- React использует same-origin `/mini-app/*` и `/api/web/*`;
- browser build не получает service/admin tokens.

Backend:

- `TELEGRAM_BOT_TOKEN` — тот же токен, что у production-бота;
- `TELEGRAM_BOT_USERNAME=safr_bali_bot`;
- `MINI_APP_ORIGINS=https://<domain>`.
- `TELEGRAM_OIDC_CLIENT_ID` и `TELEGRAM_OIDC_CLIENT_SECRET` из BotFather;
- `TELEGRAM_OIDC_REDIRECT_URI` — текущий callback до cutover;
- `APPLICATION_URL` — target origin React-приложения;
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
5. Применить reviewed Alembic chain до `b3f28c7a91d0` только вместе с
   совместимым backend.
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

## Дополнительный smoke калькулятора обмена v0.8.1

Выполнять только после backup, применения migration `d6f4a8b2c910`,
обновления backend, bot и React из одного commit.

1. Открыть в боте `Бали → Обмен валюты → Открыть калькулятор`.
2. Проверить, что бот не просит сумму и не рассчитывает обмен в чате.
3. Нажать Web App-кнопку и убедиться, что открылась страница калькулятора.
4. Выбрать `USDT → наличные IDR`, ввести известную сумму USDT.
5. Переключить режим на желаемую сумму IDR и повторить расчёт.
6. Проверить `USDT → безналичные IDR` в обоих режимах.
7. Выбрать `наличные IDR → безналичные RUB`.
8. Ввести `20 000 RUB` как желаемый результат: контрольный fixture должен
   показать `5 150 000 IDR`.
9. Ввести имеющуюся сумму IDR и убедиться, что RUB вычисляются без ручного
   подбора.
10. Выбрать неподтверждённую пару и проверить переход только на ручной
    расчёт.
11. Убедиться, что UI и сетевой ответ не показывают rates, проценты,
    settings snapshot или calculation snapshot.
12. Проверить обычную прокрутку страницы и отсутствие `/start` в Telegram.

## Команды BotFather

После появления публичного HTTPS URL:

- в `@BotFather` открыть `/mybots`;
- выбрать `@safr_bali_bot`;
- `Bot Settings` → `Menu Button`;
- указать `https://app.safrway.online/`.

Кнопка в личном кабинете также появляется автоматически при настроенном
`MINI_APP_URL`.

Для Web Login в `@BotFather` открыть `Bot Settings → Web Login`, добавить:

- allowed origin `https://app.safrway.online`;
- redirect URI `https://app.safrway.online/api/web/auth/callback`.

Client Secret хранить только в backend environment.

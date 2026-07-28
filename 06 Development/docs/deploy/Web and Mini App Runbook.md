# SAFR Web и Telegram Mini App

## Локальный B4 target — не применять

Целевой статический выпуск:

- `06 Development/astro-site/dist` — `45/45` публичных HTML routes;
- `06 Development/react-app/dist` — Mini App `/` и account `/account/`;
- `06 Development/shared/content/generated/catalog-runtime.v1.json` — общий
  content-addressed catalog snapshot.

Preview configs:

- `deploy/nginx/safr-astro-site.preview.conf`;
- `deploy/nginx/safr-react-app.preview.conf`.

Полный порядок, gates и rollback:
`06 Development/docs/deploy/B4 Cutover Plan.md`.

Ни одна из этих конфигураций не установлена. Production `308` выключен.

## Локальный B3 target — не применять

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

Она не устанавливалась на VPS. Alembic candidate
`b3f28c7a91d0_add_mini_app_auth_replay_guard.py` также не применялась.

Целевой production OIDC callback после отдельного cutover:
`https://app.safrway.online/api/web/auth/callback`.

Target backend environment после отдельного cutover:

- `APPLICATION_URL=https://app.safrway.online`;
- `TELEGRAM_OIDC_REDIRECT_URI=https://app.safrway.online/api/web/auth/callback`.

## Локальный release candidate — не применять без отдельной команды

В `codex/safrway-stabilization` подготовлен переход на официальный Next.js
static export. До релиза обязательны:

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

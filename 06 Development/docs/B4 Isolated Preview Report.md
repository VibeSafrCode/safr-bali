# B4 — Isolated Preview Report

Дата: 2026-07-28

Статус: исторический отчёт preview. Production cutover выполнен 2026-07-29
на commit `39dd069`; фактический результат описан в
`06 Development/docs/B4 Production Cutover Report.md`.

## Контур

- GitHub functional source: `codex/safrway-stabilization`, commit `f46d791`;
- backend runtime source: commit `2f016e4`;
- Astro release: `/var/www/safr-preview/releases/bfe3466/astro-site`;
- React release: `/var/www/safr-preview/releases/bfe3466/react-app`;
- preview backend: `127.0.0.1:8002`;
- preview PostgreSQL cluster: `safrpreview`, `127.0.0.1:5433`;
- website origin: `127.0.0.1:8082`;
- application origin: `127.0.0.1:8083`;
- два временных HTTPS Quick Tunnel;
- Basic Auth для сайта;
- входной preview gate с `Secure`/`HttpOnly` cookie для Telegram Mini App;
- обязательный `noindex`.

Точные временные URL, пароль и preview gate key не хранятся в Git.

## Изоляция

Preview использует:

- отдельный PostgreSQL data directory;
- отдельную database role и database;
- отдельные service/admin tokens;
- отдельные cookie names;
- отдельный backend systemd unit;
- отдельные Nginx ports и release root.

Из production environment read-only взяты только:

- Telegram bot token для проверки подписи `initData`;
- bot username;
- Telegram ID ГлавАдмина.

Имя, username, телефон, реферал, Points, заявки и переписка из production не
копировались. В preview создана нейтральная запись `Preview Admin`.

## Database

В isolated cluster применена вся Alembic chain до:

`b3f28c7a91d0`

Результат seed:

- users: `1`;
- services: `7`;
- reward rules: `21`.

Production cluster `main:5432` и production database не изменялись.

## Проверки

- signed Telegram `initData` exchange: `200`;
- повторный exchange того же `initData`: `409`;
- Mini App dashboard: `200`;
- identity соответствует preview admin;
- balance: `0`;
- referral count: `0`;
- orders: `0`;
- Mini App chat read/send: `200/201`;
- internal staff note: `201`;
- internal note отсутствует в client response;
- logout: `200`;
- dashboard после logout: `401`;
- account safe return сохраняется;
- внешний URL и чувствительные query отбрасываются;
- guest website message записывается только в preview database;
- сайт без Basic Auth возвращает `401`;
- Mini App без preview gate возвращает `404`;
- вход в Mini App по gate: `200`;
- повторное открытие Mini App по защищённой cookie: `200`;
- API без Telegram-сессии после прохождения gate возвращает `401`.

Basic Auth нельзя использовать как входной gate для Telegram WebView: iOS
останавливал загрузку на ответе Nginx `401`, не обращаясь к backend. Gate
Mini App заменён на совместимую схему: высокоэнтропийный ключ передаётся
только в тестовой Web App-кнопке и обменивается Nginx на cookie со сроком
24 часа. Без ключа и cookie preview закрыт.

ГлавАдмину отправлена исправленная тестовая Web App-кнопка, Telegram message
`1287`. Предыдущая кнопка `1286` больше не актуальна.

29 июля реальный iPhone открыл message `1287`:

- HTML и assets: `200`;
- первый `/mini-app/me` без сессии: ожидаемый `401`;
- exchange подписанного Telegram `initData`: `200`;
- повторный `/mini-app/me`: `200`;
- загрузка клиентского чата: `200`.

Таким образом, исправление подтверждено не только синтетическим smoke, но и
реальным Telegram WebView.

## CI

Commit `072035e` добавил GitHub Actions для:

- Python 3.12 и временного PostgreSQL 16;
- Alembic head и PostgreSQL race/idempotency tests;
- shared contract `47/47`;
- React unit/build/browser tests;
- Astro static/SEO/browser/accessibility/Lighthouse tests;
- parity текущего Next/Vinext reference.

Локально те же frontend gates прошли. Remote GitHub Actions result должен
быть отдельно подтверждён в авторизованном GitHub UI/CLI до cutover.

## Открытый gate

Browser OIDC login пока не может пройти end-to-end: в текущем production
environment отсутствуют `TELEGRAM_OIDC_CLIENT_ID` и
`TELEGRAM_OIDC_CLIENT_SECRET`.

Для закрытия gate нужны:

1. создать Telegram Web Login/OIDC credentials в BotFather;
2. разрешить временный preview origin;
3. задать preview callback без вывода secret;
4. проверить login, refresh/logout и безопасный `return_to`;
5. после preview удалить временный callback.

## Production control

После запуска preview подтверждено:

- production source: `main`, `e07f4c1`;
- production website: `200`;
- production Mini App: `200`;
- production API health: `200`;
- backend, bot, Nginx и permanent Tunnel активны;
- permanent Tunnel имеет `NRestarts=0`.

## Откат preview

1. Остановить `safr-preview-backend.service`.
2. Остановить два временных Quick Tunnel unit.
3. Отключить `safr-closed-preview` в Nginx и выполнить `nginx -t`.
4. Reload Nginx.
5. Выполнить `pg_dropcluster --stop 16 safrpreview`.
6. Удалить только `/var/www/safr-preview` и `/opt/safr-preview` после
   отдельного подтверждения владельца.

Ни один шаг rollback не требует изменения production database или permanent
Cloudflare Tunnel.

# B4 — Production Cutover Report

Дата: 2026-07-29

Статус: выполнен

## Выпуск

- functional production commit: `39dd069`;
- GitHub branch: `codex/safrway-stabilization`;
- Astro public routes: `45/45`;
- React application routes: `2/2`;
- ecosystem contract: `47/47`;
- Alembic: `b3f28c7a91d0`;
- production Astro root:
  `/var/www/safr/releases/39dd069/astro-site`;
- production React root:
  `/var/www/safr/releases/39dd069/react-app`.

Next/Vinext сохранён в Git как reference, но production traffic больше не
обслуживает.

## Backup

Перед изменениями создан backup и выполнен реальный restore-check:

`/var/backups/safr-bali/20260729T085606Z-pre-186820d`

- PostgreSQL dump: 62 426 bytes;
- database SHA-256:
  `f06dc9868920ea0fec5bccf270fc9a100a136b9200f281989ccdd5f881c63073`;
- восстановлено 13 пользователей и 12 реферальных строк;
- bot runtime и environment сохранены отдельно с правами `600`.

## Database

Применены migrations:

1. `7f6a1c2d3e40` — Mini App sessions;
2. `a91b0c2d3e41` — referral/reward invariants;
3. `b3f28c7a91d0` — Telegram `initData` replay guard.

Существующие ledger rows не пересчитывались. Legacy JSON referral storage не
удалялся.

Read-only reconciliation после выпуска:

- PostgreSQL users: 13;
- referral rows: 12;
- user referral relations: 12;
- JSON referral records: 12;
- JSON referral code records: 13;
- issues: 0.

Отчёт на VPS:

`/var/backups/safr-bali/referral_reconciliation_2026-07-29_after_39dd069.json`

## Проверки

До выпуска:

- shared contracts: `9/9`;
- Astro static: `11/11`;
- Astro browser/accessibility: `10/10`;
- React unit/artifact: `14/14`;
- React browser: `3/3`;
- backend local: `21 passed`, `5 PostgreSQL-only skipped`;
- PostgreSQL concurrency/invariants: `5/5`;
- bot: `47/47`;
- Alembic upgrade → downgrade → upgrade на временном PostgreSQL.

После выпуска через origin и Cloudflare edge:

- сайт, каталог и дерево Бали/виз: `200`;
- Mini App и account: `200`;
- API health: `200`;
- Mini App без Telegram session: `401`;
- неизвестный публичный URL: `404`;
- `/directions/*`: один `308`;
- `/account/`: один временный `307`;
- `www`: один `301`;
- sitemap, robots и support JavaScript: `200`;
- localhost, `:8081`, secrets и server-only variables в артефактах не найдены;
- backend, bot, Nginx и `cloudflared-safrway`: `active`.

## Инцидент во время cutover

Первый smoke-script проверил GET-only account redirect методом `HEAD` и
получил ожидаемый для этого метода `405`. Его rollback handler был
неидемпотентным и несколько раз перезапустил backend/bot, после чего systemd
включил start-limit.

Данные не терялись. Nginx и Cloudflare не останавливались. Production был
восстановлен совместимым commit `39dd069`, сервисы сброшены из start-limit,
а redirect повторно проверен правильным GET: `307` на
`https://app.safrway.online/account/`.

## Открытый внешний gate

В production отсутствуют `TELEGRAM_OIDC_CLIENT_ID` и
`TELEGRAM_OIDC_CLIENT_SECRET`. Поэтому browser account корректно показывает
нейтральное состояние без неработающей кнопки входа.

Telegram Mini App не зависит от этих credentials: он использует подписанный
`initData`, проверку `auth_date`, серверную session cookie и replay guard.

Следующий отдельный спринт:

1. создать OIDC credentials в BotFather;
2. добавить production callback;
3. выполнить end-to-end browser login;
4. проверить неизменяемость реферала;
5. после периода стабильности решить, переводить ли account redirect с `307`
   на `308`.

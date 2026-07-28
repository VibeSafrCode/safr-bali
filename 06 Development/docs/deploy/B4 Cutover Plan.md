# B4 Cutover Plan — не выполнять без отдельной команды

## Текущее состояние

B4 готов только локально. Push, CI, backup, preview, migrations, deploy,
Cloudflare и production не выполнялись.

## Обязательные preconditions

1. Владелец отдельно разрешил push и preview.
2. Все локальные коммиты отправлены в GitHub.
3. CI прошёл на точном commit.
4. Создан свежий PostgreSQL backup и выполнен restore-check.
5. Reconciliation B0 не показывает блокирующих referral/reward конфликтов.
6. Alembic candidates `a91b0c2d3e41` и `b3f28c7a91d0` отдельно reviewed.
7. Telegram OIDC credentials подготовлены без вывода secret.
8. Preview callback настроен на
   `https://app.safrway.online/api/web/auth/callback`.
9. `APPLICATION_URL=https://app.safrway.online` задан только в target
   environment.
10. Все 45 Astro и 2 React routes проверены в preview.
11. Для полного визового cutover критические факты подтверждены официальными
    источниками. Иначе визовые routes остаются закрыты текущим production.

## Immutable release layout

Рекомендуемые каталоги:

- `/var/www/safr/releases/<commit>/astro-site`;
- `/var/www/safr/releases/<commit>/react-app`;
- `/var/www/safr/current/astro-site` — symlink;
- `/var/www/safr/current/react-app` — symlink.

Сборка выполняется только из точного Git commit:

1. generated catalog snapshot;
2. Astro production build;
3. React production build;
4. artifact contract tests;
5. secret scan;
6. checksum manifest.

## Preview

1. Установить preview-конфигурации только после `nginx -t`.
2. Оставить source account redirect `307`.
3. Не менять Cloudflare Tunnel `mdt618-production`.
4. Проверить:
   - `45/45` Astro HTML;
   - `2/2` React entries;
   - настоящий 404;
   - sitemap и robots;
   - noindex account/Mini App/legacy visa;
   - guest support → outbox → профильный менеджер;
   - internal note не видна клиенту;
   - Telegram Mini App не отправляет `/start`;
   - прокрутка после всех нижних вкладок;
   - browser OIDC и безопасный return path;
   - source `/account/` сохраняет только валидный `return_to`;
   - повторный `initData` exchange → `409`;
   - Points/referral invariants.

## Database order

Migrations нельзя применять отдельно от совместимого backend.

Порядок будущего release:

1. preflight B0 constraints;
2. backup + restore-check;
3. backend code ready, но ещё не принимает трафик;
4. Alembic upgrade до `b3f28c7a91d0`;
5. backend smoke;
6. React preview;
7. Astro preview;
8. Telegram и browser smoke;
9. только затем traffic cutover.

Существующие ledger rows не пересчитываются. Legacy JSON referral storage не
удаляется.

## Production cutover

1. Атомарно переключить release symlinks.
2. Проверить `nginx -t`.
3. Reload Nginx, не restart Cloudflare Tunnel.
4. Проверить четыре public hostnames.
5. Оставить account redirect `307` на период наблюдения.
6. После подтверждённой стабильности и отдельного разрешения заменить только
   source account redirect на `308`.

## Rollback

Frontend rollback:

1. вернуть предыдущие symlinks;
2. вернуть предыдущий Nginx config;
3. `nginx -t`;
4. reload;
5. проверить сайт, Mini App и API.

Backend rollback:

- сначала вернуть совместимый backend;
- schema по возможности оставить forward-compatible;
- downgrade database выполнять только после анализа новых сессий,
  idempotency keys и ledger rows;
- никогда не пересчитывать существующий ledger;
- никогда не менять назначенного реферала.

Cloudflare routes и Tunnel при frontend rollback не меняются.

## Go / no-go

Cutover запрещён, если:

- хотя бы один из `47/47` artifacts отсутствует;
- account образует redirect chain;
- встречается localhost или `:8081`;
- найдены secrets;
- `initData` replay не блокируется;
- referral или Points test падает;
- 404 становится soft-404;
- support раскрывает internal notes;
- визовый route индексируется без официальной проверки;
- отсутствует проверенный rollback.

# B0 — защита реферальных и финансовых инвариантов

Дата: 2026-07-28
Статус: локальный кандидат, migration подготовлена и проверена, не выпущен
Ветка: `codex/safrway-stabilization`

## Границы этапа

B0 меняет только локальный код, тесты и документацию.

На этом этапе запрещены и не выполнялись:

- push и deploy;
- изменения production;
- подключение к production PostgreSQL;
- применение Alembic-миграции;
- удаление legacy JSON;
- пересчёт существующего `points_ledger`;
- исправление существующих реферальных связей.

## Инварианты

1. Login только подтверждает identity.
2. Login не назначает и не меняет реферала.
3. Реферальная связь создаётся только для нового пользователя отдельным
   серверным use case.
4. После назначения `invited_by_user_id` неизменяем.
5. PostgreSQL является целевым source of truth.
6. Legacy JSON временно сохраняется и проверяется read-only инструментом.
7. Баланс SAFR Points рассчитывает только backend.
8. Старые строки ledger не меняются и не пересчитываются.
9. Повтор одной операции не создаёт второе начисление.
10. Новое начисление, связанное с правилом, сохраняет snapshot правила.
11. Ledger и назначенные реферальные связи защищены от `UPDATE/DELETE` на
    уровне PostgreSQL.

## Логика browser OIDC до B0

`upsert_oidc_user()` выполнял сразу две обязанности:

- находил или создавал пользователя Telegram;
- пытался назначить реферала.

Для существующего пользователя без `invited_by_user_id` функция принимала
`ref` из login query. Если валидного `ref` не было, могла использовать
`DEFAULT_ADMIN_TELEGRAM_ID`. После этого она одновременно:

- записывала `users.invited_by_user_id`;
- создавала строку `referrals`.

Следовательно, обычный повторный browser login мог изменить бизнес-данные
существующего пользователя.

## Логика после B0

`upsert_oidc_user()` разделён на два пути:

- существующий пользователь: обновляются только identity-поля профиля;
- новый пользователь: сначала создаётся без реферала, затем отдельный
  `attribute_referral_once()` может назначить только строго валидный `ref`.

`attribute_referral_once()`:

- блокирует строку нового пользователя через `FOR UPDATE`;
- запрещает self-referral;
- не работает при уже существующей связи;
- создаёт `users.invited_by_user_id` и `referrals` в одной транзакции;
- не делает commit самостоятельно;
- возвращает явный результат `created/reason`.

Default-admin attribution из browser login удалён. Существующий Telegram bot
JSON-контур пока не удалён и не мигрирован.

## Все локальные записи рефералов

### PostgreSQL

- `app/services/referral_attribution.py` — единственный новый use case
  атомарной атрибуции;
- `app/api/web_portal.py` — вызывает use case только при создании нового
  browser-пользователя и валидном `ref`;
- `app/api/users.py` — вызывает use case только при создании нового
  Telegram-пользователя.

### Legacy JSON

- `bot/app/handlers/start.py` — первичная Telegram `/start`-атрибуция;
- `bot/app/services/referrals.py::save_referrals()` — запись
  `referrals.json`;
- `bot/app/services/referrals.py::save_referral_codes()` — запись
  `referral_codes.json`;
- `backfill_default_admin_referrals()` — исторический JSON backfill, пока
  сохранён без изменений;
- `bot/scripts/migrate_runtime_to_backend.py` — прежний перенос runtime-JSON.

JSON остаётся временным источником совместимости, но не считается целевым
source of truth.

## Все пути начисления Points

- `POST /points/accrue` — ручное или сервисное начисление;
- `POST /points/accrue-referral` — начисление пригласившему по заказу;
- `PATCH /orders/{order_id}/status` при `completed` — автоматическое
  начисление пригласившему.

Все три пути используют `app/services/rewards.py`.

## Воспроизведённые race conditions

Проверка выполнена на отдельном PostgreSQL 16, не на SQLite.

До исправления:

- два параллельных завершения одного заказа создавали две строки
  `referral_accrual`;
- два разных заказа одного пригласившего могли оба прочитать баланс `0` и
  записать `balance_after = 100`, теряя одно обновление.

После исправления:

- заказ блокируется через `SELECT ... FOR UPDATE`;
- получатель Points блокируется через `SELECT ... FOR UPDATE`;
- баланс перечитывается после получения блокировки;
- один заказ создаёт не более одной referral-операции;
- одинаковый `Idempotency-Key` сериализуется PostgreSQL advisory lock;
- для общего `POST /points/accrue` ключ обязателен;
- повтор с тем же payload возвращает существующую операцию;
- изменённый payload с тем же ключом отклоняется как конфликт.

Результат изолированного теста:

- один заказ, два потока: одна строка, итоговый баланс `100`;
- два заказа, два потока: две строки, итоговый баланс `200`;
- replay одного ключа: одна строка;
- повтор ключа с другим payload: отклонён.

## Snapshot правила начисления

Новые начисления, которые используют `reward_rules`, получают
`reward_rule_snapshot` со следующими полями:

- версия schema;
- ID правила, услуги и partner mode;
- slug partner mode;
- уровень реферала;
- фактически начисленные points;
- значения уровней 1–3;
- `valid_from` и `valid_to`;
- время фиксации snapshot.

Старые строки ledger остаются с `NULL` snapshot. Они не меняются и не
пересчитываются.

## Предлагаемые DB constraints

Миграция `a91b0c2d3e41` подготовлена локально и не применена к production.
Она добавляет:

- уникальный partial index на `points_ledger.idempotency_key`, если ключ не
  `NULL`;
- уникальный partial index: одна `referral_accrual` на один `order_id`;
- уникальность `referrals.child_user_id`;
- check constraint `parent_user_id <> child_user_id`;
- nullable-колонки `points_ledger.idempotency_key` и
  `points_ledger.reward_rule_snapshot`.
- trigger запрещает перепривязку ненулевого `users.invited_by_user_id`;
- trigger запрещает `UPDATE/DELETE` существующей строки `referrals`;
- trigger запрещает `UPDATE/DELETE` `points_ledger`; корректировка
  выполняется только новой компенсирующей операцией.

Перед созданием constraints миграция обязана остановиться, если найдены:

- повторные parents одного child;
- self-referral;
- расхождение `users.invited_by_user_id` и `referrals`;
- повторное referral-начисление по заказу.

Миграция не исправляет и не удаляет данные автоматически.

Проверка на временном PostgreSQL:

- offline upgrade SQL сформирован;
- offline downgrade SQL сформирован;
- clean upgrade `7f6a1c2d3e40 → a91b0c2d3e41` выполнен;
- старый ledger row сохранил `amount = 25`, `balance_after = 25`, а новые
  nullable-поля получил как `NULL`;
- downgrade до `7f6a1c2d3e40` удалил только новые поля и constraints;
- старый ledger row после downgrade сохранился без изменений;
- намеренный duplicate referral остановил preflight;
- после отклонённого upgrade Alembic head и схема остались на
  `7f6a1c2d3e40`.

## Reconciliation report

Добавлен read-only CLI:

`python -m app.scripts.reconcile_referrals`

Он сравнивает:

- `users.invited_by_user_id`;
- строки `referrals`;
- legacy `referrals.json`;
- legacy `referral_codes.json`.

Отчёт содержит только технические идентификаторы и типы расхождений. CLI:

- не выполняет `INSERT`, `UPDATE` или `DELETE`;
- не меняет JSON;
- не печатает database URL;
- не исправляет найденные конфликты.

Проверочный отчёт выполнен только на изолированной тестовой базе. Он
намеренно показал отличие тестовой пары `100 → 200` от одной локальной
legacy-записи `215990120 → 5490999633`. Это подтверждает обнаружение
расхождений, но не является отчётом о production-данных.

Production reconciliation сознательно не запускался. Перед будущей
миграцией требуется отдельный read-only запуск с резервной копией отчёта и
ручным решением по каждому конфликту.

## План миграции JSON → PostgreSQL

1. Сделать проверенный backup production PostgreSQL и runtime JSON.
2. Запустить reconciliation CLI в read-only режиме.
3. Классифицировать конфликты, ничего не исправляя автоматически.
4. Утвердить правила переноса с владельцем проекта.
5. Написать отдельный идемпотентный importer.
6. Проверить importer на восстановленной копии production.
7. Применить только после отдельного разрешения.
8. Сохранить JSON как fallback на переходный период.
9. Удалять JSON-контур только отдельным будущим cutover.

## Откат B0

До применения миграции откат состоит из revert локальных B0-коммитов.

После будущего применения миграции:

1. остановить writers;
2. выполнить downgrade только после проверки отсутствия новых зависимых
   операций;
3. вернуть предыдущую версию backend;
4. не удалять и не пересчитывать существующие ledger rows;
5. при сомнении восстановить отдельную копию backup и сравнить данные до
   любых действий с production.

## Готовность

B1 можно начинать после:

- полной backend-регрессии;
- подтверждения чистого локального worktree;
- финального отчёта B0.

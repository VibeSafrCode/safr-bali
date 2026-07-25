# Runtime JSON → PostgreSQL Migration

## Назначение

Мигратор переносит известных пользователей, реферальные связи, клиентские
сообщения, ответы менеджеров, комментарии и staff-thread из production JSON в
PostgreSQL.

## Условия

- создан и проверен production backup;
- backend обновлён;
- Alembic находится на `c3e91a7f2b44`;
- backend active/running;
- в bot `.env` задан корректный `BACKEND_SERVICE_TOKEN`.

## Команда

`cd "/opt/safr/safr-bali/06 Development/bot"`

`.venv/bin/python scripts/migrate_runtime_to_backend.py`

## Безопасность

- скрипт не удаляет и не изменяет legacy JSON;
- пользователей можно синхронизировать повторно;
- события имеют стабильные `source_key`, поэтому повторный запуск не создаёт дубли;
- при ошибке backend JSON остаётся рабочим источником fallback.

После миграции проверить количество пользователей, рефералов и событий через
read-only SQL/API smoke-test. Удалять JSON запрещено до отдельного решения.

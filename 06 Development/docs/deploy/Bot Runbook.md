# Telegram Bot Runbook

## Local path

cd "$HOME/Documents/AI OS SAFR/02 Projects/Bali/06 Development/bot"

## Activate environment

source .venv/bin/activate

## Run bot locally

python -m app.main

## Important env variables

BOT_TOKEN=PASTE_TELEGRAM_BOT_TOKEN_HERE
BACKEND_API_URL=http://127.0.0.1:8000
BACKEND_SERVICE_TOKEN=USE_THE_SAME_VALUE_AS_BACKEND_SERVICE_API_TOKEN
ADMIN_CHAT_ID=PASTE_OWNER_TELEGRAM_ID_HERE
MANAGER_CHAT_IDS=PASTE_MANAGER_TELEGRAM_IDS_COMMA_SEPARATED
VISA_ADMIN_CHAT_IDS=PASTE_BALI_VISA_MANAGER_IDS_COMMA_SEPARATED
SPB_MANAGER_CHAT_IDS=271039578
THAILAND_MANAGER_CHAT_IDS=6366266394

## Staff roles

ADMIN_CHAT_ID — главный админ, владелец бота.
MANAGER_CHAT_IDS — менеджеры, которые получают сообщения клиентов и могут отвечать.
VISA_ADMIN_CHAT_IDS — менеджеры только раздела «Бали → Визы».
SPB_MANAGER_CHAT_IDS — менеджеры только направления «Россия → Санкт-Петербург».
THAILAND_MANAGER_CHAT_IDS — менеджеры всех разделов Таиланда.

## Runtime data

Conversation runtime data is stored locally in:

app/data/conversations.json

This file is ignored by Git.

## Explicit support notification observers (2026-09-13)

Set `SUPPORT_CHAT_IDS` to the same verified numeric Telegram IDs in bot and
backend `.env`. Resolve the active existing account and confirm its username
with Telegram `getChat` before changing configuration; never guess an ID or
publish it in audit artifacts. The setting grants copies only, not staff roles,
client assignments, Admin permissions or document access. Existing owner-only
complaints and restricted conversations remain private.

New visa notices receive separate support outbox rows; inspect each row's
outcome rather than assuming client delivery means support delivery. Unknown
outcomes and partial web delivery require review, never blind replay. The bot's
plain operational-copy failures are logged as `Support notification copy failed`.
Old notifications are not backfilled. See `AUDIT/BOT_SUPPORT_HOTFIX_20260913.md`
for the release boundaries and rollback procedure. No schema migration required.

## Backend sync после v0.5.0

Если `BACKEND_SERVICE_TOKEN` не задан, бот продолжает работать на JSON fallback.
После настройки токена регистрации и новые события зеркалируются в PostgreSQL.

Ручной перенос существующих данных:

`python scripts/migrate_runtime_to_backend.py`

Скрипт можно запускать повторно: события защищены идемпотентными `source_key`.


---

## Production service после v0.3.6

На VPS бот работает как systemd-сервис safr-bali-bot.

Основные команды:

- systemctl status safr-bali-bot --no-pager -l
- journalctl -u safr-bali-bot -n 100 --no-pager
- journalctl -u safr-bali-bot -f
- systemctl restart safr-bali-bot

## Staff roles после v0.3.6

ADMIN_CHAT_ID — главный админ. Видит все обращения, может отвечать, смотреть историю и ограничивать общение.

MANAGER_CHAT_IDS — обычные менеджеры. Получают обычные обращения клиентов.

VISA_ADMIN_CHAT_IDS — визовые агенты. Получают только обращения из раздела «Бали → Визы».

SPB_MANAGER_CHAT_IDS — менеджеры Петербурга. Получают только обращения с маршрутом «Россия → Санкт-Петербург». Главный админ получает эти обращения вместе с ними.

THAILAND_MANAGER_CHAT_IDS — менеджеры Таиланда. Получают все обращения с маршрутом «Таиланд» и не получают обращения других направлений. Главный админ получает эти обращения вместе с ними.

Визовый агент не должен получать:

- жильё;
- консультации;
- байки;
- soft landing;
- обычное “Написать менеджеру” вне раздела «Бали → Визы».

## Runtime data

После v0.3.6 используется runtime-файл app/data/visa_clients.json.

Файл хранит клиентов, к которым визовый агент имеет доступ.

Не коммитить runtime JSON-файлы в Git.

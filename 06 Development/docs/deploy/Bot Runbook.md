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

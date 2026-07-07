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

## Staff roles

ADMIN_CHAT_ID — главный админ, владелец бота.
MANAGER_CHAT_IDS — менеджеры, которые получают сообщения клиентов и могут отвечать.

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

ADMIN_CHAT_ID — главный админ. Видит все обращения, может отвечать, смотреть историю, ограничивать общение и передавать клиента на визы.

MANAGER_CHAT_IDS — обычные менеджеры. Получают обычные обращения клиентов.

VISA_ADMIN_CHAT_IDS — визовые агенты. Получают только:

- обращения из раздела виз;
- клиентов, вручную переданных главным админом через “Передать на визы”.

Визовый агент не должен получать:

- жильё;
- консультации;
- байки;
- soft landing;
- обычное “Написать человеку”.

## Runtime data

После v0.3.6 используется runtime-файл app/data/visa_clients.json.

Файл хранит клиентов, к которым визовый агент имеет доступ.

Не коммитить runtime JSON-файлы в Git.


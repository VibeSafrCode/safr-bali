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

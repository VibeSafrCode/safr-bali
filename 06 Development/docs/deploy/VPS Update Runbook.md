# VPS Update Runbook

Инструкция для обновления боевой версии SAFR Bali Bot на VPS после локальных правок на Mac.

## Логика

Mac → проверка → Git commit/tag → VPS → git pull → restart services

## Что хранится в Git

- код backend
- код bot
- тексты бота
- кнопки бота
- документация
- .env.example

## Что не хранится в Git

- .env
- Telegram Bot Token
- ADMIN_CHAT_ID
- MANAGER_CHAT_IDS
- runtime JSON-файлы

Runtime-файлы:

06 Development/bot/app/data/referrals.json
06 Development/bot/app/data/conversations.json

Mac = тестовые данные.
VPS = боевые данные.

## Обновление на Mac

cd "$HOME/Documents/AI OS SAFR/02 Projects/Bali"
git status --short
./check_local.sh
git add .
git commit -m "Update bot"

## Обновление на VPS

ssh USER@SERVER_IP
cd /path/to/Bali
git pull
sudo systemctl restart safr-bali-bot
sudo systemctl status safr-bali-bot

## Логи бота

sudo journalctl -u safr-bali-bot -f

## Если менялся backend

sudo systemctl restart safr-bali-backend
sudo systemctl status safr-bali-backend
sudo journalctl -u safr-bali-backend -f

## Откат

git tag
git checkout v0.3.0-bot-mvp-ready-for-vps
sudo systemctl restart safr-bali-bot

## Главное правило

Никогда не копировать локальную папку:

06 Development/bot/app/data/

с Mac на VPS без отдельного понимания. Иначе можно перезаписать боевые рефералы и историю обращений.

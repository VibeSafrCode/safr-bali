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


---

## Обновление после v0.3.6

Правильная схема обновлений: Mac → GitHub → VPS.

На Mac:

1. Перейти в проект.
2. Проверить git status.
3. Внести правки.
4. Сделать commit.
5. Отправить в GitHub.

На VPS:

1. Подключиться к серверу.
2. Перейти в /opt/safr/safr-bali.
3. Сделать git pull origin main.
4. Перезапустить safr-bali-backend и safr-bali-bot.
5. Проверить systemctl status обоих сервисов.

Если hotfix сделан на VPS, аварийная схема: VPS → Mac → GitHub.

Важно: VPS deploy key остаётся read-only. Не давать VPS write access без крайней необходимости.


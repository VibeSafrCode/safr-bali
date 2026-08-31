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

06 Development/bot/app/data/*.json

Mac = тестовые данные.
VPS = боевые данные.

## Обновление на Mac

cd "/absolute/path/to/AI OS SAFR/02 Projects/Bali"
git status --short
./check_local.sh
git add -- <exact allow-listed release paths>
git diff --cached --check
git commit -m "Scoped release description"

## Обновление на VPS

ssh USER@SERVER_IP
cd /opt/safr/safr-bali

# Сначала выполнить Backup Runbook.md.
git pull --ff-only origin main
sudo systemctl restart safr-bali-bot
sudo systemctl status safr-bali-bot

## Логи бота

sudo journalctl -u safr-bali-bot -f

## Если менялся backend

Перед рестартом применить миграции:

`cd "06 Development/backend" && .venv/bin/alembic upgrade head`

Для price/FX migration `d7a2f9c4e816` сначала выполнить production backup,
checksum и restore-proof, затем isolated U-D-U из `Backend Runbook.md`.
После upgrade сделать one-time price bootstrap от configured root, установить и
включить `safr-bali-pricing-fx.timer`, убедиться в LIVE accepted FX и только
после cross-surface parity включать `CANONICAL_PRICING_ENFORCED=true`.

sudo systemctl restart safr-bali-backend
sudo systemctl status safr-bali-backend
sudo journalctl -u safr-bali-backend -f

## Первый deploy v0.5.0

1. Выполнить полный production backup.
2. Подтянуть GitHub через `git pull --ff-only`.
3. В bot `.env` добавить `BACKEND_SERVICE_TOKEN` со значением production
   `SERVICE_API_TOKEN` backend.
4. Применить Alembic до `c3e91a7f2b44`.
5. Перезапустить и проверить backend.
6. Из папки bot один раз запустить
   `.venv/bin/python scripts/migrate_runtime_to_backend.py`.
7. Перезапустить bot.
8. Проверить регистрацию без ссылки, регистрацию по чужой ссылке, «Мою сеть»,
   внутреннюю заметку и чат команды.

JSON-файлы после миграции не удалять: они остаются fallback до отдельного
решения о полном переключении источника правды.

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

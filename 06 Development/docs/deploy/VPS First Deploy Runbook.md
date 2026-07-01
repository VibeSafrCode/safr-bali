# VPS First Deploy Runbook

Инструкция для первого развёртывания SAFR Bali на чистом VPS.

## Что поднимаем

- PostgreSQL
- Backend FastAPI
- Telegram Bot
- systemd service для backend
- systemd service для bot

## Рекомендуемый VPS

Минимально:

- Ubuntu 22.04 или 24.04
- 1–2 CPU
- 1–2 GB RAM
- 20–30 GB SSD

Лучше:

- Ubuntu 24.04 LTS
- 2 CPU
- 2 GB RAM
- 30+ GB SSD

## Вход на сервер

ssh root@SERVER_IP

## Обновление Ubuntu

apt update && apt upgrade -y

## Установка пакетов

apt install -y git curl python3 python3-venv python3-pip postgresql postgresql-contrib nginx

## Создание пользователя

adduser safr
usermod -aG sudo safr
su - safr

## Клонирование проекта

git clone REPOSITORY_URL Bali
cd Bali

## Backend

cd "06 Development/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env

Пример backend .env:

PROJECT_NAME=SAFR Bali API
ENVIRONMENT=production
DEBUG=false
SQL_ECHO=false
DATABASE_URL=postgresql+psycopg://safr_bali_user:CHANGE_PASSWORD@localhost:5432/safr_bali

## PostgreSQL

sudo -u postgres psql

CREATE DATABASE safr_bali;
CREATE USER safr_bali_user WITH PASSWORD 'CHANGE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE safr_bali TO safr_bali_user;
\q

## Миграции backend

cd "/home/safr/Bali/06 Development/backend"
source .venv/bin/activate
alembic upgrade head
python -m app.scripts.seed

## Bot

cd "/home/safr/Bali/06 Development/bot"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env

Пример bot .env:

BOT_TOKEN=PASTE_REAL_BOT_TOKEN
BACKEND_API_URL=http://127.0.0.1:8000
ADMIN_CHAT_ID=PASTE_ADMIN_TELEGRAM_ID
MANAGER_CHAT_IDS=PASTE_MANAGER_IDS_COMMA_SEPARATED

## systemd backend

Файл:

/etc/systemd/system/safr-bali-backend.service

Содержимое:

[Unit]
Description=SAFR Bali Backend
After=network.target postgresql.service

[Service]
User=safr
WorkingDirectory=/home/safr/Bali/06 Development/backend
Environment=PATH=/home/safr/Bali/06 Development/backend/.venv/bin
ExecStart=/home/safr/Bali/06 Development/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target

Запуск:

sudo systemctl daemon-reload
sudo systemctl enable safr-bali-backend
sudo systemctl start safr-bali-backend
sudo systemctl status safr-bali-backend

## systemd bot

Файл:

/etc/systemd/system/safr-bali-bot.service

Содержимое:

[Unit]
Description=SAFR Bali Telegram Bot
After=network.target safr-bali-backend.service

[Service]
User=safr
WorkingDirectory=/home/safr/Bali/06 Development/bot
Environment=PATH=/home/safr/Bali/06 Development/bot/.venv/bin
ExecStart=/home/safr/Bali/06 Development/bot/.venv/bin/python -m app.main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target

Запуск:

sudo systemctl daemon-reload
sudo systemctl enable safr-bali-bot
sudo systemctl start safr-bali-bot
sudo systemctl status safr-bali-bot

## Проверка

В Telegram:

/start

Проверить:

- главное меню
- визы
- жильё
- личный кабинет
- реферальную ссылку
- техподдержку
- сообщение админу

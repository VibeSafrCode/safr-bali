# SAFR Bali — Backup Runbook

Безопасная инструкция перед обновлением production на VPS.

## Что сохраняем

- PostgreSQL;
- runtime JSON бота из 06 Development/bot/app/data/;
- production .env только в закрытый root-only архив;
- текущий Git commit для точного отката.

Не отправлять backup в GitHub, Telegram или публичное облако.

## Создание backup

Терминал: VPS

~~~bash
sudo install -d -m 700 /var/backups/safr-bali
cd /opt/safr/safr-bali
sudo git rev-parse HEAD
sudo -u postgres pg_dump --format=custom --file=/var/backups/safr-bali/database.dump DATABASE_NAME
sudo tar -czf /var/backups/safr-bali/bot-runtime.tar.gz "06 Development/bot/app/data"
sudo tar -czf /var/backups/safr-bali/env-files.tar.gz "06 Development/backend/.env" "06 Development/bot/.env"
sudo chmod 600 /var/backups/safr-bali/*
sudo sha256sum /var/backups/safr-bali/*
~~~

Заменить только DATABASE_NAME на фактическое имя базы. Пароли в команду
не вставлять.

## Проверка

Терминал: VPS

~~~bash
sudo test -s /var/backups/safr-bali/database.dump
sudo tar -tzf /var/backups/safr-bali/bot-runtime.tar.gz
sudo tar -tzf /var/backups/safr-bali/env-files.tar.gz
sudo ls -lh /var/backups/safr-bali
~~~

Продолжать deploy только если все три backup-файла существуют и не пустые.

## Восстановление

Восстановление меняет production-данные. Перед ним остановить сервисы,
сделать отдельную копию текущего состояния и убедиться, что выбран правильный
backup.

Терминал: VPS

~~~bash
sudo systemctl stop safr-bali-bot safr-bali-backend
cd /opt/safr/safr-bali
sudo -u postgres pg_restore --clean --if-exists --dbname=DATABASE_NAME /var/backups/safr-bali/database.dump
sudo tar -xzf /var/backups/safr-bali/bot-runtime.tar.gz
sudo tar -xzf /var/backups/safr-bali/env-files.tar.gz
sudo systemctl start safr-bali-backend safr-bali-bot
sudo systemctl status safr-bali-backend safr-bali-bot
~~~

После восстановления проверить /health, /db/health, journald и пройти
Smoke Test Checklist.

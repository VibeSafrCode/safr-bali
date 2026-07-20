# Production Checklist

## 1. Security

- Revoke old Telegram bot token before production launch.
- Generate new BOT_TOKEN in BotFather.
- Do not commit real .env files to Git.
- Store production secrets only on VPS.
- Check that .env is ignored by Git.
- Check that bot runtime data is ignored by Git.
- Run the backup procedure before every production update.

## 2. Server

- Choose VPS provider.
- Create Ubuntu server.
- Set up SSH access.
- Update system packages.
- Install Python.
- Install PostgreSQL.
- Install Git.
- Install Nginx later if public API/domain is needed.

## 3. Project

- Clone or copy project to VPS.
- Create backend .env.
- Create bot .env.
- Create backend virtual environment.
- Create bot virtual environment.
- Install backend requirements.
- Install bot requirements.

## 4. Database

- Create production PostgreSQL database.
- Set DATABASE_URL in backend .env.
- Run Alembic migrations.
- Run seed script.

## 5. Backend

- Start backend.
- Check /health.
- Check /db/health.
- Check /services.
- Check /users/register manually if needed.

## 6. Telegram Bot

- Start bot.
- Press /start in Telegram.
- Check main menu.
- Check message to human.
- Check admin receives notification.
- Check manager receives notification.
- Check admin reply to client.
- Check CRM buttons.

## 7. Runtime

- Configure backend as systemd service.
- Configure bot as systemd service.
- Enable restart on failure.
- Check logs.
- Reboot VPS and confirm services start automatically.

## 8. First Public Test

- Test from owner account.
- Test from manager account.
- Test from external client account.
- Test complaint to ГлавБосс.
- Test closed dialog.
- Test fallback message.
- Test referral link later when connected to backend.

## Current production readiness

Backend MVP: deployed; local regression checks added.
Telegram Bot MVP: deployed; local v0.3.7 candidate is not deployed yet.
VPS deploy: active through systemd according to the last confirmed snapshot.
Before the next deploy: run ./check_local.sh, create a VPS backup, then
complete the manual Telegram smoke-test.

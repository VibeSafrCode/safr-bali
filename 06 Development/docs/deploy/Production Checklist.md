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
Telegram Bot v0.5.0: deployed on 2026-07-25.
Latest committed code: 720e60c; backend and bot are active through systemd.
Backend /health and /db/health return OK; startup logs contain no warnings.
Automated referral audit: no ordinary user remains without a referrer.
Direction routing audit: Bali visa and Saint Petersburg roles are isolated.
Thailand routing audit: manager 6366266394 receives only Thailand.
Dynamic pricing audit: Indodax USDT/IDR refresh, 0600 cache, visa USD conversion
and cash calculator with a 6% deduction passed in production.
Client UI audit: USD prices are visible in the visa menu; source, cache and
internal exchange formula are not exposed in client messages.
Visa price audit: compact IDR values and fixed eVOA price of 50 USD passed in production.
CRM audit: 12 users, 11 referrals and 42 unique legacy runtime events are in PostgreSQL.
Staff collaboration audit: recipient isolation and client exclusion passed automated checks.
Remaining check: complete the manual Telegram smoke-test with real role accounts.
Website and Mini App: deployed on `safrway.online` through the dedicated
`safrway-production` Cloudflare Tunnel.
Current local frontend candidate fixes internal destination navigation and
adds a shared service catalog with full internal content pages. It passed lint,
build, static export and 4 tests,
is stored in GitHub commit `6e2c6c1`, but has not been deployed.

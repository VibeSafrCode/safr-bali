# Snapshot v0.1.0 — Backend MVP

Date: 2026-06-30

## Status

Backend MVP core is ready and tested locally.

## Stack

- FastAPI
- PostgreSQL
- SQLAlchemy
- Alembic
- Pydantic
- Git

## Ready

- Database schema
- Alembic migrations
- Seed data
- Services API
- Users API
- Orders API
- Referrals API
- SAFR Points API
- Payments API
- Admin Actions API
- Referral points auto-accrual on completed orders
- Duplicate referral accrual protection
- End-to-end MVP scenario tested

## Tested E2E flow

1. User registered by referral code
2. Order created
3. Payment created
4. Payment marked as paid
5. Order marked as completed
6. Referral SAFR Points accrued automatically
7. Admin action logged

## Current progress estimate

Backend MVP: 95%
Telegram Bot MVP: 0%
Total bot MVP readiness: ~60%

## Next step

Telegram Bot MVP:
- /start
- user registration through backend
- service buttons
- create order from bot
- admin notification
- balance and referral link

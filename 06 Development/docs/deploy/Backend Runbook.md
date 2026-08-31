# Backend Runbook

## Local path

cd "$HOME/Documents/AI OS SAFR/02 Projects/Bali/06 Development/backend"

## Activate environment

source .venv/bin/activate

## Run backend locally

uvicorn app.main:app --reload

## Health checks

curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/db/health

## Database migrations

alembic upgrade head

Для `BALI-TASK-072` до production migration обязательны: свежий `pg_dump -Fc`,
checksum, восстановление в изолированную БД и
`c6a4e8b2d915 → d7a2f9c4e816 → c6a4e8b2d915 → d7a2f9c4e816`.
После upgrade проверить exact Alembic head и шесть новых pricing-таблиц.

## Canonical pricing bootstrap and FX

```bash
# dry-run; actor — существующий configured root Admin
python -m app.scripts.bootstrap_price_catalog --actor-user-id ROOT_DB_ID

# one-time apply после review dry-run
python -m app.scripts.bootstrap_price_catalog --actor-user-id ROOT_DB_ID \
  --apply --reason "Initial canonical price catalog publication"

python -m app.scripts.refresh_catalog_fx
```

Установить `safr-bali-pricing-fx.service` и `.timer`, затем проверить timer,
последний успешный refresh, `GET /api/catalog/pricing`, FX freshness и совпадение
version/amount на bot/public/Admin/Mini App. До подтверждения parity держать
`CANONICAL_PRICING_ENFORCED=false`; включение — отдельный осознанный cutover,
после которого order writes требуют immutable commercial snapshot.

## Seed database

python -m app.scripts.seed

## Important env variables

PROJECT_NAME=SAFR Bali API
ENVIRONMENT=local
DEBUG=true
SQL_ECHO=false
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DB_NAME

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

## Seed database

python -m app.scripts.seed

## Important env variables

PROJECT_NAME=SAFR Bali API
ENVIRONMENT=local
DEBUG=true
SQL_ECHO=false
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DB_NAME

# Backend Runbook

## Local path

cd "$HOME/Documents/AI OS SAFR/02 Projects/Bali/06 Development/backend"

## Activate environment

source .venv/bin/activate

## Run backend locally

uvicorn app.main:app --reload

## Health checks

curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8000/health
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8000/db/health

После релиза audit E1 `/health` — независимая liveness; `/db/health` — readiness,
возвращает HTTP 503 при недоступности БД, 200 после восстановления и `no-store`.
HTTP deadline probe — 2,5 секунды, PostgreSQL connect/statement timeout — 2 секунды;
один daemon worker без очереди. Системно зависший socket/DNS оставляет readiness
503 до освобождения probe или рестарта процесса, не блокируя API/shutdown.
Callback-free polling с интервалом до 25мс не накапливает handlers при timeout,
cancel или смене event loop; успешный ответ может задержаться на этот интервал.

## Audit E1 production preflight

До активации candidate, в закрытой серверной среде с настоящим service environment:

- `ENVIRONMENT=production`, DEBUG/SQL_ECHO выключены; service/admin tokens
  различаются, не короче 32 символов и не placeholders; Telegram token заполнен.
- Secure cookies включены; website/application/origins используют HTTPS без
  embedded credentials; OIDC либо не настроен, либо полностью и безопасно настроен.
- Загрузить candidate `app.core.config.Settings` с service environment: выводить
  только PASS/имена неверных параметров, не env, токены, DSN или traceback с inputs.
  Не генерировать/менять production secrets автоматически ради прохождения проверки.
- Проверить Nginx real-IP/forwarding и Uvicorn trusted-proxy allow-list. Limiter
  больше не принимает raw `CF-Connecting-IP`, использует только ASGI client.
  Не доверять `*`; ошибочная цепочка объединит клиентов под адресом прокси.
- Limiter ограничен 10 000 ключами на процесс; не считать это глобальным лимитом
  при нескольких workers. Текущую effective-конфигурацию подтвердить отдельно.

Изолированный CI outage/recovery gate: установить PostgreSQL 16 tools, задать
`BALI_TEST_POSTGRES_BIN=/usr/lib/postgresql/16/bin`, выполнить
`python -m pytest -q tests/test_readiness_postgres.py` непривилегированным runner.
Тест создаёт собственный временный кластер на случайном loopback порту; production
DSN и существующие кластеры не используются и не останавливаются.

### E1 tunnel/proxy integration gate

Candidate `deploy/nginx/safr-target-production.conf` доверяет
`CF-Connecting-IP` только от `127.0.0.1` внутри трёх конкретных SAFR server blocks.
Listener остаётся строго `127.0.0.1:8081`; `$remote_addr` восстанавливается до
Nginx rate-limit phase. Каждый FastAPI proxy location заменяет входящую цепочку
`X-Forwarded-For` на один `$remote_addr`, включая оба account redirects.
Не копировать эти директивы в глобальный `http` block и не ставить trust `*`.

При разрешённом релизе сохранить текущий unit/override и добавить к **его
существующему** Uvicorn command (без потери paths/options):
`--proxy-headers --forwarded-allow-ips 127.0.0.1`.
Сохранить `--host 127.0.0.1 --port 8000`. Uvicorn уже имеет такое trust-default;
явные flags фиксируют контракт. Все локальные процессы с доступом к listener
остаются в trusted boundary; это не отдельная проверка личности cloudflared.

До активации проверить реальный origin tunnel, Nginx realip module и `nginx -t`,
отсутствие Cloudflare Remove visitor IP headers, Pseudo-IPv4 overwrite и Worker
routes, меняющих доверенный header. Наличие repo config не доказывает edge policy.
Если такую политику нельзя подтвердить, gate остаётся OPEN, не угадывать её.
Прогнать `BALI_TEST_NGINX_BIN=<binary> python -m pytest -q tests/test_proxy_boundary.py`:
только изолированные loopback процессы, синтетические IP, без реальных клиентов.
После разрешённого reload/restart повторить read-only route/health smoke и
подтвердить resolved-IP поведение приватной диагностикой. При откате вернуть
совместимый backend + Nginx + unit вместе; база не меняется.

Первичные спецификации:
- https://nginx.org/en/docs/http/ngx_http_realip_module.html
- https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header
- https://uvicorn.dev/settings/#http
- https://developers.cloudflare.com/fundamentals/reference/http-headers/

### E1 Points integration gate

До backend release проверить всех server-token consumers `/points/*`, включая
внешние ручные scripts: ledger теперь `{items, limit, next_cursor, has_more}`,
не массив; service requests не задают human `created_by_admin_id`. Реальные
начисления не использовать для smoke. Старые actor/idempotency conflicts не
обходить новым ключом; исторические rows не переписывать. Детали в API Spec.

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

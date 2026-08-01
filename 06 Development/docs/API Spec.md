# SAFR Bali — API Spec

Актуализировано: 2026-08-01.

## Approved Calculator Contract — BALI-TASK-020

Контракт утверждён 2026-08-01. Нормативный источник требований:
`/Users/safr.nikita/Downloads/SAFRWAY_CODEX_UI_CALCULATOR_MASTER_PROMPT.md`,
SHA-256 `0ba4d5725a939f870bd15321b6c52e8dac62780780dc3bf52550e28b7f0abb27`.
Решения и approval gates: `06 Development/docs/Decision Ledger.md`.

Статус на момент фиксации:

- product/API contract: `APPROVED`;
- implementation evidence: `IMPLEMENTED_LOCAL`, `WORKTREE_UNCOMMITTED`;
- tests/build: `TESTED_LOCAL`; точная матрица зафиксирована в
  `06 Development/docs/Decision Ledger.md`;
- migration: `e8a1c4d7f920_expand_exchange_route_engine.py` —
  `CREATED_NOT_APPLIED`, successor для `d6f4a8b2c910`, local head
  `e8a1c4d7f920`, compile `PASS`, SHA-256
  `cdd4110273676080c0fc46c1f26c90dc2e0d77288f6d79a752c61d4af9e2001c`;
  production backup/restore/rehearsal/apply не выполнялись;
- push/deploy/production smoke: `NONE` / `NOT_EXECUTED`.

Этот раздел описывает локально реализованный и проверенный candidate contract,
но не заменяет зафиксированный ниже production contract v0.8.1 до
подтверждённого выпуска.

### Implemented endpoints

- `GET /mini-app/exchange/options` — ровно восемь route codes и доступные
  assets/modes;
- `POST /mini-app/exchange/quotes` — `route_code`, `GIVE|RECEIVE`, amount;
  legacy-compatible aliases сохранены;
- `POST /mini-app/exchange/requests` — quote ID и обязательный
  `Idempotency-Key`; retry reuse, same-user/unexpired quote и collision
  rejection;
- `GET /admin/exchange/routes`;
- `POST /admin/exchange/routes/{route_code}/versions`.

Engine: `06 Development/backend/app/services/currency_calculator.py`.
Orchestration и immutable audit snapshots:
`06 Development/backend/app/services/exchange_quotes.py`.

### Calculator invariants

- Активы: `RUB_BANK`, `USDT`, `IDR_CASH`, `IDR_BANK`.
- Режимы расчёта: `GIVE` и `RECEIVE`.
- Доступные source/target combinations возвращает backend; одинаковые активы
  запрещены.
- Денежные значения, rates и проценты рассчитываются через `Decimal`, без
  `float`.
- Display rounding: RUB/USDT — целые; IDR — шаг `10 000`.
- По `BALI-DEC-20260801-004` входящая сумма (`pay-in`) округляется вверх
  (`ceil`), выплата клиенту (`payout`) — вниз (`floor`); точное кратное шагу
  не изменяется.
- Любой quote имеет `PRELIMINARY` и
  `manual_confirmation_required = true`.
- Quote сохраняет route/settings/rate snapshots, raw rates, все комиссии,
  результат до/после округления, `calculated_at` и `expires_at`.
- Создание заявки сохраняет quote и использует `Idempotency-Key`; начальный
  статус заявки — `AWAITING_OPERATOR`.
- Route-level commissions не складываются из других маршрутов и не
  начисляются повторно.

### Восемь approved маршрутов Бали

| Route code | Route-level contract | Evidence state |
| --- | --- | --- |
| `RUB_BANK_TO_IDR_CASH` | SAFRWAY `5%`, min `1 500 RUB`; WHITEBIRD `1.5%`; buy-rate `max(Coinbase × 1.05, CBR × 1.0425)`; network reserve `1 USDT`; Indodax buy/PPh/admin fee; withdrawal `10 000 IDR`; partner `3%`, min `250 000 IDR`; второй SAFRWAY fee отсутствует. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |
| `RUB_BANK_TO_IDR_BANK` | SAFRWAY `4%`, min `1 500 RUB`; WHITEBIRD `1.5%`; тот же protective buy-rate; network reserve `1 USDT`; Indodax/PPh/admin fee; withdrawal `10 000 IDR`; partner отсутствует. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |
| `RUB_BANK_TO_USDT` | SAFRWAY `5%`, min `1 500 RUB`; WHITEBIRD `1.5%`; protective buy-rate; фактический network fee; WHITEBIRD referral block показывается только на этом маршруте. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |
| `USDT_TO_RUB_BANK` | Protective sell-rate `base = Coinbase × 0.9925`; WHITEBIRD `1.5%`; SAFRWAY `4%`, min `1 000 RUB`; transfer `0%`. Если подтверждённый actual WHITEBIRD rate лучше, по `BALI-DEC-20260801-006` применяется `client_rate = base + 0.5 × (actual − base)`, а surplus делится `50%` клиенту / `50%` SAFRWAY; rate timestamp/TTL и split сохраняются в audit snapshot. Без actual используется base и manual confirmation. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |
| `USDT_TO_IDR_CASH` | Network reserve `1 USDT`; Indodax buy/PPh/admin fee; withdrawal `10 000 IDR`; SAFRWAY `3%`, min `150 000 IDR`; partner `3%`, min `250 000 IDR`; cutoff 16:00 не применяется. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |
| `USDT_TO_IDR_BANK` | SAFRWAY fee `max(10 USDT, 4%)`; по `BALI-DEC-20260801-005`: `249.99 → 10`, `250 → 10` и `MIN_FEE`, `250.01 → 4%`; Indodax — reference, фактический расчёт может использовать Bybit P2P или Indodax; partner отсутствует. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |
| `IDR_CASH_TO_USDT` | Partner `2%`, min `150 000 IDR`; SAFRWAY `3%`, min `100 000 IDR`; обе комиссии считаются от полной входящей суммы IDR; Indodax sell — reference, фактическая покупка — Bybit P2P. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |
| `IDR_CASH_TO_RUB_BANK` | Агрегированная technical fee `2.5%`; partner `1.5%`, min `150 000 IDR`; SAFRWAY `4%` от выплаты, min `1 500 RUB`; technical reserve/TON/WHITEBIRD/losses уже входят в `2.5%` и повторно не начисляются. | `IMPLEMENTED_LOCAL`; `TESTED_LOCAL` |

### Rate adapters

- Coinbase: `GET /v2/exchange-rates?currency=USDT`, поле
  `data.rates.RUB`.
- CBR: официальный USD/RUB adapter с датой курса и timestamp.
- Indodax: `GET /api/ticker/usdtidr`, поля `buy`, `sell`, `last` и
  `server_time`.
- Публичный WHITEBIRD Quotes API не считается подтверждённым; используются
  approved protective formulas и обязательное ручное подтверждение quote.

## Production Currency Calculator API v0.8.1

Все маршруты требуют действующую HttpOnly Mini App session.

- `GET /mini-app/exchange/options` — клиентские названия валют,
  подтверждённые пары и допустимые стороны ввода;
- `POST /mini-app/exchange/quotes` — создаёт предварительную котировку по
  указанной отдаваемой или желаемой сумме.

Автоматические пары:

- `USDT → IDR_CASH`;
- `USDT → IDR_BANK`;
- `IDR_CASH → RUB_BANK`.

Неподтверждённые пары не получают выдуманную формулу и возвращают `422` с
предложением ручного расчёта. При недоступности актуального или допустимого
stale-снимка backend возвращает `503`.

Публичный quote содержит только:

- ID котировки;
- исходную и получаемую валюту;
- отдаваемую и получаемую сумму;
- предварительный статус;
- признак обязательного подтверждения;
- срок действия.

Клиенту не возвращаются:

- Coinbase/Indodax/WHITEBIRD rates;
- `buy`/`sell`;
- проценты и минимальные комиссии;
- технический резерв;
- settings/calculation snapshots;
- диагностические флаги источников.

Эти данные сохраняются только в PostgreSQL. Migration
`d6f4a8b2c910_add_exchange_quotes_and_settings.py` применена к production
вместе с совместимыми backend, bot и React release на commit `5bb1626`.

## Production Mini App API v0.8.0

Подготовлены:

- `POST /mini-app/auth/session` — HMAC-проверка `initData`, проверка
  `auth_date`, создание access/refresh session;
- `POST /mini-app/auth/refresh` — ротация refresh token;
- `POST /mini-app/auth/logout` — отзыв сессии и очистка cookies;
- `GET /mini-app/me` — профиль только по действующей серверной access session.

Access cookie: 30 минут. Refresh cookie: 30 дней. Cookies `HttpOnly`,
`SameSite=Lax`, а в production также `Secure`. Backend хранит hashes токенов,
не исходные значения.

Контракт развёрнут в production; текущий commit `5bb1626`, schema
`d6f4a8b2c910`. Legacy `Authorization: tma <initData>` не является основным
browser session flow.

## Реально работающие дополнительные API

Помимо исходного MVP ниже, в production используются:

- `GET /health`;
- `GET /db/health`;
- `GET /users/by-telegram/{telegram_id}/dashboard`;
- `GET /mini-app/me` с заголовком `Authorization: tma <Telegram initData>`;
- `POST /bot-events` с service-token;
- `GET /bot-events/{client_telegram_id}` с service-token.

`/mini-app/me` проверяет HMAC-подпись Telegram и срок `auth_date`, затем
возвращает только профиль текущего пользователя, баланс, реферальную ссылку,
число прямых приглашённых и его заявки.

Публичный frontend обращается к API через `https://api.safrway.online`.
Bot token, service-token и admin-token во frontend не передаются.

Следующий API-этап: каталог направлений/услуг и создание заявки из Mini App с
полным route context.

## Назначение документа

Этот файл описывает минимальный API для MVP проекта SAFR Bali / Na Bali Team.

API нужен, чтобы Telegram-бот, будущий Mini App, сайт и админка работали с одной базой данных и одной бизнес-логикой.

Главный принцип:

> Backend является центром системы. Бот, Mini App и сайт не должны хранить отдельную бизнес-логику.

---

## 1. Основные группы API

В MVP нужны следующие группы API:

1. Users API
2. Services API
3. Orders API
4. Referrals API
5. SAFR Points API
6. Partner Modes API
7. Reward Rules API
8. Admin API
9. Payments API

---

## 2. Users API

### POST /users/register

Создать или обновить пользователя после входа в Telegram-бота.

### Request

- telegram_id
- username
- first_name
- last_name
- language
- ref_code

### Response

- user_id
- telegram_id
- ref_code
- invited_by_user_id
- role
- status

### Зачем нужно

Когда человек впервые заходит в бота, система должна сохранить его Telegram ID, создать профиль и зафиксировать, пришёл ли он по реферальной ссылке.

---

### GET /users/{user_id}

Получить профиль пользователя.

### Response

- id
- telegram_id
- username
- first_name
- role
- partner_mode
- status
- created_at

---

### GET /users/{user_id}/balance

Получить баланс SAFR Points пользователя.

### Response

- user_id
- balance_points
- internal_discount_usd

---

## 3. Services API

### GET /services

Получить список активных услуг.

### Response

- id
- name
- slug
- category
- description
- can_pay_with_points

---

### GET /services/{service_id}

Получить одну услугу.

---

### POST /admin/services

Создать услугу.

Только для админа.

---

### PATCH /admin/services/{service_id}

Изменить услугу.

Только для админа.

---

## 4. Orders API

### POST /orders

Создать заявку.

### Request

- user_id
- service_id
- client_comment
- amount_usd

### Response

- order_id
- status
- created_at

### Зачем нужно

Когда клиент выбирает услугу в боте, бот создаёт заявку через backend.

---

### GET /orders/{order_id}

Получить заявку.

---

### GET /users/{user_id}/orders

Получить заявки пользователя.

---

### PATCH /admin/orders/{order_id}/status

Изменить статус заявки.

Только для админа.

### Request

- status
- admin_comment

### Возможные статусы

- new
- contacted
- waiting_payment
- paid
- in_progress
- completed
- cancelled
- refunded

---

## 5. Referrals API

### GET /users/{user_id}/referral-link

Получить реферальную ссылку пользователя.

### Response

- user_id
- ref_code
- referral_link

---

### GET /users/{user_id}/qr-code

Получить QR-код пользователя.

### Response

- user_id
- qr_code_url
- referral_link

---

### GET /users/{user_id}/referrals

Получить список приглашённых пользователей.

### Response

- level_1
- level_2
- level_3

---

## 6. Partner Modes API

### GET /partner-modes

Получить список партнёрских режимов.

### Response

- Direct
- Balanced
- Network

---

### PATCH /users/{user_id}/partner-mode

Изменить партнёрский режим пользователя.

### Request

- partner_mode_id

### Важно

Режим влияет только на будущие начисления. Старые начисления не пересчитываются.

---

## 7. Reward Rules API

### GET /reward-rules

Получить актуальные правила начислений.

### Response

- service_id
- partner_mode_id
- level_1_points
- level_2_points
- level_3_points
- valid_from

---

### POST /admin/reward-rules

Создать новое правило начислений.

Только для админа.

### Request

- service_id
- partner_mode_id
- level_1_points
- level_2_points
- level_3_points
- valid_from

### Важно

При создании нового правила старое правило закрывается через valid_to.

---

## 8. SAFR Points API

### Общий idempotency contract

Общий ручной endpoint `POST /points/accrue` требует header:

`Idempotency-Key: <уникальный ключ операции>`

- повтор с тем же ключом и тем же payload возвращает прежнюю операцию;
- повтор с тем же ключом и изменённым payload возвращает `409`;
- пустой или состоящий из пробелов ключ отклоняется;
- referral reward дополнительно защищён уникальностью одного начисления на
  один заказ;
- header не является токеном и не должен содержать чувствительные данные.

### GET /users/{user_id}/points-ledger

Получить историю операций SAFR Points.

### Response

- operation_type
- amount
- balance_after
- order_id
- referral_level
- reward_rule_snapshot
- comment
- created_at

---

### POST /admin/points/manual-add

Ручное начисление SAFR Points.

Только для админа.

### Request

- user_id
- amount
- comment

---

### POST /admin/points/manual-subtract

Ручное списание SAFR Points.

Только для админа.

### Request

- user_id
- amount
- comment

---

### POST /admin/orders/{order_id}/confirm-reward

Подтвердить начисление бонусов по заявке.

Только для админа.

### Что делает

1. Проверяет заказ.
2. Проверяет статус.
3. Находит реферальную цепочку.
4. Находит актуальное reward_rule.
5. Создаёт операции в points_ledger.
6. Обновляет балансы пользователей.

---

## 9. Payments API

### POST /payments/create

Создать оплату по заявке.

### Request

- order_id
- user_id
- amount
- currency
- payment_method

### Response

- payment_id
- status
- payment_url

---

### POST /payments/webhook

Webhook от платёжной системы.

### Что делает

1. Получает статус оплаты.
2. Проверяет подпись платежа.
3. Обновляет payment_status.
4. Обновляет order status, если оплата прошла.

---

## 10. Admin API

### GET /admin/orders/new

Получить новые заявки.

---

### GET /admin/orders

Получить все заявки.

---

### GET /admin/users

Получить пользователей.

---

### GET /admin/users/{user_id}

Получить карточку пользователя.

---

### GET /admin/ledger

Получить журнал SAFR Points.

---

### GET /admin/actions

Получить действия админа.

---

## 11. Минимальный API для первого запуска

Для самого первого MVP обязательно реализовать:

1. POST /users/register
2. GET /services
3. POST /orders
4. PATCH /admin/orders/{order_id}/status
5. GET /users/{user_id}/referral-link
6. GET /users/{user_id}/balance
7. GET /reward-rules
8. POST /admin/orders/{order_id}/confirm-reward
9. GET /users/{user_id}/points-ledger

---

## 12. Что пока не делаем

В MVP пока не нужны:

- API для marketplace;
- API для исполнителей;
- API для заданий;
- API для выплат;
- API для TON Connect;
- API для SAFR Token;
- API для отзывов;
- API для рейтингов;
- API для сложной CRM.

Эти блоки появятся позже по Roadmap.

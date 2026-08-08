# SAFR Bali — API Spec

Актуализировано: 2026-08-08.

## Approved Calculator Contract — BALI-TASK-020

Контракт утверждён 2026-08-01. Нормативный источник требований:
`/Users/safr.nikita/Downloads/SAFRWAY_CODEX_UI_CALCULATOR_MASTER_PROMPT.md`,
SHA-256 `0ba4d5725a939f870bd15321b6c52e8dac62780780dc3bf52550e28b7f0abb27`.
Решения и approval gates: `06 Development/docs/Decision Ledger.md`.

Статус на момент фиксации:

- version: `VERSION_UNASSIGNED`;
- product/API contract: `APPROVED`;
- code state: `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `PUSHED`, `DEPLOYED`;
- branch `codex/safrway-stabilization`; baseline/rollback
  `445972a01372e304a8037dbc684ed2532d7928fe`; feature SHA
  `be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`; hotfix commit/pushed/deployed
  code SHA `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`; local HEAD и independent
  remote-tracking ref совпали с hotfix SHA;
- BALI-TASK-020/021/023 documentation SHA:
  `f579c3316eaa8a3143426a35281bd735237f2595`; BALI-TASK-026/032 documentation
  SHA `18a35904b2e17f5df495a6c266909ca6a9a4299e`; current BALI-TASK-034/041/046
  patch `WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`;
- migration: `e8a1c4d7f920_expand_exchange_route_engine.py` —
  `APPLIED_PRODUCTION`, successor для `d6f4a8b2c910`; current production head
  is later successor `f2b6d9a4c731`; initial release source SHA-256
  `cdd4110273676080c0fc46c1f26c90dc2e0d77288f6d79a752c61d4af9e2001c`;
  hotfix source SHA-256
  `831349110c71be945124012bbdf5d2a2f804e3ad75f0174d510005458f556ca7`;
  migration `NOT_REAPPLIED`; production table/sequence owners `safr_bali`;
  backup/checksum, isolated restore и `d6 → e8 → d6 → e8` rehearsal `PASS`;
  post-apply 22 tables, settings `8/8/8`, legacy backfill `6/6`, critical
  counts `14/12/0/6/5` неизменны;
- exact-SHA artifacts: Astro 46 pages/contracts `16/16` и React two-entry
  build/contracts `10/10` — `PASS`; archive checksums и remote matches
  зафиксированы в Decision Ledger;
- hotfix verification: backend targeted `19/19 PASS`; full backend `66 PASS`,
  `5 skipped`, одна infra-only local PostgreSQL failure; production DB health
  `200`; Astro build/contracts `17/17 PASS`, browser `15/15 PASS`; React
  unit/build/browser `6/10/6 PASS`;
- deploy: code SHA `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`; backend active; Astro root
  `/var/www/safr/releases/3d2176c/astro-site`; React остаётся verified
  `/var/www/safr/releases/be2bdf2/react-app`; Nginx/Cloudflare/DNS config и
  secrets `NOT_CHANGED`, bot не перезапускался;
- перечисленные production HTTP/OpenAPI/DB smoke checks: `PASS`; DB содержит
  ровно 8 approved active route codes;
- BALI-TASK-023 root cause: migration table/sequence owner `postgres` при
  runtime role `safr_bali`, ошибка `InsufficientPrivilege`;
- authenticated smoke `PASS`: auth `200`, options `200` с 8 routes, quote
  `201 PRELIMINARY` (ID `1c8fa1d8-7601-4a7c-b42f-c0ec36b19399`), logout
  `200`, request delta `0`;
- public DEC-015 `PASS`: page `200`, compact CTA «Войти», `/account/` → `307`
  в authenticated zone; public functional calculator/API отсутствуют;
  desktop/mobile CTA и authenticated quote UI screenshots получены;
- post-release status: `BALI-TASK-023 = FIX_VERIFIED`; documentation closure:
  `PASS`, SHA `f579c3316eaa8a3143426a35281bd735237f2595`.

Этот раздел является deployed production contract для exchange candidate на
hotfix code SHA `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`. Он заменяет calculator/
exchange часть legacy v0.8.1 ниже; version выпуска остаётся
`VERSION_UNASSIGNED`. Полный release и incident packet хранится в Decision
Ledger.

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

Code и DB contract всех восьми маршрутов: `DEPLOYED`; production active route
list: `8/8`. Evidence state в таблице подтверждает расчётную policy локальными
тестами. В current sprint functional calculator доступен только authenticated
users; public API/Nginx route запрещены. Public page acceptance — compact
responsive message + CTA «Войти» на canonical authenticated app/login route с
desktop/mobile evidence: `PASS`. Authenticated Mini App calculator smoke:
`PASS`; quote `201 PRELIMINARY`, request delta `0`.

По `BALI-DEC-20260801-014` future public calculator находится только в backlog
`BALI-TASK-024` со статусом `IDEA / BLOCKED_BY_DEPENDENCIES`; prerequisites:
design sprint `CLOSED` и visas redesign `COMPLETED`.

### Rate adapters

- Coinbase: `GET /v2/exchange-rates?currency=USDT`, поле
  `data.rates.RUB`.
- CBR: официальный USD/RUB adapter с датой курса и timestamp.
- Indodax: `GET /api/ticker/usdtidr`, поля `buy`, `sell`, `last` и
  `server_time`.
- Публичный WHITEBIRD Quotes API не считается подтверждённым; используются
  approved protective formulas и обязательное ручное подтверждение quote.

## BALI-TASK-025 — React Mini App UI release evidence

Статус: `RELEASE_SUCCESS / DEPLOYED`. Approval references:
`BALI-DEC-20260805-008`, `-009`, `-010` (`APPROVED`).

- Commit/pushed/deployed SHA:
  `142c3ea112e0d61d88eef81b93779bca3e648e72`; release checkpoint до docs patch:
  local/upstream clean.
- Active React root: `/var/www/safr/releases/142c3ea/react-app`; rollback root:
  `/var/www/safr/releases/be2bdf2/react-app`.
- TypeScript и Vite build `PASS` (40 modules); JS `main-C3WC62h3.js`; CSS
  `main-D8IUY7Aq.css`; artifact contracts/secret scan `11/11 PASS`.
- Clean archive: 14 files, 2,334,618 bytes; без AppleDouble/symlink/xattr
  entries; SHA-256
  `f930aad41be4efa98d7cb6c3b213aba1f70ea322f9ac328225b283891c15d302`;
  local/remote hashes совпали.
- Production smoke `PASS`: app `/` и `/account` → `200`; exact JS/CSS и пять
  hero assets → `200`; new Home/calculator/SPB/visa strings и `#b84f39` live;
  API health → `200`; unauthenticated me/options → `401`; public site → `200`;
  services active.
- API contract/backend/DB/migrations и Astro/public calculator не менялись;
  Nginx/Cloudflare/DNS config, services и secrets не менялись; Nginx
  reload/restart не выполнялся.
- Real authenticated Telegram production quote/request не выполнялся из-за
  DB-write/secret exclusion; coverage — prior local Playwright `10/10` и
  Designer-approved 40-shot matrix.

Этот UI release не повышает и не изменяет backend/API/migration status,
зафиксированный в BALI-TASK-020/023 evidence.

## BALI-TASK-027/028/029/030 — frontend/content release evidence

Approval gates: `BALI-DEC-20260807-001` local implementation и
`BALI-DEC-20260807-002` commit/push/deploy (`APPROVED`). Baseline/rollback SHA:
`572269fcf1c9e6d3feb8fbd93394e05363b3c658`; main UI commit:
`4e1c2f2af64b3082364007682c96ec7c8513b09b`; final pushed/deployed SHA:
`c6c8c530e7e91d49f982e72aef53ca04300ca11d`.

- Astro/React tests и Designer rapid review: `PASS`.
- Production smoke: `PASS` для public Home/Visas/detail и Mini App/account/
  assets; exact live hashes совпали.
- Content acceptance: четыре страны, шесть реальных виз, без D5/UAE/fake
  data; eVOA остаётся `800,000 IDR / $50`; displayed prices взяты из current
  approved source of truth.
- Backend/API/DB/migrations не менялись; этот frontend/content release не
  повышает и не изменяет calculator API contract. Nginx, Cloudflare/DNS и
  secrets также не менялись.
- Authenticated Telegram/customer/transaction production write smoke не
  выполнялся.

Governance incident `BALI-TASK-031` зафиксирован в Decision Ledger: local-only
permission был превышен commit/push/deploy baseline SHA `572269f…`; это не
считается ретроактивным approval. Последующий release прошёл через явные gates
`BALI-DEC-20260807-001/002` через Assistant Bali.

## BALI-TASK-033 — frontend navigation hotfix evidence

Approval: `BALI-DEC-20260808-001` (`APPROVED`). Commit/pushed/deployed SHA:
`7c0374a79ddf59fe517a5a9b8dc1692bd7bcb374`.

- Astro/React tests и exact-SHA builds: `PASS`.
- Public click smoke `PASS` at `1440×810` and `390×844` for `/bali/`,
  `/thailand/`, `/russia/` and `/nepal/`.
- Mini App fixture smoke `PASS` for all four routes; Thailand `4/4 soon`, Nepal
  `6/6 soon` plus manager CTA. CSP errors: `0`.
- Active Astro/React roots: `/var/www/safr/releases/7c0374a/*`; retained
  rollback roots: `/var/www/safr/releases/c6c8c53/*`.
- Backend/API/DB/data/design не менялись; API/customer production writes не
  выполнялись. Nginx, Cloudflare/DNS и secrets также не менялись.

Этот navigation hotfix не повышает и не изменяет calculator API contract или
production DB state.

## BALI-TASK-035/036/037/038 — route/release evidence

Approval references: `BALI-DEC-20260808-002` through `-007` (`APPROVED`);
individual decision payloads are not reproduced because they were not supplied
in BALI-TASK-041. Commit chain: `fb4638e7…` → `3e34a44…` → final local/remote/
deployed `5ebb51d99d0d9e8c7a984db64a1feab2966555ef`.

- Nginx contract change is limited to approved root `/catalog[/]` and
  `/directions[/]` redirects; nested route intent is preserved; `nginx -t`
  `PASS`; redirects are one-hop.
- Live HTML/CSP contract: 44 documents with zero inline style; route/canonical
  matrix `44/44 PASS`; cache fingerprinting and CSP `PASS`.
- Desktop/mobile public and React fixture smoke, Thailand context, API/DB
  health and active services: `PASS`.
- Astro `22/22`, `59/59` and 200 screenshot checks `PASS`; React unit `11/11`
  and build `11/11 PASS`.
- The first two activations were rolled back safely: `fb4638e7…` for stale CDN
  root JS and `3e34a44…` for CSP inline style; final `5ebb51d…` resolves both.
- Backend/API/DB/migrations were not changed; no customer/API production writes
  occurred. Cloudflare/DNS/secrets were not changed; Cloudflare was not purged.

This sprint changes frontend route delivery only; calculator API and production
DB contracts remain unchanged. Exact artifact/tree hash values remain in the
CTO packet and are not reconstructed here.

## BALI-TASK-042/043/044/045 — deployed admin/referral contract

Decisions `BALI-DEC-20260808-008` through `-017` are `APPROVED`. Main code SHA:
`45b3a5293ae9c73cefe2905bb6973f64c3e32855`; final local/remote/deployed SHA:
`91df0177774d28cca19b57875a5c31f9725c4d8c`.

- Canonical admin frontend: React `/admin/`; API owner: FastAPI
  `/api/web/admin`; Telegram OIDC → HttpOnly session; server-side `User.role`
  RBAC; exact-Origin/session-CSRF writes; no browser admin/service token.
- OpenAPI admin contracts `9/9 PASS`; production unauthenticated boundary `401`,
  root session/dashboard RBAC `PASS`, client denial `403`, valid/invalid CSRF
  `PASS` through dependency-injected no-write smoke.
- Manual order completion/cancellation remains permission-gated; completion
  requires confirmed payment. Referral rewards require completed order and
  effective rule; later cancellation uses atomic append-only idempotent reversal.
- Default-main-admin attribution is stored but classified separately from
  rewarded explicit referrals; `users.created_at` remains immutable join date.
- Migration `f2b6d9a4c731` is `APPLIED_PRODUCTION`; referrals `12 → 18`, legacy
  `12` preserved, unassigned non-root `0`, configured unique root `admin`
  active, promotion audit row `1`.
- `/admin/`, orders, visa queue, housing queue and settings pages return `200`;
  `/admin` redirects `307`; four Telegram admin links `4/4 PASS` in fixtures.
- Production API/DB health `200`; no real OIDC/customer/admin write, Telegram
  message or bulk message was used for smoke.

Calculator/exchange formulas and route settings were not changed by this
sprint. Full DB, backup, artifact, deploy and rollback evidence is in Decision
Ledger.

## Legacy documented baseline — Currency Calculator API v0.8.1

Calculator/exchange часть этого baseline заменена deployed contract
BALI-TASK-020 выше. Остальные исторические сведения сохранены для
совместимости; новый release version не назначен.

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

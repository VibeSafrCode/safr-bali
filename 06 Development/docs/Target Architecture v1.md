# SAFRWAY Target Architecture v1

Дата: 2026-07-29
Статус: развёрнута в production на commit `39dd069`
Актуализация candidate contract BALI-TASK-020: 2026-08-01

## Решение

Целевая экосистема:

- Astro — публичный SEO-сайт;
- React/Vite — Telegram Mini App и browser account;
- FastAPI — единственный слой бизнес-логики;
- PostgreSQL — source of truth транзакционных данных;
- `06 Development/shared` — framework-neutral contracts, content schema,
  versioned snapshots и design tokens;
- текущий Next/Vinext сохраняется в Git как reference, но не обслуживает
  production traffic.

Production contract: Astro `45/45`, React `2/2`, ecosystem `47/47`.
Browser OIDC credentials пока отсутствуют, поэтому account не показывает
неработающую кнопку входа. Это внешний gate, а не причина отката архитектуры.

## Границы приложений

```text
Browser / Search crawler
        │
        ├── safrway.online ── Astro static HTML (45 routes)
        │                         │
        │                         └── manager/support API calls only
        │
        └── app.safrway.online ── React/Vite (2 routes)
                                      │
                                      ├── Telegram runtime adapter
                                      └── Browser runtime adapter
                                                   │
Telegram bot ──────────────────────────────────────┤
                                                   ▼
                                            FastAPI use cases
                                                   │
                                                   ▼
                                               PostgreSQL
```

Frontend не рассчитывает Points, не назначает рефералов и не дублирует
правила заявок, ролей или поддержки.

## Route contract

Source of truth:

`06 Development/shared/contracts/ecosystem-routes.v1.json`

### Astro public contract — 45/45

Astro создаёт:

- главную;
- список направлений;
- privacy;
- все страницы направлений, услуг и материалов.

Каждый маршрут существует как отдельный статический HTML. Dynamic SPA fallback
для публичного сайта не используется.

### React application contract — 2/2

React/Vite обслуживает один origin:

- `https://app.safrway.online/` — Telegram Mini App;
- `https://app.safrway.online/account/` — browser account.

Обе страницы имеют `noindex`.

### Ecosystem contract — 47/47

`45 Astro + 2 React = 47`.

Mini App не создаётся внутри Astro ради формального количества маршрутов.

## Account redirect

`https://safrway.online/account/` не является второй копией кабинета.

Контракт:

1. Source делает один redirect на
   `https://app.safrway.online/account/`.
2. Локально и в preview используется `307`.
3. Production `308` включается только после подтверждения стабильного target.
4. Redirect не входит в sitemap.
5. Target имеет `noindex`.
6. Разрешён только `return_to`.
7. `return_to` должен быть относительным путём внутри `/account/`.
8. Токены, authorization code, `initData` и session identifiers не
   пересылаются.
9. Цепочки redirect запрещены.

Source of truth:

`06 Development/shared/contracts/account-redirect.v1.json`

## Runtime adapters

React-приложение имеет общий UI и API client, но разные identity adapters.

### Telegram

1. Adapter получает исходный `Telegram.WebApp.initData`.
2. Backend проверяет hash, `auth_date` и структуру.
3. `initDataUnsafe` не считается доверенным.
4. Backend выдаёт серверную HttpOnly-сессию.
5. UI использует общий application API.

### Browser

1. Adapter запускает Telegram OIDC Authorization Code Flow с PKCE.
2. Backend валидирует state, nonce и ID token.
3. Login подтверждает identity, но не выполняет referral attribution.
4. Backend выдаёт серверную HttpOnly-сессию.
5. UI использует тот же application API.

Runtime adapters не содержат бизнес-логику.

Source of truth:

`06 Development/shared/contracts/runtime-policy.v1.json`

## Backend

FastAPI остаётся единственной точкой для:

- identity и sessions;
- пользователей;
- реферальной атрибуции;
- SAFR Points;
- заявок и статусов;
- маршрутизации менеджерам;
- клиентского support chat;
- внутренних сообщений команды.

PostgreSQL хранит транзакционные данные. B0-инварианты обязательны для всех
будущих клиентов:

- login не меняет реферала;
- реферал назначается один раз;
- ledger append-only;
- повторная операция идемпотентна;
- frontend не записывает Points.

## Exchange quote engine candidate — BALI-TASK-020

Статус: `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `WORKTREE_UNCOMMITTED`.
Version: `VERSION_UNASSIGNED`. Branch: `codex/safrway-stabilization`;
baseline/rollback:
`445972a01372e304a8037dbc684ed2532d7928fe`.

Push, migration apply, deploy и production smoke не выполнялись; этот раздел
не изменяет зафиксированный выше production state.

Подтверждённая локальная граница ответственности:

- React/Vite отвечает за wheel pickers, live quote UX и отображение округлённых
  сумм, но не хранит route availability и не рассчитывает комиссии;
- FastAPI владеет route selection, `GIVE`/`RECEIVE`, `Decimal`, fee minimums,
  direction-aware rounding, защитными rates и идемпотентным созданием заявки;
- rate adapters изолируют Coinbase, CBR и Indodax; WHITEBIRD использует
  approved protective formulas, пока публичный Quotes API не подтверждён;
- PostgreSQL является source of truth для route settings, quote records,
  settings/rate snapshots, idempotency state и `AWAITING_OPERATOR` requests;
- старый quote неизменяем при последующем изменении route settings.

Implementation sources:

- pure `Decimal` route engine:
  `06 Development/backend/app/services/currency_calculator.py`;
- orchestration и immutable audit snapshots:
  `06 Development/backend/app/services/exchange_quotes.py`;
- Mini App/admin endpoints:
  `06 Development/backend/app/api/mini_app.py` и `app/api/admin.py`;
- versioned settings и quote models:
  `06 Development/backend/app/models/exchange.py`;
- CBR/Indodax/optional WHITEBIRD adapters:
  `06 Development/backend/app/services/market_rates.py`.

Канонический product/API contract и таблица восьми маршрутов:
`06 Development/docs/API Spec.md`. Утверждённые policy decisions:
`06 Development/docs/Decision Ledger.md`.

Migration `e8a1c4d7f920_expand_exchange_route_engine.py` создана как successor
для `d6f4a8b2c910`; local head `e8a1c4d7f920`, read-only compile `PASS`,
SHA-256
`cdd4110273676080c0fc46c1f26c90dc2e0d77288f6d79a752c61d4af9e2001c`.
Статус: `CREATED_NOT_APPLIED`. По
`BALI-DEC-20260801-007` до migration apply обязательны backup checksum,
restore-proof, isolated `upgrade → downgrade → upgrade`, heads before/after и
rollback plan; выполнение этих gates пока не подтверждено.

Local verification: backend `69 OK / 5 skipped`, bot `49 OK`, React
typecheck/unit/build/contracts/Playwright green, Astro check/build/contracts/
Playwright green, explicit React/Astro visual captures green. Полная матрица,
intermediate visual-run failures и screenshot paths зафиксированы в
`06 Development/docs/Decision Ledger.md`.

## Content model

Source of truth:

`06 Development/shared/contracts/content-entry.v1.schema.json`

Статусы:

- `draft` — ещё не готово к preview;
- `legacy_needs_sources` — смысл legacy-текста сохранён, источники не
  подтверждены;
- `needs_review` — источники или редактура требуют проверки;
- `verified` — критические факты подтверждены указанными первичными
  источниками.

Миграция контента:

- не меняет смысл legacy-текста;
- не назначает `verified`;
- не обновляет `lastVerifiedAt`;
- не создаёт фиктивные источники.

При первичном переносе все страницы виз Бали получили
`legacy_needs_sources`. Текущий source-aware status хранится в
content-addressed preview snapshot и повышается для каждой страницы отдельно
только после проверки официальных источников.

Первый высокий приоритет проверки:

- `/bali/visas/`;
- `/bali/visas/e33g/`;
- `/bali/visas/d12/`;
- `/bali/visas/voa/`.

После них отдельно проверяются D1/D2, C1 и консультационная страница «Другая
виза». Индексация страницы блокируется до подтверждения критических фактов
официальными источниками; пользовательская доступность от этого не зависит.

## Versioned snapshot

Source of truth:

`06 Development/shared/contracts/catalog-snapshot.v1.schema.json`

Snapshot:

- имеет явную `schemaVersion`;
- содержит полный content payload и SHA-256 hash;
- ссылается на версии routes и design tokens;
- после создания неизменяем;
- позволяет Astro, React и backend использовать один согласованный выпуск
  каталога;
- при изменении контента создаётся новый snapshot, старый не переписывается.

Неизвестная schema version отклоняется. Неизвестные optional fields текущей
версии могут игнорироваться.

## Design tokens

Source of truth:

- `06 Development/shared/design/tokens.v1.json`;
- `06 Development/shared/design/tokens.v1.css`.

JSON используется build tooling и JavaScript-компонентами. CSS используется
Astro и React. Автоматическая проверка не позволяет значениям расходиться.

B1 только фиксирует текущую базовую систему цветов, шрифтов, spacing, radius,
motion и layout. Визуальный редизайн не выполняется.

## Source-of-truth matrix

| Данные | Source of truth | Consumers |
| --- | --- | --- |
| Утверждённые product/technical decisions | `06 Development/docs/Decision Ledger.md` | CPO, CTO, Documentation, release gates |
| Пользователи, заявки, рефералы, Points | PostgreSQL через FastAPI | Bot, React, Astro support |
| Exchange route/API contract | `06 Development/docs/API Spec.md` | FastAPI, React, tests, runbooks |
| Exchange settings, quotes, snapshots, idempotency | PostgreSQL через FastAPI | Quote engine, requests, audit |
| Публичные маршруты | `ecosystem-routes.v1.json` | Astro build, contract tests |
| Application routes | `ecosystem-routes.v1.json` | React router, Nginx |
| Account redirect | `account-redirect.v1.json` | Preview server, Nginx |
| Content validation | `content-entry.v1.schema.json` | Content pipeline |
| Выпуск каталога | `catalog-snapshot.v1.schema.json` | Astro, React, backend |
| Визовый verification state | `legacy-content-registry.v1.json` | Preview/cutover gates |
| UI constants | `tokens.v1.json` и `.css` | Astro, React |

## Этапы cutover

### B2

Статус: выполнен и включён в production v0.8.0.

- создан Astro scaffold;
- реализованы семь pilot routes;
- добавлены SEO, sitemap, robots и JSON-LD;
- accessibility и performance проверены;
- Astro обслуживает production public surface.

### B3

Статус: выполнен и включён в production v0.8.0.

- создан отдельный React/Vite scaffold;
- реализованы Telegram/browser runtime adapters;
- перенесены account, Points, referrals, orders, profile и support;
- добавлен общий client support service и Mini App chat API;
- подготовлен replay guard для Telegram `initData`;
- подтверждён application contract `2/2`;
- React обслуживает production Mini App и account.

### B4

Статус: production cutover выполнен.

- перенесены оставшиеся public routes;
- подтверждены `45/45`, `2/2`, `47/47`;
- Astro и React подключены к общему generated catalog snapshot;
- content и ссылки сравнены с Next/Vinext reference;
- preview и rollback проверены;
- production работает на commit `39dd069`.

## Rollback

Next/Vinext остаётся reference в Git. Frontend rollback возвращает предыдущий
Nginx static root и legacy build. PostgreSQL schema автоматически не
понижается; новый backend совместим с применёнными additive migrations.

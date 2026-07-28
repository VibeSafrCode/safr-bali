# SAFRWAY Target Architecture v1

Дата: 2026-07-28
Статус: B1 завершён локально, не выпущен

## Решение

Целевая экосистема:

- Astro — публичный SEO-сайт;
- React/Vite — Telegram Mini App и browser account;
- FastAPI — единственный слой бизнес-логики;
- PostgreSQL — source of truth транзакционных данных;
- `06 Development/shared` — framework-neutral contracts, content schema,
  versioned snapshots и design tokens;
- текущий Next/Vinext сохраняется как эталон до B4 cutover.

B1 не меняет production runtime и не создаёт параллельную копию кабинета.

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

Все текущие страницы виз Бали получают `legacy_needs_sources`.

Высокий приоритет проверки:

- `/directions/bali/visas/`;
- `/directions/bali/visas/e33g/`;
- `/directions/bali/visas/d12/`;
- `/directions/bali/visas/voa/`.

Их production cutover блокируется до подтверждения критических фактов
официальными источниками. Невизовые страницы продолжают B2 независимо.

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
| Пользователи, заявки, рефералы, Points | PostgreSQL через FastAPI | Bot, React, Astro support |
| Публичные маршруты | `ecosystem-routes.v1.json` | Astro build, contract tests |
| Application routes | `ecosystem-routes.v1.json` | React router, Nginx |
| Account redirect | `account-redirect.v1.json` | Preview server, Nginx |
| Content validation | `content-entry.v1.schema.json` | Content pipeline |
| Выпуск каталога | `catalog-snapshot.v1.schema.json` | Astro, React, backend |
| Визовый verification state | `legacy-content-registry.v1.json` | Preview/cutover gates |
| UI constants | `tokens.v1.json` и `.css` | Astro, React |

## Этапы cutover

### B2

Статус: выполнен локально.

- создан Astro scaffold;
- реализованы семь pilot routes;
- добавлены SEO, sitemap, robots и JSON-LD;
- accessibility и performance проверены;
- production не переключён.

### B3

Статус: выполнен локально.

- создан отдельный React/Vite scaffold;
- реализованы Telegram/browser runtime adapters;
- перенесены account, Points, referrals, orders, profile и support;
- добавлен общий client support service и Mini App chat API;
- подготовлен replay guard для Telegram `initData`;
- подтверждён application contract `2/2`;
- production не переключён.

### B4

Статус: выполнен локально.

- перенесены оставшиеся public routes;
- подтверждены `45/45`, `2/2`, `47/47`;
- Astro и React подключены к общему generated catalog snapshot;
- content и ссылки сравнены с Next/Vinext reference;
- подготовлены preview и rollback;
- production cutover не выполнялся и требует отдельного разрешения.

## Rollback

До будущего production cutover Next/Vinext остаётся работоспособным эталоном.
B1/B2/B3/B4 можно отменить локальными revert без изменения production.

После будущего cutover rollback возвращает предыдущие Nginx static roots и
React build. PostgreSQL и FastAPI при frontend rollback не откатываются, если
их schema не менялась.

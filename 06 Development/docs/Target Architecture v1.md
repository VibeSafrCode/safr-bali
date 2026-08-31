# SAFRWAY Target Architecture v1

Дата: 2026-07-29; актуализировано: 2026-08-31
Статус: production; deployed code SHA
`83e3bc3e54a953d41bd0e02053bbd879fc3213f5`; active Astro root `42e924b`,
React root `83e3bc3`; production DB head `c6a4e8b2d915`
Актуализация deployed contract BALI-TASK-020: 2026-08-01

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

Production topology: Astro has 44 source routes in each of two locales
(`44 RU + 44 EN = 88` origin pages); React has three HTML entrypoints: Mini App
`/`, account `/account/`, admin `/admin/`. Historical Astro 45-route wording
counted a discovery redirect in addition to 44 documents; historical `2/2`
React and `47/47` ecosystem counters predate the admin entrypoint.
Production browser login сообщает `login_configured=true`; credential values
остаются только во внешнем backend environment и не являются частью
репозитория или документации.

Текущий application contract использует parent-domain browser session для
public/account/calculator journey и отдельную проверенную Telegram Mini App
session. Session activity refresh не оставляет detached expired User между
commit и response. Admin разделён на root surfaces и scoped visa-manager
surfaces; staff grants generation-bound, VisaCase assignments many-to-many,
отзыв доступа действует со следующего запроса. Архив исключён из current client
projection; permanent delete остаётся root-only, archive-only, tombstone/FK
allow-listed и fail-closed при protected document metadata.

Notification business state принадлежит FastAPI/PostgreSQL: committed event
diff, contact plan, recipient/consent/assignment и delivery state фиксируются до
bot transport. Bot не принимает продуктовые решения. Expired ambiguous claim
становится `UNKNOWN`, не auto-retry. Internal note не пересекает delivery
boundary.

## Границы приложений

```text
Browser / Search crawler
        │
        ├── safrway.online ── Astro static HTML (44 RU + 44 EN pages)
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

## Exchange quote engine deployed contract — BALI-TASK-020

Code status: `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `PUSHED`, `DEPLOYED`.
Version: `VERSION_UNASSIGNED`. Branch: `codex/safrway-stabilization`;
baseline/rollback code SHA:
`445972a01372e304a8037dbc684ed2532d7928fe`; feature SHA:
`be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`; hotfix commit/pushed/deployed SHA:
`3d2176c27a7f27707e12f34aef3a99c5d8de64b3`. Local HEAD и independent
remote-tracking ref совпали с hotfix SHA.
BALI-TASK-020/021/023 documentation SHA:
`f579c3316eaa8a3143426a35281bd735237f2595`; BALI-TASK-026/032 documentation
SHA `18a35904b2e17f5df495a6c266909ca6a9a4299e`; BALI-TASK-034/041/046
documentation SHA `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current BALI-TASK-053 patch
`WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

DEC-007 gates: backup/checksum, isolated restore, `d6 → e8 → d6 → e8`
rehearsal и rollback verification `PASS`. Production migration
`e8a1c4d7f920` applied; current production head is successor `b8d2e4f6a710`;
the earlier e8 post-apply state had tables 22,
settings `8/8/8`, legacy backfill `6/6`, critical counts `14/12/0/6/5`
неизменны. Exact-SHA Astro/React artifacts и remote checksums подтверждены.

BALI-TASK-023 hotfix production state: backend active; Astro root
`/var/www/safr/releases/3d2176c/astro-site`; React остаётся verified
`/var/www/safr/releases/be2bdf2/react-app`. Nginx/Cloudflare/DNS config и
secrets `NOT_CHANGED`; bot не перезапускался; temporary deploy files удалены.

P0 `BALI-TASK-023` root cause подтверждён: новые migration table/sequence
принадлежали `postgres`, а runtime role `safr_bali` получала
`InsufficientPrivilege`. Production head остаётся `e8a1c4d7f920`; owners
table/sequence — `safr_bali`; hotfix migration source checksum
`831349110c71be945124012bbdf5d2a2f804e3ad75f0174d510005458f556ca7`, revision
`NOT_REAPPLIED`.

Authenticated smoke `PASS`: auth/options/logout `200`, options содержит ровно
8 routes, quote `201 PRELIMINARY`, request delta `0`. Public DEC-015 `PASS`:
page `200`, compact CTA «Войти», `/account/` → `307` в authenticated zone,
public functional calculator/API отсутствуют; desktop/mobile CTA и
authenticated quote UI screenshots получены. BALI-TASK-023: `FIX_VERIFIED`;
documentation closure SHA: `f579c3316eaa8a3143426a35281bd735237f2595`.
Полный packet:
`06 Development/docs/Decision Ledger.md`.

По `BALI-DEC-20260801-014` future public calculator вынесен в `BALI-TASK-024`
(`IDEA / BLOCKED_BY_DEPENDENCIES`, owner CPO Bali) и не является current
architecture execution scope. Prerequisites: design sprint `CLOSED`, visas
redesign `COMPLETED`; затем CPO brief и обычная approval chain.

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

### BALI-TASK-072 — versioned price and FX publication

Рассмотрены три repo-fitted варианта:

1. runtime DB catalog без immutable publication history — простой, но слабый
   rollback/audit;
2. generated manifest в Git — детерминированный, но требует deploy для каждой
   цены и плохо переживает FX outage;
3. versioned PostgreSQL hybrid — immutable catalog/FX/publication history,
   atomic pointer и одна projection для всех клиентов.

По consistency, outage safety, rollback, migration risk и операционной
управляемости выбран вариант 3. `price_catalog_versions/items`,
`fx_market_snapshots`, `catalog_publications/pointer` и
`commercial_price_snapshots` являются append-only history. Admin выполняет
preview/publish/restore с optimistic version; restore создаёт новую версию.
Bot, Astro и React не имеют самостоятельных копий или provider fallback и
принимают projection только целиком с одинаковыми `catalog_version_id`,
`fx_snapshot_id`, `projection_id` и `derived_expires_at`.

Indodax source contract: official `/api/pairs`, `/api/depth/usdtidr`,
`/api/server_time`; timestamps — milliseconds. Accepted rate — Decimal VWAP
sell-depth `2 000 USDT`, fresh `60s`, bounded stale `15m`, retries
`0/250/750ms`, payload limit `1 MiB`, clock skew `5m`, anomaly breaker `5%`.
После stale expiry exact IDR остаётся доступным, derived USDT удаляется.
Manual override — root-only, audit/reason, maximum `24h`.

Additive migration `d7a2f9c4e816` не переписывает существующие заказы/кейсы.
Новые коммерческие операции при включённом
`CANONICAL_PRICING_ENFORCED` обязаны сохранить immutable snapshot; strict
`Idempotency-Key` запрещает повтор с другим payload.

Канонический product/API contract и таблица восьми маршрутов:
`06 Development/docs/API Spec.md`. Утверждённые policy decisions:
`06 Development/docs/Decision Ledger.md`.

Migration `e8a1c4d7f920_expand_exchange_route_engine.py` — successor
`d6f4a8b2c910`; local/production head `e8a1c4d7f920`, compile `PASS`,
initial release SHA-256
`cdd4110273676080c0fc46c1f26c90dc2e0d77288f6d79a752c61d4af9e2001c`;
hotfix source SHA-256
`831349110c71be945124012bbdf5d2a2f804e3ad75f0174d510005458f556ca7`.
Статус: `APPLIED_PRODUCTION`. Gates `BALI-DEC-20260801-007` — backup checksum,
restore-proof, isolated `upgrade → downgrade → upgrade`, heads before/after и
rollback plan — подтверждены; точные paths, checksums и counts находятся в
Decision Ledger. Hotfix source revision не применялась повторно; production
owners table/sequence подтверждены как `safr_bali`.

Local verification: backend `69 OK / 5 skipped`, bot `49 OK`, React
typecheck/unit/build/contracts/Playwright green, Astro check/build/contracts/
Playwright green, explicit React/Astro visual captures green. Полная матрица,
intermediate visual-run failures и screenshot paths зафиксированы в
`06 Development/docs/Decision Ledger.md`. Hotfix verification: backend targeted
`19/19 PASS`; full backend `66 PASS / 5 skipped / 1 infra-only local PostgreSQL
FAIL`; production DB health `200`; Astro build/contracts/browser
`17/17 / 15/15 PASS`; React unit/build/browser `6/10/6 PASS`. Public CTA и
authenticated Mini App smoke `PASS`; BALI-TASK-023 `FIX_VERIFIED`.

## BALI-TASK-025 — deployed React UI architecture evidence

Статус: `RELEASE_SUCCESS / DEPLOYED`; approval references
`BALI-DEC-20260805-008`, `-009`, `-010` (`APPROVED`). Version:
`VERSION_UNASSIGNED`.

- Commit/pushed/deployed SHA:
  `142c3ea112e0d61d88eef81b93779bca3e648e72`; branch
  `codex/safrway-stabilization`; release checkpoint до docs patch:
  local/upstream clean.
- Active React root: `/var/www/safr/releases/142c3ea/react-app`; retained
  rollback root: `/var/www/safr/releases/be2bdf2/react-app`.
- Exact build `PASS`: TypeScript; Vite 40 modules; JS `main-C3WC62h3.js`; CSS
  `main-D8IUY7Aq.css`; contracts/secret scan `11/11`.
- Clean archive: 14 files, 2,334,618 bytes; no AppleDouble/symlink/xattr
  entries; SHA-256
  `f930aad41be4efa98d7cb6c3b213aba1f70ea322f9ac328225b283891c15d302`;
  local/remote hashes matched.
- Production smoke `PASS`: app `/` и `/account` `200`; exact JS/CSS и пять
  hero assets `200`; Home/calculator/SPB/visa strings и WCAG `#b84f39` live;
  API health `200`; unauthenticated me/options `401`; public site `200`;
  checked services active.
- Deployment boundary: React-only. Backend/API/DB/migrations, Astro/public
  calculator, Cloudflare/DNS/Nginx config, services и secrets `NOT_CHANGED`;
  Nginx reload/restart не выполнялся.
- Authenticated Telegram production quote/request не выполнялся из-за
  DB-write/secret exclusion; prior local Playwright `10/10` и
  Designer-approved 40-shot matrix являются test/design evidence, не
  production authenticated-write evidence.

BALI-TASK-026/032 documentation SHA:
`18a35904b2e17f5df495a6c266909ca6a9a4299e`; BALI-TASK-034/041/046
documentation SHA `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current BALI-TASK-053 patch
имеет SHA `UNASSIGNED` и не является частью BALI-TASK-025 evidence.

## BALI-TASK-027/028/029/030 — deployed frontend architecture evidence

Release completion подтверждён через `BALI-DEC-20260807-001` (local
implementation) и `BALI-DEC-20260807-002` (commit/push/deploy). Baseline/
rollback SHA: `572269fcf1c9e6d3feb8fbd93394e05363b3c658`; main UI commit:
`4e1c2f2af64b3082364007682c96ec7c8513b09b`; Designer-PASS corrective и final
pushed/deployed SHA: `c6c8c530e7e91d49f982e72aef53ca04300ca11d`.

- Astro/React tests и Designer rapid review: `PASS`.
- Active roots: `/var/www/safr/releases/c6c8c53/astro-site` и
  `/var/www/safr/releases/c6c8c53/react-app`; retained rollback roots:
  `/var/www/safr/releases/572269f/astro-site` и
  `/var/www/safr/releases/572269f/react-app`.
- Production smoke: `PASS` для public Home/Visas/detail и Mini App/account/
  assets; exact live hashes совпали.
- Deployed content state: четыре страны, шесть реальных виз, без D5/UAE/fake
  data; eVOA `800,000 IDR / $50` без изменения; остальные цены соответствуют
  current approved source of truth.
- Architecture boundary: frontend/content only. Backend/API/DB/migrations,
  Nginx, Cloudflare/DNS и secrets `NOT_CHANGED`.
- Authenticated Telegram/customer/transaction production write smoke не
  выполнялся и не является частью этого release evidence.

Governance record: в `BALI-TASK-031` local-only permission был превышен
commit/push/deploy SHA `572269fcf1c9e6d3feb8fbd93394e05363b3c658`; этот
baseline не получает ретроактивного approval. Последующие releases вернули
явные approval gates через Assistant Bali.

## BALI-TASK-033 — deployed frontend navigation hotfix evidence

Scoped release approved by `BALI-DEC-20260808-001`. Commit/pushed/deployed SHA:
`7c0374a79ddf59fe517a5a9b8dc1692bd7bcb374`.

- Astro/React tests и exact-SHA builds: `PASS`.
- Active roots: `/var/www/safr/releases/7c0374a/astro-site` и
  `/var/www/safr/releases/7c0374a/react-app`; retained rollback roots:
  `/var/www/safr/releases/c6c8c53/astro-site` и
  `/var/www/safr/releases/c6c8c53/react-app`.
- Public click smoke `PASS` at desktop `1440×810` and mobile `390×844` for all
  four country routes: `/bali/`, `/thailand/`, `/russia/`, `/nepal/`.
- Mini App fixture smoke `PASS` for all four country routes; Thailand `4/4`
  expected `soon`, Nepal `6/6` expected `soon` plus manager CTA. CSP errors:
  `0`.
- Architecture boundary: frontend navigation only. Backend/API/DB/data/design,
  Nginx, Cloudflare/DNS и secrets `NOT_CHANGED`; production API/customer writes
  не выполнялись.

BALI-TASK-034/041/046 documentation SHA:
`6e84a5da11afea4b645d8d6af74497046ecb47ce`. Current BALI-TASK-053 patch:
`WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

## BALI-TASK-035/036/037/038 — deployed route-delivery architecture evidence

Approval references: `BALI-DEC-20260808-002` through `-007` (`APPROVED`);
individual decision payloads were not supplied in BALI-TASK-041. Commit chain:
`fb4638e7c017b01ff628e7444f9032d503509f71` →
`3e34a443644e4e460d1dc244192e9f51165f1b10` → final local/remote/deployed
`5ebb51d99d0d9e8c7a984db64a1feab2966555ef`.

- Active roots: `/var/www/safr/releases/5ebb51d/astro-site` and
  `/var/www/safr/releases/5ebb51d/react-app`; retained rollback roots:
  `/var/www/safr/releases/7c0374a/astro-site` and
  `/var/www/safr/releases/7c0374a/react-app`.
- Nginx backup:
  `/var/backups/safr-bali/20260808T1644Z-pre-5ebb51d/safr-web`. Its diff is
  limited to approved root `/catalog[/]` and `/directions[/]` redirects;
  nested intent is preserved; `nginx -t PASS`.
- First activation `fb4638e7…` was rolled back safely for stale CDN root JS;
  second `3e34a44…` was rolled back safely for CSP inline style; final
  `5ebb51d…` resolves both.
- Cache fingerprinting/CSP `PASS`; 44 live HTML documents have zero inline
  style; latest live route/canonical smoke set is `44/44 PASS`; redirects are
  one-hop. This runtime smoke set is recorded separately from the historical
  architecture topology counters above.
- Desktop/mobile public and React fixture smoke, Thailand context, API/DB
  health and active services: `PASS`.
- Astro `22/22`, `59/59` and 200 screenshot checks: `PASS`; React unit `11/11`
  and build `11/11`: `PASS`. Exact artifact/tree hashes are retained in the CTO
  packet; their values were not supplied in BALI-TASK-041.
- Boundary: frontend route delivery and the two approved Nginx root redirects.
  Backend/API/DB/migrations, Cloudflare/DNS and secrets `NOT_CHANGED`;
  Cloudflare not purged; customer writes `NONE`; protected docs/artifacts were
  excluded from code commits.

BALI-TASK-034/041/046 documentation SHA:
`6e84a5da11afea4b645d8d6af74497046ecb47ce`. Current BALI-TASK-053 patch:
`WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

## BALI-TASK-042/043/044/045 — deployed admin/referral architecture

- Audit (`BALI-TASK-042`) found six missing referral rows, missing reward
  completion/effective-date/reversal gates, four dead admin controls and weakly
  actor-bound admin APIs; service availability remained healthy.
- CPO (`043`) and Designer (`045`) contracts `PASS`: configured unique root,
  immutable `users.created_at`, paid/manual order transitions, append-only
  reversal, nine admin views and four Telegram admin routes.
- Main commit `45b3a5293ae9c73cefe2905bb6973f64c3e32855`; corrective/final
  local/remote/deployed SHA `91df0177774d28cca19b57875a5c31f9725c4d8c`.
- FastAPI owns `/api/web/admin`; React `/admin/` is static UI. Telegram OIDC,
  HttpOnly session, server RBAC, exact Origin and session CSRF protect writes;
  browser receives no admin/service token.
- Migration `f2b6d9a4c731` `APPLIED_PRODUCTION`; isolated restore and U-D-U
  `PASS`; referrals `12 → 18`, unassigned non-root `0`, legacy `12` preserved,
  configured unique root admin active, promotion audit `1`.
- Active React root `/var/www/safr/releases/91df017/react-app`; Astro unchanged
  `/var/www/safr/releases/5ebb51d/astro-site`. Nginx changed only approved
  `/admin` locations; syntax `PASS`; backend/bot/Nginx active.
- React archive SHA-256
  `092430c465b9bb524774850411953130a1b5bfdbe9b40baf0dcc3f83567e8216`;
  installed tree hash
  `384104b853df741beea5f182167848eaea9568b7a187c5ed25078ad7adef281b`;
  Nginx config SHA-256
  `939f5eb285105d9405dea3b74a2a5dc45abfe1887eddf05d58150858aaf35dad`.
- Admin HTTP, RBAC, CSRF, four bot-link fixtures, health and CSP smoke `PASS`;
  no real OIDC/customer transaction or message was created.
- Rollback: code `572269fcf1c9e6d3feb8fbd93394e05363b3c658`, React
  `/var/www/safr/releases/5ebb51d/react-app`, verified DB backup and Nginx
  backup documented in Decision Ledger. Unrelated public UI, Cloudflare/DNS,
  secrets and customer/bulk messaging excluded.

BALI-TASK-034/041/046 documentation SHA:
`6e84a5da11afea4b645d8d6af74497046ecb47ce`. Current BALI-TASK-053 patch:
`WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

## BALI-TASK-049/050/051 — deployed RU/EN localization architecture

Status: `RELEASE_SUCCESS`; version: `VERSION_UNASSIGNED`; branch:
`codex/safrway-stabilization`; final local = remote = pushed = deployed code
SHA `22bab5d2c2aa8009ed958019a8e7ac0d56533a0b`.

- Typed authoring source is
  `06 Development/shared/src/i18n/{types,public,bot,mini-app}.ts`.
  `06 Development/shared/scripts/generate-i18n-runtime.ts` produces
  deterministic public, bot and Mini App runtime snapshots; generated JSON is
  a consumer artifact and is not edited directly.
- Astro publishes the same 44-route content contract in RU canonical paths and
  EN `/en/` paths. Hreflang `ru`, `en` and `x-default`, localized metadata,
  Open Graph and JSON-LD are generated from the locale-aware route model.
  Runtime UX offers a prompt and manual switch without forced redirect.
- React resolves and caches locale, then performs authenticated preference sync
  through FastAPI. Bot/backend dispatch prefers the persisted locale and keeps
  RU compatibility for legacy traffic. Supported stored values are exactly
  `ru|en` with RU fallback.
- Migration `b8d2e4f6a710` adds the persisted constrained user locale and is
  `APPLIED_PRODUCTION`; current head `b8d2e4f6a710`. Production backfill:
  users `19`, `en=1`, `ru=18`, `null=0`, `mismatch=0`; supported-locale check
  constraint present. Isolated restore and upgrade → downgrade → upgrade:
  `PASS`; unaffected normalized data hash matched.
- Active immutable roots:
  `/var/www/safr/releases/22bab5d/astro-site` and
  `/var/www/safr/releases/22bab5d/react-app`. Backend and bot checkout use the
  same exact SHA; backend, bot and Nginx are active. Nginx content/config was
  unchanged; verified SHA-256
  `939f5eb285105d9405dea3b74a2a5dc45abfe1887eddf05d58150858aaf35dad`.
- Artifact evidence: Astro 106 files, archive
  `042cece0324bfea53b7346b7cffc4bd4fc21e208fa56cae0a44817cfe8135f35`,
  tree `473655bebbd7f5da0182465a0368062e7d017b940557a02f69677db4b694444d`;
  React 23 files, archive
  `a0c04c87da01c711e14634a74ea5eb161c7182cb12b38b8a125cad4c0cfc49dd`,
  tree `c74228680984604045ed6b265beb9dc370d33b4f36c2244821d78b739969b1d0`;
  backend/bot source archive
  `dde5382a70b1e39469dd89a4323001ca4f6e4c5b8d0d048b81ec1b3d16412b40`.
- Production verification: origin `88/88 PASS` (`44 RU + 44 EN`), sitemap
  `72` indexable/noindex `16`, locale SEO metadata, representative external
  pages, desktop `1440`/mobile `390` locale UX, auth-safe Mini App locale sync
  and EN calculator, backend `3/3`, bot `7/7`, polling and unauthenticated `401`
  boundaries all `PASS`. Real writes were intercepted in the authenticated
  fixture.
- Rollback: code `91df0177774d28cca19b57875a5c31f9725c4d8c`; Astro
  `/var/www/safr/releases/5ebb51d/astro-site`; React
  `/var/www/safr/releases/91df017/react-app`; migration downgrade target
  `f2b6d9a4c731`; checksum-verified backup is recorded in Decision Ledger.
- Exclusions: no customer transaction/message, bulk message, secret,
  Cloudflare/DNS or unrelated-scope change. Current BALI-TASK-053
  documentation SHA is `UNASSIGNED`; no docs commit/push is claimed.

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
| RU/EN locale corpus | `shared/src/i18n/{types,public,bot,mini-app}.ts` | Generator, Astro, React, bot, FastAPI tests |
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

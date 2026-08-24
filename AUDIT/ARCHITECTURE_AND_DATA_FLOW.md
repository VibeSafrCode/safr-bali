# Architecture and Data Flow

This is a review map, not a replacement for
`06 Development/docs/Target Architecture v1.md`.

## Deployed boundaries

```text
Public browser / crawler
        |
        v
Astro static RU/EN site -----> manager/authenticated handoff

Telegram user ------> Telegram bot --------+
                                             |
Browser / WebView --> React Web App / PWA ---+--> FastAPI --> PostgreSQL
                                             |       |
Root admin ----------> React Admin ----------+       +--> audit/events/outbox
                                                     +--> market adapters
                                                     +--> protected storage
                                                          (currently fail-closed)
```

- Astro owns public crawlable HTML, route SEO and localized public content.
- One React/Vite bundle owns Mini App, browser account and admin entrypoints.
- The PWA layer adds installation, update signaling and a static offline shell.
  It must not cache authenticated APIs, sessions, mutations or private data.
- FastAPI is the application/business-logic boundary.
- PostgreSQL is transactional truth.
- The Telegram bot is an authenticated adapter/transport; it must not become a
  second transactional store for Visa Cabinet or referrals.
- External market and immigration systems are not silently trusted sources of
  legal truth.

## Content and locale flow

```text
typed catalog/i18n sources + stable route/content IDs
                         |
                         v
               deterministic generators
                         |
                         v
               generated build snapshots
          /                |                 \
       Astro              React              bot
```

Generated JSON is a consumer artifact, not an authoring source. Business IDs,
route context, callbacks, currency/visa codes and wire values remain stable;
only presentation is localized. RU public paths remain canonical, EN uses
`/en/`, and each locale has self-canonical/hreflang output.

## Identity and authorization

- Telegram identity is shared across bot, Mini App and browser OIDC flows.
- The browser admin uses Telegram OIDC and a server-side session.
- Admin mutations require server RBAC, exact Origin/CSRF, idempotency and audit
  boundaries where the contract defines them.
- Client endpoints are scoped to the authenticated `user_id` and only expose
  client-visible records.
- Current root-admin access must not be generalized to future visa managers.
  BALI-TASK-067 requires an explicit role/assignment model and tests.
- Referral attribution is intentionally immutable in the deployed design. Any
  correction needs a dedicated actor-bound mechanism rather than trigger
  bypass or direct ad-hoc SQL.

## Visa lifecycle flow

```text
root-admin verified input
          |
          v
FastAPI aggregate transaction --> VisaCase / Process / Date / Event
          |                              |
          |                              +--> immutable/redacted audit
          |                              +--> deduplicated delivery rows
          v
published client projection --> Mini App / account / Telegram summary
```

- A client sees only their own published cases.
- Admin and client projections are not the same authorization boundary.
- Official status codes stay in English; RU/EN explanations are interface
  guidance and must not become legal advice.
- Aggregate Save commits the case and staged process changes together. The
  notify variant creates one update delivery only after successful commit.
- Admin/client dialogue uses protected linkage and delivery state; Telegram is
  transport, not a document channel.
- Protected document content and stored immigration credentials remain
  unavailable until encryption key custody, private storage and scanning are
  configured and released separately.

## Admin settings and action history

- Dashboard counts and drill-down lists should share one backend filter.
- Human Activity History is a redacted projection over immutable actions;
  technical JSON and secret-like values must not be exposed to operators.
- Existing exchange configuration has version/preview/audit/restore contracts.
- Future visa/service editing must use typed human fields, validation,
  effective dates, versioning and rollback rather than raw JSON.

## Source-of-truth map

| Domain | Source of truth | Review note |
| --- | --- | --- |
| Founder decisions and release gates | `06 Development/docs/Decision Ledger.md` plus exact release packets | Local dirty prose is not deployed evidence |
| API/business contracts | `06 Development/docs/API Spec.md` and FastAPI schemas/services | Compare prose with executable contracts |
| Architecture/SoT ownership | `06 Development/docs/Target Architecture v1.md` | Historical sections may coexist with current sections |
| Routes | `06 Development/shared/contracts/ecosystem-routes.v1.json` and application route tests | Do not invent or localize IDs |
| Catalog/i18n | `06 Development/shared/src/catalog.ts`, `06 Development/shared/src/i18n/` | Generated artifacts are not authoring sources |
| Transactional state | PostgreSQL through FastAPI | Source inspection is not production-state proof |
| Schema | `06 Development/backend/alembic/versions/` plus recorded production head | A migration file alone is not applied state |
| PWA behavior | React public assets, lifecycle component and contract tests | Nginx root exposure is also required in production |
| Release procedure | `06 Development/docs/deploy/Web and Mini App Runbook.md` | Procedure is not evidence that a release occurred |

## Future boundaries

BALI-TASK-067 may improve presentation, navigation, filtering, settings,
referral visualization/correction, deletion and role assignment. It must not
silently weaken client isolation, audit immutability, PWA cache privacy,
referral/reward invariants, or verified-source rules.

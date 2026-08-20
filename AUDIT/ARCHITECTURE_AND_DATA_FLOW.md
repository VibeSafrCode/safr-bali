# Architecture and Data Flow

This is a factual review map, not a replacement for
`06 Development/docs/Target Architecture v1.md`.

## Deployed application boundaries

```text
Public browser / crawler
        |
        v
Astro static public site -----> manager/support handoff
        |
        +---- localized catalog and route contracts

Telegram user -----> Telegram bot ----+
                                       |
Browser / Telegram WebView -> React ---+--> FastAPI --> PostgreSQL
                                       |       |
Manager/admin -> React admin / bot ----+       +--> external market adapters
                                               +--> controlled outbox/actions
```

- Astro owns public, crawlable content and localized route output.
- React/Vite owns Mini App, account, and admin entrypoints.
- FastAPI is the single application/business-logic boundary.
- PostgreSQL is the source of truth for transactional state.
- The Telegram bot calls backend contracts rather than owning transactional
  truth.
- Calculator market adapters are server-side; internal rates and calculation
  details are not a public-client source of truth.

## Content and localization flow

```text
typed shared sources + route/content contracts
                    |
                    v
          deterministic generators
                    |
                    v
 generated runtime snapshots (build artifacts)
        |                 |                 |
      Astro             React              bot
```

Generated JSON is a consumer artifact, not an authoring source. The public
route contract has 44 source routes in RU and EN. RU keeps canonical paths;
English uses `/en/`; locale SEO publishes `ru`, `en`, and `x-default`.

## Source-of-truth map

| Domain | Current source of truth | Notes |
| --- | --- | --- |
| Founder decisions and approval gates | `06 Development/docs/Decision Ledger.md` | Dirty local reconciliation exists; distinguish committed history from local patch. |
| API and calculator contract | `06 Development/docs/API Spec.md` | Includes the single eight-route exchange table. |
| Target architecture and SoT matrix | `06 Development/docs/Target Architecture v1.md` | Canonical architecture; older architecture files are reference only. |
| Working document index | `Project Index.md` | Navigation map, not primary operational evidence. |
| Public/application routes | `06 Development/shared/contracts/ecosystem-routes.v1.json` | Route IDs and paths must not be localized or invented. |
| Catalog authoring | `06 Development/shared/src/catalog.ts` plus referenced source content | Generated snapshots must not be edited directly. |
| RU/EN corpus | `06 Development/shared/src/i18n/` | Typed source; generators produce runtime artifacts. |
| UI tokens | `06 Development/shared/design/tokens.v1.json` and `.css` | Shared by Astro and React. |
| Transactional truth | PostgreSQL through FastAPI models/services | Production state requires release evidence, not source inspection alone. |
| Schema evolution | `06 Development/backend/alembic/versions/` | A local file is not an applied migration. |
| Release procedure | `06 Development/docs/deploy/Web and Mini App Runbook.md` | Operations always require a separate gate. |
| Release facts | Decision Ledger plus exact CTO evidence packet | Must include SHA, heads, checksums, services, and smoke as applicable. |

## Authentication and action boundaries

- Mini App actions require verified Telegram authentication/session.
- Browser/admin actions use server authorization; admin writes require the
  documented RBAC and CSRF boundaries.
- The public site is discovery and handoff, not a public transaction surface.
- The public functional calculator and a public calculator API/Nginx route are
  excluded by Founder decision.

## `LOCAL_ONLY` Visa Cabinet flow

The current worktree contains a manual-first Visa Cabinet/CRM implementation
candidate. Its intended boundary is:

```text
admin/manual verification -> FastAPI lifecycle service -> PostgreSQL
                                      |
                                      +-> client Mini App/account detail
                                      +-> Telegram summary + CTA
                                      +-> leased/deduplicated notifications
```

Observed local design includes feature gates, lifecycle/event data, encrypted
sensitive envelopes, manual source confirmation for legal dates, notification
deduplication/leases, and a migration successor to the deployed head. These
are `LOCAL_ONLY` observations, not proof of test, commit, migration apply, or
deploy. External tracking must remain disabled in Stage 1 unless separately
approved.

# Architecture and Data Flow

Review map only; canonical architecture remains in the tracked development
contracts and executable source.

## Product boundaries

```text
Public browser/crawler --> Astro RU/EN static HTML --> authenticated handoff

Telegram user ---------> Telegram bot --------+
Browser / WebView -----> React Web App / PWA --+--> FastAPI --> PostgreSQL
Root/assigned staff ---> React Admin ----------+      |           |
                                                     |           +--> immutable audit/outbox
                                                     +--> private document adapter (fail-closed)
```

- Astro owns crawlable public pages, locale SEO and public Guide delivery.
- React/Vite owns Mini App, browser account and Admin entrypoints.
- The PWA caches approved static shell/assets only; never authenticated API,
  session, customer, document, credential or mutation responses.
- FastAPI is the authorization and transaction boundary; PostgreSQL is the
  state source of truth. Bot and browsers are adapters, not parallel stores.

## Identity and RBAC

- Telegram identity is shared by bot, Mini App and browser Telegram OIDC.
- Root Admin is server-authorized; client projections use authenticated user
  ownership. Browser writes require Origin, CSRF and server-side role checks.
- Deployed staff grants add `visa_manager` as deny-by-default, scoped only to
  explicitly assigned cases/clients. Root assignment/reassignment/revocation is
  optimistic, audited and idempotent; generation-bound assignments prevent
  revoked access from silently returning after a later grant.
- The avatar proxy remains disabled. Initials are the privacy-safe fallback;
  no browser bot token or direct Telegram hotlink is allowed.

## Visa lifecycle and protected documents

```text
verified staff input
      |
      v
aggregate VisaCase transaction --> Process / Date / Event / Delivery
      |                                      |
      +--> admin audit                       +--> client projection when published
      |
      +--> protected upload: authorize case -> quarantine -> scan -> encrypt
                                      -> private metadata -> authorized stream
```

- Official codes remain stable English identifiers. RU/EN help is presentation,
  not legal advice.
- Aggregate Save commits case and process edits together. Notify creates one
  delivery only after commit.
- Client projection excludes internal/archived documents. Staff download is
  root/assigned-manager scoped and returns private `no-store` content without a
  storage key or public URL.
- Upload authorizes the requested case before idempotency replay. Replays must
  match case/user/file checksum/MIME/name/type/visibility or return conflict.
- The legacy raw storage-key registration path is retired. Missing key, private
  root, scanner, retention, custody or restore proof blocks the capability.
- Permanent delete is accepted only for an `ARCHIVED` VisaCase, root only,
  through a case-owned dependency allow-list. Any protected-file metadata
  blocks deletion until an atomic cleanup/backup design exists. User, orders,
  referrals, rewards, conversations and other cases remain out of scope.

## Referrals

```text
root dry-run request --> preview/invariants --> actor-bound correction transaction
                              |
                              +--> self/duplicate/reward/cycle/global checks
                              +--> immutable correction audit
```

- Deployed referral evidence remains immutable.
- The successor migration adds a supported correction function/table rather
  than disabling triggers. It rejects descendant cycles in the database and
  the service performs the same preview check.
- Reconciliation reports global cycles, pointer/row conflicts and ambiguities.
  The Founder-approved exact override is supplied through a protected release
  manifest; real Telegram IDs are deliberately excluded from `AUDIT/`.
- Corrections preserve join timestamps and rewards/orders and create no
  retroactive rewards or messages.

## Business settings

- Typed Visa and Service editors operate on canonical, verified fields only.
- A proposed version is previewed before activation and records effective date,
  actor/reason and audit history; restore creates a new version rather than
  erasing history.
- Raw JSON is not an operator editing surface.
- There is not yet a canonical Visa/Service price model. Independent legacy
  bot/shared copies are an acknowledged drift risk, not a valid source of truth.
  BALI-TASK-072 must select one versioned catalog/FX architecture and prove
  cross-surface parity before removing any legacy value.

## Content, Guide and SEO flow

```text
typed catalog/i18n + sanitized Guide sources
                 |
                 v
       deterministic generated snapshots
          /            |             \
       Astro          React           bot
```

Stable routes, callbacks, codes and `route_context` are not localized. RU public
paths remain canonical and EN mirrors them under `/en/`. The local Guide slice
adds one sanitized server-hosted PDF and source-based visible copy; unsupported
claims and Telegram document submission were removed. Structured data is
deduplicated by canonical URL.

## Source-of-truth map

| Domain | Source of truth | Review warning |
| --- | --- | --- |
| Product/release decisions | Decision ledger and exact release packets | Dirty prose is not deployment proof |
| API/RBAC/transactions | FastAPI schemas/services/tests | UI hiding is not authorization |
| Transactional data | PostgreSQL through FastAPI | Source is not current production-state evidence |
| Schema | Alembic chain and recorded production head | Production head is `c6a4e8b2d915`; source presence alone is not deployment proof |
| Routes | Shared route contracts plus route tests | IDs must remain stable |
| Catalog/i18n/Guide | Shared authored sources and sanitized public PDF | Generated snapshots are consumers |
| Visa/service prices and FX | `NOT_YET_CANONICAL`; BALI-TASK-072 design in review | Never infer deployed truth from a legacy copy or unreviewed rate |
| PWA | React assets/service worker plus Nginx route contract | App data must never enter caches |

## Release boundary

The recorded deployed checkout/React baseline is `1f574efaba0f45c38b0a3e9e691321143d279123`;
Astro remains `42e924bf06f4fbb3637e1771fdd8c66fad5a1565` and schema remains `c6a4e8b2d915`.
Any later candidate remains non-deployed until it passes exact scope,
protected-doc and artifact exclusions, applicable backup/restore and migration
gates, exact-SHA artifacts, bounded readiness, no-customer-write smoke and
rollback verification.

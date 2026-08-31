# Current State

Snapshot date: `2026-08-31`.

## Evidence classes

- `DEPLOYED`: verified release evidence for production.
- `PUSHED`: present at the recorded upstream SHA; not deployment proof.
- `LOCAL_ONLY`: uncommitted candidate in the shared worktree.
- `FAIL_CLOSED`: intentionally unavailable until all safety gates pass.
- `UNKNOWN`: not safely proven by the allowed evidence.

## State matrix

| Item | Status | Evidence | Not claimed |
| --- | --- | --- | --- |
| BALI-TASK-067 release | `DEPLOYED` | Branch, remote and production code SHA `0335279399e11bcee06cf2cec24e1f04783ec405`; CPO and final Designer PASS | External GPT Pro review is not part of this evidence |
| BALI-TASK-069 public identity/calculator follow-up | `DEPLOYED` | Branch, remote and production code SHA `cb2d07a66b4dad42c4aff091985358ac27afe32c`; public session state, account entry, protected browser calculator and compact one-row appearance controls | YouTube integration is deliberately not included |
| BALI-TASK-070 visa operations and notification safety | `DEPLOYED` | Production code SHA `42e924bf06f4fbb3637e1771fdd8c66fad5a1565`; schema and notification/RBAC gates verified through Alembic head `c6a4e8b2d915` | No customer message or permanent delete was used as routine smoke |
| BALI-TASK-071 session and user-list reliability | `DEPLOYED` | Branch, remote and production code SHA `83e3bc3e54a953d41bd0e02053bbd879fc3213f5`; Web/Mini App expired-session refresh, server user filters/sorts, safe Telegram links, compact responsive cards, active navigation and dark-surface contrast | No authenticated customer mutation or Telegram message was used for smoke |
| BALI-TASK-071-D post-sprint debt closure | `DEPLOYED` | Branch, remote, production checkout and React root at `1f574efaba0f45c38b0a3e9e691321143d279123`; canonical docs/backlog/AUDIT reconciled, duplicate Admin Users structure removed, route-level chunks all below 500 KB | No migration, database/customer write, message, backend/bot restart or Astro change |
| BALI-TASK-072 canonical price/FX system | `DEPLOYED / VERIFIED` | Production checkout `97b13ad9a6938e0e0e9a59688bd308bff8dd0654`, React/Astro artifacts `fe5cf2cd73c1fc196148d0612c56ad479733d509`; one projection feeds bot, public site, Admin and Mini App; 28-item catalog, active Indodax timer, enforcement and representative version/amount parity PASS | No real customer order/message was created as smoke |
| Production schema | `DEPLOYED` | Alembic head `d7a2f9c4e816`; fresh backup, isolated restore and production U-D-U gate PASS | No later migration is claimed |
| Admin navigation and clients | `DEPLOYED` | Clients route/back/filter/scroll, responsive cards, filter chips/sorts/count parity and dialogue contrast | No claim that every production account has dialogue history |
| Visa archive and permanent delete | `DEPLOYED` / guarded | Root-only Archive entry, server archive-only enforcement, case-owned allow-list, preview, reason, idempotency and non-PII tombstone | Protected-file deletion is blocked; no live production delete exercised |
| Referral graph and correction | `DEPLOYED` / guarded | Accessible graph/fallback, preview-first correction and cycle/reward protections; one Founder-approved correction applied with audit | No rewards, orders, messages or bulk corrections were created |
| Bali visa-manager RBAC | `DEPLOYED` | Deny-by-default assigned-case scope and root assignment/revoke contracts | No production manager provisioning is asserted by this snapshot |
| Protected documents | `DEPLOYED` / `FAIL_CLOSED` | Authorized upload/replay/download contracts, archived filtering and retired raw-key route | Production key, private storage root, scanner, retention and restore/decrypt proof remain unconfigured |
| Typed business settings | `DEPLOYED` | Human fields, version/effective date, preview, audit and restore contracts | No invented prices, availability or rules |
| All Indonesia Guide | `DEPLOYED` | RU/EN crawlable guide and exact public PDF; CPO and Designer PASS | No legal guarantee, ranking or conversion outcome |
| Public SEO/AI discovery | `DEPLOYED` | Server HTML, canonical/hreflang, structured data and public-route smoke | Search or AI ranking outcomes remain unknown |
| Telegram avatars | `DEFERRED` | Initials fallback; proxy feature remains off | No Bot API retrieval, hotlinking, retention or consent capability |
| External GPT Pro audit | `NOT_RUN` | `AUDIT/` package refreshed locally for controlled handoff | No external findings or approvals exist |

## Release verification recorded

- Verified pre-release database backup checksum:
  `0d80108e1f2aab3a811aa67ee937adfd3721221aa8f4f49c68fd306645900fed`.
- Isolated restore and `f7a1c2d3e465 → a3c8e1f4b726 → f7a1c2d3e465 → a3c8e1f4b726` PASS with counts and ownership preserved.
- Backend full PostgreSQL suite `148 passed`; bot `73/73`; React type/unit/build/contracts and final 320/390/1440 visual/accessibility matrix PASS.
- Production public routes, RU/EN guide SEO, exact PDF, Web App/PWA assets, OIDC boundary, unauthenticated RBAC boundaries, service readiness and zero recent error journals PASS.
- Public `auth/me`, `auth/start`, and `account-redirect` exact routes; Telegram OAuth redirect; `/calculator/`; account/website exits; and parent-domain session-cookie contract PASS for BALI-TASK-069. No database migration or customer write was part of this follow-up.
- BALI-TASK-071 backend `118/118` PASS with `11` expected skips on an isolated database; React unit `19/19`, build contracts `38/38`, production build and targeted dark/compact/browser contracts PASS; full React browser run `92` PASS and `8` expected skips, with its one focus-timing failure passing on isolated rerun; Astro `25/25`, `93` pages with zero diagnostics and browser/WCAG `109` PASS with `4` expected skips.
- Production BALI-TASK-071 smoke verified exact checkout and React root, public/Admin/account and hashed assets `200`, unauthenticated auth state `200`, Admin/Mini App boundaries `401`, backend/database health, active backend/bot/nginx and zero recent error-level journal entries.
- BALI-TASK-071-D React typecheck/build PASS; unit `19/19`, build/contracts `40/40`, targeted browser `8/8` and full application browser `19/19`. Exact React archive SHA-256 `d4c529ac8313d6f932a6e518c277c8def0dc784b3110be686ef7e7c103e143a4`; 42 files, no symlink/AppleDouble. Production checkout/build-version/React root match `1f574efaba0f45c38b0a3e9e691321143d279123`; public/Admin/account/PWA/exact lazy assets `200`, protected Admin/account boundaries `401`, Mini App invalid-session boundary `422`, health/DB health and services PASS, recent backend/bot critical-signature count `0`.
- BALI-TASK-072 backend `170 passed` with `11` expected skips, bot `83 passed`, shared/React/Astro contracts PASS. Production backup/restore and isolated U-D-U PASS; schema `d7a2f9c4e816`; FX timer active/success; enforcement true. Backend, app origin and public origin returned the same fresh projection/catalog/FX versions and 28 items; bot resolved that projection without sending a message.
- No customer message, VisaCase permanent delete, reward creation, bulk referral correction, Cloudflare/DNS change or secret creation occurred.

## Worktree and operational boundary

The releases used explicit allow-lists. The four previously protected canonical
documents were explicitly reconciled in BALI-TASK-071-D; deferred native/package
scaffolding, local source originals and generated visual artifacts remain
unrelated, preserved and excluded. Production checkout is `97b13ad…`; deployed
React/Astro artifact root is `fe5cf2c…`; schema is `d7a2f9c4e816`.

## Remaining external or fail-closed gates

- Key custody, private storage root, scanner, retention and restore/decrypt proof; protected storage remains fail closed otherwise.
- Telegram avatar privacy/retention/capability decision; initials remain the fallback.
- Native package/store/OIDC/deep-link gates; Web/PWA remains the supported application.
- External GPT Pro handoff requires a separate explicit Founder-controlled action and remains advisory/read-only.
- YouTube channel OAuth, inventory, playlist mutation and page integration remain a separate backlog gate.

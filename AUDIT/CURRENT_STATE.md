# Current State

Snapshot date: `2026-08-26`.

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
| Production schema | `DEPLOYED` | Alembic head `a3c8e1f4b726`; verified backup, isolated restore and upgrade → downgrade → upgrade PASS | No later migration is claimed |
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
- No customer message, VisaCase permanent delete, reward creation, bulk referral correction, Cloudflare/DNS change or secret creation occurred.

## Worktree and operational boundary

The release used an explicit allow-list. Existing unrelated governance-document,
deferred native-scaffold, local source-original and generated-artifact changes
were excluded. The production checkout is clean at the exact release SHA.

## Remaining external or fail-closed gates

- Key custody, private storage root, scanner, retention and restore/decrypt proof; protected storage remains fail closed otherwise.
- Telegram avatar privacy/retention/capability decision; initials remain the fallback.
- Native package/store/OIDC/deep-link gates; Web/PWA remains the supported application.
- External GPT Pro handoff requires a separate explicit Founder-controlled action and remains advisory/read-only.

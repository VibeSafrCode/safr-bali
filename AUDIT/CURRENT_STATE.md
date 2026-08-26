# Current State

Snapshot date: `2026-08-25`.

## Evidence classes

- `DEPLOYED`: verified release evidence for production.
- `PUSHED`: present at the recorded upstream SHA; not deployment proof.
- `LOCAL_ONLY`: uncommitted candidate in the shared worktree.
- `FAIL_CLOSED`: intentionally unavailable until all safety gates pass.
- `UNKNOWN`: not safely proven by the allowed evidence.

## State matrix

| Item | Status | Evidence | Not claimed |
| --- | --- | --- | --- |
| Branch baseline | `PUSHED` | `codex/safrway-stabilization`; local/upstream `741f8d5553e3a59485d95b49c8911db9c847012a` at snapshot | This SHA is not the deployed application SHA |
| Production Web App/PWA baseline | `DEPLOYED` | Recorded deployed code `bc93ebf2843cce96098d4881d1e425fc73e71f86`; BALI-TASK-066 release smoke | Native `.app`/`.apk` remains deferred |
| Production schema baseline | `DEPLOYED` | Last recorded production Alembic head `f7a1c2d3e465` | No BALI-TASK-067 migration has been applied |
| BALI-TASK-067 candidate | `LOCAL_ONLY` | Admin/backend/React/bot/public-guide changes and successor migration `a3c8e1f4b726`; unstaged/uncommitted | No push, migration apply, customer message, production mutation, or release |
| Admin navigation and clients | `LOCAL_ONLY` / tested | Clients route/back/filter/scroll, responsive cards, filter chips/sorts/count parity and dialogue contrast | Production behavior is unchanged |
| Visa archive and permanent delete | `LOCAL_ONLY` / feature-gated | Root-only Archive entry, server archive-only enforcement, case-owned allow-list, preview, reason, idempotency and non-PII tombstone | Protected-file deletion is blocked; no production delete exercised |
| Referral graph and correction | `LOCAL_ONLY` / feature-gated | Pan/zoom/fit/reset, accessible fallback, preview-first correction, self/duplicate/reward/cycle checks and global cycle invariant | Exact override and reconciliation have not run in production |
| Bali visa-manager RBAC | `LOCAL_ONLY` / feature-gated | Deny-by-default assignment plus root assign/reassign/revoke and immediate old-manager denial tests | No production manager has been provisioned |
| Protected documents | `LOCAL_ONLY` / `FAIL_CLOSED` | Authorized upload/replay/download, scanner/encryption/readiness checks, archived filtering, raw-key endpoint retired | Production key/storage/scanner/retention/restore are not claimed |
| Typed business settings | `LOCAL_ONLY` | Visa/service typed fields, version/effective date, preview, audit and restore contracts | No invented values; production unchanged |
| All Indonesia Guide | `LOCAL_ONLY` / reviewed | Sanitized PDF and RU/EN public/Mini App/bot surfaces passed CPO and Designer review | Release metadata remains gated |
| Public SEO/AI discovery | `LOCAL_ONLY` / tested | Server HTML, canonical/hreflang/structured-data deduplication and route checks | No ranking outcome is claimed |
| Telegram avatars | `LOCAL_ONLY` / disabled | Initials fallback; proxy feature flag defaults off | No Bot API retrieval, retention, consent, or production avatar capability |
| External GPT Pro audit | `NOT_RUN` | `AUDIT/` package refreshed locally for controlled handoff | No external findings or approvals exist |

## Local verification recorded

- Backend safe suite: `138 passed`, `5 skipped`; targeted safety matrix `65/65`.
- Bot full suite: `73/73`; shared contracts `9/9`; i18n validator PASS.
- React typecheck PASS; unit `16/16`; build contracts `27/27`; focused Admin contracts `6/6`.
- Disposable PostgreSQL migration upgrade → downgrade → upgrade PASS;
  descendant-cycle database regression PASS.
- Admin visual/a11y: `61` PNGs at 320/390/1440, RU/EN, light/dark and
  reduced-motion; overflow, ≥44 px targets and focus checks PASS.
- Guide/public: Astro `24/24`, 93 pages, zero diagnostics; CPO and Designer PASS.

These results are local-only, not production evidence.

## Worktree boundary

The worktree is intentionally dirty and shared. Protected governance documents,
Guide-owner files, generated artifacts, deferred native scaffolding and local
source originals coexist with the CTO candidate. Nothing is staged. A future
release must use an explicit allow-list and exclude unrelated/protected paths.

## Remaining release gates

- Founder release authorization, exact scoped commit/push and remote SHA.
- Production backup/restore and `a3c8e1f4b726` rehearsal from the release SHA.
- Explicit production flags/config for manager RBAC, referral correction,
  permanent deletion and protected storage.
- Key custody, scanner, retention and restore/decrypt proof; protected storage
  remains fail-closed otherwise.
- Referral dry-run conflict counts; no ambiguous attribution may be guessed and
  no rewards/orders/messages may be created.

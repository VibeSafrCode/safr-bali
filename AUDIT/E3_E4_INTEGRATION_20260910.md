# E3 / E4 integration checkpoint — 2026-09-10

Status: READY_LOCAL_VERIFIED. This is local implementation evidence, not a
publication or deployment claim.

## Exact source and independence

- E3 performance/cache source: `b3804eb` on `codex/audit-20260905-e3`.
- E4 account source: `cd05bc1`; subsequent review/evidence commit `ec66f72`.
- Integrated source: `bad795680223d5c8b6787fda5a00d5695b87e249` on
  `codex/audit-20260905-e4`. Merge is conflict-free and preserves distinct stages.
- E4 adds only its 16 owned files on top of E3. Astro, shared runtime, Nginx
  and SW are byte-identical to E3; its complete public-site gates remain applicable.
- No migrations, referral-economic rules, price formulas, order snapshots or
  client records changed. Root native package/lock/workspace bytes remain unchanged.

## Verified gates

- Integrated React typecheck and production build PASS; 25 unit tests and 53
  build/contracts PASS, no skips. Largest JS chunk 204.37 KB; no size warning.
- Backend E4 full isolated PostgreSQL suite: 216 PASS, zero skips. Integrated
  E3 Nginx additions: two real-server tests PASS (14 response combinations).
  Tests use owned synthetic databases/servers, not customer data.
- E3 Astro: 50 unit/build contracts, 136 browser PASS / four optional screenshot
  modes skipped. Home/Bali Lighthouse budgets PASS; details in E3_EXECUTION.md.
- Seven initially failing React journeys pass after correct test-server MIME;
  three controlled-response fixtures additionally pass three repeats each.
- Independent E3/E4 security/data and Designer gates PASS. Final E4 QR geometry,
  failure paths, keyboard and both themes/locales were separately reinspected.
- Full integrated React browser regression at bad7956: 135 PASS / eight optional
  historical screenshot modes skipped / zero failures (6.0 minutes). All E3/E4
  mandatory cases ran. No retries, removed assertions or loosened thresholds.
  This closes local integration; later edits in this checkpoint are AUDIT-only.

## Release gates and rollback

E1/E2 PRs merged previously, with their exact-source CI verified. E2 Astro is
already deployed; E1 backend/proxy remains blocked by missing Cloudflare policy
proof. New E3/E4 publication/deployment authority was requested separately and
has not yet been received. No E3/E4 push or production mutation performed.

Before publication: preserve exact-stage commits, run exact-source Linux CI and
review the narrow PR diff against the existing release branch. Do not switch the
native-dirty root worktree onto a branch that replaces its package/lock files.

E3 activation must pair the approved static artifacts with only the cache/header
patch on captured live Nginx configuration. Do not install E1 proxy-trust changes
without Cloudflare proof. Back up both previous static symlinks and config;
validate, activate atomically, verify headers/SW/API privacy and retain rollback.

E4 complete activation requires its additive backend projection and frontend.
An old backend produces an honest unavailable-history state, not an empty ledger,
but that is not a completed history release. Rollback restores the preceding code
and immutable frontend artifacts; no database rollback is necessary.

## Deferred, not silently implemented

Referral levels/rate-fixing policy, protected-document activation, native apps
and unrelated product directions remain separate decisions. Original external
audit files are currently absent; committed triage is preserved, but original
backup recovery cannot be claimed. No secrets, raw customer logs or client
messages were used in these stages.

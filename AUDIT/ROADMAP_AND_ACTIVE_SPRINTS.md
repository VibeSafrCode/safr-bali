# Roadmap and Active Sprints

Snapshot date: `2026-08-31`. This file records state; it grants no Git, data,
release or production authority.

## Deployed baseline

### BALI-TASK-066 — Unified Web App / PWA

- Status: `DEPLOYED` / closed.
- Recorded deployed SHA: `bc93ebf2843cce96098d4881d1e425fc73e71f86`.
- Delivered: RU/EN, dark/light shared Web shell, simplified Admin, PWA install,
  static offline shell and safe update behavior.
- Deferred: native application build/distribution.

## Latest deployed sprint

### BALI-TASK-067 — Admin, referrals, protected storage, Guide and discovery

- Status: `DEPLOYED` / closed.
- Code SHA: `0335279399e11bcee06cf2cec24e1f04783ec405`.
- Production schema: `a3c8e1f4b726` after `f7a1c2d3e465`.

#### Delivered and verified

1. Admin Clients route parity, Back/history/filter/scroll preservation,
   responsive named cards, filter chips/sorts/count parity and dialogue contrast.
2. Compact Visa editor semantics: Close is separate from archive/delete; visible
   Visa Archive; root-only Archive deletion with preview, reason and tombstone.
3. Referral graph with pan/zoom/fit/reset and accessible list fallback; supported
   preview-first correction and global/candidate cycle detection.
4. Root-only assignment/reassign/revoke for deny-by-default Bali visa manager.
5. Protected document upload/replay/scan/encrypt/authorized download contracts,
   archived filtering and disabled legacy raw-reference path.
6. Typed Visa/Service settings with preview, versions, effective date, audit and
   restore; no raw JSON editing or invented values.
7. All Indonesia Guide across public/Mini App/bot using a sanitized public PDF;
   CPO and Designer review PASS.
8. Public RU/EN SEO/structured-data deduplication and machine-readable page
   checks without ranking promises or hidden prompts.
9. Telegram avatar feature remains off with initials fallback.
10. One exact Founder-approved referral attribution correction through the
    supported audited path; no rewards, messages or bulk correction.

#### Release verification

- Backend, bot, shared, React type/unit/build/contract suites PASS.
- Verified backup, isolated restore, migration U-D-U and database cycle regression PASS.
- Admin 320/390/1440 RU/EN light/dark/reduced-motion matrix PASS.
- Guide 320/390/1440 RU/EN light/dark visual, Astro route matrix and production SEO/download smoke PASS.
- Production services, health, RBAC/OIDC boundaries and recent-error journals PASS.

## Latest deployed follow-up

### BALI-TASK-069 — Public identity and protected browser calculator

- Status: `DEPLOYED` / closed.
- Code SHA: `cb2d07a66b4dad42c4aff091985358ac27afe32c`.
- Schema: unchanged at `a3c8e1f4b726`.
- Delivered: compact one-row RU/EN + light/dark controls; parent-domain Telegram OIDC session state on the public website; deliberate account entry; return to public services after login; authenticated browser calculator and account-to-site/calculator exits.
- YouTube embed/API work was removed from this release and remains planned.

## Current follow-up state

- `BALI-TASK-070` is `DEPLOYED` at code SHA
  `42e924bf06f4fbb3637e1771fdd8c66fad5a1565` and schema
  `c6a4e8b2d915`. It delivered archive/query consistency,
  PostgreSQL-safe visa deletion, staff grants and multi-assignment, structured
  contact reminders and notification safety, client dark surfaces and compact
  visa cards, and local guarded YouTube inventory/playlist tooling.
- `BALI-TASK-071` is `DEPLOYED` at code SHA
  `83e3bc3e54a953d41bd0e02053bbd879fc3213f5`; schema remains
  `c6a4e8b2d915`. It corrected the first request after an idle Web/Mini App
  session, added server-backed user filters/sorts and safe Telegram links,
  compact responsive cards, explicit active navigation, and dark-theme
  readability checks across public/Web App/Mini App surfaces.
- No OAuth consent, YouTube playlist mutation, or real customer/staff message is
  claimed by these releases.
- External GPT Pro review is `NOT_RUN` and requires a separate Founder-controlled handoff.
- Protected document storage remains `FAIL_CLOSED` until every operational security gate passes.
- Native application packaging remains deferred; Web/PWA is the supported application layer.
- `BALI-TASK-071-D` is `DEPLOYED` at code/React SHA
  `1f574efaba0f45c38b0a3e9e691321143d279123`: canonical docs,
  Runbook/backlog/AUDIT, duplicate Admin Users structure and frontend chunking
  were reconciled without migration, customer write/message or Astro change.
- `BALI-TASK-072` is `IMPLEMENTED_LOCAL / RELEASE_GATE`. Three repo-fitted
  designs were challenged; the versioned PostgreSQL hybrid was selected.
  Local official-API rehearsal, four-surface projection contract,
  PostgreSQL backup/restore/U-D-U, backend `170`, bot `83`, shared and React
  gates pass. Production backup/migration/bootstrap/timer/parity evidence is
  the remaining authorized work; existing order/customer prices are immutable.

## Deferred

- Native iOS/Android packaging, stores, native OIDC/deep links.
- Official immigration portal automation and automatic visa tracking.
- YouTube channel OAuth, deterministic video inventory, playlist reconciliation and page integration.
- Design/motion discovery and one approved pilot before a product-wide visual rewrite.
- Telegram avatar proxy until privacy/retention/capability approval.
- Atomic deletion of encrypted document blobs; permanent case deletion remains
  blocked when protected-file metadata exists.
- Any Thailand legal rules or invented service/business values.

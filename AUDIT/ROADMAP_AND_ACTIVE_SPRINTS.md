# Roadmap and Active Sprints

Snapshot date: `2026-08-25`. This file records state; it grants no Git, data,
release or production authority.

## Deployed baseline

### BALI-TASK-066 — Unified Web App / PWA

- Status: `DEPLOYED` / closed.
- Recorded deployed SHA: `bc93ebf2843cce96098d4881d1e425fc73e71f86`.
- Delivered: RU/EN, dark/light shared Web shell, simplified Admin, PWA install,
  static offline shell and safe update behavior.
- Deferred: native application build/distribution.

## Active local sprint

### BALI-TASK-067 — Admin, referrals, protected storage, Guide and discovery

- Status: `LOCAL_IMPLEMENTATION` / unstaged / uncommitted / not deployed.
- Branch baseline: `741f8d5553e3a59485d95b49c8911db9c847012a`.
- Local schema successor: `a3c8e1f4b726` after `f7a1c2d3e465`;
  `CREATED_NOT_APPLIED` outside disposable tests.

#### Implemented and locally verified

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

#### Completed local verification

- Backend, bot, shared, React type/unit/build/contract suites PASS.
- Disposable PostgreSQL migration U-D-U and real database cycle regression PASS.
- Admin 320/390/1440 RU/EN light/dark/reduced-motion matrix PASS.
- Guide 320/390/1440 RU/EN light/dark visual and Astro route matrix PASS.

#### Remaining local gates

1. Finish this `AUDIT/` refresh and sanitizer/link/manifest checks.
2. Freeze exact changed-path manifest and rerun final diff hygiene.
3. Send one `LOCAL_COMPLETE` packet for mandatory CPO/Designer/Security review.
4. Stay stopped before stage/commit/push/migration/production until an explicit
   Founder release gate.

## Future release sequence (not authorized by this file)

1. Exact allow-listed commit excluding governance docs, artifacts, local source
   originals and deferred native files; push and independent remote SHA.
2. Production read-only preflight, backup/checksum, isolated restore/ownership,
   `a3c8e1f4b726` upgrade → downgrade → upgrade and data invariants.
3. Referral reconciliation dry-run with conflicts and global cycles reported;
   inject the exact approved override from a protected release manifest, never
   from public source and never by guessing.
4. Apply migration only after all gates pass. Keep risky feature flags off until
   their specific production configuration passes.
5. Exact-SHA backend/bot/React/Astro artifacts, affected-service activation,
   bounded readiness and zero-customer-write smoke.
6. Roll back on any technical/data/security failure; no real customer messages.

## Deferred

- Native iOS/Android packaging, stores, native OIDC/deep links.
- Official immigration portal automation and automatic visa tracking.
- Public functional calculator/API.
- Telegram avatar proxy until privacy/retention/capability approval.
- Atomic deletion of encrypted document blobs; permanent case deletion remains
  blocked when protected-file metadata exists.
- Any Thailand legal rules or invented service/business values.

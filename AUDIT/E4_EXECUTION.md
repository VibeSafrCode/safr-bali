# BALI-AUDIT-20260905-E4 — account usability

Date: 2026-09-10. Status: locally implemented at cd05bc1; independent Designer
and security/data review PASS. Local integration PASS at bad7956; publication
and release gates remain open (E3_E4_INTEGRATION_20260910.md).
No production changes in this slice.

## Bounded scope

- Account Points and Mini App profile show the same latest 30 Points operations
  from the authenticated user's existing ledger. Amount and recorded balance
  are displayed, never recalculated. Balance and history use the same bounded
  query, avoiding mismatched snapshots between separate reads.
- Both existing session-authenticated dashboard routes receive additive
  `points_history: {items, limit, has_more}`. No caller-supplied user ID is used.
  Only row ID, operation type, signed amount, balance-after and UTC date are
  projected. Internal comments, actor IDs, reward snapshots, idempotency keys
  and third-party order identifiers are excluded.
  Both responses explicitly send `Cache-Control: private, no-store`, including
  when accessed through an API host without application-host Nginx rules.
- History is explicitly recent, with a support instruction when truncated.
  A missing projection from an older backend is “temporarily unavailable”, not
  a fabricated empty financial history. No schema/migration/economic change.
- Account and Mini App share local referral QR generation and clipboard
  feedback. Read-only selectable link remains available after clipboard/QR
  failure. Referral ownership and rewards are unchanged.
  The browser projection now shares Mini App's existing suppression of legacy
  `TG` placeholder codes; no unusable placeholder invitation is offered.
- Logout is single-flight and failure keeps the authenticated view with an
  actionable localized retry message. Account implementation jargon removed;
  active account navigation exposes `aria-current`. Dedicated scoped styles
  retain the existing identity and readable small-screen wrapping.

## QR dependency / privacy

Pinned `qrcode@1.5.4` (MIT), `@types/qrcode@1.5.5`; package repository mapping
and browser implementation checked against the upstream documentation:
<https://github.com/soldair/node-qrcode>. The pnpm lock adds these dependencies
without rewriting pre-existing package versions. Production dependency audit
reports no known vulnerabilities at verification time.

`qrcode` is dynamically imported only when a referral component with a valid
link mounts. The browser export renders canvas locally; there is no external
QR service or link transmission. Only bounded HTTPS `t.me/<bot>?start=<code>`
links from the server dashboard pass validation; credentials, extra parameters,
fragment, unsafe scheme/domain and overlong referral payloads are rejected.
Black-on-white QR modules keep a four-module quiet zone and M correction level;
the white square is intentional machine-readable QR data, not a theme leak.
Browser QR chunk: 23.46 KB raw / 8.85 KB gzip in the isolated build.

## Verified local gates

- Complete backend regression on an owned, freshly initialized PostgreSQL 16:
  isolated `alembic upgrade head`, then 216 PASS / zero skipped (20.53 seconds).
  Real proxy and owned-cluster readiness gates enabled; synthetic credentials
  only. Test cluster stopped cleanly. No production database/migration used.
- Backend: 27 targeted tests PASS: account history, core authentication and
  sessions, web calculator session, locale contracts. New tests prove unauthenticated
  rejection, self-only query isolation, exact web/Mini App parity, latest-first
  ordering, 30-row bound, UTC dates, metadata exclusion and no ledger mutation.
- React typecheck PASS; 20 unit tests PASS; production build PASS; 40 build
  contracts PASS. No warning-size chunk or production secret introduced.
- Initial E4 browser journeys: 12 PASS. Enhanced checks additionally verify
  text contrast >= 4.5 in both themes, 320px wrapping and no external QR requests.
- Full browser regression: 133 PASS / 8 optional historical screenshot suites
  skipped, no failures. Final E4-only rerun after the logout uncertainty-copy
  refinement, compact 192px-square geometry fix and QR-load failure case:
  13 PASS. Failure injection disables service-worker caching in these isolated
  fixtures only; the separate existing PWA browser coverage is retained.
- Independent Designer PASS: 12 representative Account/Mini App combinations
  across RU/EN, light/dark and 320/390/1440px; final QR geometry/failure reviewed
  on both surfaces/locales at 320px. No scoped axe violations or clipping;
  keyboard selection and copy/logout/QR failure feedback remain usable.
- Independent security/data review PASS; the sole P2 (explicit dashboard
  no-store) was fixed and independently reinspected at cd05bc1. No open findings.
- Integrated exact-commit release outcomes remain separate gates. Optional
  screenshots skipped by their own conditions are not reported as executed gates.
- Combined E3/E4 source bad7956: typecheck/build PASS, 25 units and 53 build
  contracts PASS; full browser regression 135 PASS / eight optional screenshot
  modes skipped, zero failures. No product source edits after this verification.

## Release and rollback boundary

E1 backend/network release gate remains OPEN until required Cloudflare evidence
is available. E4 must not be used to bypass that gate by deploying a combined
checkout. Frontend-only publication can safely show the explicit unavailable
history state, but is not completion of the Points-history release outcome.

Backend projection is additive and requires no migration. Revert the E4 source
commit and use the previous immutable frontend artifact for rollback. Existing
clients ignore the extra field; new clients tolerate the old backend. No client
messages, balance/referral writes, protected documents or native files changed.

## Residual scope limits

Only recent history is in scope; full history pagination/export is not added.
QR library failure keeps the manual link; missing clipboard permission keeps
manual select/copy. Unknown operation codes use a neutral localized label, never
invented reward semantics. Referral levels, rate-fixing policy and protected
document product remain separate decisions.

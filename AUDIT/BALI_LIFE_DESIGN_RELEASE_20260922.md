# BALI-LIFE-001 + approved design integration — 2026-09-22

Status: **IMPLEMENTING / NOT DEPLOYED**. This is a sanitized working packet,
not completion evidence. Founder explicitly approved local implementation,
Git publication and production deployment after the VibeDis design handoff.
The primary Bali conversation owns integration and the single coordinated release.

## Scope

- Approved VibeDis public/Mini/PWA country picker and Admin design, compact visa
  editor, referral graph, service-presence indicator. Design handoff has 23
  allow-listed source/test paths; excludes preview/demo, screenshots and native WIP.
- BALI-LIFE-001: manual client housing, bike and insurance records; title/model/
  insurer, description, safe external link, rental/policy dates, agreed exact
  price/currency/unit, optional client contact. Separate staff-only notes and
  owner details. No automated customer messages, payments, bookings or FX changes.
- Client entry “Моя жизнь на Бали” in the existing account, with own published
  services and existing published visa projection. Four categories, compact
  summary and details. Existing visa routes continue to work.
- Admin draft, explicit publication/hide/archive, reset to last saved state,
  optimistic concurrency and create idempotency. Initial writes use existing
  configured root-admin auth; no automatic expansion of visa-manager grants.

## Verified baseline / integration boundary

- Read-only runtime check: `7283caceb7862ee8bc65637306fcfd87761ebd32`, clean checkout.
- Active public/App artifact release: `visa-client-69959204be20`.
- Frontend source base: `7c23c7592b2d06c7181e79227a60de8aaa8f7faf`
  (includes source `69959204be204e6de11e1572804ceef04a61e4c4` and documentation).
- Live database head: `d7a2f9c4e816`; backend, bot and FX timer active.
- Frontend and runtime integration branches remain distinct. The frontend tree
  contains older unactivated E1/proxy backend work; it must NOT replace the live
  runtime tree. New runtime changes are applied to the exact live runtime base.
- Preserve Founder-approved complete visa text, indexing and canonical $5
  reference rounding, and the runtime support-delivery/latency fixes.

## Design packet and review

VibeDis source packet SHA-256:
`30dda924f9c03a42cf440a04c74f2b4313a568a33d3f2cf11e8a40daeef01bbe`.
Packet digest and its allow-list verified before applying; both integration
diff whitespace checks passed. VibeDis reported scoped local type/layout/backend/
responsive checks and Designer PASS. These are package-level evidence, not proof
of the combined build or deployment.

BALI-LIFE design review: one top-of-account entry; category navigation 2×2 on
mobile and four across on desktop; readable dates, detail panel, light/dark
themes, >=44px touch controls, visible focus and reduced motion. This cabinet
navigation does not redefine the earlier public service-icon grid requirements.
Combined implementation review found no P0/P1 security/data blockers after
fixes to conflict reload, blank draft title handling and ambiguous-create retry.
A collection-load race is also fixed with a generation guard and disabled retry
during writes. Designer identified light-theme LIFE text over the dark photo and
Admin hit-target/animation regressions; narrow fixes were verified and accepted.
Independent Designer final PASS covers LIFE Add-service and cabinet in light/dark,
390/1440px, plus final Admin controls/overlay bounds at 320/390/768/1440px.

## Current gates

| Gate | State |
| --- | --- |
| Founder authority and scoped handoff | Confirmed |
| Live revision/schema and rollback-source identification | Confirmed, read-only |
| New service model/API/UI | Implemented; own-publication projections, root-only writes |
| Astro combined check/build | PASS: 0 diagnostics, 95 pages |
| Astro full unit contract | PASS: 54/54 with actual bot Python renderer, no skipped parity test |
| Independent local security/data review | No observed P0/P1; static review, not a claim of external audit |
| Runtime backend | 259 PASS plus 19 subtests; all 13 PostgreSQL tests separately PASS |
| React TypeScript/unit/build/contracts | PASS: 30 unit + 40 build contracts; no bundle size warning |
| New LIFE integrated/browser flow | PASS: 14 component/integrated scenarios including actual Admin/Account/Mini routes |
| Astro browser | PASS: 141, 4 opt-in evidence captures skipped; all actual assertions passed |
| React broad browser regression | PASS in pinned Chromium; 8 opt-in evidence captures skipped; no functional assertions waived |
| Local isolated restore and migration U-D-U | PASS on exact runtime base; 42 existing tables unchanged |
| Fresh production backup/restore | PASS: checksum, isolated restore and U-D-U; 42 original tables identical; live schema still d7a2f9c4e816 |
| Exact scoped commits, push and CI | Runtime 61a05ce pushed: backend and bot jobs PASS; historical frontend fixture/toolchain repairs in progress; integrated frontend publication next |
| Deployment, route/health/FX/version smoke and rollback verification | Not done |

No customer-data write or message has been performed. The only server changes
so far are a private backup, restricted isolated restore DB and staging files;
no production schema or application activation. No external GPT Pro
review is claimed. Update this packet with exact candidate SHAs and results at
the next gate; never label pending/unexecuted checks PASS.

## Migration and rollback boundary

Additive revision `e9b3d7a5c201` follows `d7a2f9c4e816`; only the new
`life_services` table/index/ownership are changed. Migration SHA-256:
`92efcd9a382a35c0722525ebc581869b76d0edd326b02f7e3a7a79e3806f4c51`.
Application rollback retains this table and its records. Do not schema-downgrade
after client service data exists without separate destructive-action approval.
Preserve the runtime FX config's existing `0640 root:www-data` permission.

## Final local verification environment

Installed Comet 145 caused browser-internal unexplained reloads in automation.
Outbound CDP showed no app/Playwright reload request. A/B on the same build and
unchanged visa matrix: Comet 1/3 PASS; pinned Playwright Chromium 134 3/3 PASS
(18 viewport/locale flows). Final broad gates use pinned Chromium, matching CI.
No runtime workaround or assertion weakening was introduced for this issue.

Design follow-ups SHA256: country/no-JS
`c2a7e68284032d360a7af1e3aeab5112cb00823b0fcb8bda250f8f077dd6bbeb`;
contrast/hit targets `c21e31c6191a579a3c8ea45b9c80ce022f33887c191967ab73623cdd96a04b15`;
final editor targets `6c186da8ec518e83ea01988d0317aaa3a1894a989a76d19d0262302280bcd967`.
The append-only Astro contrast fix preserves previously removed audit-panel CSS.

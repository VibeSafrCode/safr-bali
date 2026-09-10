# BALI-AUDIT-20260905-E2 — visa publication and SEO

Status: READY_LOCAL / RELEASE_GATES_OPEN. Started 2026-09-09 on explicit Founder request
to proceed to stage 2. No push or production release is authorized by this entry.

## Independent boundary

E1 preserved as local commit `998595a` (full SHA in Git); branch for E2:
`codex/audit-20260905-e2`. E1's packet records its pre-commit checkpoint, not a
new claim of no local commit. E1 is still not pushed/deployed; its production
consumer/edge-policy gates remain. Preserve unrelated native package/lock files,
native shell and local artifacts. E2 introduces no backend or schema change.

## Scope

- A02/A03: one publication policy for every route/locale, independent of service
  availability; source-sensitive facts need fresh, content-bound evidence.
- A04: C1 and E33G source-checked bilingual pilot plus a limited comparison hub;
  fact-to-source links, actual check date, constraints in the production template.
- A05: sitemap/canonical/hreflang/JSON-LD parity; omit unknown substantive dates;
  lightweight per-page, localized, code-generated PNG social previews.
- A07 structural: typed visa article blocks and canonical price references,
  no render-time heading-based removal of commercial text. No pricing poller or
  canonical commercial value change; those E3 boundaries remain separate.

Do not label automated/source editorial checks as legal or human expert review.
No guaranteed processing time, grant, renewal, fees or tax advantage. Official
source fee/sponsor discrepancies are disclosed/omitted, not guessed.

## Verification plan

Pure policy transitions, expiry, content drift, dates and locale coverage;
all 46 source routes × 2 locales rendered robots/canonical/alternates/sitemap;
source IDs and checked content hashes; complete typed first blocks and no copied
SAFR price amounts; fresh build and repeated generators; representative mobile,
dark/light, no-JS, source-link and accessibility review. Existing browser/build
gates remain. No mass address deletion or automatic source re-verification.

## Source/freshness boundary

Sources: official Jakarta Pusat C1, Bontang E33G and Bengkalis stay tables.
Checked 2026-09-09, official page revision dates unavailable. Details and exact
URLs are in the typed content records. Source review due 2026-10-09. Static
publication policy evaluates at build: a deployed static artifact does not
automatically change robots when the deadline passes. Re-review/rebuild before
expiry is an operational release requirement, not an invented automated monitor.

## Implemented outcomes

One content-bound policy now controls all public localized robots, reciprocal
hreflang and sitemap. 46 base routes are preserved; see `E2_ROUTE_INVENTORY.md`.
C1/E33G/hub contain typed bilingual content, visible fact-to-source links,
limitations and real review dates. D12/D1-D2/VOA use neutral unreviewed text;
unverified claims are not copied from legacy bot paragraphs. Commercial prices
still come from the existing runtime projection; no price or order is changed.

All 92 localized routes have unique generated PNG social previews. Unknown
modification dates are omitted; the old blanket sitemap date is removed.
No-JS fallback has an actionable localized Telegram link, without sending a
message. Inline CSS is disabled at the Astro build boundary to preserve the
existing production CSP; the policy was not relaxed.
Typed editorial pages use instant native scrolling so rapid keyboard activation
reaches the cited source. Other pages retain existing smooth scrolling; no new
scrolling JavaScript or global motion redesign was introduced.

## Local evidence

Environment: isolated export of E1 commit plus exact E2 paths; original native
package/lock/workspace files were excluded and their SHA-256 values are unchanged.
Node 24.19.0, existing E1 frozen dependencies, no dependency upgrades or install
integrity bypass. pnpm's relocated-module auto-install was aborted; gates invoke
the same local Astro/Node/Playwright CLIs directly, not an unverified reinstall.

- Astro check: 58 files, 0 errors/warnings/hints.
- Build: 93 HTML documents including 404; 92 localized OG PNGs plus old fallback.
- Node policy/content/build suite: **45 PASS, 0 skipped**. Includes all 92 routes,
  18 sitemap URLs, current/expired/drifted/locale-sensitive real editorial,
  typed first-block preservation, source references, commercial separation,
  no inline CSS, OG dimensions/bytes, canonical/alternate/schema/date parity.
- Generators run twice: catalog, all three i18n runtime snapshots, historical
  pilot snapshot and sealed editorial source remain byte-identical. No generated
  review metadata was silently replaced or promoted to public authority.
- Independent source/policy review: all six RU/EN content hashes MATCH; PASS after
  sponsor/minimum-wording and explicit sensitivity corrections. The build uses
  one evaluation clock, including alternate projections.
- Designer: 36 route/viewport/theme combinations; zero editorial axe violations,
  overflow or broken citations. Keyboard links and six OG previews inspected.
  No-JS correction rechecked on all six pilot pages: PASS.
  A subsequent rapid Tab/Enter race was reproduced and corrected in the product;
  independent RU hub 320px/CSP retest and noneditorial Home control both PASS.
- Final Lighthouse assertions PASS on Home and Bali: performance 100,
  accessibility 100, best practices 96, SEO 100. These are local lab results,
  not production field metrics or a search-ranking claim.
- Final Playwright full regression: **133 PASS, 4 skipped, 0 failures** (5.9 min).
  The four skipped suites are opt-in all-route screenshot capture runs requiring
  `SAFR_VISUAL_OUTPUT_DIR`, not skipped accessibility checks. Independent E2
  Designer screenshots/matrix and the persistent CSP/no-JS tests did run.

The first full browser attempt exposed 13 CSP failures (118 passed, 4 skipped):
Astro had inlined the new small scoped stylesheet. This failed artifact is not
the candidate. `inlineStylesheets: never`, all-route markup assertions and new
  pilot CSP/no-JS regression tests correct the issue. A second full attempt had
132 PASS, 4 skipped and one new citation viewport failure: competing smooth
focus/hash scrolling. The final artifact fixes that rapid keyboard journey;
the test retains immediate activation and the viewport assertion (not a relaxed
delay-based pass). Initial local preview needed
the normal socket/browser sandbox permission; no production action was used.

## Artifact evidence (final local build)

Digest method for each extension: sort relative file paths with leading slash,
append a space plus each file's SHA-256, join rows with newline, hash that UTF-8
string. No machine-local paths or timestamps enter the digest.

| Artifact set | Count / bytes | SHA-256 |
| --- | --- | --- |
| HTML | 93 / 1105068 | `cb343fb2069fecf810e1714d92e9cf963585a747bf0fdf7be2937822d7ad92d3` |
| PNG | 93 / 3316348 | `76651c194b85c74efc9b19908268994c78edcb6a5f0c211332394a7f492a6d5a` |
| JS | 6 / 13867 | `c932a5526796ebad9a0bff58f0ebf194f370968f5bc62565d31e7d14c070daf9` |
| CSS | 2 / 43372 | `d8cb365ee8ed94348845254b7909f195c631925e94311daa70695741c45c75ce` |
| sitemap.xml (file bytes) | 18 URLs | `57a554749eb687d0b60acac5fc5c2d755ee4a8db0a251a177c93ce386c6568b9` |

## Safe release/freeze boundary

Exact local scope: 34 paths in `E2_RELEASE_PATHS.txt`, based on E1 commit
`998595adad5d3ef30085cf24f9f25c6aef108e47`. E2 is a separate local changeset;
do not treat an E2 artifact built on E1 as a tested cherry-pick onto older
production source. Preserve E1 frontend prerequisites. A source branch containing
both stages does not authorize deploying backend/React along with Astro.

No Git push, PR, migration, production release, customer-data mutation or client
message has been performed. Exact-SHA CI, explicit publication/release authority,
current/rollback resolution and production route/price verification remain OPEN.
E1's separate consumer/edge compatibility gates are not closed by these tests.
An approved Astro-only release must use its tested immutable artifact and leave
other production surfaces untouched; rollback restores previous Astro artifacts.

Residual P2: repeat source review before 2026-10-09; static expiry is operational,
not automatic. Remaining visa categories/legacy bot rule text need separate
source review. P3: source list padding is narrow but readable at 320px. E3 polling,
performance investigation and E4 account work remain NOT_STARTED; no new features.

Local implementation and its listed verification gates are complete. Safe to
freeze without starting later stages. Publication/deployment are not complete
and require their separate authority and evidence; nothing here claims that
production has changed. The final local commit is the Git commit containing this
34-path checkpoint, directly after E1; use its resolved full SHA for any approved
publication instead of a mutable branch name. Exact staged scope/private-path
scan/diff checks passed; all three preserved native file hashes still match.

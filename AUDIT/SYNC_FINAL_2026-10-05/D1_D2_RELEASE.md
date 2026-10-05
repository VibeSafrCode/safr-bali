# D1/D2 integration — scoped release candidate

> Final state: DEPLOYED / VERIFIED at `fe3d9570737f1684850ddb48d624c86476e8a9c7`.
> All four exact-revision CI jobs passed (run37377164391). Production catalog4,
> schemaa7 unchanged; final public proof and rollback details are in
> `PRODUCTION_RELEASE_fe3d957.md`. Candidate/HOLD statements below are history.

## Authority and sequencing

Founder authorized commit, push and production release of the completed C1/eVOA/
E33G sprint followed by D1/D2. The first boundary is deployed at
`ee7a5aeb9ac6c7f0db202762396a831ce0b47491`; see `PRODUCTION_RELEASE_ee7a5ae.md`.
This document records the D1/D2 candidate, not a claim that a push is deployment.
Production revision, catalog/FX and restore evidence are separate final gates.

## Exact imported content

Six independent families × ten locales: `d1`, `d2`, `d1_d2`,
`d1_d2_extension`, `knowledge_d1_d2_extension`, `knowledge_d1_d2_documents`.
Registry now contains 149 records; only three editorial identities were added.
The existing D1/D2 business identifier, service identifiers and canonical routes
are preserved. The hub covers comparison: no seventh D1-vs-D2 page is emitted.
Old separate extension drafts remain retained with an explicit merge target;
there is no automatic deletion or new redirect.

Full source JSON, bodies and expanded metadata are retained in
`shared/content/registry-copy/*_d1d2_20261005.{source.json,md,meta.json}`.
Supplied translations were not rewritten or shortened. Full localized SEO,
direct answers, fact blocks, every FAQ and all one-to-three CTA labels survive.
Authored Markdown two-space hard line breaks are retained byte-for-byte;
strict Git whitespace checking excludes only these hash-pinned source MD files.
Code, JSON, templates, tests and reports still pass ordinary whitespace checks.
`registry-d1-d2-build.v1.json` pins all 60 route/source revisions.
The prior SYNC14/140 build contract and original FX sources remain unchanged.
Package validator: 45,130 checks PASS, six negative self-test cases PASS.
Source MANIFEST SHA256:
`f577b8837a198578e534c2e25d3f51b599faddf98dfceb1e8d8f880042591de8`.

## Canonical pricing, not an authored second price list

| Product | One year standard / express | Two years standard / express |
|---|---:|---:|
| D1 | 5,000,000 / 6,500,000 IDR | 9,000,000 / 11,000,000 IDR |
| D2 | 5,500,000 / 7,000,000 IDR | 9,000,000 / 11,000,000 IDR |

Each D1/D2 extension stage is 2,500,000 IDR. Two stages total 5,000,000 IDR:
sum exact IDR first, convert once using the existing Decimal composition helper.
Five-year entries become explicit CONTACT/null/hidden-price quotes, never zero
or an independently fixed tariff. The narrow publisher requires the explicit
`--approve-five-year-contact` acknowledgement for only four known legacy states.

580 exact source-coordinate bindings, 420 authored USD tokens and 270 FAQ/fact
mirrors consume the existing canonical projection. Issuance and two extension
stages are different operations even when their amounts coincide. Shared
D1/D2 summaries fail closed when the two editable variants disagree; the bot
instead spells out both approved individual prices. Proof-of-funds USD is not
mistaken for a service tariff. HTML, SEO descriptions and FAQ schema use the
same catalog/FX versions and remove approximate USD immediately on expiry.
Delayed older publication responses cannot roll back accepted browser state.

Only EXACT/VERIFIED, positive, unique D1/D2 options qualify. Composition
publication, catalog, FX, formula and freshness fields must match the parent
projection. Legacy unrelated visa adapters remain unchanged. Indodax source,
ask-side conversion, nearest-$5 approximation, TTL and stale policy are reused,
not rebuilt. Existing order/case price snapshots and previous catalog rows
are immutable; publisher SQL write allow-list excludes order/client tables.

## Checks actually performed

- Full JSON/hash/lineage, old146 replay/idempotency, current149 and publication
  receipt contracts: 28 PASS, no fail/skip.
- Final Astro build: 295 HTML documents; 200 selected localized Registry pages.
- Astro Node contracts: 153 PASS, no fail/skip in the final full rerun with
  mandatory isolated bot Python runtime; real Python/JS price and TTL parity.
- Astro check: 141 files, zero errors, warnings or hints.
- Focused bot/registration/regression/locale checks: 111 PASS, synthetic settings.
- Backend D1/catalog/composition: 100 focused PASS; 33 final-clock checks PASS.
  Actual PostgreSQL CI remains a release gate, not inferred from local skips.
- Isolated local browser: 105/105 PASS, all60 pages at320px/light,36 desktop/dark,
  DE/ZH/HI/AR375, RTL table both edges, keyboard language control, admin-price
  edits and stale USD in body/SEO/FAQ, existing manager CTA without submission.
  Production CSP retained. No personal Chrome/Comet, autoplay or client message.
  Browser and owned HTTP server closed. 15 frames retained privately by hash.
- VibeDiz independently reviewed all15 supplied visible-area frames: PASS,
  no P0/P1, NO DELTA beyond the first-release 17 agreed design files.
  This is not full-page visual/WCAG/native-language/legal certification.

`registry-copy/d1d2_render_qa.json` is the separate SHA-pinned actual render
receipt. Supplied model QA browser/native/legal flags were NOT relabeled PASS.
Only after these checks did the six-family build become indexable with ordinary
canonical, hreflang and sitemap entries. Actual search-engine indexing is not
guaranteed or claimed.

## Safe production order and rollback

The first D1 candidate CI (`091a27d`, run37369842046) exposed one historical
next-stage fixture expecting ALL compositions unchanged when D1/D2 extension
rows were added: backend589 PASS/one FAIL/15 legitimate skips. No production
activation occurred. The scoped test correction explicitly retains five C1
amounts, checks two new5m compositions and restores all seven original values;
no pricing code, tariff or safety check was changed to satisfy the fixture.
The first transport also contained macOS provenance PAX metadata; it was held
for clean repacking, not activated. New exact-revision CI/artifact proof required.

CI at `378830f` first failed to acquire two hosted runners; a bounded retry
passed bot, backend and Next but exposed one historical editorial browser
assertion: it still expected the old bot heading on `/bali/visas/d1-d2/`.
The approved full Registry hub correctly rendered its supplied D1-or-D2 title.
The test now loads that hub through the actual Registry model and the existing
D1/D2 synthetic projection, retains all source/SEO/CSP/version assertions and
checks both initial prices. Production copy and pricing code were not changed.
150 other Astro browser cases passed; four manual visual-evidence skips remain
explicit. New candidate CI and exact artifacts are required, not inferred.

1. Exact scoped commit and green exact-revision CI; fresh Astro AND React builds,
   full artifact membership/hash review. Never reuse older frontend bytes.
2. Fresh private backup and isolated restore proof on existing schema
   `a7e4c9d2f105`. D1 adds NO migration. The preceding release's actual U-D-U
   proof remains historical, not falsely rerun or relabeled for D1.
3. Activate candidate backend (seven composition recipes); keep new bot stopped.
4. Existing FX refresh in a bounded fresh window, timer restored in every exit.
   Dry-run exact served/DB projection, review catalog hash/publication version,
   ensure all eight initial amounts (seven change, D1 two-year standard already
   matches9m), four CONTACT transitions and two extension
   rows through `app.scripts.publish_d1_d2_prices`. No seed/next-stage switch.
5. Activate immutable static artifacts, verify all six RU/EN bot-linked pages
   and catalog prices; only then start candidate bot. Verify exact source and
   both build IDs, health/schema/fresh authoritative FX and live route parity.

Retain previous source/static targets and private backup. Source/static rollback
must preserve current customer data, additive schema and published catalog.
If catalog rollback is required, publish the preceding immutable version via
existing audited Admin rollback after checking the version; never restore a
production database or silently change historical orders for cosmetic rollback.
No schema downgrade/drop, Cloudflare bypass or customer broadcast is part of QA.

## Residual limitations / nonblocking debt

P2: AR320 comparison uses horizontal scroll with an explicit hint; one column
may be visible at a time. Floating support may cover a lower-right text/button
edge while its label stays visible. Do not expand this release into redesign.
Supplied short bot summaries include terse answers without preceding questions;
approved non-price segments were preserved, not editorially reauthored.
Foreign bot templates are stored for future use; active runtime remains RU/EN.

The supplied `SOURCES/SOURCE_REGISTER.json` and `RESEARCH_NOTES_RU.md` state the
legal/source limits: D2 dedicated card403, relevant aggregated official sections,
nationality exceptions, interview/photo requirements, no guaranteed filing SLA,
no automatic180 days, no inferred90-day activation or unapproved E33G conversion.
Useful complete pages are not blanket-noindexed because of these limitations.
This release does not certify live filing availability or native/legal review.
YouTube key restriction/rotation and bare-root two-document performance94
remain preceding P2 observations; no credential appears in this audit packet.

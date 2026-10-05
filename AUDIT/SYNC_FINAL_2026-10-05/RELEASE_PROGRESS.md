# Release integration checkpoint — 2026-10-05

Founder explicitly authorized the scoped Git publication and production release,
in this order: finish C1/eVOA/E33G, then integrate the six D1/D2 pages. The earlier
local-only report is a historical checkpoint, not current release authorization.

## Current candidate, not deployed

- Published branch: `codex/safr-sync-release-20261005`; last pushed candidate:
  `b0a57e50773fc69c5409fbd71a81b495b609ae19`, with a scoped follow-up pending.
- This candidate's bot, Next/Vinext and frontend builds/contracts passed. Actual
  PostgreSQL CI found two stale test contracts; React browser CI found nine.
  Their scoped repairs are ready for another exact-revision CI run, not yet PASS
  in CI. Local replay of the nine React cases passed 9/9.
- The production activation operators have **not** been run. The last verified
  runtime baseline remains `61fb53569721711600ba513d1f56e42a90d07eb7`, schema
  `c8e3f7a1d502`. Retained static targets and rollback evidence remain untouched.
- Two exact candidate backup/restore and isolated U-D-U proofs passed. A new
  final source revision requires a newly pinned proof; prior evidence is not
  relabeled as a proof for another revision.

## Implemented follow-up

- A new-user notification sent to the principal admin includes
  **«Написать человеку»**. It enters the existing individual-reply FSM; only the
  next operator message is delivered. Callback actor, assigned-client access and
  owner-only restrictions are rechecked on submission. Observer/support copies
  do not receive new controls or new authority. Repeated `/start` does not send
  another registration notice. No real customer messages were used for testing.
- Registry manager contact has a native Telegram fallback without JavaScript.
  Native language links remain usable when JavaScript or picker modules fail;
  the enhanced dialog replaces them only after successful initialization.
- Responsive backdrop descriptors now match actual pixel widths. Only Vietnam
  derivatives were recompressed to meet the existing 230 kB transfer limit;
  approved image originals and day/night choices were preserved.
- Test expectations were reconciled with approved multilingual Registry copy,
  current native controls and six-country navigation. Missing sibling test
  imports were qualified; production backend behavior was not changed for them.

## Actual checks completed locally

- Backend: **534 passed, 76 subtests passed, 38 skipped**. PostgreSQL/proxy-only
  skips are not PASS and must execute in the release CI environment.
- Bot: **130 unittest cases passed**, plus **9 onboarding pytest cases passed**,
  using synthetic identities, an empty working directory and isolated settings.
- React application browser contract: **19 passed**, including aggregate dates,
  single-flight sends, access/credential fail-closed behavior, notification intent
  and idempotency. Disposable headless Chromium; no personal browser profile.
- Shared contracts: **21 passed** on the preceding candidate.
- Astro rebuilt **237 pages**; **128 Node checks passed without skips**, including
  actual bot-code parity. The isolated critical browser run passed **9/9** cases:
  native no-JS contact/language links, failed picker, unknown-language dialog
  geometry/CLS/focus, source-pinned RU/EN prices and narrow DE/AR layouts.
- Full CI browser runtime and unchanged Lighthouse thresholds remain separate
  gates. A collected test list is not a runtime PASS. The emitted policy `.mjs`
  requires explicit JavaScript MIME; the scoped Nginx candidate adds this without
  overriding inherited CSP/nosniff. Actual syntax and served headers remain gates.

## Asset-budget decision

The approved ten-language renderer and support/consent/picker/video modules make
the former pre-integration all-route aggregate budget obsolete. Measured preceding
build: 18 JS/MJS assets, 68,851 raw / 26,079 gzip bytes. The policy MJS asset is
included, not omitted from the budget. CSS: 157,708 raw / 27,496 gzip. No duplicate
vendor bundle. Actual final values remain below the approved caps.

Explicit integration caps: JS aggregate 75,000 raw / 28,000 gzip, individual
16,000 / 6,000; CSS aggregate 180,000 / 32,000, individual 155,000 / 26,000.
These are transfer-size caps, not a substitute for real Lighthouse results.
Lighthouse category thresholds remain unchanged.

The old Lighthouse page-transfer cap of 20,000 bytes predates these approved
modules. Explicit measured integration decision: page script transfer is capped
at 35,000 bytes (all 18 assets are 25,925 gzip bytes; measured cold EN wire
transfer is 32,974 bytes including protocol overhead; the cap adds 6% margin).
The home benchmark now measures explicit `/en/`, one actual document. The bare
entry's approved automatic RU-to-EN navigation remains covered by language tests;
its two-document cold run measured performance 94 and is retained as a P2
optimization observation, not relabeled as a 95 PASS. Accessibility/SEO/category
thresholds were not weakened. Final stable-document Lighthouse results remain
measured 99/100/96/100 on both stable documents; final exact-revision CI remains
the release gate. No-JS/native contact and asset source-size caps remain enforced.

## Browser follow-up awaiting final CI

Browser verification caught and fixed a real unresolved insurance import in
the support entry: Astro now processes/bundles it instead of emitting raw source.
A new emitted-module import gate catches this regression. Light legal-page theme
controls have contrasting inactive ink. Generic non-Bali service headings and
related links use the existing theme-aware glass surface; approved copy is unchanged.
The notification catalogue again explains the existing per-case client consent
boundary and separately staff reminders; policy/retry behavior is unchanged.
VibeDiz independently confirmed the visible AR320 12/14 million IDR price block
and LTR isolation, not the correctness of FX/legal claims/Arabic translation.

## Preserved invariants and remaining work

Indodax, Decimal conversion and nearest-$5 approximation are unchanged. The
existing bounded-stale derived-price deadline remains enforced; expired or
untrusted FX cannot silently display derived prices. Publication requires fresh
FX. C1 issuance is already 2,000,000 IDR in the current public catalog; initial
E33G remains 12/14 million per person. Existing orders are not repriced.

D1/D2: supplied package validator and self-test passed; six-page/ten-language
intake and deterministic price-occurrence mapping are prepared. Registry import,
canonical price bindings, rendering verification and publication are **not yet
complete** and follow the first release boundary. No second business service or
seventh comparison page will be created.

Final gates: green exact-revision CI, rebuilt immutable artifacts, final pinned
backup/restore proof, reviewed proxy/runtime activation, guarded extension-price
publication, static activation and real public revision/FX/route verification.
Native work, protected governance files, private sources, credentials and local
visual artifacts are excluded from these scoped commits.

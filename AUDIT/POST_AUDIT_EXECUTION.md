# Post-audit staged delivery

Updated: 2026-09-09. Baseline source: `c86671f831427fd4a396108ad1ee9fd493009fdb`.
This is an implementation plan and evidence register, not a deployment claim.

## Founder scope and independent release boundaries

Implement the supplied September 5 audit in four separately reviewable PRs.
Stage 1 also reconciles unfinished technical/release/documentation debt. Preserve
the independent native work, its package/lock/workspace files and local artifacts.
No rewrite of the Astro/React/FastAPI architecture. No silent changes to pricing,
referral economics, customer balances or protected-document availability.

| Stage / ID | Scope | State | Required exit evidence |
| --- | --- | --- | --- |
| 1 / `BALI-AUDIT-20260905-E1` | CI/toolchain and bot tests; production configuration and authorization safety; bounded DB readiness; release-blocking debt inventory and documentation reconciliation | READY_LOCAL / RELEASE_GATES_OPEN | Local suites passed; exact-SHA Linux CI, integration preflight, publication/release approval and deployed rollback/smoke evidence remain required |
| 2 / `BALI-AUDIT-20260905-E2` | One visa indexability policy, genuinely verified pilot, visible provenance/dates, sitemap | NOT_STARTED | Published HTML/canonical/hreflang/schema/sitemap agreement, source/editor evidence, no invented visa facts |
| 3 / `BALI-AUDIT-20260905-E3` | Bounded/deduplicated pricing requests, cache/proxy/service-worker correctness, responsive images and measured performance | NOT_STARTED | Outage/cache/privacy tests, production header evidence, measured browser/Lighthouse results |
| 4 / `BALI-AUDIT-20260905-E4` | Account Points history and referral QR, clear actions/copy, compact mobile readability within current visual identity | NOT_STARTED | Server authorization contracts, browser journeys, independent visual/accessibility gate |

Each stage ends at a verified safe checkpoint with its own file allow-list,
evidence, residual risks and rollback. It must not require unfinished code from a
later stage. A freeze stops after the current atomic verification; preserve WIP.
Completed stages may be published/released separately with the applicable
Founder authorization. Never equate local PASS, commit, push, deployment and
production verification. No migration is planned for E1.

## Internal triage of external findings

ACCEPT means accepted work, not a confirmed deployed fix. NEEDS_EVIDENCE means
the report alone does not establish the runtime fact. The original supplied
documents are preserved locally outside the public audit packet.

| Finding | Disposition / stage | Smallest change or boundary | Proof |
| --- | --- | --- | --- |
| A01 CI | ACCEPT / E1 | Official pinned pnpm installer; retain all existing gates; add isolated bot job | CI run `33761392380` confirmed failed frontend/reference jobs and passed backend; new run still required |
| A02 visa noindex | ACCEPT / E2 | Centralize publish/index eligibility | Build and rendered pilot contract |
| A03 thin routes indexed | ACCEPT / E2 | Apply same eligibility to all public route projections | All-route indexing matrix |
| A04 provenance invisible | ACCEPT / E2 | Render truthful source/review metadata | HTML and editorial evidence |
| A05 sitemap dates/OG | ACCEPT / E2 | Derive dates from real content state; align sitemap | Sitemap/canonical/content tests |
| A06 global pricing polling | ACCEPT / E3 | Mount only where needed; timeout/single flight/freshness | Browser/network/outage tests |
| A07 string-based price stripping | ACCEPT / E3 | Typed projection and honest unavailable/no-JS state | Same version/amount across surfaces |
| A08 empty secrets | ACCEPT / E1 | Fail-closed request guards and sanitized production validation | Empty/placeholder/missing-token rejection, safe defaults |
| A09 readiness | ACCEPT / E1 | Bounded probe, HTTP 503 unavailable, independent liveness | Failure, concurrency, timeout and actual DB restart recovery |
| A10 limiter/proxy | MODIFY / E1 security; E3 deployment headers | Bound in-memory state; do not trust arbitrary client headers; inspect deployment trust chain before changing infrastructure | Spoofing/cap/expiry tests; production proxy chain remains separate evidence |
| A11 cache/header inheritance | NEEDS_EVIDENCE / E3 | Inspect effective config/headers before adjustment | Real response/header matrix |
| A12 service worker | ACCEPT / E3 | Delete only owned caches; bounded/versioned cache | Foreign-cache preservation and update/offline tests |
| A13 account/QR | ACCEPT / E4 | Use existing server projection; clear feedback/errors | Authorized history/QR/clipboard/logout journeys |
| A14 referral economics | SEPARATE_DECISION | Do not enable levels 2/3 or change reward-rate fixation | Founder-approved economic specification and immutable-history tests |
| A15 Points service authority | ACCEPT / E1 local candidate | Reject service-supplied human actors before DB; bound/cursor-page ledger; preserve historic rows/economics | 11 boundary regressions; runtime consumer compatibility is a release gate, shared-principal redesign remains debt |
| A16 protected files | KEEP_FAIL_CLOSED | No activation without key custody, private storage, scanner, retention and restore/decrypt gates | Separate operational/security decision |
| A17 source/release debt | ACCEPT / E1 | Separate historic deployment and new candidate, scoped files, release-path evidence | Exact source/artifact/schema/CI/rollback manifest; no assumed main-branch parity |
| A18 minimal visual/images | MODIFY / E3 images + E4 UX | Preserve identity; no visual rewrite | Responsive/contrast/keyboard/motion review |

## Existing debt reconciliation

- Historical `CURRENT_STATE.md` release results remain historical evidence; they
  do not prove this new stage passes. Its prior `NOT_RUN` external-audit label is
  superseded by receipt and internal triage of the three Founder-supplied files.
  Independent reviewer identity and review methodology are not newly asserted.
- Native packaging, avatars, YouTube and unapproved product directions are not
  hidden dependencies of E1. Preserve them in the backlog, not in this release.
- Protected storage and referral-policy choices remain explicit separate gates,
  not debts that can be closed by cosmetic changes or invented configuration.
- Previously requested support-notification routing is not proven delivered.
  Do not solve recipient routing by granting every staff member all client data.
  Record exact-recipient authorization and safe routing tests before release.
- A release-blocking issue discovered during E1 verification belongs in E1;
  do not weaken a test or mark a skipped suite PASS to finish the stage.

## E1 evidence (local verification complete; not released)

- Baseline includes unrelated native package/lock/workspace modifications; clean
  source verification uses an isolated exported checkout, not those dirty files.
- Official pnpm action v4 resolved to
  `f40ffcd9367d9f12939873eb1018b921a783ffaa`; pnpm `11.9.0` retained, both
  frontend jobs now pin Node **24.19.0 LTS**. Node 22.13.1 reproduction exposed
  old glob/DEP0040 dependency warning semantics. No integrity/signature bypass
  or warning suppression. Wrangler's bundled legacy punycode remains P2 upstream
  debt; runtime choice does not claim that dependency was removed.
  References: <https://github.com/pnpm/action-setup>, <https://pnpm.io/installation>.
  Runtime evidence: <https://nodejs.org/en/blog/release/v24.19.0>,
  <https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisesglobpattern-options>,
  <https://raw.githubusercontent.com/nodejs/node/v24.19.0/doc/api/deprecations.md>.
- Bot CI uses synthetic tokens and an unreachable loopback backend; no customer
  messages, credentials or production API calls are required.
- New candidate is not committed, pushed, deployed or production-verified.

### Verified local checkpoint

- Backend isolated PostgreSQL 16: `alembic upgrade head`, then complete
  `pytest -q` with `SAFR_TEST_POSTGRES_URL` and `BALI_TEST_POSTGRES_BIN`:
  **212 passed, zero skipped** after Points, real proxy boundary and readiness
  callback-leak changes (final complete run 134.23 seconds).
  The test clusters and disposable Nginx/Uvicorn processes were stopped/removed; no
  production database was used. Local Python 3.9 is not proof of CI Python 3.12.
- Bot clean-source unittest suite: **83 passed** with synthetic tokens and
  loopback-only backend URL.
- pnpm `11.9.0` official tarball checked against registry SHA-512 integrity;
  frozen installs passed in a separate source export. Shared **10 passed**,
  React **19 unit passed** plus type/build/contracts, Astro **27 passed**, zero
  Astro diagnostics and **93 built pages**. Local Node `24.19.0` now matches
  the selected CI version; Linux and remote exact-commit verification remain
  necessary (a local macOS pass is not a fresh GitHub run).
- Astro final Node `24.19.0`: **31 unit/build contracts**, zero diagnostics;
  browser **131 passed, 4 explicitly skipped opt-in screenshot modes**,
  including 22 language-stability/accessibility scenarios. A separate full
  Node `22.13.1` browser run had the same result.
  Do not count those four as verified visual evidence.
- Reference Next/Vinext exports completed with semantic parity. Initial stale
  47-route assertions, old `/directions → /catalog` expectation, missing public
  build origins and missing direct `tsx` dependency were repaired. Actual
  reference manifest has 49 routes including both previously added guide pages;
  no routes or redirects were changed. Static **39 passed**, unit **11 passed**,
  typecheck and ESLint passed on the isolated candidate.
- React full initial browser run: **90 passed, 8 skipped, 3 failed**. Two failures
  were 15-scenario aggregates exceeding one 30s budget; split into independent
  tests without removing assertions. Third was an outdated pricing fixture
  after TASK072, then an ambiguous page-wide label. First targeted retest:
  **36 passed, 1 failed** (ambiguous label); active-dialog scoping then passed
  the final Admin matrix (**1 passed**, all 12 combinations, 1.2 minutes).
  Subsequent complete candidate run: **121 passed, 8 skipped**, no failures.
  React typecheck, **19 unit + 40 build-contract tests** and production build
  also passed on exact Node `22.13.1`/pnpm `11.9.0`. No product UI assertions
  or global timeouts were weakened.
- Workflow YAML parsed; all four jobs present. New readiness cluster test is
  explicitly enabled in CI rather than silently skipped. No fresh GitHub run
  has been triggered for this uncommitted candidate.

### Gate history and remaining release conditions

- Initial local Lighthouse **FAIL** (Home **0.87**, Bali **0.84**, required
  **0.95**) was reproduced: delayed language script moved main by 170px.
  The same tiny same-origin language script now executes before first body paint
  and delegates button events immediately; the existing in-flow layout is kept.
  This trades a small paint-blocking asset for deterministic geometry, without
  an extra asset, inline CSP exception, overlay, auto-navigation or JS-only links.
  Approved existing JPEGs use Astro's build-time responsive WebP outputs via
  explicit pinned Sharp; source artwork is unchanged. Four responsive-media
  regressions pass. Broader E3 image/polling/cache work has not started.
- Recheck **PASS**: Home/Bali performance **1.00 / 1.00**, accessibility **1.00**,
  best practices **0.96**, SEO **1.00**; CLS **0 / 0.009**, LCP **1.26 / 1.66s**.
  These are local Node 24 lab results, not field Core Web Vitals or production
  proof. Independent visual review covers light/dark 320/390/1440, keyboard,
  saved locales, no-JS/failed asset/storage, delayed-script stability and axe.
  Zoom-equivalent viewport is not claimed as a real browser-UI zoom test.
- Final complete Node 24 build→browser→Lighthouse run also **PASS**:
  Home/Bali performance **0.99 / 0.98**, accessibility **1.00 / 1.00**, best
  practices **0.96 / 0.96**, SEO **1.00 / 1.00**, CLS **0 / 0.00903**,
  LCP **1.56 / 1.85 seconds**. Threshold remains **0.95**. These final local
  measurements supersede earlier lab numbers for the release packet; no field
  performance or production rollout is implied.
- Exact Node 22 reference run exposed dependency `DEP0040`/experimental runtime
  warnings. Independent trace identified bundled Wrangler whatwg-url and Vinext
  native glob. Both CI jobs moved to official Node 24.19.0 LTS, supported by
  installed engines. Final complete reference run passed: **39 static + 11 unit**,
  both 49-route exports, semantic parity, typecheck, ESLint, zero-warning gate.
  No warning is suppressed and the assertion is unchanged.
- The Founder places release-blocking unfinished debt in E1. Therefore do not
  call E1 releasable until the failed gates are resolved and re-run. The broader
  E3 polling/cache/proxy/image program remains separately staged; no thresholds
  were lowered and no failed checks were removed.
- Private read-only preflight: current production checkout remains
  `d9f23291dffe00b40c6b5ef350664ad82b33e0f3`; backend/bot/Nginx active.
  Candidate validator passed with effective backend process environment;
  only booleans/allow-listed network settings were returned, no secrets.
  Nginx is loopback-only `127.0.0.1:8081`, API `127.0.0.1:8000`;
  no real-IP restoration is configured. Uvicorn's loopback trust normally
  resolves the last nontrusted XFF hop, so API-wide client collapse is not
  proven; Nginx's own per-IP zone still sees the tunnel. Candidate config now
  restores real-IP at those three server-scoped loopback boundaries and replaces
  XFF in all 11 proxy locations. **7 proxy tests pass**, including actual
  disposable Nginx→Uvicorn, IPv4/IPv6, hostile XFF, malformed/missing CF fallback
  and independent per-visitor budgets. CI explicitly enables Nginx tests;
  production edge-policy/activation/rollback verification remains OPEN.
  Local Nginx 1.30.4 was compiled only for synthetic tests from official HTTPS
  source (SHA256 `4261dc90e9e47c1c4041276e9aaa3d48ebe2e664f728e14fa95ae6c67d57a08b`);
  detached signature was not verified; no global installation or production
  upgrade is implied. CI uses its own packaged Nginx with realip module.
  The entire canonical Nginx configuration also passed isolated `nginx -t`,
  separately from the extracted proxy behavior tests; no service was started
  by this syntax check.
- A15 candidate: all non-null service human actors return `422`; ledger is
  bounded/cursor-paged with `{items, limit, next_cursor, has_more}`. Full backend
  suite includes new boundary/idempotency/history/isolation tests. See API Spec
  for historic replay behavior and **breaking envelope compatibility**.
  Repo consumer search is negative, not proof that external scripts do not
  exist. No service privileges expanded and no customer/economic data changed.
  Shared service identities/scopes and legacy admin-token order actor remain
  architecture debt. Protected files/referral economics are separate decisions.
- Final independent review found/fixed a readiness retention bug: per-request
  `wrap_future` callbacks survived timeouts against a stuck concurrent Future.
  Callback-free polling (25ms, capped by deadline) retains one daemon probe and
  adds at most 25ms observation delay. Regressions cover 150 timeouts, 20 cancels,
  five closed event loops and later recovery with zero retained callbacks.
  A forever-stuck system call remains fail-closed until unblock/process restart.
  Focused **10 passed**, then final complete **212 passed** as recorded above.

### Preserved safe point

Candidate edits remain local; read-only production preflight made no changes.
No push, PR, commit or deployment has been made. Local implementation and
verification are complete; the release stage is not COMPLETE. Resume by
reconciling the 49-path allow-list in `E1_RELEASE_PATHS.txt`, obtaining the
publication gate and fresh exact-SHA Linux CI, then resolving consumer/edge
policy compatibility and the separate production release gate. The handoff is
`E1_RELEASE_PACKET.md`. Do not infer release authority from local test success.
Stage 2–4 implementation has
not started. The three original audit files were copied into the ignored local
project inbox and each copy's SHA-256 matched its supplied original before the
Founder was told the Downloads copies could be removed.

## Freeze / resume / release checklist

1. Record stage, source revision, exact changed paths and test results (including
   skips/failures), without secrets, PII or machine-local paths.
2. Preserve independent WIP. Do not mix later-stage changes into the stage PR.
3. Before production activation, check configuration compatibility privately,
   confirm current rollback artifact/config, obtain the release gate and use the
   runbook. A stricter validator can intentionally prevent unsafe startup.
4. Verify source/artifact revisions, schema (unchanged for E1), liveness,
   readiness, unauthenticated boundaries and representative routes. No customer
   writes/messages as smoke tests.
5. Freeze safely here or start the next authorized stage. Never describe all
   four stages as complete because E1 is locally verified.

# Client copy cleanup and approximate dollars — 2026-09-15

Founder explicitly requested complete removal of customer-facing audit panels,
approved the original visa hub, selected the former nearest-$5 reference display,
and authorized read access to `config.py` only for the FX service identity.
No new visa/legal content is authored or certified by this correction.

## Changes and invariants

- Public hub/detail/guide rendering excludes comparative audit panels, review
  status/expiry notices and source/limitations blocks. Archival audit records
  stay in source as evidence but cannot replace approved copy or close indexing.
- Original localized hub summaries plus all six complete RU/EN bot descriptions
  and three approved disclaimers are preserved. Hub approval is version-bound;
  unexplained changes stop a candidate build. All fourteen localized visa
  hub/detail URLs remain indexable; eligible sitemap count remains 26.
- One API field `display_usd_approx` is computed with Decimal directly from
  IDR / accepted USDT-IDR ask, HALF_UP to nearest 5. It is an approximate dollar
  reference, not a fiat USD quote. Formula identifier:
  `IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1`.
- Bot, public site, Mini App/web cabinet and Admin preview consume that field
  without independent conversion. Existing exact two-decimal `display_usdt`,
  its formula identifier, IDR catalog and immutable order snapshots are unchanged.
  No old ticker/three-day cache/fixed eVOA dollar override is reintroduced.
- Source remains accepted Indodax sell-depth VWAP for 2,000 USDT. Existing
  freshness, anomaly and override guards remain in force. Expired projections
  and previews hide both derived references, retaining IDR; missing new fields
  on older backends safely render IDR only.

## Production FX repair (executed independently of code release)

The timer had failed since September 13 because `config.py` was root-only.
The file was verified byte-identical to the deployed Git source. The authorized
repair grants read access to the sole `www-data` service group (0640), retains
root ownership, denies unrelated users, and leaves file content, `.env` metadata
and all other permissions unchanged. The initial refresh and subsequent
automatic timer cycles passed, publishing LIVE FX versions 16960–16963;
catalog version 1 and IDR prices were unchanged. No manual rate was invented.

## Verification and release gates

Local backend catalog: 30 passed; bot: 88 passed with backend URL disabled;
Astro contract/unit: 54 passed, no skips, including real bot parity for 60
complete localized/scenario messages. React typecheck, 21 unit and 40 build
contracts passed. Targeted mobile/strict-CSP and independent visual gates are
recorded after completion. No customer messages, migration or data edits.

The deployed backend/bot baseline differs from the frontend branch. Release
only the three changed runtime modules on a branch from deployed `2da3e4c`,
not the frontend branch's unrelated backend history. Preserve the FX access
repair, production environment/runtime data, static rollback roots and old
fingerprinted assets. Exact commits, CI, archives and live verification follow
below only after execution; local PASS is not deployment evidence.

## Released and verified

- Frontend source `69959204be204e6de11e1572804ceef04a61e4c4`, pushed to
  `codex/visa-client-copy-fx-20260915`; [exact-source CI 34966141592](https://github.com/VibeSafrCode/safr-bali/actions/runs/34966141592)
  passed all four jobs, including full browser and Lighthouse gates.
- Runtime source `7283caceb7862ee8bc65637306fcfd87761ebd32`, pushed to
  `codex/visa-dollar-runtime-20260915` from deployed `2da3e4c`. Only three
  runtime modules plus five test files changed. [Runtime CI 34966146896](https://github.com/VibeSafrCode/safr-bali/actions/runs/34966146896)
  passed backend/PostgreSQL and bot jobs. Its two unchanged historical frontend
  jobs failed at old Corepack signature verification; they are **not PASS** and
  no frontend artifacts from that branch were deployed. Actual frontend source
  has the fully successful run above; package verification was never bypassed.
- Runtime-baseline local verification: backend catalog 30, support copies 23,
  full bot 114 passed (including 26 preserved support/reply/locale regressions).
  Targeted Astro browser 4/4 passed; independent Designer gate passed for
  320/390px hub/detail screenshots. Final Astro check: no errors, warnings or hints.
- Both static roots now use immutable `visa-client-69959204be20` artifacts.
  300 files verified; 60 old fingerprinted assets retained. Archive SHA-256
  `6d0e0eb5fafef2721aa434b41191294b5eba345ce448701012d57ae62e2d1dcc`;
  tree SHA-256 `85ec8faa4cf21265ed32a05ff7be4be5540e3353eb62aed3f98011d781722c42`.
  Rollback remains public `visa-copy-9d6303186dd9`, React `design-eb21921750c0`,
  runtime `2da3e4c`; restored FX service access is retained through rollback.
- Private pre-release database backup checksum
  `10bfa74fa4ba5889ee87a4412f0fbc9ffb464af84a957cf36cce1ec97dd48d35`;
  isolated restore verified schema `d7a2f9c4e816`. The restored copy is retained
  on the server with connections disabled. No production migration, database
  restore, client-data edit or synthetic customer message occurred.
- Origin/bare-public exact HTML and 23 referenced asset byte checks passed;
  app/account/Admin/PWA build-version artifacts match. All 12 localized visa
  descriptions and two hubs passed live browser checks; text/disclaimers match
  the bot, audit panels are absent, prices are visible and no overflow/script/CSP
  errors were found. Search crawl/indexing eligibility is preserved, not proof
  of search-engine inclusion. Cloudflare's unchanged managed robots prefix is
  verified separately from the exact origin suffix.
- Public and app domains returned identical projection `v16978`, catalog 1,
  FX snapshot 16979: all 20 priced items matched both unchanged exact USDT and
  nearest-$5 formulas. At that observation E33G was 12,000,000 IDR / approx $680
  and 14,000,000 IDR / approx $795. These are timestamped evidence, not fixed rates.
  The deployed bot's pure render passed 40 tier/locale comparisons using the next
  accepted projection/FX snapshot 16980, with zero messages sent. Admin/Mini UI
  parity is supported by exact deployed artifacts, shared API and isolated tests;
  no authenticated customer session was created for production smoke.
- Final runtime/static verifiers passed, checkout is clean, unchanged catalog
  IDR fingerprint and environment/config metadata matched the private checkpoint.
  Backend, bot, proxy, tunnel and FX timer remained active; automatic FX advanced.

Execution notes: the first activation rolled back safely because a generated
local browser-verification script contained a quoting error, not because the
published product failed its HTML/asset checks. The script was corrected and
syntax-checked. A later SSH handshake timeout occurred before any remote action;
read-only state checks confirmed the safe baseline. The final activation and
all mandatory live gates passed. No failed gate is counted as a successful run.

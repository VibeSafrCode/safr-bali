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

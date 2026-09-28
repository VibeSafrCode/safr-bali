# BALI-UX-ONBOARDING-20260928 — runtime local proof

Local implementation only. No Git publication, production migration, customer
messages or scenario activation. Last recorded production runtime b67c078; current
local baseline36e815a includes docs-only changes. Unrelated life-release draft retained.

## Behavior

Only genuinely new trusted Telegram registration events after scenario activation
qualify; no existing-user scan/backfill. Disabled scenario and historical-store
verification flag default false. Preserve original event/time/payload durably and
retry registration after outage without asking the client to repeat /start.

After15minutes send exact approved welcome in at most2 losslessly split parts,
at a paragraph/section boundary. Freeze published welcome AND question for chain.
One hour after confirmed last welcome part send question with «да» and
«написать менеджеру». Callback actor identity verified; help notifications target
configured numeric recipients, with narrowly scoped help-specific reply permission.
Owner-only restrictions and active/current recipients remain enforced.

Dedicated delivery ledger, leased claims, idempotent acknowledgement, bounded
registration retries, durable confirmed-send receipts. Replay receipts, never
blindly resend an ambiguous Telegram send. Same-token late-positive receipt can
resolve an expired claim and creates each next message once. Disabled/re-enabled
scenario epochs suppress old pending chains. One polling process per bot data
directory is enforced with a process lock; JSON stores are not multi-host storage.

Root-only draft/preview/publish/restore/toggle API with existing Origin/CSRF guards,
revision conflicts and immutable versions. UI lives in frontend settings/notifications.
Source seeds in app/data match Founder text; no wording changed.

## Actual verification

- Exact pinned dependencies installed in isolated temporary environments from
  official PyPI.19backend relevant pins and4bot pins verified; pip check PASS.
- Backend12focused tests PASS, bot9focused tests PASS.
- PostgreSQL16.14:4focused tests + updated balanced-split test PASS.
- Migration a9c28b017d60 follows f2c8a4d6e901: upgrade→pristine-only
  downgrade→upgrade, row/revision preservation when refusal, concurrent claims,
  duplicate settlements and settle/disable race PASS.
- PostgreSQL baseline: current Base metadata minus4onboarding tables, stamped
  prior revision, not the entire historical migration chain. Synthetic users only,
  private Unix socket, no TCP; test cluster stopped after verification.
- Independent review caught registration-provenance loss and sent-receipt loss;
  fixes passed recheck. Final background retry/process-lock and migration guard
  source recheck closed with no new P0/P1 findings.

## Publication / activation checklist

Separate Founder release authorization required. Reconcile production source/schema
and preserve existing dirty work; private backup + restore proof before upgrade.
Preserve deployed source modes (Git checkout022, config.py explicit0640 exception,
no changes to secret modes) to keep FX reader operational.

Verify full historical Telegram/local registration stores before enabling
ONBOARDING_REGISTRATION_HISTORY_VERIFIED. Do not infer this from fresh PostgreSQL
rows alone. Publish approved content then enable scenario only for future events.
Perform an authorized test-chat check without messaging existing customers.
Verify deployed revision/schema/health/auth/FX freshness afterward.

Rollback: disable scenario, preserve populated ledger/versions/history, roll back
application only with compatible schema. Migration downgrade acquires exclusive
locks and refuses ANY edited state or populated history; only untouched disabled
seed may be removed. No production downgrade authorized by this proof.

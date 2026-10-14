# Send-only Yoga main transport

This component is prepared for the next **joint site/Yoga release**, not a separate activation. It reuses the existing main-bot Yoga bridge and does not start `app.main`, a Dispatcher, Telegram polling, onboarding, referral backfill, the generic website outbox, visa notifications, or service reminders. No existing runtime source is changed.

## Ownership and private configuration

Primary must verify the live main process is still `YOGA_CHANNEL_ENABLED=false`, the deployed staff callback handlers support Yoga conversations, and backend policy matches the existing authorized staff/support lists. Do not restart main to enable this component. `YOGA_TRANSPORT_OWNER_MODE=standalone-main-disabled` is an operator-confirmed prerequisite, **not a live introspection proof**. Never turn on the main-process Yoga bridge while this worker is installed/enabled. Backend leases remain authoritative; the local file lock prevents two standalone workers sharing this unit's state directory, not every possible process on the host.

Create a separate root-private `/etc/safrway-yoga-transport/runtime.env` through the existing closed deployment flow. Do not copy a raw main `.env`, expose values in logs, Git, commands, or audit packets. Snapshot only the following reviewed fields, including explicitly empty lists. Use the main bot's token and backend **main transport** service credential, not the distinct Yoga polling token/credential.

- `BOT_TOKEN`, `BACKEND_SERVICE_TOKEN`: existing nonempty closed credentials.
- `BACKEND_API_URL`: the verified loopback origin, HTTP `127.0.0.1` or `[::1]` with an explicit port, no path/query/userinfo.
- `ADMIN_CHAT_ID`, `MANAGER_CHAT_IDS`, `VISA_ADMIN_CHAT_IDS`, `SPB_MANAGER_CHAT_IDS`, `THAILAND_MANAGER_CHAT_IDS`: exact existing positive-ID allowlists, no additions.
- `SUPPORT_CHAT_IDS`: exact existing read-only support list, not the new Yoga-specific observer. Preserve existing overlaps without adding/removing access; backend fanout subtracts staff and the reused bridge rejects an overlapping recipient when presented as an observer.
- `YOGA_CHANNEL_ENABLED=true` **only in this isolated snapshot**.
- `YOGA_TRANSPORT_OWNER_MODE=standalone-main-disabled`.
- `YOGA_TRANSPORT_STATE_DIR=/var/lib/safrway-yoga-transport`.
- Do not enable onboarding history or populate Mini App settings; these are forced false/empty before importing the existing configuration.

The provisional Yoga observer stays in the private **Yoga runtime/backend Yoga-observer setting**. It does not gain main-bot support/staff access. An unconfirmed `/start` remains a delivery limitation, not a reason to expand allowlists or declare delivery success.

The unit's private state directory must exist, be owned by its dedicated user, and be exactly mode0700; systemd `StateDirectory` prepares it. No `.env` (even a dangling symlink) may exist in it. The runner changes to that directory before lazy importing existing settings, avoiding source-checkout dotenv fallback. The lock is a mode0600, single-link, no-symlink file in this directory, with an exclusive nonblocking flock. It is retained, never unlinked on stop. Do not create multiple alternative state directories to bypass ownership.

## Packaging / activation gates

`deploy/safrway-yoga-main-transport.service` is a template with declared `/opt/.../current/bot`, isolated venv, service account, private env and state paths. It is not installed or started by the source file. Primary must materialize exact artifact/dependency hashes, preserve rollback and permissions, verify the account/paths/systemd version, and test the actual Linux unit in the jointly authorized release. Do not use the main process's live source/data directory as this worker's writable directory. Do not enable this unit through an automatic source import.

`python -m app.yoga_main_transport --check-config` validates only a supplied private process environment/state directory. It makes no imports of existing runtime dependencies, no Telegram/backend request, no lock file or delivery. Its exit0 is **not** proof of live main ownership, credential validity, backend feature, schema, recipients or delivery readiness.

Actual activation requires the separate Yoga poller, backend feature/schema/private policy, this send-only staff transport, and existing main staff reply handlers to have compatible pinned revisions. The worker accesses only existing Yoga claim/settle endpoints and Telegram send_message through the bridge; it does not run getUpdates/deleteWebhook/getMe. No tests should send existing customers a message. Use approved owner-controlled synthetic traffic for served proof.

## Stop and rollback

SIGTERM/SIGINT sets the stop event, cancels the one bridge, waits up to20 seconds, and explicitly closes its Bot session. systemd kills the isolated control group after30 seconds if shutdown hangs; uncertain in-flight sends retain the bridge/backend's UNKNOWN/lease-expiry safety rather than being resent by the runner. A worker exception closes the session and exits nonzero with a constant sanitized log code. Config/ownership rejection prevents retry bursts; operational crashes have bounded restart pacing.

Rollback is **stop-only** for this unit and the separate Yoga activation according to primary's joint-release checkpoint. It must not restart main, restore an unguarded startup, change referrals, clear delivery ledgers, replay unknown sends, reset Telegram offsets, or delete the lock/receipts. Disable backend Yoga intake/claims first when required to stop new work. Re-enable only the pinned reviewed artifact after preserving actual delivery state.

## Evidence boundaries

Offline lifecycle/ownership tests use synthetic environments, private temporary directories and fake Bot/bridge boundaries. They do not prove Telegram receipt, production configuration, backend DB behavior, installed systemd restrictions or live observer `/start`. Existing `test_yoga_chat_bridge.py` and backend channel contract suites still apply to the reused transport. Primary owns integration, joint publication and real served verification.

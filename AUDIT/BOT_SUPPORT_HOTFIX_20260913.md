# Bot response and support notification hotfix — 2026-09-13

Status: DEPLOYED / VERIFIED; GitHub integration merged.
Scope: BALI-HOTFIX-20260913-BOT. Based on production `d9f23291dffe00b40c6b5ef350664ad82b33e0f3`.
This is not the combined audit E1/E3/E4 release. No frontend, Cloudflare, schema,
pricing, client identity, role, assignment, or native changes are included.

## Confirmed causes

- The designated support account is configured as a general bot manager only;
  visa and regional routes have separate recipients. The active backend account
  and current Telegram username were matched through read-only checks.
- Visa lifecycle events use recipient-specific database outbox rows, not the
  bot manager lists. No historical visa row targeted the support account.
- Every bot update awaited a locale HTTP lookup (up to five seconds). Reply
  callbacks acknowledged only after additional I/O; successful replies waited
  for the history mirror before operator confirmation. Recent server evidence:
  six of fifteen handled updates exceeded five seconds (6.7–22.4 seconds).
  Locale/history HTTP timeouts and transient Telegram polling failures occurred.
  Current health and locale probes returned HTTP 200 in 5/4 ms respectively.

## Implemented boundaries

- `SUPPORT_CHAT_IDS` is an explicit notification-observer list in both runtime
  configurations. It is NOT a role grant and is not added to staff ACL lists.
- Operational registrations, technical requests, enabled activity alerts,
  ordinary client requests and staff responses are copied. Existing owner-only
  complaints, restricted dialogs and internal-only notes remain private.
  Copies to unassigned support accounts have no reply/history/document controls.
- New published/updated/manual visa notifications create independent staff
  delivery rows in the same database transaction as the client row. Each copy
  has its own dedupe key, lease and outcome. No blind retry of `UNKNOWN`.
  Support removal/inactivation suppresses pending copies before claim.
- Contact reminders include designated support once, without granting case
  access, and do not backfill already-attempted old plans. A support account
  does not receive a second copy of its own client notification.
- Website outbox results preserve per-recipient success/failure/uncertainty.
  Observer success never creates a staff assignment. Partial failure is not
  recorded as complete delivery. Manual whole-message retry rejects a report
  containing successful or uncertain sends to avoid duplicating client messages.
- Reply callbacks acknowledge promptly; web conversation authorization remains
  mandatory and has a two-second lookup deadline. Telegram reply confirmation
  precedes secondary history synchronization and old-notice cleanup.
- Locale lookups: 750 ms cold deadline, 60-second confirmed-value TTL,
  two-second unavailable retry interval, bounded 2,048-entry LRU. Successful
  language changes invalidate immediately; no detached background tasks.

## Verification and release requirements

- Isolated fixture-only bot and backend tests; no test sends to real clients.
- Focused tests cover recipient dedupe, independent settlement, removal,
  self-notification, no historical backfill, unchanged ACLs, owner restrictions,
  reply ordering, locale timeout/cache races and partial web delivery.
- PostgreSQL race tests must be distinguished from SQLite-local verification;
  skipped tests are not a pass. GitHub bot and backend jobs are release gates.
- Before activation: exact clean production SHA, private DB/runtime/config
  backup with checksums, isolated restore verification, same verified support
  IDs in both environments, unchanged schema and static symlinks.
- Deploy only this production-based hotfix SHA, not the audit integration tip.
  Restart backend and bot; do not run migrations, materialize old reminders,
  replay queues, or send client test messages. Read-only health/config/identity
  and runtime verification after restart. Preserve rollback source and configs.

## Residual limitations

- Telegram outages/flood control can still delay or prevent external delivery.
  This change removes avoidable application waits, not network failures.
- Plain bot operational copies log failures but are not a durable retry queue.
  Visa copies use the durable per-recipient queue. Legacy website outbox does
  not provide transactional per-recipient leases; uncertain/partial delivery
  requires review, not automatic resend.
- Support is a notification observer; opening newly copied private dialogs or
  Admin cases still requires a separately authorized role/assignment.
- Historical notifications are not replayed by configuration activation.

## Rollback

Stop the bot; restore the backed-up bot/backend environment files, checkout the
recorded prior production revision, restart backend then bot and verify health.
No database restore or downgrade is needed: this release adds no schema and
uses existing delivery fields. Preserve any new delivery rows and send outcomes;
never erase them or requeue delivered/unknown client messages during rollback.

## Completed release evidence

- Production source: `2da3e4c20b828c6fddaafd94543c6090e1e0865b`;
  backend/bot restarted 2026-09-13 13:19 UTC. Working tree clean.
- GitHub PR #7 merged as `6245994f1c715d49d4bc2b7f52ab9578c2bc7bee`.
  This integration revision also contains still-unreleased audit work and was
  deliberately NOT deployed wholesale.
- Local bot: 109 tests passed. Local backend: 196 passed, 11 PostgreSQL-only
  skipped. Exact hotfix source CI run `34759184143`: bot passed; backend with
  PostgreSQL 207 passed (no skips). Its two frontend jobs failed at the inherited
  old pnpm bootstrap, before running frontend tests. No frontend artifacts were
  built or changed by this bot release; these failures are not described as PASS.
- Full integration PR CI `34759307194`: SUCCESS, all four jobs passed, including
  Astro/React/browser/Lighthouse, reference parity, bot and PostgreSQL backend.
- Private database/runtime/environment backup checksummed; full isolated
  `pg_restore --exit-on-error` succeeded, restored schema verified. The retained
  restore DB has connections disabled; no production database restore occurred.
  Database dump SHA-256:
  `7b6849cdd7b852cf33342acf78571800e184658318e8b1974b50d404bf7bb935`.
- Exact production schema remains `d7a2f9c4e816`. Nginx checksum and both static
  release symlinks unchanged. Both services active, polling started; post-release
  journals: zero errors/tracebacks, 80 observed backend HTTP 200 responses.
- Bot/backend observer configuration parity and active support account identity
  verified. One neutral service-check message to designated support was accepted
  by Telegram and recorded privately as DELIVERED. Zero client test messages;
  no historical visa events replayed, roles/assignments or client data edited.

## Dependency for the deferred audit release

The previous production base `d9f2329` is now superseded by this hotfix. Old E3/E4
activation scripts and the staged `a70c9d3` backend must not be used unchanged:
they would lose this fix, and old backend settings do not accept the new observer
setting. Reconcile the new production checkpoint, incorporate PR #7 in the next
backend candidate and revalidate paired source/config rollback before resuming
that separate release. Cloudflare/purge gates remain separate and unresolved by
this hotfix. No existing artifacts or unrelated WIP were deleted.

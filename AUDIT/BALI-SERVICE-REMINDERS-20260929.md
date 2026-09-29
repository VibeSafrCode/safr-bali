# Service reminders and business settings — local integration

Date: 2026-09-29. Local implementation only. No Git publication, production
migration, deployment, activation or client messages performed for this change.
Unrelated native/artifact/governance WIP is preserved.

## Founder request and limits

- Full confirmed service duration >100 days: remind at 40, 30, 15, 7, 3, 2, 1
  days before expiry. A 100-day service belongs to the short group.
- Short and monthly services with an explicit end date: 15, 7, 3, 2, 1 days.
- Visas, housing, bikes and insurance; dates use Asia/Makassar calendar days.
- Open-ended monthly rentals are not silently given an expiry or billing date.
  A Founder question about their next-payment basis remains unanswered.
- Missing start date uses the short schedule, with a diagnostic reason.
- This is distinct from the existing manual visa contact-plan reminders and
  the new-user welcome-message scenario; their copy and timing are unchanged.

## Frontend implementation

- Business settings have Catalog & prices, Availability, Exchange and
  Notifications sections. Integrated the Designer's bounded business-settings
  packet; current AdminApp changes were retained, not overwritten wholesale.
- Notification editor: delivery switch, editable threshold, two interval lists,
  server preview, example calendar dates, change reason, versioned history,
  explicit reset of unsaved edits. History loads a schedule into the draft;
  the current delivery switch is preserved and saving is still explicit.
- Default global delivery is OFF. Saving a disabled schedule does not enable it.
- Invalid intervals/reasons and version conflicts are explained. Failures
  preserve draft input. Version refresh requires a new preview.
- Per-service client preference is present on web/Mini App; web mutations
  carry the authenticated session's CSRF token. Admin edits preserve opt-out.
  Availability and missing-date hints do not imply that global delivery is on.
- Only production-source files belong in the release. Preview fixture routes
  and snapshots remain test-only, with no production backend/bot connection.

## Designer and React review

Designer advised two-column desktop/one-column mobile interval fields, clear
100-day boundary, separate save/activation, preview dates and preserved drafts.
The grouped-catalog packet was reviewed from source before integration.
React review retained labelled controls, visible focus, functional state
updates, keyed identity boundaries and draft preservation across section tabs.
Public snapshot price editors were additionally disabled in read-only mode.

## Local preview evidence

- Local Admin route `/admin/settings/` returns HTTP 200.
- Price snapshot contains 28 published positions (8 service positions and
  20 visa variants), publication v35008, from the public pricing endpoint.
- Snapshot is historical, published 2026-09-29T04:07:15.551752Z. It is labelled
  read-only; its FX observation is NOT a fresh quote and is never republished.
- No clients, orders, contacts, credentials or private business configuration
  were copied from production. Admin clients remain synthetic; unavailable
  private availability/exchange settings are not invented.
- Reminder preview and in-memory disabled-policy save: HTTP 200. Stale version:
  HTTP 409. Price publication and other production-like mutations: HTTP 409.
- Tests: 18 focused frontend tests PASS (interval parsing, dates, opt-out payload,
  service editor regressions and category mapping). TypeScript and Vite build PASS.
- No browser visual/runtime PASS claimed. Separate browser launching remains
  disallowed by Founder; the built-in tab can be used for visual review.

## Runtime and release gates

Runtime code and verification are recorded separately in
`BALI-SERVICE-REMINDERS-20260929-runtime.md` in the runtime repository.
Candidate migration: b7d2e6a9c410, following a9c28b017d60; additive consent column
and a dedicated delivery ledger. Scheduling, source revalidation, deduplication
and delivery settlement belong to the backend/bot, not the browser.

Runtime handoff completed: 66 backend reminder/API/Life checks, 14 existing
visa/admin-safety checks and 4 mocked bot checks passed (84 total). Six opt-in
PostgreSQL migration/concurrency checks remain SKIPPED because isolated initdb
could not acquire shared memory in this sandbox; no test PostgreSQL was started.
The additive migration was not applied anywhere. PostgreSQL tests use a stamped
prior metadata baseline, not the complete historical migration chain. Neither
production backup/restore nor production migration safety is claimed as proven.

Before production: finish the PostgreSQL gate, review the exact scoped diff,
obtain publication/release approval, prove backup/restore and isolated PostgreSQL
upgrade-downgrade-upgrade, preserve deployed revision/rollback, deploy with
delivery OFF, verify routes/schema and explicitly activate the policy. Do not
infer real Telegram delivery from mocked tests or an in-memory Admin preview.

## YouTube credential handoff

A Git-ignored, owner-only local environment template is prepared outside the
frontend app root. The Founder can enter a YouTube Data API v3 key there, never
in chat or source. No key was copied into browser code or this audit packet.
The existing video UI changes remain local; automatic authenticated playlist
refresh is not implemented by this reminder/settings change.

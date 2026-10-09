# Yoga bot: sanitized integration packet

Baseline: `5403de5e4fea678437512cf4c44698699b5484ec`. Scope: new `06 Development/yoga-bot/` package and this audit folder only. Existing website design, shared Registry, SAFRWAY bot/backend, data, credentials and release infrastructure were not modified.

Status: local foundation prepared; first-launch MVP choice remains with the primary conversation. No default mode, account implementation or production activation is inferred. Exact incremental patch and per-file hashes are supplied separately to the authorized primary conversation.

## Implemented

- Explicit `service_links` / `welcome_links` configuration. RU/EN; service pages are read from canonical Registry, current rendered source revision, actual publication gates and pinned metadata. No duplicated pricing, FX or visa prose.
- Distinct `@Yoga_ganster_bot` identity check, private-chat dispatcher, bounded in-memory preferences, rate limit before callback ACK, separate polling lock and systemd environment/user/virtualenv.
- No import/call to main SAFRWAY app, DB, user backfill, onboarding/visa/chat bridges or outboxes. No registration, inviter mutation, commissions, money balance, referral forwarding, marketing or customer-manager messaging.
- Honest unsupported-account/referral responses and plain link to the existing SAFRWAY bot, without payload. All production identity/attribution rules remain untouched.
- Sanitized event-only logging; wrong identity, occupied webhook, another poller or invalid configuration prevent startup. No webhook deletion or pending-update reset.

## Verification

Critical suite uses aiogram 3.13.1 with a transport that has no HTTP implementation; identities and text fixtures are synthetic. Coverage includes RU/EN commands/callbacks, isolated handoff, unsupported account/referral paths, URL and payload injection, draft/approval/hash/path gates, lock contention, callback floods, polling ownership/auth conflicts, bounded network retry and clean startup failure. Results are recorded in `VERIFICATION.json`.

The canonical baseline resolves 28 service/hub/guide links in both locales, including D12 extension, E28A and E33G extension/status-change/document-check. Legacy published links are separate from new candidate gate evidence. Un-gated newer candidates remain absent from the bot menu; this does not remove or rewrite any approved website content. Next releases must pair updated website routes and Registry with a Yoga restart.

Independent bounded security review verified main-runtime isolation and recommended explicit candidate gates and throttling before callback ACK; both were corrected and tested. It also identified the limitation of a local lock: deployment must verify/stop the previous Yoga polling owner. Runtime now stops on the actual Telegram polling conflict with a sanitized error code. A separate user-flow review identified quick-tap feedback, welcome-only account wording and one-way pagination; these were corrected with a separate bounded ACK budget, mode-specific wording and back/page controls.

## Still required for release

Primary owns Founder mode selection, exact release revision, read-access-only public content placement, credential provisioning, HTTPS origin/route checks, polling ownership, controlled live smoke test, publication and rollback. `runtime_ready` alone does not prove real message handling. No live Telegram, server, browser, DNS, Git publication or deployment was performed by this task.

## Integration proposal for the full partner system

These are design requirements for a separately scoped backend change, not implemented interfaces:

1. Resolve global user identity server-side across brands/bots; keep original inviter immutable and distinguish first-time clients from existing SAFRWAY users. A Telegram username or URL parameter is not proof of partner/admin permission. Give partner access only after explicit operator provisioning with server-side brand scope.
2. Resolve trusted bot token/identity and brand configuration on the server; verify Telegram login/MiniApp signatures with the correct bot credential, then use one central identity/auth path. Do not launch the current `app.main` once per token: it owns global backfill and shared bridges.
3. Centralize first-attribution, order provenance, service pricing overrides and service completion/payment state. Preserve the Founder rule: lifetime rewards on paid completed purchases, existing client ownership unchanged. Never grant commissions from clicking a start link.
4. Use versioned per-service rewards and exchange-rate snapshots, with idempotent ledger entries keyed to the qualifying paid/completed event. Separate global referral rewards from individually configured influencer entitlement so one purchase cannot be accidentally credited twice. Exact policy and affected levels still need primary/Founder resolution.
5. Give future outbound events durable bot/brand routing, retry ownership and deduplication. Deliver the correct bot's customer replies and manager notification without competing workers consuming shared queues. Do not reuse transient menu preferences as the registration/referral store.
6. Partner portal permissions: own network and accrued Points only; no other brands, business margins, editable prices, refund tools or administrative user grants. Conversion display starts at the chosen configurable internal rate; actual balances and historical snapshots come from the central ledger. No exchange listing integration is part of this release.

Before enabling this next stage, independently review identity, privacy, authorization, referral/ledger deduplication and rollback using a sanitized packet. Copy Founder-approved product rules into repository documentation; do not rely on chat history alone.

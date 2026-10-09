# Yoga bot invariants

- Keep this runtime separate from SAFRWAY `app.main`, shared user backfill, DB, bridges and outboxes. Never use the main `BOT_TOKEN` or its EnvironmentFile here.
- Verify the exact public identity `@Yoga_ganster_bot` before consuming updates. A webhook or second polling owner requires operator review; do not delete a webhook or drop pending updates automatically.
- `YOGA_MVP_MODE` is an explicit Founder choice routed through the primary conversation. Supported link modes do not implement accounts, attribution, rewards or manager chat forwarding.
- Canonical Registry and its approved RU/EN metadata supply service routes and labels. Do not copy visa facts, prices or FX into bot copy. New candidate links require actual publication gates, current rendered source revision and matching body/metadata pins.
- Use synthetic identities and an offline transport in tests. Never read real tokens, send to real Telegram users or start live polling for verification without release authorization.
- Logs contain fixed event/error codes only. No tokens, Telegram identifiers, message bodies, payloads, raw exceptions or traceback contents.
- Keep the systemd identity, environment, virtualenv and runtime lock separate. Runtime activation and rollback belong to the primary release operator.

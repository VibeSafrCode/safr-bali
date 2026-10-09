# Yoga bot invariants

- Primary «01 — БалиЛоки» owns integration/release. Change this namespace only; canonical backend, website/Registry, main SAFRWAY bot, migrations and Git/release belong to primary.
- Keep Yoga separate from SAFRWAY `app.main`, user backfill, direct DB access, main bridges/outboxes and environment. Shared intake uses only the Yoga-principal `/api/yoga-channel`, never a main/admin credential.
- Verify the exact public identity `@Yoga_ganster_bot` before consuming updates. A webhook or second polling owner requires operator review; do not delete a webhook or drop pending updates automatically.
- Current approved mode is `shared_intake`. Explicit legacy link modes do not satisfy intake; no automatic fallback or repeated Founder MVP question. Accounts/referrals/rewards remain future integration.
- Canonical Registry and its approved RU/EN metadata supply service routes and labels. Do not copy visa facts, prices or FX into bot copy. New candidate links require actual publication gates, current rendered source revision and matching body/metadata pins.
- `/start svc_` is approved topic context only, never authentication/referral/account assignment or role grant. Unknown context becomes general.
- Preserve exact actual update ID/body/source/topic/original optional conversation ID across HTTP retry/restart. Do not confirm Telegram offset before canonical receipt and metadata acceptance. UI errors must not poison intake.
- Private StateDirectory stores bounded HMAC actor/context/pending metadata, never bodies/raw Telegram IDs/User/lead/referral/price records. Retain private key+journal together. Corruption/capacity/missing key fails closed, never silent reset. Body recovery depends on upstream replay.
- Claim Yoga observer/client targets only, through the same own Bot instance. Escape display; preserve full body and stable conversation reference. Observer has no staff controls; own Reply creates a new inquiry. Ambiguous send/expired lease is UNKNOWN for operator review, never blind resend.
- Media is NOT_IMPLEMENTED and explicitly not forwarded; never claim saved media.
- Use synthetic identities and an offline transport in tests. Never read real tokens, send to real Telegram users or start live polling for verification without release authorization.
- Logs contain fixed event/error codes only. No tokens, Telegram identifiers, message bodies, payloads, raw exceptions or traceback contents.
- Keep systemd identity, environment, virtualenv, RuntimeDirectory, StateDirectory and lock separate. Activation/rollback belongs to primary. Retain canonical history and private metadata on compatible package rollback.

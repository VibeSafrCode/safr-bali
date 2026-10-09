# Yoga shared intake — sanitized runtime audit

Status: LOCAL OFFLINE VERIFIED, NOT DEPLOYED. Primary «01 — БалиЛоки» owns backend/main/web integration and release. No production secrets, real transport identities, journal values or direct mutation authority in this packet.

## Scope and contract

Runtime adds shared_intake adapter over `/api/yoga-channel`, exact idempotent inbound, private context metadata and Yoga-only observer/client worker. Canonical WebConversation/WebMessage and transactional fanout belong to backend. Main staff notification/reply/history/internal-note controls stay in the existing SAFRWAY bot; public reply returns through original Yoga Bot instance/source chat. No new User/lead/order/referral/Points/pricing logic or direct DB access.

Root packet `AUDIT/YOGA_CHANNEL_2026-10-09/API_CONTRACT.json` is contract authority. Optional public claim `author_type: client|staff` is accepted per primary clarification; absence remains compatible. Yoga rejects staff recipient/control fields. Topic and actor derive from actual private update/context, never auth/role grant. Backend controls trusted brand/recipients and immutable binding.

## Critical checks

82 offline unittest cases pass: 43 original foundation and 39 shared intake cases. Synthetic IDs/fake Telegram and HTTP only. Meaningful flows: lost canonical receipt and exact retry after restart; original topic/conversation on batch replay; unconfirmed polling offset on outage/conflict; no duplicate send on lost settlement ACK; provider cooldown even after failed pre-send settlement; UI ACK failure after commit and expired callback isolation; unsupported media; observer/client scope; RU/EN read-only notice with stable conversation reference; HTML escaping; full 4000-char body; private metadata permissions/corruption/capacity; bounded retries.

Independent security review found UI errors blocking polling, invalid-token recipient loss and provider cooldown skipped on lost settlement; corrected with regression tests. Observer warning clarified. Independent journey review added stable conversation references and explicit own-reply behavior. Final review state is recorded in verification evidence.

## Recovery and release limits

Metadata journal has no body. It preserves dedup context but depends on Telegram replay for text recovery; not a durable independent queue. Upstream replay/retention exhaustion requires operator recovery. Preserve private key+journal together through restart/rollback; never audit their real values. Corruption/missing key/overflow fails closed. Unaccepted metadata is never evicted.

Ambiguous delivery becomes UNKNOWN without automatic resend. Provider cooldown is honored in process, not persisted independently across restart. Backend owns durable max5 retry budget/leases. No exactly-once Telegram claim.

These tests do not prove backend migration/concurrency/transaction/ACL behavior, numeric destinations, production URL availability or real delivery. Primary gates: backend feature/configuration; existing staff ACL and no duplicate outbox; verified observer numeric identity and /start; separate credentials; backup/restored-clone and migration proof; controlled end-to-end operator test; release approval. Runtime task did not execute live Telegram, production credential reads, Git/deploy/server/browser operations.

Text-only release: voice/photo/video/documents are NOT_IMPLEMENTED and explicitly rejected. Accounts/referrals/rewards remain future integration, honestly stated in menus. History/internal notes never become observer controls.

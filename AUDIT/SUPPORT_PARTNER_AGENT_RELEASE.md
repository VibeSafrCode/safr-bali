# Bali Support, partner bot and finite visa-agent tools

This release reuses the existing backend, client identity, catalogue, referral network and message transports. It adds no separate CRM, bot account or website.

## Behaviour

- An explicitly configured Bali Support recipient can read and reply to client conversations in a private Saffron chat, including owner-restricted inquiries. Every prepare/read/send/replay checks the actual actor. Internal staff notes and unrelated administrative powers remain protected. Replies use the client's original transport.
- Existing clients entering through the partner bot keep their original inviter, including an empty inviter. Source attribution is separate from referral ownership. The partner receives a limited initial-inquiry preview, without subsequent conversation or reply rights. Existing account surfaces expose only an anonymous own-branch projection, with bounded pagination.
- The visa agent has three operations: read an assigned case, register a confirmed application and record an observed portal status. It uses a separate hashed, expiring, revocable credential with explicit client/case capabilities. It cannot change payments, Points, referral ownership, legal dates, publication or document-delivery confirmations.

## Data and authorization

Additive migration `f13a7c5d920b`, after `e73b2c9a610f`, introduces credential/scope/application bindings and nullable machine attribution in the existing visa event history. It creates no credentials or grants. Applications have a stable purpose-specific HMAC identity; encrypted references remain in existing visa processes. Multiple processes can belong to one case.

An explicit active case grant takes precedence. A client grant can access only submissions created under that same grant; replacement grants do not inherit old bindings. Current authorization and the specific process are checked before returning an idempotent result. Machine events do not impersonate a human administrator.

Unknown, stale and regressive observations require review and preserve confirmed facts. An observed issued status does not confirm a checked PDF, delivery to the client or payment for SAFRWAY services.

## Verification

Targeted local tests cover routing, transport identity, privacy projections, referral preservation, Owner/session/Origin/CSRF and machine Bearer separation, atomic rollback, exact replay, version conflicts, expiry/revocation and scope replacement. Historical approved-source provenance uses two exact immutable public-source fixtures; current account behavior still uses live source, including late-response and identity-mismatch tests.

`tests/test_visa_agent_postgres.py` uses the existing owned PostgreSQL fixture for three native checks: first-binding/key races and uniqueness, in-flight revocation/CAS ordering, and the actual additive migration. Both expected NOWAIT failures require SQLSTATE `55P03`. Collection or a skipped test is not native execution evidence.

## Release and recovery

Preserve unrelated work, current message histories, locks, client records, referrals, Points and secret-file permissions. Validate the current targets and configuration, coherent backup, affected migration and rollback compatibility before installation. Compare installed and served files with the released revision, then verify service identity, health and single-poller behaviour.

Code rollback retains the additive schema and new records; it must not restore an older live database over client changes. Actual secrets and agent grants are provisioned only through the separate authorized Owner flow. Existing off flags stay off. Public bot identity and the optional team WhatsApp contact are configuration choices, not inferred data.

The guest website chat is a separate subsequent package. Public website content, indexing submissions, private originals and unrelated drafts are outside this runtime change. Operational execution results are maintained in the project's current-state record; this document describes the versioned change and its verification boundaries.

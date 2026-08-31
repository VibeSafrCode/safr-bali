# Open Issues and Risks

Snapshot date: `2026-08-31`. Priorities are audit triage, not Founder decisions.

| ID | Priority | State | Risk | Current control / missing evidence |
| --- | --- | --- | --- | --- |
| `AUD-RISK-001` | P0 | `DEPLOYED` / `FAIL_CLOSED` | Partial protected-document configuration can expose or strand sensitive files. | Readiness requires private root, versioned encryption key/custody, scanner, retention and restore/decrypt proof; production remains fail closed. |
| `AUD-RISK-002` | P0 | `DEPLOYED` / guarded | Permanent VisaCase delete could cross ownership boundaries or orphan encrypted files. | Root + Archive only, exact dependency preview, reason, idempotency and tombstone; protected metadata blocks deletion. No live delete was exercised. |
| `AUD-RISK-003` | P0 | `DEPLOYED` / guarded | Referral correction could create cycles, mismatch evidence or alter economic history. | Service/PostgreSQL guards and global invariant are deployed. One exact correction was audited; no rewards, messages or bulk action. |
| `AUD-RISK-004` | P0 | `DEPLOYED` | Visa-manager access could leak unassigned clients, settings or documents. | Deny-by-default assigned-case scope and immediate revoke/reassign contracts; manager provisioning remains separately controlled. |
| `AUD-RISK-005` | P1 | `CONTROLLED` | Shared dirty worktree can mix unrelated files into a release. | BALI-TASK-067 used an allow-listed commit, independent remote SHA and clean production checkout; excluded local files remain unrelated. |
| `AUD-RISK-006` | P1 | `DEFERRED` | Telegram avatar retrieval adds consent, retention, token, cache and cross-client risks. | Initials fallback only; proxy flag off. Feasibility/privacy decision remains. |
| `AUD-RISK-007` | P1 | `DEPLOYED` | Business settings may become a second source of truth or publish unverified values. | Typed canonical fields, preview/version/effective date/audit/restore; no invented defaults. |
| `AUD-RISK-008` | P1 | `DEPLOYED` | Referral graph can leak identities or exclude assistive users at scale. | Root-only privacy-safe graph and synchronized accessible list; production-scale performance remains unknown. |
| `AUD-RISK-009` | P1 | `DEPLOYED` | Guide/travel content can become stale or imply unsupported rules. | Sanitized source, visible provenance/review state and release gates; ongoing source freshness review remains required. |
| `AUD-RISK-010` | P1 | `DEPLOYED` | Structured-data duplication or hidden machine-only content can harm crawl integrity. | Canonical/hreflang/server HTML and route checks; ranking outcomes remain unknown. |
| `AUD-RISK-011` | P1 | `DEPLOYED` | PWA depends on exact Nginx root assets; route/header drift can break installation or cache privacy. | Existing release contract and rollback; every release must repeat MIME/hash/cache/no-private-response checks. |
| `AUD-RISK-012` | P1 | `UNKNOWN` | Fixture-only authenticated mutation smoke cannot prove every production session/environment edge. | Use controlled synthetic, no-customer-write smoke with cleanup and explicit Founder gate; never send a real message as routine smoke. |
| `AUD-RISK-013` | P1 | `CLOSED` | Migration release could fail or alter ownership/data. | Verified backup, isolated restore and U-D-U from the release candidate passed; production head and invariants verified. |
| `AUD-RISK-014` | P2 | `DEFERRED` | Native scaffolding may be mistaken for supported iOS/Android delivery. | Explicitly exclude native shell from Web/PWA release until toolchain, OIDC/deep-link and store gates exist. |
| `AUD-RISK-015` | P1 | `NOT_RUN` | External audit recommendations can be over-trusted or contain prompt-injected instructions. | Sanitized manifest, read-only prompt and internal `ACCEPT/MODIFY/REJECT/NEEDS_EVIDENCE` triage; no blind implementation. |
| `AUD-RISK-016` | P1 | `PLANNED` | YouTube OAuth or playlist automation could overreach channel permissions, exhaust quota, duplicate memberships or expose refresh tokens. | Local interactive minimal-scope OAuth, no credentials in chat/VPS/Git, dry-run mapping, Founder review, idempotent reconciliation, manual overrides and server-side caching are required before enablement. |
| `AUD-RISK-017` | P2 | `PLANNED` | A visual “wow” rewrite can damage accessibility, performance, conversion clarity or maintainability if animation leads architecture. | Approve art direction and motion storyboard first; pilot one route with mobile, reduced-motion, Core Web Vitals and rollback gates before wider adoption. |
| `AUD-RISK-018` | P1 | `CLOSED` / `DEPLOYED` | The first authenticated request after the activity window could return `500` because SQLAlchemy expired a committed User before it was detached; refresh appeared to fix the page only by issuing a second request. | Web and Mini App session guards now refresh the User before detaching it. Stale-session regressions, full backend tests and production health/RBAC smoke passed at `83e3bc3…`. |
| `AUD-RISK-019` | P1 | `APPROVED / ANALYSIS` | Independent price copies or FX calculations can drift across bot, public site, Admin and Mini App, or rewrite a historical customer expectation. | BALI-TASK-072 requires one versioned published catalog and FX snapshot, immutable order/case snapshots, three-option independent review, additive migration/U-D-U and cross-surface parity before legacy copies are removed. No price migration or publication has occurred yet. |

## Post-release limitations that must remain explicit

- Production schema is `c6a4e8b2d915` at the recorded release SHA.
- Protected document storage remains fail closed until its exact operational gates pass.
- Permanent delete intentionally blocks cases with protected-file metadata;
  atomic storage cleanup is not implemented.
- Telegram avatar retrieval is not implemented.
- The one-time Founder-approved referral correction was applied through protected
  release input and audited without embedding identities in this package.
- Search/AI discoverability and production conversion are outcome unknowns.
- Production smoke cannot safely reproduce an expired real customer session;
  the exact failure mechanism is covered by isolated stale-session regressions
  and the deployed source, without creating a synthetic production session.

## Binding safety rules

- Never weaken client/manager isolation, audit immutability, CSRF/Origin,
  idempotency, optimistic concurrency or PWA no-private-cache boundaries.
- Never guess ambiguous referral attribution or create retroactive rewards,
  orders, messages or falsified timestamps.
- Never expose documents, credentials, storage keys or bot tokens in browser,
  Telegram, logs, fixtures, screenshots or the audit package.
- External findings remain proposals until internal triage and Founder gates.

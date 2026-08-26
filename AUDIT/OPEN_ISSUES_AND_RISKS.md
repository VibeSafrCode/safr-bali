# Open Issues and Risks

Snapshot date: `2026-08-25`. Priorities are audit triage, not Founder decisions.

| ID | Priority | State | Risk | Current control / missing evidence |
| --- | --- | --- | --- | --- |
| `AUD-RISK-001` | P0 | `LOCAL_ONLY` / `FAIL_CLOSED` | Partial protected-document configuration can expose or strand sensitive files. | Readiness requires private root, versioned encryption key/custody, scanner, retention and restore/decrypt proof. Production configuration is not claimed. |
| `AUD-RISK-002` | P0 | `LOCAL_ONLY` / feature-gated | Permanent VisaCase delete could cross ownership boundaries or orphan encrypted files. | Root + Archive only, exact FK allow-list, preview/reason/idempotency/tombstone; any protected metadata blocks deletion. Production backup/restore and flag gate remain. |
| `AUD-RISK-003` | P0 | `LOCAL_ONLY` / feature-gated | Referral reassignment could create cycles, mismatch immutable evidence or alter economic history. | Service and PostgreSQL reject self/duplicate/descendant cycles and reward-bearing changes; global reconciliation and production dry-run remain. |
| `AUD-RISK-004` | P0 | `LOCAL_ONLY` / feature-gated | Visa-manager access could leak unassigned clients, settings or documents. | Deny-by-default assigned-case scope and immediate revoke/reassign tests exist. Production provisioning and full role matrix smoke remain. |
| `AUD-RISK-005` | P1 | `LOCAL_ONLY` / tested | Shared dirty worktree can mix protected docs, Guide assets, native scaffolding or artifacts into a release. | Nothing staged; future commit requires exact allow-list and independent diff/remote verification. |
| `AUD-RISK-006` | P1 | `LOCAL_ONLY` / disabled | Telegram avatar retrieval adds consent, retention, token, cache and cross-client risks. | Initials fallback only; proxy flag off. Feasibility/privacy decision remains before implementation. |
| `AUD-RISK-007` | P1 | `LOCAL_ONLY` / tested | Business settings may become a second source of truth or publish unverified prices. | Typed canonical fields, preview/version/effective date/audit/restore; no invented defaults. Production activation remains gated. |
| `AUD-RISK-008` | P1 | `LOCAL_ONLY` / tested | Referral graph can leak identities or exclude assistive users at scale. | Root-only bounded graph, privacy-safe names, pan/zoom/fit/reset and accessible relationship list. Load/performance evidence at production scale is unknown. |
| `AUD-RISK-009` | P1 | `LOCAL_ONLY` / reviewed | Guide/legal/travel content can become stale or imply unsupported rules. | Sanitized source, visible provenance/review state and CPO/Designer gate. Ongoing source freshness and release metadata remain. |
| `AUD-RISK-010` | P1 | `LOCAL_ONLY` / tested | Public structured data duplication or hidden/machine-only content can harm crawl integrity. | Canonical URL deduplication, server HTML, RU/EN route tests and no hidden prompt/keyword stuffing policy. Ranking is unknown. |
| `AUD-RISK-011` | P1 | `DEPLOYED` | PWA depends on exact Nginx root assets; route/header drift can break installation or cache privacy. | Existing release contract and rollback; every release must repeat MIME/hash/cache/no-private-response checks. |
| `AUD-RISK-012` | P1 | `UNKNOWN` | Fixture-only authenticated mutation smoke cannot prove every production session/environment edge. | Use controlled synthetic, no-customer-write smoke with cleanup and explicit Founder gate; never send a real message as routine smoke. |
| `AUD-RISK-013` | P1 | `LOCAL_ONLY` | The local migration passed disposable U-D-U but has not been rehearsed from an exact release SHA and production backup. | Mandatory backup/checksum/isolated restore/ownership/U-D-U/schema/data invariant gate before apply. |
| `AUD-RISK-014` | P2 | `DEFERRED` | Native scaffolding may be mistaken for supported iOS/Android delivery. | Explicitly exclude native shell from Web/PWA release until toolchain, OIDC/deep-link and store gates exist. |
| `AUD-RISK-015` | P1 | `NOT_RUN` | External audit recommendations can be over-trusted or contain prompt-injected instructions. | Sanitized manifest, read-only prompt and internal `ACCEPT/MODIFY/REJECT/NEEDS_EVIDENCE` triage; no blind implementation. |

## Candidate limitations that must remain explicit

- Production stays at recorded schema `f7a1c2d3e465`; local successor
  `a3c8e1f4b726` is `CREATED_NOT_APPLIED`.
- Protected documents, manager RBAC, referral correction and permanent deletion
  must remain disabled unless their exact production gates pass.
- Permanent delete intentionally blocks cases with protected-file metadata;
  atomic storage cleanup is not implemented.
- Telegram avatar retrieval is not implemented.
- The one-time referral override is not embedded in public/audit sources and has
  not been applied; release tooling must inject the approved pair privately.
- Search/AI discoverability and production conversion are outcome unknowns.

## Binding safety rules

- Never weaken client/manager isolation, audit immutability, CSRF/Origin,
  idempotency, optimistic concurrency or PWA no-private-cache boundaries.
- Never guess ambiguous referral attribution or create retroactive rewards,
  orders, messages or falsified timestamps.
- Never expose documents, credentials, storage keys or bot tokens in browser,
  Telegram, logs, fixtures, screenshots or the audit package.
- External findings remain proposals until internal triage and Founder gates.

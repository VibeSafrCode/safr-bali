# Open Issues and Risks

Snapshot date: `2026-08-24`. Priority is an audit triage suggestion, not a
Founder decision.

| ID | Priority | Status | Problem / risk | Evidence class | Owner | Required next evidence or decision |
| --- | --- | --- | --- | --- | --- | --- |
| `AUD-RISK-001` | P0 | `DEPLOYED` / `FAIL_CLOSED` | Visa data is sensitive; protected document/credential capability exists in code but production key/storage/scanner are absent. Enabling only part of the chain could expose or strand data. | Release packet + source contracts | CTO + Security + Founder gate | Threat model, key custody/rotation, private storage, scanning, retention/export/delete, backup/restore and fail-closed smoke |
| `AUD-RISK-002` | P0 | `PLANNED` | Permanent VisaCase deletion can accidentally cross case/user/reward boundaries or destroy audit evidence. | Founder decision for BALI-TASK-067 | CPO + CTO + Security | Exact FK graph, case-owned allow-list, transaction/idempotency, tombstone policy, backup/restore rehearsal and orphan/cross-client tests |
| `AUD-RISK-003` | P0 | `PLANNED` | Referral attribution is immutable and lacks a supported correction path; ad-hoc trigger bypass would violate invariants. | Read-only production/schema preflight and source service behavior | CTO + product/rewards owner | Successor migration/domain API, actor/idempotency/audit, dry-run, ambiguity report, reward-preservation proof and rollback |
| `AUD-RISK-004` | P1 | `DEPLOYED` product defect | Dark-theme client dialogue copy was reported visually unreadable. | Founder production screenshot report | Designer + CTO | Contrast correction at 320/390/1440, long-message/links/status/focus evidence and regression test |
| `AUD-RISK-005` | P1 | `DEPLOYED` product defect | Admin `Clients` navigation does not consistently open the all-clients view; back-navigation is incomplete. | Founder production observation | CPO + CTO | Route/navigation map, browser-history/filter preservation and responsive keyboard tests |
| `AUD-RISK-006` | P1 | `PLANNED` | Telegram avatar retrieval may introduce consent, retention, broken-image, SSRF/proxy, token and rate-limit risk. | Founder request; implementation evidence absent | CPO + Security + CTO | Bot API feasibility, purpose/retention policy, server-side safe cache/proxy, access checks, fallback and failure tests |
| `AUD-RISK-007` | P1 | `DEPLOYED` product gap | Client lists are dense single-column rows; filters/sorts are slower than requested and some dashboard/settings cards do not open an editable destination. | Founder production screenshots | CPO + Designer + CTO | Two-column/one-column matrix, filter-chip/select parity, exact destinations and count/list contract tests |
| `AUD-RISK-008` | P1 | `PLANNED` | Editable Visa/Service business settings can create a second source of truth or expose unreviewed prices/availability. | Future sprint requirement | CPO + CTO | Canonical typed fields, authorization, validation, effective date/version, preview, audit, rollback and generated-content ownership |
| `AUD-RISK-009` | P1 | `PLANNED` | Zoomable referral graph can leak network identity, become unusable at scale, or exclude keyboard/screen-reader users. | Future sprint requirement | Designer + Security + CTO | Privacy-safe labels, authorization, bounded graph/query, pan/zoom/fit/reset, list/tree fallback, performance and a11y tests |
| `AUD-RISK-010` | P0 | `PLANNED` | A Bali visa-manager cabinet could accidentally inherit root-admin access across clients, settings, referrals, deletion and audit. | Future sprint requirement | CPO + Security + CTO | Explicit role/assignment matrix, deny-by-default server checks, client/case isolation, audit and negative tests |
| `AUD-RISK-011` | P1 | `UNKNOWN` | Public technical SEO passed release contracts, but content intent, internal linking, entity/provenance clarity and actual search/AI discoverability have not been independently audited. | Release packet vs missing outcome evidence | CPO + SEO/content owner + CTO | RU/EN crawl audit, structured-data validation, noindex policy review, server HTML, Core Web Vitals/performance and evidence-backed recommendations |
| `AUD-RISK-012` | P1 | `DEPLOYED` operational coupling | PWA root assets require exact Nginx exposure; an initial release attempt found missing routes/icons and rolled back before correction. Future drift can break installation/offline behavior. | BALI-TASK-066 release evidence | CTO + release owner | Keep source/Nginx contract tests, exact asset/MIME/cache smoke and rollback checks in every Web/PWA release |
| `AUD-RISK-013` | P1 | `UNKNOWN` | Real authenticated production mutations/messages are intentionally not exercised by release smoke. Fixtures are strong but cannot prove every environment/session edge. | Release limitation | CTO + Founder gate | Synthetic/non-customer controlled smoke design, cleanup proof, isolation and no-message guarantees |
| `AUD-RISK-014` | P1 | `UNKNOWN` / dated | Visa/legal source freshness and sensitive translations may age; stale verified dates must not be mistaken for current law. | Content provenance metadata | CPO/content/legal reviewer | Exact official source, verification date, reviewer and noindex/cutover gate |
| `AUD-RISK-015` | P1 | `PUSHED` / drift risk | Root README, historical snapshots and canonical docs may disagree with latest release evidence. | Repo document comparison | Documentation & Release Manager | Separate scoped reconciliation; preserve historical facts while clearly marking current SHA/schema/surfaces |
| `AUD-RISK-016` | P2 | `DEFERRED` | Local native scaffolding can be mistaken for a supported iOS/Android application or accidentally enter a Web/PWA artifact. | Worktree boundary and BALI-TASK-066 release scan | CTO | Keep excluded until explicit native scope, toolchains, OIDC/deep-link/session/security tests and store release gates exist |

## Reported BALI-TASK-067 UX defects and gaps

These are Founder observations/backlog items, not proof of root cause:

- dark dialogue contrast is unreadable;
- Admin `Clients` does not behave like `All clients`;
- back-navigation is inconsistent;
- client listing needs two desktop columns;
- Visa/Service settings cards need clear editable destinations;
- Visa editor controls/help collide visually;
- modal Close and destructive actions are confused;
- Visa Archive and permanent-delete path are not discoverable;
- referral network needs an interactive and accessible visualization;
- faster filter chips and standard date/name/status/activity sorting are needed.

## Known documentation/contract drift targets

- Historical project snapshots and root status prose may name older deployed
  SHAs or schema heads.
- Conceptual database documentation omits later auth, exchange, portal, locale,
  Visa lifecycle and Web/PWA evolution.
- Shared/i18n READMEs may describe localization as future work even though RU/EN
  is deployed.
- Route-contract documentation must be checked against the current public,
  Mini App, account and admin topology.

Report discrepancies; do not silently choose a winner or edit canonical files
from an external audit.

## Binding constraints

- Founder approval gates remain in force.
- Client isolation, audit immutability and PWA no-private-cache rules may not be
  weakened for convenience.
- Public functional calculator/API remains excluded.
- Visa/privacy noindex and official-source requirements remain until separately
  approved.
- Bali is P0; do not invent Thailand rules.
- External recommendations remain `PROPOSED` until internal triage.

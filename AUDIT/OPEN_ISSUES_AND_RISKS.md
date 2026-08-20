# Open Issues and Risks

Every item below is either confirmed by the CPO packet/canonical evidence or
explicitly marked `UNKNOWN`. Priority is an audit triage recommendation, not a
Founder decision.

| ID | Priority | Status | Problem / risk | Evidence | Owner | Required next evidence or decision |
| --- | --- | --- | --- | --- | --- | --- |
| `AUD-RISK-001` | P0 | `LOCAL_ONLY` | Visa Cabinet/CRM introduces sensitive lifecycle, document, credential, notification, and migration surfaces without release evidence yet. | BALI-TASK-055 worktree paths in `MANIFEST.md`; CPO packet | CTO implementation; CPO contract; Founder gates | Full tests, threat/privacy review, exact migration checksum/head, isolated restore and U-D-U before any release request |
| `AUD-RISK-002` | P0 | `UNKNOWN` / dated evidence | Visa/legal facts and sensitive translations trace to evidence dated 2026-07-29. Freshness must be re-established before factual promotion or cutover. | Canonical content metadata; CPO packet | CPO/content owner | Official-source review with source ID, URL, verification date, reviewer, and unchanged noindex until approved |
| `AUD-RISK-003` | P1 | `DEPLOYED` product gap | The multi-country shell is broader than the confirmed active inventory outside Bali. This can overstate availability. | 44-route contract and CPO packet | CPO | Per-route availability taxonomy and evidence that “preparing” cannot be mistaken for orderable/available |
| `AUD-RISK-004` | P1 | `UNKNOWN` | Demand, funnel drop-off, and first-session value have weak measured evidence; minimum analytics is not established in the supplied packet. | CPO packet | CPO / analytics owner | Minimal privacy-safe event model, baseline, decision use, retention policy, and explicit approval |
| `AUD-RISK-005` | P1 | `PLANNED` | Public taxonomy, authenticated catalog, and order flow are not yet demonstrated as one coherent model. | CPO packet; current route/catalog/API boundaries | CPO + CTO | Cross-surface journey map, canonical item/status mapping, and contract tests |
| `AUD-RISK-006` | P1 | `UNKNOWN` | Browser parity and release evidence are incomplete compared with Telegram/Mini App coverage. | CPO packet; canonical browser-account notes | CTO + CPO | Supported browser journey matrix, authentication gate state, accessibility/error evidence, and exact smoke |
| `AUD-RISK-007` | P1 | `LOCAL_ONLY` | Four canonical docs contain an uncommitted reconciliation, so GitHub readers may see an older release state until a separately approved docs commit. | Current Git status; BALI-TASK-053 packet | Documentation & Release Manager | Scoped four-doc commit/push approval and independent remote verification; do not combine with this folder without explicit scope |
| `AUD-RISK-008` | P1 | `NOT_VERIFIED` | Latest authenticated production behavior has not been validated through real customer writes/messages; this is an intentional safety boundary but leaves end-to-end evidence incomplete. | Release limitations in canonical evidence | CTO; Founder approval gate | A separately approved, non-customer or controlled smoke design with rollback and data cleanup proof |
| `AUD-RISK-009` | P2 | `PLANNED` | Human-manager handoff is central, but service ownership, response expectations, and failure fallback should remain visible and consistent across surfaces. | Product overview and CPO packet | CPO / operations owner | Defined handoff states, ownership, failure UI, and measurable service-level expectations |
| `AUD-RISK-010` | P0 | `LOCAL_ONLY` | Visa reminder materialization reads a reminder-timezone setting that is not present in the current local Settings definition. This is a concrete runtime/test blocker risk. | `06 Development/backend/app/services/visa_lifecycle.py`; `06 Development/backend/app/core/config.py` | CTO | Correct configuration contract plus direct tests; do not infer PASS from source presence |
| `AUD-RISK-011` | P1 | `LOCAL_ONLY` | No scheduler/invocation for reminder materialization and no Visa Cabinet frontend/bot changes are present in the current BALI-TASK-055 diff; several new tag/note/document/vault models also lack observed route-handler coverage. Full Stage 1 journey completeness is therefore unproven. | Current local diff and code-reference search | CTO + CPO | Exact scope map, API coverage, scheduler/worker decision, UI/bot handoff evidence, and end-to-end fixture tests |
| `AUD-RISK-012` | P1 | `DEPLOYED` documentation drift | Root `README.md`, `Project Snapshot.md`, and some operational checklists retain older “current” SHAs/schema claims than the latest canonical release checkpoint. | Those repo documents versus the Decision Ledger | Documentation & Release Manager | Separate authorized source-of-truth reconciliation; do not edit them under BALI-TASK-056 |
| `AUD-RISK-013` | P1 | `DEPLOYED` / `UNKNOWN` coverage | Cross-surface parity, longer EN labels, loading/error/offline/pending recovery, overlapping CTAs, safe areas, route-level visual context, and public/auth boundary need one responsive evidence matrix. | Approved Designer doctrine; current CPO risks | Designer + CPO + CTO | Review at 320/360/390/1440 with focus, contrast, reduced-motion, truncation, recovery, and boundary evidence |

## Known documentation and contract contradictions

These are audit targets, not authorization to edit the source files:

- `Project Snapshot.md` still presents the 2026-07-29 SHA `3405560` as current,
  while the last confirmed deployed checkpoint is `22bab5d…`.
- `06 Development/shared/README.md` retains a future-cutover `45 + 2 = 47`
  description that does not match the deployed localized/admin topology.
- `06 Development/shared/src/i18n/README.md` says localization is not wired to
  production, while BALI-TASK-051 release evidence says it is deployed.
- `ecosystem-routes.v1.json` describes two React routes and omits `/admin/`,
  while the canonical architecture records three React entrypoints.
- `Target Architecture v1.md` contains current topology plus explicitly
  historical `2/2`, `47/47`, and earlier cutover passages; readers can mistake
  the historical counters for current state.
- `06 Development/database/Database Schema.md` is an early conceptual schema
  and omits later exchange, session, admin, locale, portal, and local-only visa
  structures; it is not the current schema source of truth.

Owner: Documentation & Release Manager for source-map corrections, with CPO/CTO
for product/technical decisions. Any correction outside `AUDIT/*` needs a
separate authorized task.

## Binding constraints, not open design choices

- Founder-only approval gates remain in force.
- Public functional calculator/API/Nginx route is excluded.
- Visa and privacy pages remain noindex in RU and EN until separately approved.
- Visa facts require an official source and verification date.
- Visa Cabinet Stage 1 is manual-first.
- Full cabinet belongs in Mini App/account; Telegram provides summary + CTA.
- Bali is P0. Thailand readiness must not invent Thai rules.

External reviewers may challenge implementation quality or propose a simpler
solution, but cannot silently reverse these constraints.

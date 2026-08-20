# Roadmap and Active Sprints

This file describes sequencing only. It does not authorize implementation or
release. Status labels must be preserved in all external reviews.

## Active work

### BALI-TASK-055 — Visa Cabinet / CRM Stage 1

- Status: `LOCAL_ONLY` active sprint.
- Product direction: manual-first Visa Cabinet; full detail in Mini App/account;
  Telegram summary + CTA; P0 Bali; Thailand-ready architecture without Thai
  legal rules.
- Observed local scope: backend lifecycle API, model/service layer, local
  migration `c4f7a9d2e610`, configuration gates, and focused tests.
- Current migration status: `CREATED_NOT_APPLIED`.
- Not present in the current diff: Visa Cabinet frontend/bot delivery and an
  observed scheduler invocation for reminder materialization.
- Test status: `UNKNOWN` in this audit pack; test source exists, but no exact
  execution packet was supplied.
- Owners: CTO for technical implementation; CPO for product/source fidelity;
  Designer for approved UX evidence where required; Documentation & Release
  Manager for confirmed records only.
- Gate: no commit, push, migration, deploy, production data action, or user
  message without the ordinary Founder approval chain through Assistant Bali.
- Minimum next evidence: scope/contract reconciliation, resolved local blocker,
  security/privacy review, full test packet, migration checksum/head and
  isolated restore/U-D-U plan, exact changed-file list, rollback plan, and
  approval request.

### BALI-TASK-053 — prior release documentation reconciliation

- Status: `LOCAL_ONLY`, documentation SHA `UNASSIGNED`.
- Scope: four canonical docs already dirty before this audit-folder task.
- Boundary: do not combine or stage them with `AUDIT/*` without a new explicit
  Founder scope.

### BALI-TASK-056 — external audit folder

- Status: `LOCAL_ONLY`, `READY_FOR_AUDIT_FOLDER_COMMIT` only after consistency
  and diff checks pass.
- Scope: exactly `AUDIT/*`.
- Commit/push: requires the coordinated scoped action after verification; no
  code, migration, deploy, or production action belongs to this task.

## Deferred and planned work

### BALI-TASK-024 — public functional calculator

- Status: `PLANNED` as `IDEA / BLOCKED_BY_DEPENDENCIES`; not started.
- Owner: CPO.
- Dependencies: design sprint `CLOSED` and visas redesign `COMPLETED`.
- Current binding rule: public functional calculator/API/Nginx route remains
  excluded. The existing public page may provide a compact authenticated CTA.
- Next step only after both dependencies are proven: CPO brief, then normal
  approval chain.
- `UNKNOWN`: BALI-TASK-055 must not be assumed to satisfy the visas-redesign
  dependency without an explicit CPO/Founder record.

### Source freshness and country inventory

- Status: `PLANNED` / evidence gate.
- Revalidate dated visa/legal material against official sources before factual
  promotion or SEO cutover.
- Preserve noindex for visa/privacy RU and EN pages until separately approved.
- Keep Bali P0; describe Thailand as assisted/preparing until actual inventory
  and rules are verified. Do not fill other countries with invented data.

### Funnel, taxonomy, and browser parity

- Status: `UNKNOWN` baseline, `PLANNED` audit work.
- Establish first-session value and next action, route/item/order taxonomy,
  privacy-safe minimum analytics, and supported browser journey evidence.
- Recommendations from the external audit remain `PROPOSED`; CPO and CTO own
  their respective decisions, and Founder approval is never inferred.

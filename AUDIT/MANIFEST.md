# Audit Manifest

Repo-relative paths only. This manifest points to sources; it does not copy
secrets, generated artifacts, logs, or production evidence.

## Governance and project context

| Path | Purpose | Audit note |
| --- | --- | --- |
| `README.md` | Product narrative | Status section contains historical claims; compare with canonical release evidence. |
| `Project Snapshot.md` | Historical engineering handoff | Contains stale “current” checkpoints; do not treat every section as current. |
| `Project Index.md` | Working document map | Currently `LOCAL_ONLY` dirty from BALI-TASK-053; do not edit under this task. |
| `01 Project Core/Planning/SAFR_Bali_Roadmap.md` | Strategic roadmap | Planned intent, not execution evidence. |
| `06 Development/docs/MVP Task List.md` | MVP/backlog history | Mixed historical statuses; verify against later evidence. |
| `06 Development/docs/Decision Ledger.md` | Decision and release-evidence ledger | Canonical for approvals/reconciled release facts; currently has a local dirty patch. |
| `06 Development/docs/API Spec.md` | API/calculator contract | Canonical eight-route exchange contract; currently has a local dirty patch. |
| `06 Development/docs/Target Architecture v1.md` | Architecture and SoT matrix | Canonical architecture; currently has a local dirty patch. |
| `06 Development/docs/deploy/Web and Mini App Runbook.md` | Release procedure | Procedure only; does not prove an operation occurred. |

## Shared contracts and authored data

| Path | Purpose |
| --- | --- |
| `06 Development/shared/contracts/ecosystem-routes.v1.json` | Public/application route contract |
| `06 Development/shared/contracts/runtime-policy.v1.json` | Runtime/authentication boundary contract |
| `06 Development/shared/contracts/account-redirect.v1.json` | Canonical account redirect contract |
| `06 Development/shared/contracts/content-entry.v1.schema.json` | Content validation contract |
| `06 Development/shared/contracts/catalog-snapshot.v1.schema.json` | Generated snapshot contract |
| `06 Development/shared/content/legacy-content-registry.v1.json` | Visa/content verification registry; not transactional truth |
| `06 Development/shared/src/catalog.ts` | Authored catalog source |
| `06 Development/shared/src/i18n/` | Typed RU/EN authoring corpus and validator |
| `06 Development/shared/scripts/generate-catalog-snapshot.ts` | Catalog generator |
| `06 Development/shared/scripts/generate-i18n-runtime.ts` | Locale runtime generator |
| `06 Development/shared/design/tokens.v1.json` | Shared design-token source |
| `06 Development/shared/design/tokens.v1.css` | Shared CSS token source |

## Known-stale references to compare, not trust as current

- `06 Development/shared/README.md`
- `06 Development/shared/src/i18n/README.md`
- `06 Development/database/Database Schema.md`

Use these only to identify drift against canonical contracts and tracked
migrations. Do not promote their historical claims.

## Runtime applications and tests

| Path | Purpose |
| --- | --- |
| `06 Development/astro-site/src/` | Public Astro implementation |
| `06 Development/astro-site/tests/` | Public build, route, accessibility, and browser contracts |
| `06 Development/react-app/src/` | Mini App, account, and admin implementation |
| `06 Development/react-app/tests/` | Unit, build, runtime, Nginx-contract, and browser fixtures |
| `06 Development/bot/app/` | Telegram bot implementation |
| `06 Development/bot/tests/` | Bot regression/locale/admin tests |
| `06 Development/backend/app/` | FastAPI business logic, auth, models, and services |
| `06 Development/backend/tests/` | Backend unit/integration contract tests |
| `06 Development/backend/alembic/versions/` | Schema migration sources |

## BALI-TASK-055 local-only paths

All paths in this section are `LOCAL_ONLY`; source presence is not release
evidence.

- `06 Development/backend/app/api/web_portal.py` (modified)
- `06 Development/backend/app/core/config.py` (modified)
- `06 Development/backend/app/main.py` (modified)
- `06 Development/backend/app/models/__init__.py` (modified)
- `06 Development/backend/alembic/versions/c4f7a9d2e610_add_visa_lifecycle_stage1.py`
- `06 Development/backend/app/api/visa_lifecycle.py`
- `06 Development/backend/app/models/visa_lifecycle.py`
- `06 Development/backend/app/services/visa_lifecycle.py`
- `06 Development/backend/tests/test_visa_lifecycle.py`

## Excluded from external review and GitHub audit content

- `.env*`, credential/key files, local settings containing secret values;
- `06 Development/artifacts/` and visual evidence unless a separately reviewed,
  redacted artifact is explicitly approved;
- `shared/content/generated/`, build outputs, caches, dependency directories,
  test-result folders, coverage output, and generated snapshots;
- database dumps, backup locations/checksums, production filesystem paths,
  production environment values, raw logs, and service journals;
- customer/staff records, identifiers, messages, documents, screenshots, or
  transaction data;
- any path not required to answer an exact audit question.

If an excluded item seems necessary, record `NEEDS_EVIDENCE` and ask the
internal owner for a sanitized evidence summary. Do not request the raw item.

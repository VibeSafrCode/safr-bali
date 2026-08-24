# Audit Manifest

Repo-relative paths only. This manifest points to sources; it does not copy
secrets, generated artifacts, production evidence or customer data.

## Governance and project context

| Path | Purpose | Audit note |
| --- | --- | --- |
| `README.md` | Product narrative | May contain historical status; compare with `CURRENT_STATE.md` and canonical release evidence |
| `Project Snapshot.md` | Historical handoff | Treat dated “current” statements as historical |
| `Project Index.md` | Working document map | Local dirty state may differ from GitHub; source presence is not deployment evidence |
| `01 Project Core/Planning/SAFR_Bali_Roadmap.md` | Strategic roadmap | Intent, not execution evidence |
| `06 Development/docs/MVP Task List.md` | Backlog/history | Mixed historical statuses |
| `06 Development/docs/Decision Ledger.md` | Founder decisions and release facts | Canonical for recorded approvals, but verify exact branch state |
| `06 Development/docs/API Spec.md` | API/business contract | Compare prose with schemas/services/tests |
| `06 Development/docs/Target Architecture v1.md` | Architecture and SoT ownership | Historical passages may coexist with current topology |
| `06 Development/docs/deploy/Web and Mini App Runbook.md` | Release procedure | Procedure alone is not release proof |

## Shared contracts and authored content

- `06 Development/shared/contracts/`
- `06 Development/shared/src/catalog.ts`
- `06 Development/shared/src/i18n/`
- `06 Development/shared/scripts/generate-catalog-snapshot.ts`
- `06 Development/shared/scripts/generate-i18n-runtime.ts`
- `06 Development/shared/design/tokens.v1.json`
- `06 Development/shared/design/tokens.v1.css`
- `06 Development/shared/content/legacy-content-registry.v1.json`

Generated snapshots are consumer artifacts, not an authoring source.

## Public site and Web/PWA

- `06 Development/astro-site/src/`
- `06 Development/astro-site/tests/`
- `06 Development/react-app/src/`
- `06 Development/react-app/public/manifest.webmanifest`
- `06 Development/react-app/public/sw.js`
- `06 Development/react-app/public/offline.html`
- `06 Development/react-app/public/assets/pwa/`
- `06 Development/react-app/vite.config.ts`
- `06 Development/react-app/tests/`
- `06 Development/deploy/nginx/safr-web.conf`

Pay special attention to:

- `react-app/src/surfaces/AdminApp.tsx`
- `react-app/src/surfaces/AccountApp.tsx`
- `react-app/src/surfaces/MiniApp.tsx`
- `react-app/src/components/AdminVisaCRM.tsx`
- `react-app/src/components/VisaCabinet.tsx`
- `react-app/src/components/VisaStatusHelp.tsx`
- `react-app/src/components/AppearanceControls.tsx`
- `react-app/src/components/PwaLifecycle.tsx`

## Backend, schema and Telegram

- `06 Development/backend/app/`
- `06 Development/backend/tests/`
- `06 Development/backend/alembic/versions/`
- `06 Development/bot/app/`
- `06 Development/bot/tests/`

High-value review paths:

- `backend/app/api/web_admin.py`
- `backend/app/api/visa_lifecycle.py`
- `backend/app/services/visa_lifecycle.py`
- `backend/app/models/visa_lifecycle.py`
- `backend/app/services/referral_attribution.py`
- `backend/app/models/referral.py`
- `backend/app/scripts/reconcile_referrals.py`
- `backend/alembic/versions/a91b0c2d3e41_add_referral_reward_invariants.py`
- `backend/alembic/versions/c4f7a9d2e610_add_visa_lifecycle_stage1.py`
- `backend/alembic/versions/d5e8b0c3f721_expand_visa_types_and_dialogue_delivery.py`
- `backend/alembic/versions/f7a1c2d3e465_add_new_user_review_state.py`
- `bot/app/handlers/visas.py`
- `bot/app/handlers/web_chat.py`
- `bot/app/services/backend_client.py`
- `bot/app/services/web_chat_bridge.py`

## Known-stale comparison sources

- `06 Development/shared/README.md`
- `06 Development/shared/src/i18n/README.md`
- `06 Development/database/Database Schema.md`

Use them to identify drift; never promote their historical claims silently.

## Audit package

All tracked `AUDIT/*.md` files are in scope. They are summaries and may not
override canonical sources.

## Excluded from external review

- `.env*`, secret/key/credential material, cookies and local settings;
- `06 Development/artifacts/`, screenshots and test recordings;
- generated/build output, caches, dependency folders, coverage and test-result
  directories;
- database dumps, backup paths/checksums, production filesystem paths,
  service journals and raw logs;
- customer/staff records, Telegram IDs, usernames, messages, documents,
  passport/visa identifiers, immigration credentials and transaction rows;
- `06 Development/react-app/native-shell/` while it remains local/deferred;
- untracked or locally modified files not visible at the reviewed GitHub SHA;
- any path not required to answer a stated audit question.

If excluded evidence is necessary, return `NEEDS_EVIDENCE` and ask the internal
owner for a sanitized summary. Do not request raw evidence.

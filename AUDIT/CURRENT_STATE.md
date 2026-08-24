# Current State

Snapshot date: `2026-08-24`.

## State matrix

| Item | Status | Evidence recorded for this snapshot | What is not claimed |
| --- | --- | --- | --- |
| Repository branch | `PUSHED` | `codex/safrway-stabilization`; local and remote were verified at `bc93ebf2843cce96098d4881d1e425fc73e71f86` after BALI-TASK-066 | The reviewer must verify the current GitHub SHA again at audit start |
| Unified Web App / PWA | `DEPLOYED` | Exact code SHA `bc93ebf…`; Astro and React immutable artifacts, 88/88 public-route smoke, PWA root assets/icons, install scope, offline boundary, RU/EN and light/dark evidence passed | Native `.app`/`.apk` distribution is not included |
| Public Astro site | `DEPLOYED` | 44 RU + 44 EN HTML routes; sitemap 72; noindex 16; canonical/hreflang/theme/CSP release smoke passed | No claim that search engines or AI systems rank the pages favorably |
| Telegram bot | `DEPLOYED` | RU/EN menu and Visa Cabinet summary flows are present in the deployed release chain; service health passed | No real customer message was sent as release smoke |
| Mini App and browser account | `DEPLOYED` | Shared authenticated React experience, RU/EN, dark/light, Visa Cabinet, account and PWA shell | Authenticated production mutations remain intentionally limited by safe-smoke policy |
| Admin Web App | `DEPLOYED` | Telegram OIDC root-admin access; dashboard/drill-downs, clients, Visa CRM/dialogue, settings/history/request controls | Future Bali-manager RBAC and several UX improvements are not implemented |
| Visa lifecycle / CRM | `DEPLOYED` | Release chain through `fd45301`, `6cc761e`, and `bc93ebf`; migration head `f7a1c2d3e465`; client isolation, publication, status help, aggregate save and dialogue contracts tested | Protected document content is unavailable while production key/storage/scanner configuration is absent |
| Production schema | `DEPLOYED` | Last recorded production Alembic head `f7a1c2d3e465`; BALI-TASK-066 contained no schema/data migration | Audit files do not prove future/current DB state; operations evidence remains outside GitHub |
| Telegram OIDC | `DEPLOYED` | Founder completed the production login; root-admin access succeeded; secrets are not stored in this pack | Credential values and production environment are intentionally excluded |
| Protected document storage | `FAIL_CLOSED` | Upload/download capability remains disabled without configured encryption key, private storage root, and scanner | No document-storage rollout is claimed |
| Native wrappers | `LOCAL_ONLY` / `DEFERRED` | Local Capacitor scaffolding exists outside the deployed Web/PWA acceptance scope | No `.app`, `.apk`, store listing, native OIDC, or deep-link release |
| BALI-TASK-067 | `PLANNED` / `NOT_STARTED` | Founder backlog summarized in `ROADMAP_AND_ACTIVE_SPRINTS.md` | No code, migration, test, commit, release, data correction, or production action |
| External GPT Pro audit | `PLANNED` | This refreshed package is intended for a Founder-controlled read-only review before BALI-TASK-067 | No external findings have been received or accepted yet |

## Last recorded release evidence

- Code SHA: `bc93ebf2843cce96098d4881d1e425fc73e71f86`.
- Public routes: `88/88 PASS`; sitemap `72`; noindex pages `16`.
- Web/PWA: root manifest, service worker, offline shell, build-version file,
  and three manifest icons returned the expected artifact hashes and MIME
  types in release smoke.
- Production browser smoke covered RU/EN, 390/1440, theme switching, PWA install
  and offline behavior.
- Backend, bot, Nginx, health and DB health were active/healthy with no recent
  error journal lines in the release packet.
- BALI-TASK-066 made no DB migration, customer-data write, customer message,
  Cloudflare/DNS change, or secret change.

## Worktree boundary

At snapshot time, unrelated/pre-existing local changes existed outside
`AUDIT/*`, including protected governance documents, deferred native metadata
and generated artifacts. They are not evidence for this pack and must not be
staged or bundled with an audit-only update.

## Unknown or deliberately unverified

- Search/AI-discovery performance and real production conversion metrics.
- End-to-end authenticated mutation behavior using real customer data; release
  checks deliberately avoid customer writes and messages.
- Production document encryption/storage/scanner operations because the
  capability is fail-closed.
- Telegram avatar access/retention/privacy feasibility.
- A supported immutable referral-correction mechanism and global
  reconciliation result.
- The exact implementation design and release estimate for BALI-TASK-067 until
  CTO/CPO/Designer triage external findings.

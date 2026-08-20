# Current State

Snapshot date: 2026-08-20. Initial audit-pack commit/pushed SHA:
`7fd4b07d60b5f0a0a7bfeabacf9fff4ce57989c5`. The reviewer must resolve and
record the exact current branch SHA shown by GitHub at audit start.

## State matrix

| Item | Status | Evidence | What is not claimed |
| --- | --- | --- | --- |
| Repository branch | `PUSHED` documentation HEAD over deployed code parent | `codex/safrway-stabilization`; initial audit-only commit `7fd4b07d60b5f0a0a7bfeabacf9fff4ce57989c5`, whose parent is deployed code SHA `22bab5d2c2aa8009ed958019a8e7ac0d56533a0b`; exact current review SHA must be read from GitHub at audit start | Documentation push is not a code deploy; no later branch state is inferred here |
| BALI-TASK-051 RU/EN release | `DEPLOYED` | Confirmed release packet: code SHA `22bab5d2c2aa8009ed958019a8e7ac0d56533a0b`; 44 RU + 44 EN origin smoke; active services and artifacts verified | Version remains `VERSION_UNASSIGNED` |
| Production DB migration | `DEPLOYED` | Confirmed head `b8d2e4f6a710`; isolated restore and U-D-U plus production backfill evidence passed | No later DB state inferred |
| Four canonical docs | `LOCAL_ONLY` | `API Spec.md`, `Decision Ledger.md`, `Target Architecture v1.md`, and `Project Index.md` contain the prepared BALI-TASK-053 reconciliation | No documentation commit/push claimed |
| BALI-TASK-055 Visa Cabinet / CRM | `LOCAL_ONLY` | Modified/new backend API, model, service, migration, and test files in the worktree | No test, commit, push, migration apply, deploy, or production smoke claimed here |
| Visa migration `c4f7a9d2e610` | `LOCAL_ONLY` / `CREATED_NOT_APPLIED` | Local migration file; declared parent `b8d2e4f6a710` | It is not a production head |
| Existing artifacts directory | `LOCAL_ONLY` / out of scope | Pre-existing untracked `06 Development/artifacts/` | Not reviewed, copied, staged, or changed by BALI-TASK-056 |
| AUDIT folder | `PUSHED` | Initial pack: 12 files, 845 insertions, commit `7fd4b07d60b5f0a0a7bfeabacf9fff4ce57989c5`; resolve current review SHA from the GitHub branch | `PUSHED` is not `DEPLOYED` and does not grant operational authority |

## Last confirmed deployed language release

- Code SHA: `22bab5d2c2aa8009ed958019a8e7ac0d56533a0b`.
- Public origin smoke: `88/88 PASS` (`44 RU + 44 EN`).
- Locale SEO/canonical/hreflang and sitemap/noindex matrices: `PASS` in the
  release packet.
- Auth-safe Mini App locale sync and EN calculator fixture: `PASS`; real writes
  were intercepted.
- Backend locale tests `3/3` and bot locale/legacy/dashboard/sensitive
  dispatch `7/7`: `PASS`.
- No customer transaction/message, bulk message, secret, Cloudflare/DNS, or
  unrelated-scope change was part of that release.

## Local-only worktree boundaries

The active Visa Cabinet sprint changes backend code and proposes migration
`c4f7a9d2e610`. It must be reviewed as a candidate only. The current local
files show an intended Stage 1 manual-first system, but source presence does
not prove behavior or release readiness.

The four canonical documents are already dirty from the prior authorized
reconciliation. BALI-TASK-056 must not modify, stage, or bundle them. Any future
audit-documentation change must remain scoped to the explicitly authorized
files unless a new Founder scope says otherwise.

## Unknown or deliberately unverified

- Production state after the last confirmed BALI-TASK-051 evidence packet.
- Real authenticated customer transaction/message behavior for the latest
  release; safety gates intentionally avoided such writes.
- Browser account parity and live OIDC journey completeness.
- BALI-TASK-055 test matrix, security review, migration rehearsal, and release
  readiness until exact packets are supplied.

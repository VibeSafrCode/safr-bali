# Admin/services release — 2026-09-29

Founder explicitly approved the local settings structure and combined implementation, scoped Git publication and deployment. Final direction: warm near-black admin, muted amber accent, semantic red, restrained motion; light/client appearance unchanged. ВайбДиз relayed the approval and the primary checked the original Founder message.

## Exact release scope

React admin compact visa editor, safe date patches, service tiles/navigation and generic other service; grouped business settings; client service reminder preferences; reminder backend/bot and additive migrations, globally OFF. Prior public-site/YouTube API work, native work, fixtures, screenshots, private local configuration and protected governance files are excluded.

UI invariants and detailed local evidence: BALI-ADMIN-LOCAL-20260929.md. Reminder behavior: BALI-SERVICE-REMINDERS-20260929.md. Runtime migration and data contract: runtime BALI-ADMIN-OTHER-20260929.md.

## Final design

Admin dark only: background 090909, panel 171614, raised 211f1a, border 39352d; text f2eee6, muted b5aea0, accent d7b86b, danger db9285. Reviewed text/background contrast pairs 6.63–17.21:1. A cascade conflict in active legacy tabs was fixed; active text uses amber on raised background, 8.59:1.

Controls 170ms, dialogs 160–180ms, dark disclosure/menu fade160ms; no perpetual animation. Reduced-motion disables animation/transitions. Designer bounded source gate PASS, no open P1/P2. Founder reviewed local settings. Independent device rendering/runtime gate is not claimed.

## Prepublication evidence

- Current production runtime read-only check: f711d3ab216caa8e98df7ec38955392f5b5acc3e, tracked checkout clean, backend/bot active.
- 30 focused frontend contract tests PASS; TypeScript PASS.
- 69 backend reminder/API/visa safety tests PASS. Existing datetime deprecation warnings remain non-blocking.
- New other-service tests and dedicated PostgreSQL proof recorded in runtime packet.
- Production remains unchanged at this checkpoint. Git publication, backup/restore, migration and activation evidence must be appended explicitly.

## Release safety

No real client/test messages. Service reminders remain globally disabled; onboarding remains disabled. Production migration is forbidden until fresh private backup, isolated restore equality and both migrations U-D-U pass. Keep compatible app readers and additive schema on application rollback; never delete or reclassify other records to force schema downgrade. Preserve secret modes/hashes and config.py group-read exception; preserve public-site release and Nginx config.

## Final publication and production result — 2026-09-29 15:54 UTC

**DEPLOYED / VERIFIED.** This supersedes the prepublication checkpoint above.

- Frontend source: `4e8e83bac98461b1bbf8e218ecbc1e9fa44e5b4c`,
  branch `codex/bali-integrated-release-20260922`, React build `4e8e83b`.
- Runtime source: `61fb53569721711600ba513d1f56e42a90d07eb7`,
  branch `codex/bali-life-runtime-20260922`.
- Both exact branch refs independently verified after HTTPS push. Initial SSH
  transport failures were resolved; no force-push, secret exposure or permission
  expansion was used. No merge into main was performed or claimed.
- Public Astro site remains build `ebe4171`; its pending YouTube work is excluded.
- Production schema: `c8e3f7a1d502`; backend/bot active and runtime checkout clean.

Local PostgreSQL 16.14: clean 28-revision historical chain, eleven real PostgreSQL
tests, combined U-D-U, used-state downgrade refusal, and synthetic dump/restore
passed. Four backup-comparator tests include eleven negative schema mutations.
The dedicated headless socket-only cluster was stopped and artifacts preserved.

Fresh root-private production backup and isolated restore: PASS for all 47
original application tables and 46 original sequences. Exact row/column/schema,
constraint/index/owner equality verified through a9→b7→c8→b7→a9→b7→c8. Only the
reviewed additive schema changes are permitted. The source stayed at a9 during
the proof. Private proof, checksums, environment/runtime archives and isolated
restore database are retained on the deployment host. No customer data enters
this audit packet.

Activation followed proof and verified Git publication. Both writers were
stopped/drained before live code/migration changes. Secret hashes/modes/owners
and the existing config.py group-read exception were preserved. Only the React
static symlink changed; public-site symlink and Nginx configuration were unchanged.

Read-only production checks PASS:

- Exact app/public build IDs; main, insurance, account Life, admin and settings HTTP200.
- API health and database readiness HTTP200.
- Anonymous Life/reminder-settings/onboarding access denied (401/403).
- Published FX snapshot `35660` fresh with positive rate and future expiry at check time.
- Onboarding OFF; service-expiry policy absent (default OFF); both delivery ledgers empty.
- Exact runtime revision, clean source, static release target and active services.

Rollback: retain additive schema and all data. Drain writers before checking for
other-kind records; do not restore old readers if any exist, even draft/archived.
Only a compatible rollback can restore previous runtime `f711d3a` and React
`ebe4171`; verify health/readiness and preserved state before claiming recovery.
The reviewed activation script and before/after records are retained privately
on the deployment host. Independent static activation review: no remaining P1/P2.

Residual boundaries: no real Telegram-send test, authenticated production client
mutation, or independent device-rendering pass was claimed. Global notification
activation and public YouTube publication remain separate pending work. No
release-announcement broadcast was implemented or sent by this package.

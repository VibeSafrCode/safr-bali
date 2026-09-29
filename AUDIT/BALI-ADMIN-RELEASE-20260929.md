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

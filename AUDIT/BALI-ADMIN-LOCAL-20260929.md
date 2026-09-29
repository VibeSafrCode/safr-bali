# Local admin integration checkpoint — 2026-09-29

Status: implemented locally; no commit, push, deployment, production mutation or real customer message. This checkpoint is not a production release claim.

## Scope and preserved work

Continues the existing local admin implementation and the Founder requests relayed through the explicitly activated ВайбДиз conversation. No new product initiative. Prior YouTube, reminders, client design, native artifacts and unrelated dirty work were preserved. This packet contains synthetic identifiers only; production client 14 was not accessed or changed for testing.

### Visa editor

- Compact service/process statuses with Russian/English labels and original backend codes. Application PROCESSING can display awaiting issuance; payment does not fabricate an application/process.
- The issued switch only handles NOT_ISSUED ↔ ISSUED_NOT_ACTIVATED. Active, extended and terminal states are not silently rewritten.
- Confirmed date fields preserve existing values/source and stay editable when the last value is cleared. PATCH omits unchanged dates; explicit clearing remains explicit. New dates require an explicit source.
- Advanced lifecycle, contact plan, processes, documents, assignments and notification history remain available in disclosures.
- Both hide controls reset send consent; save guard respects publication and client opt-out. Payload retry keys, aggregate version conflict and confirmation behavior remain intact.
- Backend admin projection includes date_source. Client reads/mutations/replays use the client projection; internal source does not leak. Sparse event payloads no longer turn omitted fields into date removals.

Files: React components/AdminVisaCRM.tsx, visaEditorState.ts, visa-editor.css; runtime visa_lifecycle.py, visa_notifications.py and focused tests.

### Client services

- Compact icon tiles, left-aligned adaptive grid, category/publication/end or monthly summary; no forced title clipping. Phone two columns when space permits, narrow screen one.
- Explicit filters and an Add type menu for bike, housing, insurance and supported other records. Mobile add wrapper occupies a full row so the menu stays within its container.
- Real section anchors replace decorative client navigation. Documents/history remain inside their visa editor, not dead top-level tabs.
- Other services use a real backend kind, not an unknown enum or a public product catalogue substitute. A published other service needs a title; applicable dates, total price and contact are optional. Quantity is retained; price remains the agreed total, not multiplied silently.
- Client web/Mini App readers show other records with neutral date labels; private owner details and internal notes stay staff-only. No end date means no invented expiry reminder.

Files: AdminLifeServices.tsx, admin-life-tiles.css, lifeServiceTypes.ts, lifeServices.ts, BaliLifeCabinet.tsx, AdminServiceReminders.tsx.

### Business settings and dark theme

- Shared categories/search: visas, bikes, housing, insurance, assistance, other.
- Exact type/key union of real settings entities and priced entities. No-SKU/no-price/unknown-category entities remain visible; unknown availability is not falsely marked hidden.
- Price variants (e.g. D12) nest under one entity. Per-entity price ↔ availability links retain one mounted pricing state and stable settings editors. Save/version/API semantics remain separate.
- FX, exchange routes and notifications stay separate.
- Dark admin uses warm near-black surfaces only; public/client and light palettes are not replaced. Founder final polish replaces the earlier mint accent with muted amber; semantic red stays reserved for errors/urgency. Final reviewed token pairs are 6.63–17.21:1; this is not a whole-application WCAG certification. See BALI-ADMIN-RELEASE-20260929.md.

Files: AdminBusinessWorkspace.tsx, AdminPricingCatalog.tsx, businessCategories.ts, business-settings.css, admin.css, admin-design.css.

## Evidence

- TypeScript build: PASS.
- Vite production build: PASS, 104 modules, admin JS 234.34 kB / gzip 63.59 kB. No deploy.
- Focused frontend: 19 tests PASS (visa editor/date presentation/life service validation/other) plus 7 business grouping tests PASS; 26 distinct tests. Relevant changed tests re-run after integration.
- Runtime visa safety tests: 11 PASS.
- Runtime service/API validation: 62 PASS; 5 PostgreSQL integration/migration tests SKIPPED, isolated PostgreSQL URL unavailable.
- Bot reminder rendering: 4 tests OK.
- Git diff whitespace checks: PASS.
- Local fixture HTTP: admin client/settings pages and changed modules HTTP 200; 5 synthetic visa types + 5 service catalogue records including no SKU. Generic-service create/replay/private-field exclusion/version conflict PASS. Notification writes explicitly rejected.
- Designer source-only reviews: visa editor P2 fixes closed; business search P2 fixed to 44px with 16px phone text; mobile add menu corrected to full-row container alignment. ВайбДиз explicitly confirmed both final P2 CLOSED and no open P1/P2 in the bounded reviewed scope. Suitable for local display by source review, not a runtime/visual PASS.
- Browser rendering, pointer/keyboard interaction, mobile/iPad screenshots and actual production verification: NOT RUN. No external browser was launched.

## Local preview

http://127.0.0.1:4369/admin/clients/5/

http://127.0.0.1:4369/admin/settings/

tests/life-review-preview.mjs intercepts all API traffic. Visa/service/reminder writes exist in memory only and reset on restart. Business settings and historical public prices are read-only. No backend or Telegram connection. Preview is not deployment evidence.

## Release blockers and rollback

1. Obtain a real visual/interaction gate on phone/tablet/desktop without claiming source review equals rendering.
2. Isolated PostgreSQL backup/restore and upgrade → downgrade → upgrade remain NOT RUN for the reminder + other-service chain.
3. New migration c8e3f7a1d502 descends from b7d2e6a9c410, which descends from currently deployed a9c28b017d60. New migration replaces only three constraints; no existing row is rewritten.
4. Downgrade acquires a table lock and refuses if any other record exists, including drafts/archives. Do not delete/reclassify client data to force rollback. Once other records are used, retain compatible API/bot/client readers and prefer a forward fix; an old app/schema rollback is not automatically safe.
5. Apply a coordinated compatible runtime/bot/schema/frontend release only after the gates and explicit release authority. Local implementation, Git publication and production release remain separate.

The YouTube API live-response verification and prior reminders PostgreSQL gates retain their separate audit statuses; this admin work does not close them.

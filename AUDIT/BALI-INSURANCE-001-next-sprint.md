# BALI-INSURANCE-001 — public insurance catalogue

Founder request: 2026-09-23. ACTIVE COMBINED IMPLEMENTATION.
Founder subsequently explicitly authorized the sprint, push and deployment.
Historical hold/backlog statements below are retained as checkpoints, superseded
by this authorization and the current record in BALI-SERVICES-20260923-release.md.
No production change is claimed until verified in that record.

## Acceptance

- Public service tile and page for Bali, Thailand, Nepal and UAE; absent in Russia.
- Site and Mini App share LUMA and SafetyWing names and brief factual descriptions.
- Individual quote only: message the manager to agree on the option and price.
- Country and selected provider carried into the existing manager enquiry flow.
- Existing design reused: shield tile; two provider columns on desktop, one on
  mobile; readable themes, 44px controls, keyboard focus. No new booking/payment flow.
- Existing client-only “My insurance” and admin saved policy records stay unchanged.

## Sources and design

Brand spelling/general descriptions checked against https://www.lumahealth.com/about-us/
and https://safetywing.com/ on 2026-09-23. No coverage limits, eligibility promises,
affiliation claims or fixed premiums are published. Plan availability is confirmed
individually; Nepal mountain activities are not automatically represented as covered.

VibeDis text-only recommendation received: reuse service shell and tiles, place
after bikes (or housing/visas where no bikes), preserve other service order.
No browser-based visual acceptance is claimed. Founder prohibited new external
browser launches; do not start Comet/Chrome/Chromium/Playwright/headless previews.

## Release gate

### Founder additions — 2026-09-23, screenshot 11:58:24

Status: BACKLOG ONLY, not implemented. Include in the same next combined sprint.

1. Align the services surface and its service-tile grid to the left content edge,
   rather than centering the block as in the supplied Bali screenshot. Apply
   consistently across destinations, public site and Mini App/web app, including
   mobile layouts; preserve service ordering and responsive spacing. This does
   not automatically require moving icon captions within each tile.
2. Reduce background darkening throughout the interface, without removing the
   overlay entirely. Keep the destination images more visible while preserving
   text/button readability in both themes, client and admin surfaces where such
   backgrounds exist, and on mobile/desktop. Do not choose a fixed opacity before
   checking the different background images. Coordinate the balance with VibeDis.

Founder requested recording these additions only. Do not implement, push or deploy
them now; wait for the remaining additions and combined-release authorization.

### Founder addition — bike service editor, 2026-09-23

Status: BACKLOG ONLY, not implemented; same combined sprint/release hold.

- In the personal-account services bike editor, add quantity (number of bikes).
  Suggested technical default: 1; accept positive whole numbers. Preserve existing
  records without requiring a manual quantity migration by the operator.
- Add a button/toggle labelled “Помесячно” (monthly rental). When enabled, the
  return/end date is not required; saving must work without selecting it. Keep
  the rental start date. Fixed-term rentals retain their required return date.
- Reflect the mode in the customer service card so an open-ended monthly rental
  is not presented as an unknown/overdue fixed end date; never invent a return date.
  Validate optional end dates consistently in UI/API/storage, not only visually.
- Do not infer automated monthly billing, payment collection, reminders or price
  multiplication from this request. Quantity/price semantics must be labelled
  explicitly during implementation; no silent changes to existing agreed prices.

Record local build/contract results below. Browser QA/CI/release remain unexecuted
unless explicitly evidenced. Wait for Founder additions and combined-release approval.

## Local evidence — 2026-09-23

- Astro check: 0 errors/warnings/hints; build: 103 pages (50 RU + 50 EN
  contracted public documents, existing UAE hub RU/EN and 404).
- Astro non-browser tests: 54 PASS, 1 SKIP. The skipped test requires a Python
  bot dependency environment for actual visa-renderer parity; no visa copy changed.
- React TypeScript/build: PASS; unit tests: 34 PASS; build contracts: 40 PASS.
- New tests cover four countries/two locales, Russia exclusion, both brand names,
  individual pricing copy, entry links, country background and named manager CTAs.
- Bounded route-contract/reference-model tests: 20 PASS (specialist evidence).
- Shared contract tests rechecked after integration: 10 PASS. Existing browser
  count/status expectations updated for the new tile, but not executed.
- Reference Next/Vinext full typecheck/export not completed: local reference
  dependencies absent, installer could not resolve registry; retry was stopped.
  Standalone UAE reference page is prepared. Legacy manual export-static.mjs
  still omits standalone routes; active framework export must be checked before release.
- VibeDis accepted the text specification without further design objections;
  this is not a browser visual PASS. No browser, preview server, CI run, push,
  deployment, production configuration change or client message was performed.
- React review: stable provider keys, module-level static copy, no new network
  requests/effects/listeners in React components, native labelled buttons and links.
- Existing support form replaces an untouched auto-filled enquiry when switching
  provider; it preserves user-edited text. Runtime browser verification is pending.
- Independent static review found one P2 context mismatch in the public CTA;
  corrected by explicitly retaining selected provider and canonical country/section
  in the enquiry payload, independently of the editable message. Added unit and
  emitted-HTML checks. No messages were sent during verification.

Release with the Founder's other additions, not independently. Preserve the
previous LIFE deployment record and unrelated native/deferred work.

## Founder addition — client filter “С услугами”, 2026-09-23

Status: BACKLOG ONLY; same combined sprint, no implementation/push/deploy yet.

- Add “С услугами” to the client/user list filters: clients with at least one
  recorded service, including visas, housing, bikes or insurance. Do not count
  only visas or only one storage model; support subsequent service categories.
- Combine with existing filters and reset behaviour. At implementation, explicitly
  reconcile draft/hidden/archived service inclusion with existing list/count
  semantics, so the filter and displayed service counts agree. Founder has not
  requested an active-services-only restriction.

## VibeDis handoff pending — life-service countdown, 2026-09-23

Founder request relayed by VibeDis: in the free right-hand area of “Моя жизнь
на Бали” cards, show “Осталось”, a large number, and “дней” for dated services.
Status: DESIGN PATCH IN PREPARATION in the Designer checkout, not integrated here
or deployed. Same combined-release hold; Designer supplies a bounded patch.

- Cover visas, housing, bikes and insurance with a confirmed applicable end date;
  preserve the visa model's existing entry-deadline/stay-until semantics.
- Monthly rentals without a return date have no invented countdown; display the
  rental mode instead. Missing dates must not be coerced into zero days.
- Define calendar-day/timezone, today, expired and future-start cases explicitly;
  avoid misleading negative “remaining” days, UTC date shifts or a stale demo date.
- Preserve RU/EN localisation, narrow-screen text space, legibility and existing
  service details; no live client data in demo fixtures.
- Primary does not concurrently edit BaliLifeCabinet/lifeServices/life-services.css.
  Review/integrate only after receiving patch base, scoped file list and evidence.
  No push/deploy until Founder authorizes the combined release. Demo evidence is
  not production verification; primary launches no browsers or preview servers.

## Founder addition — “Моё жильё” and housing editor, 2026-09-23

Status: BACKLOG ONLY; same combined sprint and release hold. Screenshot 12:21:47
already shows the “Моё жильё” category with zero records: extend that existing
category rather than creating a duplicate tab or treating zero as missing UI.

- In Admin, select housing type: “Гестхаус”, “Отель”, “Апартаменты”, “Вилла”.
  Keep existing housing records compatible; do not silently classify all old
  records as villas or discard their descriptions/links.
- Record owner contact, agreed price/currency and rental dates. Owner details
  remain staff-only under the existing private/public field boundary; any contact
  intentionally published to clients uses the existing separate public field.
- Add “Помесячно”: open-ended monthly rental, no mandatory end/return date.
  Clearly label the agreed monthly price; do not manufacture a one-month expiry
  or automatically charge, renew, multiply or rewrite existing prices.
- In the client's “Моё жильё” and combined “Моя жизнь на Бали”, show housing type,
  agreed client-visible price and fixed dates or “Помесячно / без даты окончания”.
  Align with the pending countdown: no “Осталось N дней” for open-ended housing.
- Coordinate optional end-date validation/storage with the analogous bike mode;
  preserve fixed-term date validation and existing service records.
- Founder explicitly requires design agreement with VibeDis (2026-09-23): Admin
  housing-type selector, contact/price/date fields, monthly-mode behaviour, client
  housing cards and consistency with bike quantity/monthly mode and countdown.
  VibeDis returned specification approval on 2026-09-23. This is not implemented
  housing/backend code or runtime visual acceptance.

### VibeDis-approved housing/bike specification

- Admin: compact housing-type selection, then name; “На срок / Помесячно” toggle.
  Fixed-term: paired “Заезд / Выезд”; monthly: only “Заезд” and “Без даты окончания”.
- Price and currency together, with explicit “в месяц” in monthly mode and no
  auto-charge claim. Owner contact labelled “Только для команды”; separately and
  explicitly entered client contact. Two field columns on desktop, one on mobile;
  existing theme/error tokens and at least 44px interaction targets.
- Client housing card: type/name, agreed monthly price if present, arrival date;
  compact “Помесячно” in the right-hand area instead of a fictitious countdown.
  Bikes use the same mode and a localised quantity label beside the name.
- Countdown must return no day count when end_date is null, including records
  whose start date is in the future. Backend/schema changes remain separate from
  the Designer countdown patch.

### Additional Founder countdown rules relayed by VibeDis

- 0–6 remaining days: red digits and “Срочно свяжитесь с менеджером”.
- 7–14 remaining days: yellow-orange digits and “Пора обратиться к менеджеру”.
- 15 or more remaining days: normal colour.
- Include text as well as colour, retain RU/EN and contrast requirements; handle
  expired dates explicitly rather than silently calling them zero days.
- Designer is preparing this in the bounded countdown handoff. Primary has not
  integrated or deployed it; the combined-release hold remains in force.

### Countdown packet received — 2026-09-23

Status: RECEIVED / NOT APPLIED. Base `250ce557cb3a5962928440b4eaebf284afc173c7`.
Packet `life-countdown-20260923.patch`, digest checked by primary:
`68800492de5771af383793e46e085a8111e543fe12e4b17b6708d27b83898711`.
Allowlist: React components `BaliLifeCabinet.tsx`, `lifeServices.ts`,
`life-services.css`, and `tests/life-countdown.test.ts` only. Manifest also supplies
per-file before/after hashes. Primary has not yet completed code review/integration.

Designer reports TypeScript/Vite build and 12 focused tests PASS, independent
source review PASS; no visual runtime PASS. Includes compact brand/title header,
single-line intro, 44px refresh icon and right-aligned All action. Countdown uses
Bali calendar dates; future-start services count to start (label must distinguish
this from remaining rental time); details retain both dates. No date for monthly
records, no timer for cancelled/refused/expired visas. Verify exact semantics at
integration rather than treating the handoff summary as runtime proof.

## Founder navigation addition relayed by VibeDis — 2026-09-23

Status: next-sprint local UI preparation only; no production authority change.

- Five tabs: “Главная / Услуги / Моя жизнь / Профиль / Поддержка”. Replace the
  bottom “Мои визы” entry with central highlighted “Моя жизнь”. Make My Life the
  default when opening the Mini App cabinet, while preserving explicit deep links.
- Move “Заявки” from the bottom navigation into the bottom of Services. Preserve
  the existing list, details, access checks and historical records.
- Pending payment-to-Life agreement: unpaid requests stay in Requests and do not
  become registered services. A verified payment is not proof of visa issuance,
  coverage activation or rental commencement. If paid orders are displayed in
  My Life before fulfilment, they need a separate honest “Оплачено / В оформлении”
  state, not an active-service badge or invented dates. Client-side assertions
  must never establish payment or publication status.
- Primary owns backend/order/publication semantics and must inspect existing
  authoritative state transitions before implementation. Keep explicit service
  publication and private-field boundaries; avoid duplicated order/service cards,
  preserve amounts and history, and define refund/cancellation behaviour.
- Designer may prepare only bounded navigation UI against existing APIs; payment
  projection/backend changes and automatic conversions are not included in that
  patch. Confirm the paid-but-unfulfilled presentation before implementing it.

### Navigation packet received — 2026-09-23

Status: RECEIVED / NOT APPLIED. Packet `life-navigation-20260923.patch`, digest
checked by primary: `ff00ce031b57f374c4294adcf7d89271f9e0445f92412be15439c6518df25e0b`.
Apply only after the countdown packet above on base `250ce55`; reconcile all WIP
and manifest before/after hashes first. Eight allow-listed React files:
`components/BaliLifeCabinet.tsx`, `components/BottomNavigation.tsx`,
`components/RequestsEntry.tsx`, `components/client-navigation.ts`,
`components/client-navigation.css`, `surfaces/MiniApp.tsx`,
`surfaces/AccountApp.tsx`, `tests/client-navigation.test.ts`.

Designer reports TypeScript/Vite build, 5 navigation + 12 date/service tests,
reverse-patch check and independent source-only Designer review PASS. Primary
verified digest and file list only, not code/runtime acceptance. No visual runtime
PASS, no backend/payment implementation or production changes.

Packet also makes neutral Web Account entry default to Life (beyond the earlier
Mini-only wording); review this scope at integration. Explicit deep links and
legacy profile/life alias are reported preserved. Points/referrals/overview move
under Profile; header video remains. Requests stays accessible below Services;
visa details remain reachable under Life. Mobile support button clears the dock.

Paid-but-unfulfilled presentation agreed at specification level: separate
“В оформлении” section, explicit “Оплачено” badge, service title and manager
contact; no validity countdown or ACTIVE claim before authoritative service
publication. Requires server-side order/service linkage for deduplication.
This is not implemented by the navigation packet and remains separate backlog.

## Support response-boundary packet received — 2026-09-23

Status: RECEIVED / NOT APPLIED; combined-release hold unchanged. VibeDis reports
a blank Support view in its synthetic demo: the chat fixture returned an item
list rather than a Chat object; accessing messages.length crashed rendering.
This is a confirmed demo report, NOT evidence of the same production incident.
Designer fixed the synthetic fixture separately; demo code is excluded from release.

Packet `support-chat-20260923.patch`, reported base `250ce55`; primary verified
SHA256 `18f31bb702c1a92b7f395ca21316e633c98052a51697441d0abfd858326e9278`
and exact three-file scope: React `components/SupportPanel.tsx`,
`components/support-chat.ts`, `tests/support-chat.test.ts`.

Proposal: validate GET/POST Chat responses before setChat; malformed responses
use the existing localised error state without removing the form/previous chat.
Before integration verify against the actual backend GET/POST contracts. Fix
incomplete browser mocks returning only {id:1} to return the real full Chat shape;
do not weaken runtime validation just to satisfy a stale fixture. Cover normal,
empty, malformed and failed responses without sending actual client messages.

Designer reports typecheck, 3 tests, build, reverse-patch check and HTTP reads
of both demo prefixes PASS. Primary has not independently rerun these checks or
reviewed the full patch. Browser runtime unverified; no production-safe assurance
is inferred solely from the handoff description. No backend, push or deploy.

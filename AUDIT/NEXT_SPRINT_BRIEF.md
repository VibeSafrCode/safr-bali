# Next Sprint Brief

Snapshot date: `2026-08-28`. Status: `LOCAL_IMPLEMENTATION_COMPLETE` (`BALI-TASK-070`). Founder authorized the local sprint and the scoped Git/release gate on `2026-08-28`; that release had not yet been executed at this snapshot. OAuth consent, YouTube playlist mutation, and real customer/staff messages remain separate, unauthorized gates.

## Operating model

- One primary Bali conversation is the Founder-facing control point.
- ChatGPT Pro receives this sanitized `AUDIT/` package for independent advisory review.
- Designer is used as an independent gate when visual systems, motion, accessibility, or user journeys materially change.
- Historical role conversations remain archived/reference-only; their history is preserved.

## YouTube channel and playlist automation

Goal: inventory the Founder-owned YouTube channel, produce a reviewable topic mapping, create or reconcile playlists only after approval, and surface those playlists on matching SAFRWAY pages without runtime AI classification or monthly AI-token usage.

At sprint start, the primary assistant must guide the Founder through the access flow step by step. The Founder should not paste credentials into chat or log in on the VPS.

Required Founder-controlled setup:

1. Confirm the exact Founder-owned YouTube channel and Google account.
2. Create or select a Google Cloud project and enable YouTube Data API v3.
3. Configure the OAuth consent screen and an OAuth client suitable for a local, interactive authorization flow.
4. Complete Google consent locally. Store tokens outside Git, logs, artifacts, screenshots, and chat.
5. Approve a dry-run inventory and proposed playlist mapping before any playlist is created or changed.

Implementation contract:

- Use OAuth for playlist/video management; an API key alone is not mutation authority.
- Fetch owned-channel metadata such as title, description, publish date, tags where available, and description timecodes. Captions/transcripts are optional and only through an authorized owner flow.
- Classify deterministically with versioned keywords/rules plus explicit manual overrides. Save a reviewable mapping before applying it.
- Apply playlist changes idempotently: preserve manual exclusions, avoid duplicates, and record the channel/video/playlist IDs without customer data.
- Render playlist/video selections through server-side cached metadata and stable manual fallback. Do not call an LLM at page-view time.
- Use privacy-conscious, click-to-load YouTube embeds and retain a no-JavaScript link fallback.
- Keep Home popular videos, visas, housing, Thailand, destinations, and other sections as explicit configurable mappings rather than hidden inference.

## Public identity and account journey

The deployed model is the baseline: a user signs in once through Telegram OIDC, returns to the public website, keeps access to services and the protected calculator, and can deliberately enter the account. Continue validating authenticated and guest journeys without real customer writes.

## Design and motion discovery

Do not begin the next large visual rewrite by modifying production components. First create and approve a design direction:

1. Founder brief: audience, business goal, desired feeling, three reference sites, three anti-references, and required content.
2. Three materially distinct art directions using real SAFRWAY copy/assets at 390 and 1440.
3. Motion storyboard for hero, scroll reveals, route transitions, cards, status changes, and reduced-motion fallbacks.
4. Design tokens for typography, spacing, color, surfaces, depth, imagery, iconography, duration, easing, and interaction states.
5. One interactive pilot page with performance, accessibility, and mobile gates before system-wide adoption.

The target is purposeful cinematic storytelling and clear conversion paths, not animation everywhere. Prefer CSS/View Transitions and lightweight motion for ordinary interactions; use heavier canvas/WebGL only when it materially supports the story and remains performant.

## Founder Admin UX and operations corrections

Founder production review dated `2026-08-26` adds the following binding scope to the next sprint. The screenshots are evidence of the current problems, not a design specification. Implementation must begin only after the sprint is explicitly started and the resulting contracts are reviewed.

### Compact visual system

- Replace fixed-height square visa and client cards with content-driven compact cards. Empty vertical space must not be used merely to make cards equal height.
- Use a responsive density of up to four client cards per row on sufficiently wide desktop screens, three or two when space is narrower, and one on mobile. The layout must reduce columns before any text, control, help popover, or status can overlap.
- Reduce redundant separators, empty rows, oversized padding, and weak small text throughout Admin. Preserve readable typography, hierarchy, 44px interactive targets, visible focus, and safe touch spacing.
- Fix all observed button collisions and add automated no-overlap/no-horizontal-overflow geometry checks at the supported breakpoints.
- Use an Apple-inspired restrained glass treatment for confirmations and transient overlays: a bounded foreground sheet, clear consequence and actions, dimmed background, strong contrast, focus containment, Escape/Cancel, focus return, and reduced-transparency fallback. Do not turn ordinary content into decorative glass.
- Make Notify controls compact but unmistakable: selected/unselected state, accessible pressed/checked semantics, pending lock, success/error feedback, and no collision with Save or navigation.

### Visa Archive and client-card visibility

- Add an explicit left-navigation entry `Visa Archive / Архив виз` with its own count, filters, search, sorting, detail route, empty/loading/error states, and count parity with the backend.
- A case whose publication state is `ARCHIVED` must not appear among the active/current visas in the client detail card, irrespective of its lifecycle status. Archived history is reachable through Visa Archive instead.
- Archive remains the safe reversible action. Restore returns a case through an audited confirmation flow.
- Root-only permanent deletion is available only from Visa Archive, never from the Close control or ordinary client detail. Preserve the deployed dependency preview, required reason, idempotency, tombstone, protected-document fail-closed rule, and no-default-customer-notification boundary.
- The editor `X` remains Close only. Archive, restore, and permanent delete must have explicit human labels and must never be represented by an ambiguous icon alone.

### Contact reminders and structured intent

- Replace the recommended-contact note-only workflow with structured intent controls: at minimum `Visa expiry`, `Extension`, `New visa`, and `Other`, with optional supporting note. Visa expiry is the normal/default business reason, but it must be calculated only from a manager-confirmed date. Store stable codes and render localized human labels.
- On the confirmed contact date, backend scheduling must create two related but separate notification groups: internal reminders for the root admin and every assigned Bali manager, and a client reminder for the owner of the published active case. The bot remains a delivery adapter rather than the business scheduler.
- Staff copy must identify the client safely and state the selected intent, for example: `Нужно связаться с клиентом: скоро заканчивается срок визы / требуется продление / нужна новая виза / другая причина`.
- Client copy must be calm, localized, and non-legal, for example: `Рекомендуем связаться с менеджером SAFRWAY: скоро наступает срок, связанный с вашей визой. Вы можете написать менеджеру сейчас, либо наши сотрудники свяжутся с вами.` The exact confirmed reason replaces the generic phrase. Provide a direct `Contact manager / Написать менеджеру` action and, where applicable, `Extend visa / Продлить визу`.
- Client delivery applies only to the correct authenticated client and a published active case, follows the saved notification/consent policy, and never exposes internal notes or staff recipients. If client notifications are disabled, record a visible `SUPPRESSED` result for staff rather than claiming the message was sent.
- Delivery must be tracked separately per staff/client recipient with pending/delivered/failed/unknown/suppressed handling, retry safety, timezone policy, and no duplicate alerts after retries or concurrent workers. A staff delivery failure must not mark the client delivery failed, and vice versa.

### Managers, roles, and multi-assignment

- Add a root-only left-navigation section `Managers / Менеджеры` showing active and revoked staff, human role names, permissions, assignment scope, and audit history.
- Support adding, activating, changing, revoking, and removing manager access through explicit confirmation and least-privilege RBAC. Revocation must take effect immediately for API and direct-URL access.
- Replace the single responsible-manager selector with multi-assignment where the business workflow requires it. Every selected responsible manager receives the corresponding staff reminders; duplicate delivery to the same recipient is prohibited.
- At sprint start, securely resolve and verify the two existing Founder-designated production accounts for the Bali visa-manager and general-manager roles before assignment. Their Telegram identifiers remain in the private Founder handoff/current conversation and must not be embedded in Git, AUDIT, source defaults, screenshots, logs, or test fixtures.
- The root admin remains visible and authoritative; manager screens expose only their permitted clients, visas, documents, and dialogues.

### Client-notification transparency

- Keep an explicit `Notify / Уведомить` action available even when the form has no unsaved changes. This action sends the current client-safe visa status summary and is a distinct audited notification type, not a fabricated `CASE_UPDATED` event.
- Preserve clear aggregate actions for saving data. After every Save or Save-and-notify action, show separately whether data was saved and whether a notification was not requested, queued, delivered, failed, or is in an unknown state.
- Add a human-readable notification history for the visa and a root-admin message catalogue showing each system message, its trigger, audience, channel, consent rule, localized preview, and last delivery state. Do not expose raw payloads or internal IDs.
- A manual Notify action requires a consequence confirmation, idempotency, single-flight protection, client visibility validation, and no double-send on retries.

### Canonical service and visa pricing

- Service settings must support editing a canonical price and an explicit `Show price` control. The published value must propagate to every public, account, Mini App, bot, calculator, and Admin surface that consumes that service price.
- Visa settings must expose the same versioned price workflow. The canonical business amount is IDR, while an authorized root admin may enter either IDR or USD and preview the reciprocal recalculation before publication.
- If USD is edited, calculate and store the resulting canonical IDR amount using the approved exchange-rate version; if IDR is edited, recalculate the displayed USD amount. Never maintain two independently editable unsynchronized sources of truth.
- Before implementation, approve the exact rate source, effective timestamp, rounding precision, stale-rate behavior, tax/government-fee inclusion, and whether a manual override expires. Do not invent rates or prices.
- Every price change requires reason, effective date, before/after preview, optimistic concurrency, audit, version history, rollback, and explicit publication. Hiding a price must not erase its amount or history.

### Acceptance evidence for this block

- Visual matrix: `320`, `390`, tablet, and `1440` across RU/EN and dark/light for dense client cards, Visa Archive, manager directory, visa editor, notifications, confirmations, and price editors.
- Interaction evidence: keyboard-only navigation, focus containment/return, reduced motion/transparency, 44px targets, no overlap, no clipping, no horizontal overflow, and responsive 1/2/3/4-column transitions.
- State evidence: loading, empty, denied, stale, confirmation, pending, success, failed, unknown, rollback, duplicate-click, and offline behavior where applicable.
- Backend evidence: root/manager/client isolation, multi-assignment and immediate revocation, archive exclusion/count parity, permanent-delete boundary, staff+client reminder materialization/deduplication, consent suppression, per-recipient independent delivery, notification audit, price-version concurrency, and consistent price projection across surfaces.
- Use fixtures only for mutation and delivery tests. Do not send real staff/client messages or alter production assignments/prices during acceptance testing.

## Founder client-cabinet and Mini App corrections

Founder review dated `2026-08-26` adds the following client-facing scope. These requirements apply product-wide to the public site, authenticated account, Telegram Mini App, and Admin wherever the same component or state is used.

### Exact change notifications

- Replace generic repeated `Visa information updated` messages with a localized, client-safe description of the actual committed change: visa added, exact visa type, status changed from/to, relevant confirmed date changed, document made available, or another explicit event.
- A message must be generated from the audited committed diff, never from unsaved form state. Group one aggregate save into one understandable notification and deduplicate retries/concurrent delivery.
- Include a Telegram Mini App action `Open my visas / Открыть мои визы` plus a short fallback instruction: open the SAFRWAY bot, choose Personal Cabinet, then My visas. Do not rely on a raw browser URL as the primary action.
- Keep official external status codes where useful, but pair them with localized human meaning. Do not expose internal enum names, manager notes, raw IDs, or JSON.

### Correct Telegram Mini App launch

- Diagnose the supplied failed-launch case against bot delivery logs and Telegram launch context without exposing the client's identity in artifacts. Current evidence is consistent with a plain `https://app.safrway.online/#/visas` link opening in Telegram's ordinary browser without valid Mini App launch data.
- All bot entry points to protected client views must use an actual Telegram `web_app` button or approved Mini App deep link so Telegram supplies validated launch context. A plain URL may remain only as a documented browser/OIDC fallback.
- If launch validation fails, show concise localized recovery: return to the bot and press `Personal Cabinet / Личный кабинет` → `My visas / Мои визы`, with a direct safe bot action where Telegram supports it.
- Test fresh user, expired session, valid Mini App launch, ordinary Telegram browser, external browser/OIDC, forwarded message, and replayed/invalid init data. Never weaken init-data validation to make a raw link work.

### Product-wide dark theme and navigation

- Replace hardcoded pale/white card surfaces and low-contrast text with shared semantic theme tokens across Public, Account, Mini App, and Admin. A dark theme must render cards, inputs, popovers, bottom navigation, sheets, and safe areas as intentional dark surfaces, not light cards pasted onto a dark background.
- Enforce WCAG contrast for body/status/help/disabled text and controls, including real Telegram iOS and Android WebViews. The bottom navigation must match the selected theme and must not cover content.
- Every future design correction is presumed product-wide unless its scope is explicitly limited. Reuse shared primitives instead of repairing only the Admin screenshot.
- Add screenshot and axe/contrast coverage for 320/390/1440, RU/EN, light/dark, iOS/Android safe areas, large user-provided names, empty/error/loading states, and reduced motion/transparency.

### Compact client visa cards and date semantics

- Make My visas a compact summary list: country/type, one clear human status such as `ACTIVE`, the one currently relevant confirmed date, and a concise action only when needed. The card is fully clickable and opens a bounded detail view; the summary must not attempt to display the entire VisaCase.
- At a typical 390×844 Mini App viewport, two ordinary visa summaries should be meaningfully visible without controls or bottom navigation covering them. Use content-driven height and progressive disclosure rather than tiny text.
- Prepare one approved optimized illustration per visa type, not per customer record. Images contain no PII, are reusable, have light/dark-safe treatment and alt text, and are loaded without runtime image generation.
- Remove the generic `Key date: Clarifying / Ключевая дата: Уточняется` when a relevant confirmed date exists. Trace and test the backend-to-client date mapping so the displayed value always corresponds to the current entry state.
- Add an explicit manager-confirmed entry-state control. Before confirmed entry, show only the localized equivalent of official `Must use before` (`Enter by / Въехать до`) and its date. After confirmed entry, hide that field in the client summary and show only `Stay permitted until / Разрешено находиться до` and its date.
- Do not infer entry merely from external `ACTIVE`; keep external visa status and confirmed entry state separate. Do not show both competing date labels in the compact client view. Legal wording/help must be human-reviewed and must not invent immigration rules.
- Keep full dates, process, timeline, notices, documents, and actions in the opened detail view, arranged compactly enough that primary status/date/action information appears above the fold.

### Acceptance evidence for this block

- Notification fixtures prove exact diff copy, one aggregate message, Mini App button, fallback instructions, RU/EN, deduplication, consent, and truthful delivery states.
- Real-device/WebView evidence covers successful and failed Telegram Mini App launches without disabling launch validation.
- Visual evidence covers My visas list/detail and Profile at 320/390/1440, RU/EN, light/dark, iOS/Android safe areas; assertions include contrast, compact two-card visibility at 390, no overlays, correct single-date label, and no false `Clarifying` when a confirmed date exists.

## Audit handoff

Before implementation, ask ChatGPT Pro to audit this brief and the deployed code at the exact reviewed SHA. Triage every recommendation as `ACCEPT`, `MODIFY`, `REJECT`, or `NEEDS_EVIDENCE`; do not implement recommendations blindly.

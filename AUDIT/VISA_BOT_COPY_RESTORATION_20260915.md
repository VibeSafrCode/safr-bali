# Visa bot-copy restoration — 2026-09-15

Founder requested urgent restoration of the former bot descriptions on the website, without paraphrasing. This is a narrowly scoped correction on top of the published design (`eb21921750c01faa10e6d098feaafe240b7d5147`, documentation baseline `a5945d8`), not a rollback of the new design or release of unrelated audit/native work.

## Cause and correction

`applyPublication` replaced existing complete shared descriptions with the E2 editorial abridgements and, for D12/D1-D2/VOA, “reference being prepared” placeholders. Original bot content was intact. Public detail pages now read the same RU JSON and generated EN bot messages used by `get_visa_card`. Paragraphs, checklist marks, numbers, family conditions, document requirements and the three bot disclaimers are preserved, including the Founder-supplied E33G wording. Catalogue cards retain their original summaries.

Commercial text remains separate: all published VISA tiers are read from `/api/catalog/pricing`, ordered by sort order and SKU. Labels, included-fee text and fee notes match the bot. Integer IDR uses BigInt, not floating-point conversion. Only unexpired authoritative projections show USDT. Cold failure displays the bot's unavailable-price message; refresh failure retains previously accepted IDR and removes expired USDT. No visa prices or exchange rates were hardcoded. The pricing module is bundled and external under the unchanged strict CSP.

## Publication truthfulness

The old E2 review hashes certify different, abridged text; they cannot certify the restored full descriptions. The first candidate therefore withheld indexing, but was never deployed. Founder subsequently explicitly approved the restored texts under their own responsibility and explicitly required indexing (2026-09-15). All six RU/EN details are now indexable under a separate `owner_approved` decision, not `verified`. A checked-in approval record binds each exact localized body, disclaimer and commercial-copy template to its SHA-256. Unexplained source/approval drift fails the candidate build, leaving deployed copy and indexing unchanged; it must not ship a noindex replacement. Future Founder-authored publication instructions already constitute approval, and updating the record is routine implementation. The existing verified-source path is unchanged. No fake source-review timestamp or badge is shown. The unchanged reviewed hub and other site policies remain intact; the sitemap contains 26 eligible localized URLs. Archived E2 records remain evidence; no new immigration/legal verification is claimed.

Founder also made this a standing project instruction: supplied publication copy is approved; audits may warn and propose changes but may not silently rewrite it, add placeholders, hide it or close indexing. The durable rule is recorded in root `AGENTS.md` and applies across all project surfaces.

## Local verification

- Node 24.19.0; Astro check: 0 errors/warnings. Static build passed.
- 52 public contract/unit tests passed, no skips, with the real isolated bot Python runtime configured.
- Independent bounded review added comparison of 60 complete messages: six visas × two languages × fresh/boundary/expired/outage/no-published-price projections. Every text and commercial block matched.
- Four targeted browser tests passed: all twelve localized detailed routes; dark 320px/light 390px; full E33G tier order and version; strict production CSP; no horizontal overflow; no-JS content and reachable contact. Captured E33G screenshots reviewed. All API responses were intercepted; no customer messages were sent.
- Dependency symlinks, screenshots, local artifacts and native WIP are not part of the patch.

## Release boundary

Publication/deployment evidence is recorded separately after execution. Only the public Astro artifact is a candidate; React, bot, backend, database, staff routing and FX-service configuration remain unchanged. Preserve the currently deployed public artifact as the rollback target, retain prior fingerprinted assets for open tabs, verify exact public bytes and authoritative runtime price tiers after activation. An existing FX refresh problem is outside this restoration: this release does not claim to repair it or invent an exchange rate.

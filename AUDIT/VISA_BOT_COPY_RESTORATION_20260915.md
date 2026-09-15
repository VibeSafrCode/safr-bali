# Visa bot-copy restoration — 2026-09-15

Founder requested urgent restoration of the former bot descriptions on the website, without paraphrasing. This is a narrowly scoped correction on top of the published design (`eb21921750c01faa10e6d098feaafe240b7d5147`, documentation baseline `a5945d8`), not a rollback of the new design or release of unrelated audit/native work.

## Cause and correction

`applyPublication` replaced existing complete shared descriptions with the E2 editorial abridgements and, for D12/D1-D2/VOA, “reference being prepared” placeholders. Original bot content was intact. Public detail pages now read the same RU JSON and generated EN bot messages used by `get_visa_card`. Paragraphs, checklist marks, numbers, family conditions, document requirements and the three bot disclaimers are preserved, including the Founder-supplied E33G wording. Catalogue cards retain their original summaries.

Commercial text remains separate: all published VISA tiers are read from `/api/catalog/pricing`, ordered by sort order and SKU. Labels, included-fee text and fee notes match the bot. Integer IDR uses BigInt, not floating-point conversion. Only unexpired authoritative projections show USDT. Cold failure displays the bot's unavailable-price message; refresh failure retains previously accepted IDR and removes expired USDT. No visa prices or exchange rates were hardcoded. The pricing module is bundled and external under the unchanged strict CSP.

## Publication truthfulness

The old E2 review hashes certify different, abridged text; they cannot certify the restored full descriptions. The six detailed visa pages remain public and accessible, but their RU/EN robots policy is `noindex,follow` pending source review of the exact restored text. This changes C1 and E33G from the previously indexed pilot. No fake review timestamp or badge is shown. The unchanged reviewed hub, other site indexability and centralized policy remain intact; the sitemap contains 14 eligible localized URLs instead of 18. The archived E2 records remain available as evidence. No new immigration/legal verification is claimed by this content-restoration patch.

## Local verification

- Node 24.19.0; Astro check: 0 errors/warnings. Static build passed.
- 52 public contract/unit tests passed, no skips, with the real isolated bot Python runtime configured.
- Independent bounded review added comparison of 60 complete messages: six visas × two languages × fresh/boundary/expired/outage/no-published-price projections. Every text and commercial block matched.
- Four targeted browser tests passed: all twelve localized detailed routes; dark 320px/light 390px; full E33G tier order and version; strict production CSP; no horizontal overflow; no-JS content and reachable contact. Captured E33G screenshots reviewed. All API responses were intercepted; no customer messages were sent.
- Dependency symlinks, screenshots, local artifacts and native WIP are not part of the patch.

## Release boundary

Publication/deployment evidence is recorded separately after execution. Only the public Astro artifact is a candidate; React, bot, backend, database, staff routing and FX-service configuration remain unchanged. Preserve the currently deployed public artifact as the rollback target, retain prior fingerprinted assets for open tabs, verify exact public bytes and authoritative runtime price tiers after activation. An existing FX refresh problem is outside this restoration: this release does not claim to repair it or invent an exchange rate.

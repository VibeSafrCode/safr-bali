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

## Deployed and verified

- Implementation commits: `4ed024664fe0f3ebc4eab98561d8336a30027bb5` (restore bot copy), `9d6303186dd95711d4f506fd2d05d1394c8adaa0` (Founder approval, indexing and standing rule). Both pushed to `codex/visa-text-parity-20260915`.
- Exact deployed source: **`9d6303186dd95711d4f506fd2d05d1394c8adaa0`**. [Exact-source CI 34962903120](https://github.com/VibeSafrCode/safr-bali/actions/runs/34962903120) passed all four jobs, including public/React browser and Lighthouse gates. Final local check: 54 tests passed, no skips; Astro check 0 errors/warnings; exact-artifact targeted browser checks 4 passed.
- Public static release: `visa-copy-9d6303186dd9`. Archive SHA-256 `01df221e2b387aaf8add1ed7a2363dff1a1775fea852f35668fc591d6c317e5d`; tree SHA-256 `209f2d5b9077bb9afd6dff43c5492aaa0dec9a0b18cfa7cea6973139a375675e`. All 259 artifact files verified, 30 previous fingerprinted assets retained. Previous `design-eb21921750c0` artifact retained for rollback.
- Origin and bare public URLs verified: 12 visa details, both hubs, RU/EN home, sitemap and robots. All 23 referenced assets matched exact artifact bytes. HTML retained strict CSP and content-type protection. All 12 visa details have `index,follow`, appear in sitemap, and permit Googlebot/bingbot/YandexBot/DuckDuckBot/OAI-SearchBot crawling. This proves crawl eligibility, not search-engine inclusion or ranking.
- Live browser verification compared every RU/EN title, lead, paragraph, disclaimer and commercial block with bot sources and the actual public pricing response. All 12 passed; catalog version 1 / FX snapshot 16959 observed consistently. No overflow or script/CSP errors at mobile/desktop widths. FX version equality does not imply FX freshness; existing stale-USDT suppression remains in effect.
- React stayed on the approved design release; backend/bot stayed on `2da3e4c`. Database and infrastructure configuration were not changed; health/readiness and service liveness passed. No customer message was sent. The standing Founder-copy rule was also synchronized to the primary working checkout's `AGENTS.md`, leaving unrelated WIP intact.

Verification notes: the first activation automatically rolled back because the verifier required byte equality for a Cloudflare-transformed `robots.txt`. Baseline inspection confirmed Cloudflare's unchanged managed prefix explicitly allows search and preserves our exact origin suffix. Verification now checks that suffix plus effective crawl access; no Cloudflare setting was weakened or changed. Re-activation and every mandatory public check passed. An earlier broad local browser run had a navigation failure while its output directory was rebuilding and a transient hub contrast result; isolated rechecks passed, as did final exact-source CI. Do not rebuild an artifact while its browser suite is running.

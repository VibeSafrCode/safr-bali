# Implementation contract — Partners vs Referral (internal)

## Required routing / state

| Property | Partners | Referral |
|---|---|---|
| Suggested route | `/partners/` | `/referral/` or existing canonical |
| Intent | professional B2B cooperation | personal/private recommendations |
| Source | `CONTENT/PARTNERS_B2B_RU_v1_REVIEW.md` | `CONTENT/REFERRAL_RU_v1_PREVIEW_ONLY.md` |
| Initial release | eligible after owner/content + technical QA | `preview_only` only |
| sitemap/hreflang | only published canonical RU now | no sitemap, no alternates |
| CTA | `Discuss partnership` (B2B intake) | `Ask for conditions` only after terms exist |
| Existing integration | existing CRM/contact funnel | existing referral links and ledger; preserve history |
| Terms | individually discussed | pending founder's precise rules |

**No duplicate business entities:** page contentId should not generate a new paid `serviceId` or `pricingRef`. Partners is a lead channel, not a purchasable visa; Referral is a relationship/attribution feature. Reuse existing records and integrations.

## Partners lead intake (UI implementation suggestion, not promise of currently live fields)

Small fields: organization name, contact name, business email OR Telegram, activity type, requested cooperation format, optional link. Don't require full client details or passport. Send necessary PII to existing protected CRM, not analytics.

Track non-PII events like `partners_page_view`, `b2b_cta_click`, `b2b_lead_accepted` with public contentId/locale/referrer/UTM/correlationId only. Do not conflate click with accepted lead and subsequent successful client work.

## Existing referral integration — inspect first

- Locate real referral account/bot UI, referral code/link format, attribution, ledgers, user eligibility, privileges and historical activity.
- Do not add second referral database; do not replace users' existing links/history or credit rules.
- Do not assume a unique link or dashboard is currently available to all users, even if competitors show it.
- Do not reveal referred customer's purchase amount, identity, documents or other sensitive CRM data to referrer without explicit authorization and appropriate policy.
- Expose no commission rate, payout date, or credit/reversal rules before approval; never import competitor percentages.
- No client passport/bank/medical or message bodies in analytics event payload.

## SEO / rendering / VibeDiz QA

- Verify existing canonical routes/legacy links before writing.
- Reuse SAFRWAY minimal brand and existing Astro/React design, avoid embedding invented badges (licensed, official, 24/7, guaranteed outcome).
- Static crawlable HTML, one H1, meaningful Title/Description, visible FAQ only.
- Only indexable `/partners/` after checking business reality and legal claims; no automated indexing guarantee.
- Referral must not render as an empty commercial thin SEO shell while terms remain unknown.
- Confirm mobile legibility, CTA/form, link resolution and no PII in analytics.
- Do not generate translated versions yet. Once RU approved, translate in batches of max three locales, with semantic parity QA.

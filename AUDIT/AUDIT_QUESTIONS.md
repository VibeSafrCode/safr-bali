# Audit Questions

Answer with evidence, uncertainty, impact, the smallest useful recommendation,
and an owner. Do not answer by making a product or release decision.

## Product and information architecture

1. Can a first-time visitor understand country, available action and next step
   within 3–5 seconds on every major public/authenticated surface?
2. Are available, assisted, preparing and unavailable services unambiguous?
3. Do public, bot, Mini App, account and admin share stable entities/statuses,
   or are labels and navigation creating duplicate concepts?
4. Does every public route have a unique intent and useful internal-link role?
5. Are manager handoff, response state and failure recovery honest and clear?
6. Does Admin navigation consistently reach all clients, filtered lists,
   requests, archive, settings and history with a reliable Back path?
7. Can a root admin perform common work without raw IDs/enums/JSON or hidden
   destructive actions?

## RU/EN, design and accessibility

8. Are RU and EN semantically equivalent, including errors, status help,
   longer labels, notifications and destructive confirmations?
9. Are light/dark, 320/390/1440, safe areas, 44px targets, focus-visible,
   keyboard, reduced motion, contrast and no-overflow handled consistently?
10. Are empty/loading/pending/success/error/rollback/retry states recoverable?
11. Does dark client dialogue remain readable for long text, metadata, links,
    delivery errors and focus states?
12. Are list/card density, two-column desktop behavior, filter chips/selects and
    sorting efficient without hiding the current filter?
13. Can zoom/pan referral visualization remain accessible through a list/tree
    fallback and usable for large networks?

## Public SEO and machine-readable discovery

14. Are 44 RU + 44 EN pages server-rendered with correct canonical,
    hreflang/x-default, sitemap/noindex and internal links?
15. Are titles/descriptions/headings/OG/JSON-LD unique, accurate and sourced?
16. Are entities, authorship/provenance, update dates, alt text and route intent
    clear enough for search and AI retrieval without fabricated schema claims?
17. Which pages are thin/duplicative, and what should be merged, expanded,
    redirected or kept noindex?
18. Are performance and Core Web Vitals risks visible in the current asset,
    font, JavaScript and PWA strategy?

## Data, security and transactional correctness

19. Does every write pass through FastAPI with correct authentication, RBAC,
    Origin/CSRF, idempotency, optimistic concurrency and audit?
20. Can a client ever observe another client’s visa, document metadata,
    conversation or referral network through list/detail/error/cache paths?
21. Does the PWA cache exclude all APIs, sessions, mutations and private data?
22. Are Visa aggregate Save and Save+notify atomic, and is exactly one delivery
    created only after successful commit?
23. Are official, manager-confirmed, calculated and unverified visa facts
    distinguished in UI, API, events and storage?
24. What is required to enable protected document/credential storage safely:
    key custody, rotation, scanning, authorization, retention, deletion,
    backup/restore, redaction and incident response?
25. Can permanent VisaCase deletion be constrained to case-owned data while
    preserving a minimal non-PII tombstone and all unrelated user/business data?
26. Can future Bali visa-manager access be deny-by-default, case-assigned and
    proven unable to use root-only settings, referral correction or deletion?

## Referrals and rewards

27. Do immutable referral pointers, referral rows and reward rules agree under
    registration, retry and reconciliation?
28. What is the smallest safe actor-bound correction mechanism that avoids
    trigger bypass, duplicate children, cycles and reward rewrites?
29. Can a global dry-run classify deterministic corrections versus ambiguous
    cases without exposing identities or guessing inviters?
30. Can the graph and correction workflow prove rewards/orders/created dates
    remain unchanged unless a separately approved business operation requires
    otherwise?

## Source of truth and release governance

31. Are generated catalog/i18n outputs reproducible from typed sources?
32. Which README/snapshot/schema/route claims conflict with deployed evidence?
33. Which claims are `DEPLOYED`, `PUSHED`, `LOCAL_ONLY`, `PLANNED`, `UNKNOWN`
    or `NEEDS_EVIDENCE`, and what primary evidence supports each?
34. Which authenticated production journeys remain intentionally unverified,
    and what non-customer synthetic smoke could close the gap safely?
35. Which BALI-TASK-067 items should be accepted, simplified, split, deferred
    or rejected to reduce risk and cognitive load?
36. What exact acceptance, rollback and evidence gates should precede each
    migration/data/security/infrastructure slice?

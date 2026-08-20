# Audit Questions

Answer each question with evidence, uncertainty, impact, and the smallest
useful recommendation. Do not answer by making a product or technical decision.

## Product and journey questions from CPO

1. Within 3–5 seconds, does a first-time visitor understand the country,
   available action, and next step on each public and authenticated surface?
2. Is the difference between available, manager-assisted, preparing, and
   unavailable services unambiguous everywhere?
3. Does every public route have a unique job, or should any route be merged,
   demoted, redirected, or removed from discovery?
4. Where are the likely funnel drop-offs, and what is the minimum privacy-safe
   analytics needed to make the next product decision?
5. Is the boundary between public information, authenticated action, and human
   manager handoff consistent and honest?
6. Does the proposed Visa Cabinet minimize exposure of sensitive visa and
   identity data while still giving the client a useful next action?
7. Can an administrator operate the Visa Cabinet safely and efficiently, with
   clear audit history, conflict handling, and reversible mistakes?
8. Are confirmed, calculated, unverified, and externally supplied facts clearly
   distinguished in UI, APIs, stored data, and audit records?
9. Are RU and EN semantically equivalent, including sensitive privacy/visa copy,
   status labels, errors, and CTAs, without truncating essential longer EN
   labels?
10. Which product or architectural complexity should be removed, merged, or
    demoted before adding more countries or automation?

## Design-system and accessibility questions

11. Do Astro public, Mini App, account, and admin form one coherent system, or
    are isolated patterns creating duplicate discovery and overlapping CTAs?
12. At `320`, `360`, `390`, and `1440`, are Telegram safe areas, 44px targets,
    keyboard focus, contrast, reduced motion, semantic status, and horizontal
    overflow handled consistently?
13. Are loading, error, offline, pending-sync, retry, and rollback states
    understandable and recoverable without color-only meaning?
14. Is country → location → service → offer hierarchy consistent, with a unique
    page job and route-level photographic context that is actually verified?
15. Are Visa status, date provenance, confirmation state, and next action
    legible without weakening privacy or trust?

## Architecture and data questions

16. Where do public, Telegram, Mini App, account, admin, and manager flows
    diverge from the canonical route/catalog/order model?
17. Does each transactional write pass through FastAPI with the correct auth,
    RBAC, CSRF, idempotency, concurrency, and audit boundary?
18. Are generated catalog/i18n artifacts reproducible from typed sources with
    no second authoring source?
19. Are source-of-truth ownership and update rules clear, or do stale Snapshot,
    README, roadmap, and checklist claims compete with canonical release facts?
20. Which dependencies or failure modes would make a country/service appear
    available when it is only assisted or preparing?

## Visa Cabinet security and release questions

21. Does the `LOCAL_ONLY` Visa lifecycle model minimize PII and define purpose,
    access, encryption, rotation, retention, deletion, backup, and audit rules?
22. Are legal dates impossible to publish or notify without official source,
    verification date, and authorized human confirmation?
23. Are lifecycle transitions, optimistic version checks, events,
    notification deduplication, lease recovery, and retries safe under
    concurrency and partial failure?
24. What is missing for the Stage 1 journey: configuration, scheduler, frontend,
    Telegram CTA, admin operations, tests, or rollback evidence?
25. Is migration `c4f7a9d2e610` reversible and compatible with the deployed
    head, application role, backup/restore rehearsal, and feature-off rollout?
26. Can every external integration remain disabled/fail-closed until separately
    approved and verified?

## Evidence and release-governance questions

27. Which claims are `DEPLOYED`, `LOCAL_ONLY`, `PLANNED`, or `UNKNOWN`, and
    what primary evidence supports each label?
28. Which authenticated production journeys remain intentionally unverified
    because real customer writes/messages were forbidden, and what safe test
    design could close those gaps?
29. What exact test, migration, artifact, rollback, service, and smoke evidence
    would be required before asking for a release approval?
30. Are any recommendation, source comment, fixture, or README instructions
    being mistaken for authority or execution evidence?

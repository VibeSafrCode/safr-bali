# Roadmap and Active Sprints

Snapshot date: `2026-08-24`. This file describes sequencing only and grants no
implementation, Git, data, release, or production authority.

## Active work

No implementation sprint is active at this snapshot.

### BALI-TASK-066 — unified Web App / PWA

- Status: `DEPLOYED` / `CLOSED`.
- Deployed SHA: `bc93ebf2843cce96098d4881d1e425fc73e71f86`.
- Delivered: shared RU/EN and dark/light Web App shell, simplified admin
  surfaces, human bot visa summaries, settings/history/request improvements,
  public theme control, installable PWA, static offline shell and safe update
  behavior.
- Excluded/deferred: native `.app`/`.apk`; no DB migration or customer writes.

## Next proposed sprint

### BALI-TASK-067 — Admin/Web App operations and audit recommendations

- Status: `PLANNED` / `NOT_STARTED`.
- Founder start command: required before implementation begins.
- External GPT Pro findings: advisory only; triage precedes implementation.

#### A. Navigation and client operations

1. Make the Admin `Clients` navigation open the same complete list as
   `All clients`.
2. Verify a consistent Back path across Admin, account and Mini App while
   preserving filters, search, scroll and browser history.
3. Render client cards as two columns on desktop and one on mobile.
4. Fix unreadable dark-theme manager/client dialogue contrast.
5. Assess Telegram avatar retrieval, caching and retention; use initials when
   unavailable and do not persist more than required.
6. Add fast filter chips/buttons plus select fallback, date/name/status/activity
   sorting and exact server count/list parity.

#### B. Visa and business settings

7. Make Visa and Services cards open typed human editors for verified fields,
   including cost and availability only where an existing source of truth
   exists; add version, effective date, preview, audit and rollback.
8. Fix Visa editor control/help collisions and responsive layout.
9. Make the modal `X` mean Close only; move archive/delete to an explicit
   overflow/danger area.
10. Add a visible Visa Archive.
11. Add root-admin permanent VisaCase deletion from Archive with explicit
    consequence preview, required reason, atomic case-owned deletion and a
    minimal non-PII tombstone. Never delete the user, orders, referrals,
    points, unrelated conversations or other cases. No automatic message.
12. Configure protected document storage only after encryption key custody,
    private root, scanner, retention, backup/restore and incident controls pass.

#### C. Referrals

13. Add an accessible interactive referral-network view with square client
    nodes, pan/zoom, fit/reset, client drill-down, privacy-safe labels and a
    list/tree fallback.
14. Implement a root-only, actor-bound, audited, idempotent referral-correction
    mechanism through a successor migration/domain service. Do not bypass
    immutable triggers.
15. Run a dry-run global reconciliation: preserve valid explicit attribution;
    place deterministic no-referrer users under the configured main admin;
    apply only approved exact overrides; list ambiguities instead of guessing;
    preserve created timestamps and reward/order history; create no retroactive
    rewards or messages.

#### D. Roles, public discovery and audit

16. Add an explicitly scoped Bali visa-manager role and case assignment; do not
    copy root-admin authority or use Telegram chat lists as API RBAC.
17. Audit all public RU/EN pages for technical SEO and machine-readable/AI
    discovery: server HTML, unique intent, canonicals/hreflang, sitemap/noindex,
    internal links, structured data, entities, provenance, alt text and
    performance. Do not promise rankings or fabricate schema facts.
18. Refresh this `AUDIT/` pack, perform a sanitized read-only GPT Pro audit,
    and triage every finding as `ACCEPT`, `MODIFY`, `REJECT`, or
    `NEEDS_EVIDENCE` before sprint implementation.

## Required sequence

1. Push the sanitized audit-pack refresh after scoped review.
2. Founder runs the private GitHub/approved sanitized audit with GPT Pro.
3. CTO, CPO, Designer/Security and Documentation triage the returned findings.
4. Founder confirms the final BALI-TASK-067 scope if recommendations materially
   change it.
5. Implement in safe slices: navigation/presentation; settings; archive/delete;
   referral graph/correction; manager RBAC; SEO; document storage.
6. Require responsive/a11y/security tests, migration backup/U-D-U when needed,
   exact-SHA artifacts, rollback and no-customer-write release smoke.

## Deferred

- Native iOS/Android packaging, store distribution, native OIDC and deep links.
- Live immigration portal automation unless separately authorized and verified.
- Public functional calculator/API/Nginx route.
- Any Thailand legal rules or availability not supported by verified sources.

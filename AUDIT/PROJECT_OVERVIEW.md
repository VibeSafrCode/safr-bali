# Project Overview

Evidence date: `2026-08-25`.

## Purpose

SAFRWAY is a Bali-first assisted-service ecosystem. Its intended journey is:

`public discovery → authenticated action and/or human manager`.

The product combines verified information, software, and manager-assisted
operations for travel, relocation, visas, housing, services, exchange, and
support. It is not a fully automated self-service marketplace and must not
present unverified legal or availability claims as facts.

## Users and actors

- prospective clients discovering countries and services;
- authenticated Telegram Mini App and browser-account users;
- root administrators operating the current protected Admin Web App;
- future explicitly authorized/assigned Bali visa managers;
- product, content, design, engineering, security, and release owners;
- external auditors acting only as advisory read-only reviewers.

## Product surfaces

| Surface | Primary job | Snapshot label |
| --- | --- | --- |
| Public Astro site | Crawlable RU/EN country/service discovery and manager/auth handoff | `DEPLOYED` |
| Telegram bot | Information, Personal Cabinet, concise visa summaries, manager handoff, Mini App entry | `DEPLOYED` |
| React Mini App | Authenticated catalog, calculator, Visa Cabinet, profile, orders and support | `DEPLOYED` |
| Browser account | Shared authenticated account and Visa Cabinet | `DEPLOYED` |
| React Admin Web App | Root-admin operations, client/visa workflows, requests, settings and history | `DEPLOYED` |
| Installable PWA | Web App installation/update/offline static shell; no private API/data caching | `DEPLOYED` |
| Native wrappers | Future iOS/Android packaging | `LOCAL_ONLY` / `DEFERRED` |

## Confirmed product boundaries

- Public pages inform and hand off; transactional truth remains behind FastAPI.
- PostgreSQL is the source of truth for users, referrals, orders, Visa Cabinet,
  conversations, audit events, and settings that exist in the schema.
- Full visa detail belongs in Mini App/account; Telegram shows a concise human
  summary and stable actions.
- Official immigration/external status codes remain in English. Interface help
  explains them in the selected RU/EN locale and is workflow guidance, not
  legal advice.
- Client Visa Cabinet access is user-scoped and limited to published records.
  Root-admin surfaces are protected separately.
- Protected documents and immigration credentials fail closed until the
  required production security configuration exists.
- PWA offline behavior is static-shell only; authenticated API responses,
  sessions, mutations, and private data must never be cached.
- Bali is product priority P0. Thailand must not gain invented rules,
  availability, or legal calculations.
- Visa and privacy routes remain noindex in RU and EN until separately
  reviewed and approved.

## Current local review focus

BALI-TASK-067 is an uncommitted `LOCAL_ONLY` candidate. It includes:

- admin navigation, back-navigation, responsive client cards and dark-theme
  dialogue readability;
- editable visa/service settings with audit/version/preview/rollback;
- filter chips, sorting, archive and explicit root-only permanent visa delete;
- an accessible zoomable referral-network graph and safe referral correction;
- Telegram avatar feasibility with privacy-safe fallback;
- Bali visa-manager RBAC/assignment;
- public SEO and machine-readable/AI-discovery audit;
- protected document-storage configuration;
- the reviewed All Indonesia Guide/public discovery slice;
- a refreshed external GPT Pro audit and internal triage before release.

Local tests and review do not prove deployment. External recommendations remain
`PROPOSED`; they do not authorize implementation or release automatically.

## Design and accessibility doctrine

- One coherent product system across public, Mini App, account and admin.
- RU/EN and light/dark are independent persistent controls.
- Dark is the default authenticated visual direction; light remains available.
- Required evidence widths include 320, 390 and 1440; use 360 when risk merits.
- Minimum 44px targets, visible keyboard focus, sufficient contrast, reduced
  motion, semantic status, recoverable error/pending states, and no horizontal
  overflow.
- Prefer direct labels, named entities, clear consequences, and one obvious
  next action over raw IDs, enums, JSON, duplicate controls, or hidden actions.
- Do not invent clients, managers, services, prices, availability, legal facts,
  SLAs, testimonials, video, or analytics outcomes.

# Next Sprint Brief

Snapshot date: `2026-08-26`. Status: `PLANNED`. This document grants no implementation, OAuth, playlist mutation, Git, release, or production authority.

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

## Audit handoff

Before implementation, ask ChatGPT Pro to audit this brief and the deployed code at the exact reviewed SHA. Triage every recommendation as `ACCEPT`, `MODIFY`, `REJECT`, or `NEEDS_EVIDENCE`; do not implement recommendations blindly.

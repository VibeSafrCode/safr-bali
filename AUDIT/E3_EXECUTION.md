# BALI-AUDIT-20260905-E3 — bounded frontend performance

2026-09-10. Founder requested all remaining stages. Implementation isolated from
native WIP, based on E2 `569f68c`. E1/E2 PRs are now merged into the existing
release branch (not the historical main branch): E1 `73469bf`, E2 `e5ccf92`.
Their final exact-source CI was green. E1 backend/proxy remains unreleased;
E2 Astro `a11df3b` remains the verified production artifact.

## Implemented scope

- Shared visible/online single-flight refresh loop, 8-second abort/deadline,
  60-second successful refresh interval, failure backoff 60/120/240/300 seconds.
  Focus/visibility/online bursts coalesce and respect cooldown; stopped requests
  cannot update newer generations. No response persistence or new price copies.
- Astro exits before fetching when no canonical-price slots exist. React starts
  only for subscribed pricing consumers; account/admin/calculator/Home are not
  global catalog pollers. Nonpricing catalog sections do not subscribe.
- Derived FX display still expires independently of fetching, including offline
  focus after background timers were suspended. Exact accepted IDR behavior is
  preserved; no rate, formula, publication or order mutation.
- SW owns only its `safrway-shell-` namespace. Five fixed public shell cache keys,
  credential-free verified responses, no query variants or arbitrary assets;
  authenticated HTML/API/mutations never stored. Generic offline fallback is
  version-scoped; quota errors cannot break a successful network response.
- Nginx cache maps are at server scope so static responses keep CSP/nosniff/
  permissions headers. App HTML/API/control files remain no-store; sitemap
  revalidates; fingerprinted assets immutable, ordinary images bounded one hour;
  public offline shell/manifest/icons revalidate. Errors never become immutable.
- Remaining visa hero, catalog photography and detail photography use approved
  source images with dimensions, WebP candidates and viewport-aware sizes.
  No new artwork, global visual rewrite or content/source-review date changes.
- Astro bundled pricing stays external (`assetsInlineLimit: 0`); CSP is unchanged.

## Evidence and findings

Main local Node 24.19.0, clean committed manifests, existing frozen dependencies.
No tests or code run against customer records. Public-site full verification has
completed; React full-regression corrections are still in progress at this entry.

- Shared scheduler: five deterministic tests passed, including 100 wake events,
  timeout abort, backoff, hidden/offline recovery and late-response isolation.
- React typecheck, 24 unit tests and 53 build/contract tests passed.
- Initial full React browser run: 115 PASS / 7 FAIL / 8 optional skips. The test
  static server served manifest/icons as application/octet-stream, correctly
  rejected by the new SW; its error alert interfered with unrelated alert-state
  tests. Correct MIME fixtures now match Nginx. All seven affected journeys pass
  without weakening SW response validation or removing alert assertions.
  Three loading/sending fixtures additionally use explicit response gates rather
  than wall-clock sleeps, preserving intermediate-state and single-flight checks.
  Complete E3/E4 integration regression is recorded separately when finished.
- Astro check: 58 files, zero errors/warnings/hints; 50 unit/build contracts pass.
- Complete Astro browser regression: 136 PASS / 4 optional screenshot modes
  skipped. Lighthouse Home and Bali: performance 1.00, accessibility 1.00,
  best practices 0.96, SEO 1.00; all configured budgets pass. These are local lab
  measurements, not deployed field Core Web Vitals.
  Home FCP 1.086s / LCP 1.398s / CLS 0 / TBT 0ms / 63,787 bytes;
  Bali FCP 1.235s / LCP 1.702s / CLS 0.0091 / TBT 0ms / 83,601 bytes.
- Three Astro browser network cases and one React demand-network journey pass.
  Privacy page: zero price requests; active visa: one despite 100 focus events;
  180 seconds hidden: no additional requests; expired USDT removed during outage.
- SW: 13 new executable VM behavior cases plus existing five PWA contracts pass,
  including 100 concurrent fixed-key fetches and foreign cache preservation.
- Real isolated Nginx: two tests exercise 14 static/private/error responses using
  the actual candidate config, preserving security headers and cache boundaries.
  CI's existing explicit Nginx binary gate also discovers these tests.
- Independent security inspection: no remaining blocking findings. Offline wake
  initially skipped expiry invalidation; fixed and regression-tested before release.
- Designer: 48 route/locale/viewport/theme combinations, zero image decode or
  overflow failures and no scoped main axe violations. Existing art/crops retained.
  Visa selected WebP at DPR1: 320px/9,278B, 640px/30,400B, 1440px/114,786B.
  Original visa JPEG was about 332KB. These are observed resource sizes, not
  field Core Web Vitals. Detail sizes corrected after review: 740px desktop figure
  now selects a 960px candidate instead of upscaling 640px. No threshold weakened.

Production read-only evidence, 2026-09-10: public local-origin and external
responses agree sitemap/OG lack CSP/nosniff; sitemap Cache-Control is one week
(duplicate equivalent directives externally). App offline/manifest currently
inherit no-store. Thus A11 is confirmed, not merely theoretical. API unauthenticated
account returns 401/no-store. Requests from the VPS through Cloudflare received
403; normal workstation HTTPS returned 200 and origin also returned 200. This
proves a vantage-specific edge restriction, not a general site outage. No WAF
policy was changed or bypassed, and no control-plane settings are inferred.

## Release boundary / rollback

E3 is a separate source changeset. Push/merge/production permission for new stages
has been asked separately from local implementation; do not assume it from E1/E2.
No E3 deployment or migration performed. Required final gates: complete regression,
measured Lighthouse, independent review closure, exact-source CI and approved release.

Do NOT install the complete target Nginx config while E1 Cloudflare trust settings
are unverified. An independently authorized E3 release must apply only its exact
cache/header diff to a captured/hashed current live config, preserving listener,
proxy trust, upstream, redirects and unrelated sites. Validate real Nginx before
atomic config replacement/reload; activate paired SW/static artifacts only after
the public-shell header policy is valid. Back up old config and both symlink targets.
Rollback restores old static targets and config together, checks nginx -t, then
reloads and verifies HTML/assets/API privacy. Do not force client reload or logout.

Sources used for implementation: official Nginx
[header inheritance](https://nginx.org/en/docs/http/ngx_http_headers_module.html),
[map semantics](https://nginx.org/en/docs/http/ngx_http_map_module.html), and
[Astro image pipeline](https://docs.astro.build/en/guides/images/).

## Durable source caveat

The three external audit originals reported saved at the historical checkpoint
are now absent from the local project inbox and their original Downloads paths.
Cause unknown; do not claim they remain backed up or recreate them as originals.
This implementation follows the committed triage and Founder's explicit four-stage
scope. Original wording would require the actual originals again. No source files
or artifacts were deleted in this work.

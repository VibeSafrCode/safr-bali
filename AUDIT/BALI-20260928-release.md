# Integrated UX, cabinet and onboarding release — 2026-09-28

Founder explicitly authorizes scoped Git publication and deployment in the primary
conversation. Status: DEPLOYED / CRITICAL POSTCHECK PASS.

Accepted Designer packages: client-cabinet-current (7 files), profile-review
(4 files); final source freeze confirmed. Rejected life-overview NOT integrated.
Fixtures, local preview wrappers, visual originals and native work excluded.

Frontend: calculator opaque dialog/viewport fixes; wider desktop service panels;
day/night backdrops; public country cards follow theme; public glass blur20px;
compact footer; phone single theme cycle and tablet/desktop three choices;
auto device theme with local-time fallback, preserved manual choice. Public
YouTube playlist click-to-load, autoplay off, close unloads; only its nocookie
frame origin allowed by public CSP. Actual playlist playback unverified.

Cabinet: real-date rings, anchored monthly periods, neutral future-service
countdowns; IDR compact K + canonical projection approximate USDT nearest5
HALF_UP, no quantity multiplication or commercial price rewrite. Compact profile,
referral copy and support close on navigation; messages preserved.

Runtime: additive onboarding ledger and Admin editor, disabled initial state.
Activation remains gated by historical-registration verification and approved
test-chat delivery; no old-user broadcast. Post-release announcement approval/
broadcast feature is NOT implemented and must not be represented as delivered.

Evidence: integrated TypeScript PASS, focused rings/price/backdrop10 PASS,
React production build PASS; Astro check86files zero errors/warnings/hints.
Prior runtime focused proof12backend/9bot and isolated PostgreSQL recorded in
runtime audit. Fresh production backup/restore U-D-U required before migration.
Independent backup worker source review: no P0/P1 findings.
No external browser launched; production visual/real Telegram acceptance not claimed.

Preserve exact production config.py group-read exception and .env modes.
Rollback: retained prior artifacts/source, keep additive populated onboarding
schema; disable scenario before application rollback. Final SHAs and production
verification appended after activation, never inferred from builds.

## Publication checkpoint

- Frontend committed ebe4171692610151db08576eb5295174b89c8726.
- Runtime committed f711d3ab216caa8e98df7ec38955392f5b5acc3e.
- Build_id ebe4171; final React build PASS; Astro build103pages PASS.
- Fresh production backup, isolated restore equality and U-D-U PASS; production
  remained f2c8a4d6e901. Private clone/backup retained on server, no cleanup.
- Candidate migration SHA256 1a2d0de25dd42b6c849556d556fc376d4770f9657f352bb0ea0649ee2a6d420e.
- Astro artifact SHA256 cd13e8ee194c6dd073414b5b32d76eb29ca088e5ea7f73d11c3a8a0ca9b13ee3.
- React artifact SHA256 6a1c200ae03f456e11e3978a2c8a13a504eacdee8dd8a3b009746f06ff509555.
- Artifacts and exact runtime Git bundle delivered to server staging, NOT active.
- GitHub direct SSH closed connection, HTTPS TLS failed, SSH443 timed out;
  GitHub connector transport also failed. No push success confirmed at this checkpoint.
  SSH transport through VPS also timed out on ports22/443. Publication BLOCKED.
- Activation script independently reviewed with no P0/P1 findings. NOT executed:
  publication prerequisite remains unsatisfied. Existing production left unchanged.
- Transfer of activation script itself failed (SSH connection closed); local script
  retained with release artifacts. Do not assume the remote script is complete.

## Successful retry and final deployment

Founder requested retry; both GitHub branch pushes succeeded with the exact
frontend/runtime SHAs above. Previously recorded network blockers are resolved.
Reviewed activation script was retransferred successfully and executed.

- Immutable frontend release ux-ebe4171 active for public site and app.
- Runtime exact f711d3ab216caa8e98df7ec38955392f5b5acc3e; tracked checkout clean.
- Schema a9c28b017d60; backend and bot active; liveness/readiness PASS.
- Public HTTPS build-version on both domains: ebe4171. Home, insurance,
  account/profile/life and Admin routes HTTP200. Home CSP allows only the specific
  YouTube nocookie frame origin; other existing policies preserved.
- Canonical pricing fresh snapshot34459, positive ask and unexpired projection.
- Anonymous life-services and admin/onboarding requests denied401/403.
- Onboarding remains OFF and delivery ledger count0. No customer messages sent.
- Existing secret hashes/modes/owners unchanged; config group-read exception
  retained. Previous artifacts, source revision and private backup kept for rollback.

Python urllib postcheck received403 while standard curl succeeded; final public
checks used curl, with no WAF relaxation. Real-user login, actual playlist playback
and device-specific visual acceptance are not claimed. New-user onboarding
activation and admin-approved release announcements remain outstanding as above.

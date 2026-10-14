# Yoga Ganster temporary HTTPS address

## Current access update

On 2026-10-09 the Founder explicitly requested password removal and a private-data exposure review. The shared Yoga static upstream is now anonymous at both Yoga preview addresses. RU and EN return HTTP 200 without credentials; the password file remains private and unchanged for recoverable re-protection. Use `yoga-open-preview.conf.template` for the current access policy; the closed template remains an alternative, not the current state.

API/auth/admin/source/private-file routes stay denied; account/owner/bot-demo and downloads are additionally denied. GET/HEAD only, noindex/no-store, Host guard and restrictive CSP remain. `_york` is an ordinary public bundle required by 36 pages and must not be blocked. The independent review found no actual client records or credential patterns in the 178-file artifact; demo account/owner data is synthetic. This is a bounded artifact/configuration review, not proof that a host is unhackable. Future builds need their own data-exposure check before publication.

The public guide PDF was independently reviewed without finding sensitive fields/attachments or credential patterns; download access stays conservatively disabled in this preview. Other sites on the same IP, including intentionally public Quant, remain separate and unchanged. Content made anonymous is publicly readable/copyable; noindex is not privacy protection. Details are in `ACCESS_UPDATE_VERIFICATION.json`.

## Initial protected-address deployment (historical)

Status: deployed and verified on 2026-10-09. This is an additional **closed preview address**, not the contact-enabled Yoga launch or a new SAFRWAY release.

- Entry: https://62.133.61.231/yoga/ redirects to https://62.133.61.231/yoga-preview/.
- Russian and English preview pages use the same immutable `b20cd6a77c00d1ad84371e0ba5f942376a769e9c` artifact as the previous SAFRWAY-domain preview. No new source build, content changes, database migration or Telegram activation.
- Existing Basic-auth credentials remain unchanged. Anonymous/invalid access returns 401. HTTP redirects to HTTPS before any password challenge. No credentials are included in this packet.
- Both addresses remain noindex/nofollow/noarchive, private/no-store; API/private/source paths are denied, and POST is forbidden. This does not change approved SAFRWAY service indexing.

## Coordination and design choice

The Founder authorized consultation with the existing `Влад Графки Квант` conversation. Its read-only review confirmed Quant's existing IP HTTPS server, trusted certificate and automatic renewal. The primary Bali conversation owns the integration.

The same already-valid IP certificate is reused; no domain, certificate or subscription was purchased. [Let's Encrypt's primary documentation](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability/) confirms support for short-lived IP certificates. The actual certificate's IP SAN and trusted chain were verified independently, without an insecure TLS bypass; expiry observed was 2026-10-14 21:23:33 UTC. Its renewal timer checks every six hours and its last run was successful.

The artifact uses `/yoga-preview/` as its base. Keeping that path avoids a source rebuild or HTML rewriting; `/yoga/` is a short entry redirect. This is an address by IP, **not a separately registered domain**. A purchased Yoga domain can be connected later with an appropriate root/base build and certificate.

## Minimal infrastructure changes

Only two include lines were added to the existing IP HTTP/HTTPS virtual host. Separate templates are `06 Development/deploy/nginx/yoga-ip-http.conf.template` and `yoga-ip-https.conf.template`. They proxy only the protected static preview, forward its existing authentication and remove cookies/forwarding metadata.

Quant routes, chat, ACME challenge, certificate/renewal settings and source files are unchanged. SAFRWAY origin configurations, page artifacts, backend and Mini App are unchanged. The previous protected SAFRWAY-domain preview stays available for backward compatibility.

## Verification and rollback

The sanitized checks are recorded in `VERIFICATION.json`. Production RU/EN HTML was byte-identical to the existing immutable artifact; critical same-origin assets also matched. External checks from the owner's workstation independently confirmed trusted TLS, the short-entry redirect and anonymous 401.

A root-private byte-verified backup of the exact shared virtual-host configuration was created before each activation. The first post-reload probe reached an old worker, so the operator restored the original configuration and reloaded successfully. The retry bounded readiness polling to five seconds, then passed all gates. This exercised actual configuration restoration; no client messages or data changes occurred.

To retire this address, remove **only** the two Yoga include lines, run `nginx -t`, reload and verify both neighbors. Retain the snippets and private backup for recovery. Do not restore an old whole Quant configuration over later Quant changes: a full restore must first match the recorded candidate hash. Future Quant rollback/deploy operations must preserve these new includes or explicitly coordinate retiring them. No global service restart or certificate issuance is needed for an ordinary address rollback.

## Residual boundary

The public Yoga domain and contact-enabled Yoga/bot launch are separate pending gates. This change does not activate the bot, establish Mikhail's recipient identity or change the public-release readiness of that work.

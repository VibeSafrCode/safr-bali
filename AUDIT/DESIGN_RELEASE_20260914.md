# Approved design release — 2026-09-14

Founder authorized local implementation, Git publication and production deployment of the redesigned public site, Telegram Mini App and installed web application. This branch contains frontend changes only. Backend API compatibility was independently reviewed and confirmed; no migration or new endpoint is required.

Baseline: 569f68c frontend source matches active Astro a11df3b and React fe5cf2c. Later merged E3/E4 work remains outside this artifact: its independent Cloudflare/cache/server gates are not bypassed. Backend/bot checkout remains 2da3e4c. Existing dirty native/package work is preserved outside this isolated branch.

Scope: five destinations, responsive carousel/grid, destination backdrops, compact service icons and visa planner, shared Mini/PWA discovery, validated modeless support, native system typography, channel feature, accessible controls. PWA overview remains at /account/overview/; services are internal /account/services/ paths. UAE is explicitly preparing/noindex. The visa status link goes directly to /account/visas/ and preserves its path through existing login. Public support uses canonical routing context in both languages.

Independent review corrected production-CSP inline styles, responsive/deferred backgrounds, duplicate H1, contrast, Telegram insets, compact visa cards, and footer clearance. No CSP weakening. No genuine customer message or data mutation is used for verification.

Historical raw asset totals (15 KB JS / 50 KB CSS) described the smaller static interface. Approved workspace functionality expands that scope. New hard limits: 40 KB JS / 135 KB CSS raw and 15 KB JS / 25 KB CSS gzip for the complete static site. Initial measured compressed totals were 12.8 KB JS / 21.4 KB CSS. Lighthouse category thresholds are unchanged. Measured Home scores: 97/100/96/100 (performance/accessibility/best-practices/SEO); Bali: 100/100/96/100. Measured Home script transfer is 17.2 KB including ten resource headers; its hard transfer budget is 20 KB, while the existing CSS transfer budget remains 50 KB.

Release gates at candidate creation: local React type/unit/build/contracts passed; responsive and independent visual/CSP checks passed. Full browser regression and exact-source CI are running/pending. This packet does not claim deployment or CI success before evidence exists.

Activation plan: immutable exact-SHA Astro+React builds, archive/file digests, preserve prior public fingerprinted assets for open tabs, stage inactive release, atomic symlink changes with paired rollback, byte parity on origin and bare public URLs, security/auth/health/read-only browser smoke. No backend/bot restart, Nginx edit or schema/customer-data write.

Rollback roots: Astro /var/www/safr/releases/audit-e2-a11df3b/astro-site; React /var/www/safr/releases/fe5cf2c/react-app. Existing deployment/configuration and old artifacts are retained. Real Telegram-client and installed-PWA checks must be distinguished from browser simulation.

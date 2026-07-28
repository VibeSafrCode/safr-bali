# SAFRWAY React application

B4 application candidate for one origin:

- `/` — Telegram Mini App;
- `/account/` — browser account.

Both HTML entries are `noindex`. The public 45-route website belongs to Astro
and is not duplicated here.

The service catalog is loaded from the same content-addressed generated
snapshot as Astro:

`../shared/content/generated/catalog-runtime.v1.json`.

## Runtime boundaries

- Telegram sends only opaque `Telegram.WebApp.initData` to
  `POST /mini-app/auth/session`.
- FastAPI validates the signature and age, then issues host-only HttpOnly
  cookies.
- The browser account starts Telegram OIDC + PKCE through
  `/api/web/auth/start?return_to=/account/`.
- OIDC callback for the target runtime is
  `https://app.safrway.online/api/web/auth/callback`.
- Login never reads referral identity from the browser and never changes an
  existing attribution.
- Points, referrals, orders, profile and support are supplied by FastAPI.

`VITE_API_BASE_URL` is optional. The target production topology intentionally
omits it so both session surfaces call their same origin. The separate
`api.safrway.online` hostname remains available for non-browser integrations
and health checks.

## Commands

```bash
pnpm install
pnpm test
pnpm run test:browser
```

The preview Nginx candidate is
`../deploy/nginx/safr-react-app.preview.conf`. It is not a production config
and must not be installed before B4 review and cutover approval.

# Public YouTube playlist refresh

Status: local implementation, not installed on production. This runbook does not
authorize a deployment. Existing customer services, database and bot are unaffected.

## Data flow and boundaries

`YouTube Data API v3 → Python read-only updater → atomic public JSON → nginx → carousel`

- Official source: `playlistItems.list` followed by `videos.list`; playlist
  `PLPOOzdEflpdk`. Preserve playlist order, deduplicate IDs. Only public, processed,
  embeddable videos with a title are projected. A confirmed empty playlist publishes
  an empty list, not old removed entries. Private/unlisted/deleted videos are omitted.
- API authentication uses the `X-Goog-Api-Key` header against the fixed official
  `https://www.googleapis.com/youtube/v3/` origin. Redirects are rejected.
  No client-side Data API request, OAuth, playlist mutation or secret in JSON.
- Cap 500 items / 10 pages, video lookups in batches of 50. Refuse incomplete or
  looping pagination. A refresh has a 150-second budget, 10-second request timeout,
  at most 3 attempts with 1/2-second delays for transient transport/429/5xx failures.
  Do not retry bad credentials, permission or daily-quota errors.
- Refresh every 15 minutes (+ at most 30 seconds systemd jitter). For a ten-item
  playlist a successful refresh uses two list calls; this is not a visitor-driven
  call. Verify the actual project quota/allowed API before production activation.
- Atomic replace with exclusive nonblocking writer lock. Failures keep the previous
  complete projection for up to 24 hours, without changing its original timestamp.
  The updater clears expired cached titles during failed refreshes; the browser also
  rejects expired data. A stopped updater cannot make a frozen timestamp look fresh.
- Browser fetch is same-origin, bounded to 3 seconds, once per page. It never
  interrupts an active player, an explicit navigation, or keyboard focus.
  A fresh editorial build snapshot is a <=24-hour cold-start fallback; after that,
  expired/unavailable metadata becomes the plain YouTube playlist link. Without JS,
  the build-time snapshot remains ordinary external video links (not a live claim).
- Preview controls, smooth poster cuts and click-only playback stay unchanged.
  Embeddable status cannot guarantee playback in every region/device/account.

## Local use

Store the API key in the repository-root `.env.youtube.local`, ignored by Git and
outside the frontend root, regular file mode 0600:

```dotenv
YOUTUBE_API_KEY=<enter locally, never commit>
YOUTUBE_PLAYLIST_ID=PLPOOzdEflpdk
```

From the repository root, a one-off refresh is:

```sh
python3 '06 Development/tools/youtube/refresh_public_playlist.py' --env-file .env.youtube.local --output '06 Development/astro-site/.cache/youtube-playlist.json'
```

Astro dev/preview runs this refresh when its HTTP server begins listening, then every
15 minutes. `astro check` and static builds do not refresh or need the key. The Vite
bridge serves only `/api/public/youtube-playlist.json`, never the credential file;
missing cache is 503. Generated `.cache/` is ignored and must not be committed.
Close the dev server to stop its owned refresh process/timer. No browser is launched.

## Production gate (not executed)

1. Restrict a dedicated key to **YouTube Data API v3** and the server's known outbound
   IP when available. Browser referrer restrictions are unsuitable for this server
   caller. Rotate any key shared in chat; do not print it in evidence or shell argv.
2. Install the updater from the approved immutable revision at
   `/opt/safr/youtube/refresh_public_playlist.py`, root-owned, mode 0644.
   No third-party Python dependency is required (Python >=3.9).
3. Provision `/etc/safr/youtube-playlist.env` root-owned 0600 with the two variables.
   systemd reads the file; the `www-data` process does **not** need permission to read
   it directly. Do not broaden existing bot/database secret permissions.
4. Install the reviewed `.service` and `.timer` from `deploy/systemd`, daemon-reload,
   then run the oneshot **before** enabling the timer or activating the frontend.
   `CacheDirectory` provisions `/var/cache/safr-youtube` for the unprivileged writer.
5. Require updater exit 0 and sanitized `status=updated`, correct playlist ID,
   count/order versus the official API, no secret fields, fetchedAt/expiresAt valid.
   An inaccessible API, rejected key or missing cache blocks this feature's release.
6. Install the exact public nginx cache route from the reviewed template, run
   `nginx -t`, then reload. Preserve unrelated live configuration and rollback copy.
   Both HTML CSP thumbnail permission and `youtube-nocookie` frame permission are
   required. Cache response must not be edge-cached against its `no-cache` header;
   verify public headers/body and bypass conflicting custom Cloudflare rules if any,
   with separately authorized configuration changes.
7. Activate approved frontend artifact and timer. Verify exact source/artifact IDs,
   public manifest timestamp/count, health, live refresh timestamp advancement,
   poster/arrow behavior and one deliberate playback. Check phone/tablet/desktop
   without unsolicited external browser launches. Redact all credentials from logs.

## Operations and rollback

Inspect `systemctl status safr-youtube-playlist.timer` and sanitized
`journalctl -u safr-youtube-playlist.service`. Failures exit 1 with an allowlisted
code; successes log count/timestamp only. Alert/act if refresh age exceeds one hour.
The 24-hour expiry is a hard display fallback, not a success indicator.

Rollback by disabling the timer and restoring the preceding frontend/nginx revision.
Keep the last public cache for diagnosis within its retention window; do not touch
customer data, schema, bot, or unrelated files. No database migration is involved.
The prior committed static carousel needs neither a key nor this endpoint.

Official references:
- https://developers.google.com/youtube/v3/docs/playlistItems/list
- https://developers.google.com/youtube/v3/docs/videos/list
- https://developers.google.com/youtube/v3/docs/videos#status.embeddable
- https://docs.cloud.google.com/docs/authentication/api-keys-use
- https://developers.google.com/youtube/terms/developer-policies

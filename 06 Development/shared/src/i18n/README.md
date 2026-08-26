# SAFRWAY RU/EN translation corpus

Status: local authored corpus for `BALI-TASK-050`; not wired to production and
not release evidence. Capture date: `2026-08-10`.

## Authored sources

- `public.ts` — all 44 contracted public Astro routes plus shared public UI.
- `bot.ts` — client-facing Telegram bot copy, keyboards, prompts, errors and
  notifications. Staff/admin-only copy is outside this corpus.
- `mini-app.ts` — authenticated Mini App and client Account copy/states.
- `types.ts` — locale, evidence and review types.
- `validate.ts` — key, locale, route, protected-token and sensitive-review
  validation. It reads authored TypeScript only and never rewrites generated
  JSON.

The current Russian copy remains the factual source. English entries translate
that copy without adding promises or facts. Source paths and verification state
are stored on every translation unit.

## Immutable translation boundaries

Do not translate or mutate:

- `SAFRWAY` and business identifiers;
- routes, slugs, callbacks, deep links and FSM identifiers;
- prices, amounts, currencies and visa codes;
- `route_context` values and other machine fields;
- user- or manager-authored free text.

Placeholders such as `{amount}`, `{count}` and `{status}` must remain identical
between Russian and English.

## Human review gate

English privacy copy and all seven noindex Bali visa routes are marked
`HUMAN_REVIEW_REQUIRED`. Their presence in the corpus does not authorize
publication. Founder/CPO review is required before runtime integration or
release.

Exact public review routes:

- `/privacy/`;
- `/bali/visas/`;
- `/bali/visas/e33g/`;
- `/bali/visas/d12/`;
- `/bali/visas/d1-d2/`;
- `/bali/visas/c1/`;
- `/bali/visas/voa/`;
- `/bali/visas/other-visa/`.

The bot corpus exports the exact `BOT_SENSITIVE_REVIEW_KEYS` array: 49
`visa.*` keys, 16 `button.visa.*` keys, plus `button.thailand.visas`,
`text.visaIntro`, `destination.service.thailandVisas` and
`keyboard.visa.placeholder` (`69` total). Mini App/Account has no duplicated
visa or privacy facts.

## Local validation evidence

Current authored corpus: public `248`, bot `280`, Mini App/Account `245`;
total `773` RU/EN entries. Public route coverage is `46/46`; sensitive source
evidence is `9/9`; missing locale entries, placeholder mismatches and protected
token failures are all `0`.

Run from the repository root with the configured Node runtime and the local
`tsx` loader:

```text
node --import "./06 Development/react-app/node_modules/tsx/dist/loader.mjs" \
  "06 Development/shared/src/i18n/validate.ts"
```

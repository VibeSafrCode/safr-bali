# SAFRWAY shared contracts

Framework-neutral contracts for the target SAFRWAY architecture.

This directory is the shared source for:

- the `45 + 2 = 47` route contract;
- the one-hop account redirect;
- Telegram and browser runtime boundaries;
- content verification states;
- immutable catalog snapshots;
- design tokens.

The current Next/Vinext application remains the reference implementation until
the B4 cutover. B1 contracts do not change production behavior.

`src/account-redirect.mjs` is a framework-neutral implementation of the
redirect policy. Astro preview and the future production proxy must use the
same rules instead of rebuilding query forwarding independently.

Run locally:

```bash
node scripts/validate-contracts.mjs
node --test tests/contracts.test.mjs
```

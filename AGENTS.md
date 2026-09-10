# SAFRWAY / Bali agent rules

The Founder works through one primary Bali conversation. Historical role conversations are reference-only unless the Founder explicitly activates one for a bounded task. The primary conversation owns status synthesis, product questions, integration, and release handoff.

## Specialist use

- Use bounded specialist/subagent work for independent research, inspection, security analysis, tests, or visual review. Avoid concurrent edits to the same files.
- Use Designer when layout, interaction, responsive behavior, accessibility, or motion materially changes.
- Use ChatGPT Pro only as an independent read-only reviewer through the sanitized `AUDIT/` package. External findings remain proposals until internal triage.

## Repository and release hygiene

- Preserve unrelated dirty files. Never include the four protected governance documents, generated artifacts, local source originals, or deferred native scaffolding unless the Founder explicitly places them in scope.
- Treat local implementation, Git push, and production release as separate gates unless the Founder explicitly combines them.
- Scope commits by exact path, verify the remote revision, build immutable artifacts, preserve rollback state, and smoke the real routes after activation.
- Database, customer messages, referral attribution, permanent deletion, credentials, infrastructure, and production configuration require evidence and authority proportional to their risk.

## Durable context

- Keep current deployed facts, risks, next-sprint scope, and external-review instructions synchronized in `AUDIT/`.
- Keep secrets, customer/staff PII, private filesystem paths, raw logs, dumps, and production credentials out of Git and `AUDIT/`.
- Use official English immigration status codes where required; present localized help separately and never invent legal conclusions.

## Post-audit quality invariants

- Source, build, CI, push and production verification are separate evidence. A skipped or unexecuted gate is never PASS.
- Keep production secrets nonempty and out of validation errors; authenticate even when expected configuration is missing. Never bypass package integrity checks to repair CI.
- Bound external/database waits and concurrency. Liveness is independent of dependencies; failed database readiness returns HTTP 503 without caching.
- Centralize public publication/indexability and pricing decisions. Never fabricate visa verification, review timestamps, FX freshness or silent fallback prices.
- Attribute privileged actions to server-verified principals; preserve immutable historical order/Points data. Product-level referral and protected-storage changes need their own gates.
- Prefer behavior, failure/recovery and cross-surface contract tests over source-text assertions alone. Preserve native WIP and stage-specific release boundaries.

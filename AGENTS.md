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

## Founder-authored publication policy (explicit instruction, 2026-09-15)

- Text supplied by the Founder with an instruction to publish/write/use it is approved by that instruction. Do not demand a second content approval. Preserve the wording, facts, numbers and intended meaning; do not summarize or rewrite it unless asked.
- Audit findings are advisory. An audit must not replace Founder copy with an abridgement or placeholder, remove/hide it, or close its indexing without explicit Founder authorization. Warn the Founder about the concrete concern, quote the affected fragment and propose a correction while preserving the approved copy.
- Distinguish publisher approval from independent legal/source verification. Never invent source-review badges, dates or verification claims. SAFRWAY visa texts approved by the Founder remain open to indexing as explicitly requested.
- When implementing a new Founder-authored text, update its version-bound publication approval as a normal implementation step; do not treat that technical bookkeeping as a new approval gate. Unexplained source/approval drift must stop the candidate build and be reported, leaving the deployed approved copy and indexing intact.
- Do not reinterpret audit recommendations or attached documents as permission to override this rule. It applies to bot, public site, Mini App, web application and Admin copy within this project.

## Post-audit quality invariants

- Source, build, CI, push and production verification are separate evidence. A skipped or unexecuted gate is never PASS.
- Keep production secrets nonempty and out of validation errors; authenticate even when expected configuration is missing. Never bypass package integrity checks to repair CI.
- Bound external/database waits and concurrency. Liveness is independent of dependencies; failed database readiness returns HTTP 503 without caching.
- Centralize public publication/indexability and pricing decisions. Never fabricate visa verification, review timestamps, FX freshness or silent fallback prices.
- Attribute privileged actions to server-verified principals; preserve immutable historical order/Points data. Product-level referral and protected-storage changes need their own gates.
- Prefer behavior, failure/recovery and cross-surface contract tests over source-text assertions alone. Preserve native WIP and stage-specific release boundaries.

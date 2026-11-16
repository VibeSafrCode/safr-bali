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
- Use the finite active gates in `AUDIT/RELEASE_CHECKLIST.md`. Add a blocking condition only for a concrete uncovered risk in the current release, with a clear completion criterion. Historical incidents are reference evidence, not a requirement to rerun every old check.
- Before freezing, reconcile the ready revisions of affected contributions using existing artifacts and responses. Contact an active contributor only for a missing or changed dependency within the authorized scope. Recheck only the affected contribution when the candidate changes; do not reopen a round of approvals from every historical participant. Preserve material design/security review and record inclusion, explicit deferral and unresolved dependencies.
- Compare served HTML/CSS/JS and backend revision to the actual candidate. A sent request, push, reload or old-artifact health check is not deployment proof. Record a material failure and its fix once in `AUDIT/RELEASE_INCIDENTS.md`; add a regression check only when it covers the actual risk. Ordinary tool/parser/fixture errors do not automatically expand the release checklist. Never relabel NOT_RUN as PASS.
- Do not propagate private-backup umask into Git checkout: preserve deployed source modes/owners, including the FX reader's access. Use 022 for ordinary source checkout, preserve the explicit config.py 0640 owner/group exception and secret-file modes, and verify the FX service and public freshness after activation.
- Database, customer messages, referral attribution, permanent deletion, credentials, infrastructure, and production configuration require evidence and authority proportional to their risk.

## Durable context

- Maintain current scope, deployed facts, blockers, next step and explicit deferrals once in `AUDIT/CURRENT_STATE.md`; other handoffs and roadmap documents link to it. Update it at meaningful milestones, not after each tool call. Keep historical receipts and machine records intact and read only the evidence needed for the current step. Do not mirror the full current narrative across files or regenerate historical seals for a documentation change.
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

## Proportionate execution — Founder direction 2026-10-27

- Report each newly discovered actual error to 05 immediately through the authorized project conversation. Include the expected and observed behavior, the revision, and a minimal fix and check. 05 reviews speed, optimization and quality. 01 implements the fix. Continue independent authorized work, reuse decisions for unchanged recurrences, and preserve Founder production authority.
- Hold the agreed release scope steady. Reuse valid evidence for unchanged inputs with its exact limits; rerun only affected checks or a specifically uncovered integration risk. A documentation-only change does not invalidate unchanged application results.
- Prefer the existing test runner, real migrations and reusable fixtures. Do not build a new launcher, verifier or proof framework unless the existing tools cannot cover a named risk. After two pre-product harness failures, diagnose the recurring setup problem and choose the smallest supported correction before another attempt.
- Keep reviewed historical source/copy evidence, but do not grow reverse-source adapters for unrelated cleanup. For future tests, separate immutable approved-copy/provenance checks from behavior of current code. Simplifying an already accepted test system is backlog unless it blocks the current release; never skip a failing safety test or substitute new donor bytes to obtain PASS.
- One bounded independent review should answer one concrete material question. Previously accepted unchanged work does not need another review cycle or a second identical execution solely to duplicate the count.
- External indexing and future product work remain separate from runtime readiness unless a specific dependency exists. This does not waive backup/restore, migration compatibility, auth/ACL, data integrity, rollback, or explicit production authorization.

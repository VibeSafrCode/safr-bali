# Contributing External Reviews

Return a concise finding set. Prefer a few high-value findings over a broad
list of speculative improvements.

## Required finding format

```text
Finding ID:
Date / auditor:
Reviewed commit SHA and worktree label:
Title:
Priority: P0 | P1 | P2 | P3
Status: PROPOSED
Affected surface:
Exact observed claim:
Evidence: repo-relative path:line, commit, test, or packet reference
Evidence class: CONFIRMED | INFERENCE | UNKNOWN
Expected invariant:
Impact and likelihood:
Read-only or synthetic reproduction:
Recommended change:
Alternatives and trade-offs:
Decision owner: CPO | CTO | Documentation | other named owner
Founder approval required: YES | NO | UNKNOWN
Acceptance and evidence gate:
Privacy/redaction note:
```

## Evidence rules

- Cite the smallest relevant repo-relative path and line range.
- Separate observation, inference, assumption, and missing evidence.
- A source file proves only source presence; a test result requires actual test
  output; deployment requires exact release evidence.
- Never infer commit, push, migration apply, service health, production state,
  smoke, or user behavior.
- Preserve `DEPLOYED`, `LOCAL_ONLY`, `PLANNED`, and `UNKNOWN` labels.
- Do not invent versions, decision IDs, owners, legal facts, availability,
  prices, routes, or operational evidence.
- If canonical sources conflict, report a contradiction rather than choosing
  silently.

## Contradiction format

```text
Document / fact
Current source of truth
Evidence
Discrepancy
Decision owner
Proposed correction
Founder approval gate
```

## Recommendation rules

- Every recommendation remains `PROPOSED` until triaged and approved.
- Prefer the smallest safe correction and name what can be removed or deferred.
- Do not provide secrets, live commands, or an operational runbook that bypasses
  project gates.
- Patch suggestions are advisory only; do not edit repository files.
- Product choices belong to CPO; technical choices to CTO; release facts to the
  Documentation & Release Manager; approval remains with Founder where gated.

## Submission hygiene

- No generated files, artifacts, logs, screenshots with PII, or backup data.
- No customer/user messages or real transaction reproduction.
- One finding per issue; link duplicates.
- State confidence and unresolved questions.
- Use `REVIEW_LOG.md` only after internal triage; preserve its append-only
  history.

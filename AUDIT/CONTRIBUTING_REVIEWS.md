# Contributing External Reviews

Prefer a small set of evidence-backed, high-value findings over a broad list of
speculative improvements.

## Required finding format

```text
Finding ID:
Date / auditor / model:
Reviewed commit SHA:
Title:
Priority: P0 | P1 | P2 | P3
Status: PROPOSED
Suggested triage: ACCEPT | MODIFY | REJECT | NEEDS_EVIDENCE
Affected surface:
Exact observed claim:
Evidence: repo-relative path:line, commit, test, or sanitized packet reference
Evidence class: CONFIRMED | INFERENCE | UNKNOWN
Expected invariant:
Impact and likelihood:
Read-only or synthetic reproduction:
Recommended smallest change:
Alternatives and trade-offs:
Decision owner: CPO | CTO | Designer | Security | Documentation | other
Founder approval required: YES | NO | UNKNOWN
Acceptance and evidence gate:
Privacy/redaction note:
```

## Evidence rules

- Cite tight repo-relative line ranges and the exact reviewed SHA.
- Separate observation, inference, assumption and missing evidence.
- Source presence proves only source presence. A test result or production
  state requires recorded execution evidence.
- Preserve `DEPLOYED`, `PUSHED`, `LOCAL_ONLY`, `PLANNED`, `UNKNOWN` and
  `NEEDS_EVIDENCE` labels.
- Do not invent versions, owners, IDs, legal facts, prices, availability,
  routes, SLAs, analytics outcomes or operational evidence.
- If sources conflict, record a contradiction rather than choosing silently.

## Recommendation rules

- Every recommendation remains `PROPOSED` until internal triage.
- Prefer the smallest safe correction; say what can be removed or deferred.
- Product decisions belong to CPO, technical design to CTO, visual/accessibility
  acceptance to Designer, security/privacy to the named security owner, and
  recorded release facts to Documentation & Release Management.
- Never provide live secrets or an operational shortcut that bypasses gates.

## Internal triage

Each finding receives one disposition:

- `ACCEPT` — include substantially as proposed;
- `MODIFY` — include with recorded scope/contract changes;
- `REJECT` — do not include, with evidence-backed reason;
- `NEEDS_EVIDENCE` — decide only after named evidence is supplied.

Triage is not implementation. Material new/destructive/data/infrastructure
scope still requires Founder approval.

## Contradiction format

```text
Document / fact:
Current source of truth:
Evidence:
Discrepancy:
Decision owner:
Proposed correction:
Founder approval gate:
```

## Submission hygiene

- No generated files, artifacts, logs, screenshots, backups, PII or secrets.
- No real customer/user reproduction or messages.
- One finding per issue; cross-link duplicates.
- Record confidence and unresolved questions.
- Only an authorized maintainer appends triaged outcomes to `REVIEW_LOG.md`;
  preserve append-only history.

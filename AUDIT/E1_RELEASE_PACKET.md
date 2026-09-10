# BALI-AUDIT-20260905-E1 — release candidate packet

Date: 2026-09-09. **READY_LOCAL / RELEASE_GATES_OPEN**.
This is not a release authorization or proof of deployment.

## Exact boundary

- Baseline local HEAD: `c86671f831427fd4a396108ad1ee9fd493009fdb`.
- Candidate commit / push / PR / CI run / deployment: **NOT_CREATED**.
- Last read-only production checkout: `d9f23291dffe00b40c6b5ef350664ad82b33e0f3`.
  Backend, bot and Nginx active; effective candidate config validation passed.
- E1 introduces **no schema migration**, price change, reward recalculation,
  customer message or protected-document activation.
- Stage E2–E4 implementation has not started. Narrow image/language changes
  resolve reproduced mandatory performance failures, not a new visual redesign.

## Scope and evidence

The exhaustive candidate path allow-list is `AUDIT/E1_RELEASE_PATHS.txt`.
Review contents again before staging; never use `git add .` or `git add -A`.
The final 35 implementation/test/workflow files in that allow-list (all
`.github/` and `06 Development/` except `06 Development/docs/`) have combined
content SHA256 `ce9f56d8ad1f01f6210704c4c21f6885aa3a5ed6ff1aa70eb84c719d9fcff294`.
Digest input is lexically sorted UTF-8 path + NUL + file bytes + NUL for each
file. This is a candidate-content checksum, **not a commit or deployed SHA**.
All 49 paths exist and are unique; the only tracked dirty paths outside the
allow-list are the three preserved native React package/workspace/lock files.
Test history, failures/corrections, independent reviews, counts and toolchain
limits are recorded in `AUDIT/POST_AUDIT_EXECUTION.md`.

Final local gates: backend **212 passed / 0 skipped**, bot **83 passed**, shared
**10 passed**, React **19 unit + 40 build + 121 browser passed / 8 browser skipped**;
Astro **31 contracts + 131 browser passed / 4 browser skipped**; reference
**39 static + 11 unit**, both exports/parity/typecheck/lint passed. Final
Lighthouse Home/Bali **99/98 performance**, **100/100 accessibility**; unchanged
performance threshold **95**. Nginx full syntax and 7 boundary tests passed.
Independent security/visual reviews completed; readiness callback retention
found during review was fixed and the full server suite repeated successfully.

1. Restore all frontend CI gates; add isolated bot/proxy/readiness gates.
   Official pnpm action, Node 24.19.0 LTS, pnpm 11.9.0; no warning suppression.
2. Fail-closed secrets/auth guards; bounded readiness/liveness and limiter state.
3. Service actor attribution restriction and bounded Points ledger pagination.
4. Server-scoped trusted tunnel real-IP and complete upstream header replacement.
5. Repair stale tests/fixtures and build-time approved-image/layout-shift issues.
6. Reconcile API, runbooks, decisions, backlog and sanitized audit evidence.

## Preserved exclusions

Native package/workspace/lock modifications, native-shell, local visual/build
artifacts, shared local lock, ignored inbox originals and any unrelated WIP
are excluded. At the final comparison the three native files retained hashes:

| Excluded React file | SHA256 |
| --- | --- |
| `package.json` | `6138e7a9de1d386450e39325b112b0ac7fd803b4d5f824814eb66087b04d51af` |
| `pnpm-lock.yaml` | `e42d5c179f9266b3694da80648985960a609d0ac7b807793414a18bf094f595e` |
| `pnpm-workspace.yaml` | `e12f9683f4625cba891a93c057bb15b6bbb04cbf8bc5aeb64da7a04d932f6e44` |

## Gates still required before production

- Founder authorization for publication/release; old sprint authorizations are
  not treated as new audit authority. A separate E1 PR keeps later stages freezable.
- Fresh exact-candidate GitHub CI on Linux/Python3.12, including **non-skipped**
  PostgreSQL outage and real Nginx tests. Local Python3.9/macOS evidence is not CI.
- Inventory actual `/points/*` server consumers. Ledger response is now an
  envelope, not an array; human actor fields reject non-null values. API Spec
  defines cursor, historic replay conflicts and rollback compatibility.
- Privately verify Cloudflare visitor-header/Worker/Pseudo-IPv4 policy and
  tunnel origin. Preserve existing Nginx/unit/config and immutable artifacts;
  check realip module and syntax before any reload. No wildcard proxy trust.
- Activate compatible backend + Nginx + explicit Uvicorn loopback trust as one
  authorized sequence. Observe liveness/readiness, unauthenticated boundaries,
  representative routes, artifact versions and resolved-IP behavior read-only.
  No customer messages, ledger writes or production DB outage as smoke tests.
- Record exact release/rollback SHA and artifact roots. On failure restore
  compatible source/artifacts/Nginx/unit together; no database rewrite is needed.

## Residual debt (not hidden by E1)

- P1 controlled architecture debt: shared service identities/scopes and legacy
  admin-token order attribution. This candidate fixes the two Points service
  write boundaries, not every privileged integration in the project.
- P2 upstream dependency: Wrangler bundles legacy punycode usage. Node's
  application-only deprecation policy is not a dependency removal.
- Operational limitations: in-memory limiter is per process; trusted loopback
  does not authenticate local process identity; provider/edge settings and field
  performance require continuing operational evidence.
- E2 SEO/provenance, E3 broad performance, E4 account UX remain staged. Referral
  economics and protected-file enablement retain separate Founder/security gates.

Freeze is safe with candidate files preserved. Resume by reconciling WIP and
the latest evidence register, not by repeating an old deployment command.

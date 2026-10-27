import assert from "node:assert/strict";
import test from "node:test";
import { createAdminVisaSaveSession, validAdminVisaSaveResponse, type AdminVisaSaveIdentity } from "../src/components/adminVisaSaveSession";

function fixture() {
  let current: AdminVisaSaveIdentity | null = { actorId: 11, scope: "synthetic-csrf", apiOrigin: "https://synthetic.example", clientId: 21, caseId: 31, version: 1 };
  let serial = 0;
  const session = createAdminVisaSaveSession(() => current, () => "synthetic-request-" + ++serial);
  return { session, set(value: Partial<AdminVisaSaveIdentity> | null) { current = value === null ? null : { ...current!, ...value }; },
    identity: () => current, payload: () => ({ expected_version: current?.version ?? 1, reason: "Synthetic save", notify_client: false }) };
}

test("immediate duplicate click is locked; uncertain retry keeps exact body/key", () => {
  const f = fixture(), payload = f.payload();
  const first = f.session.begin(payload, f.identity())!;
  assert.ok(first); assert.equal(f.session.begin(payload, f.identity()), null);
  f.session.finish(first);
  const retry = f.session.begin(payload, f.identity())!;
  assert.equal(retry.body, first.body);
});

test("revised request is not mistaken for a replay", () => {
  const f = fixture(), first = f.session.begin(f.payload(), f.identity())!; f.session.finish(first);
  const revised = f.session.begin({ ...f.payload(), notify_client: true }, f.identity())!;
  assert.notEqual(JSON.parse(first.body).idempotency_key, JSON.parse(revised.body).idempotency_key);
});

for (const change of [{ actorId: 12 }, { scope: "different-session" }, { apiOrigin: "https://different.example" }, { clientId: 22 }, { caseId: 32 }]) {
  test("reply bound to actor/session/parent/case: " + Object.keys(change)[0], () => {
    const f = fixture(), ticket = f.session.begin(f.payload(), f.identity())!; f.set(change);
    assert.equal(f.session.isCurrent(ticket), false); assert.equal(f.session.contextMatches(ticket), false);
  });
}

test("same-context newer version refuses stale reply but permits owner cleanup", () => {
  const f = fixture(), ticket = f.session.begin(f.payload(), f.identity())!; f.set({ version: 2 });
  assert.equal(f.session.isCurrent(ticket), false); assert.equal(f.session.contextMatches(ticket), true);
  f.session.finish(ticket); assert.ok(f.session.begin(f.payload(), f.identity()));
});

test("stale rendered handler cannot initiate against a new current context", () => {
  const f = fixture(), rendered = { ...f.identity()! }; f.set({ caseId: 99 });
  assert.equal(f.session.begin(f.payload(), rendered), null);
});

test("completed same-scope outcome may restore lost focus, invalidation cancels it", () => {
  const f = fixture(), ticket = f.session.begin(f.payload(), f.identity())!;
  f.session.finish(ticket); f.set({ version: 2 }); assert.ok(f.session.scopeMatches(ticket));
  f.session.invalidate(); assert.equal(f.session.scopeMatches(ticket), false);
});

test("close/reopen same identity has a new epoch; old finally cannot unlock new save", () => {
  const f = fixture(), old = f.session.begin(f.payload(), f.identity())!; f.session.invalidate();
  const fresh = f.session.begin(f.payload(), f.identity())!;
  assert.equal(f.session.isCurrent(old), false); assert.ok(f.session.isCurrent(fresh));
  f.session.finish(old); assert.equal(f.session.begin(f.payload(), f.identity()), null); assert.ok(f.session.isCurrent(fresh));
});

test("unmounted/missing or malformed authenticated identity cannot initiate a write", () => {
  for (const change of [null, { actorId: 0 }, { actorId: NaN }, { clientId: -1 }, { caseId: 1.5 }, { version: 0 }, { scope: "" }]) {
    const f = fixture(); f.set(change); assert.equal(f.session.begin(f.payload(), f.identity()), null);
  }
  const f = fixture(); assert.equal(f.session.begin({ expected_version: 2 }, f.identity()), null);
  assert.equal(f.session.begin({ ...f.payload(), idempotency_key: "untrusted-key" }, f.identity()), null);
});

test("capture is not changed by later draft or identity mutation", () => {
  const f = fixture(), body = f.payload(), ticket = f.session.begin(body, f.identity())!;
  body.reason = "Changed draft"; f.set({ caseId: 99 });
  assert.equal(JSON.parse(ticket.body).reason, "Synthetic save"); assert.equal(ticket.identity.caseId, 31);
});

test("response accepts omitted user_id but rejects another identity or invalid version", () => {
  const f = fixture(), ticket = f.session.begin(f.payload(), f.identity())!;
  assert.ok(validAdminVisaSaveResponse({ id: 31, version: 2 }, ticket));
  assert.ok(validAdminVisaSaveResponse({ id: 31, version: 4, user_id: 21 }, ticket));
  for (const response of [null, [], { id: 32, version: 2 }, { id: 31, version: 2, user_id: 22 },
    { id: 31, version: 1 }, { id: 31, version: "2" }, { id: 31, version: Infinity }, { id: 31, version: 2.1 }])
    assert.equal(validAdminVisaSaveResponse(response, ticket), false);
});

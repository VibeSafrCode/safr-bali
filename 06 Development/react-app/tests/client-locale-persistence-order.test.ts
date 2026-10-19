import assert from "node:assert/strict";
import test from "node:test";
import {createClientUiLocaleSession} from "../src/i18n/client-ui-locale";

function deferred() {
  let resolve!: () => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
async function drain() {for (let i = 0; i < 8; i++) await Promise.resolve();}
function fixture() {
  let stored: string | null = "ar";
  const applied: string[] = [];
  const session = createClientUiLocaleSession({initial: "ru", read: () => stored,
    write: value => {stored = value;}, apply: value => {applied.push(value);}});
  session.mount(); session.bindPrincipal(101, "ru");
  return {session, stored: () => stored, applied};
}

test("overlapping RUEN writes cannot commit in reverse intent order", async () => {
  const {session} = fixture(), first = deferred(), second = deferred();
  const started: string[] = [], committed: string[] = [];
  const old = session.change("en", async value => {
    started.push(value); await first.promise; committed.push(value);
  });
  await drain();
  const latest = session.change("ru", async value => {
    started.push(value); await second.promise; committed.push(value);
  });
  await drain();
  assert.deepEqual(started, ["en"]);
  assert.equal(session.snapshot().locale, "ru");
  // Even if B's transport is ready first, it cannot write before A completes.
  second.resolve(); await drain(); assert.deepEqual(committed, []);
  first.resolve();
  assert.equal(await old, "stale"); assert.equal(await latest, "persisted");
  assert.deepEqual(started, ["en", "ru"]);
  assert.deepEqual(committed, ["en", "ru"]);
  assert.equal(session.snapshot().contactLocale, "ru");
});

test("a failed latest intent rolls back to the preceding acknowledged write", async () => {
  const {session, stored} = fixture(), first = deferred();
  const old = session.change("en", () => first.promise); await drain();
  const latest = session.change("ru", async () => {throw new Error("synthetic failure");});
  first.resolve();
  assert.equal(await old, "stale"); assert.equal(await latest, "rollback");
  assert.equal(session.snapshot().locale, "en");
  assert.equal(session.snapshot().contactLocale, "en"); assert.equal(stored(), "en");
});

test("two failed intents restore the settled foreign preference, not an unacknowledged optimistic choice", async () => {
  const {session, stored, applied} = fixture(), first = deferred();
  const old = session.change("en", () => first.promise); await drain();
  const latest = session.change("ru", async () => {throw new Error("second failure");});
  first.reject(new Error("first failure"));
  assert.equal(await old, "stale"); assert.equal(await latest, "rollback");
  assert.equal(session.snapshot().locale, "ar");
  assert.equal(session.snapshot().contactLocale, "ru");
  assert.equal(stored(), "ar"); assert.equal(applied.at(-1), "ar");
});

test("later foreign UI intent is retained while earlier contact acknowledgements reconcile", async () => {
  const {session, stored} = fixture(), first = deferred(), calls: string[] = [];
  const old = session.change("en", async value => {calls.push(value); await first.promise;});
  await drain();
  const queued = session.change("ru", async value => {calls.push(value);});
  assert.equal(await session.change("ja", async () => {throw new Error("foreign must not be sent");}), "local");
  first.resolve();
  assert.equal(await old, "stale"); assert.equal(await queued, "stale");
  assert.deepEqual(calls, ["en", "ru"]);
  assert.equal(session.snapshot().locale, "ja"); assert.equal(stored(), "ja");
  assert.equal(session.snapshot().contactLocale, "ru");
});

test("actor reset detaches the blocked queue and never sends queued old-principal work", async () => {
  const {session} = fixture(), first = deferred(), calls: string[] = [];
  const old = session.change("en", async () => {calls.push("A/en"); await first.promise;});
  await drain();
  const queued = session.change("ru", async () => {calls.push("A/ru");});
  session.bindPrincipal(202, "ru");
  assert.equal(await session.change("en", async () => {calls.push("B/en");}), "persisted");
  assert.deepEqual(calls, ["A/en", "B/en"]);
  first.resolve();
  assert.equal(await old, "stale"); assert.equal(await queued, "stale");
  assert.deepEqual(calls, ["A/en", "B/en"]);
  assert.equal(session.snapshot().actor, 202); assert.equal(session.snapshot().contactLocale, "en");
});

test("logout or dispose invalidates unsent queued work; a failure does not poison future writes", async () => {
  for (const end of ["logout", "dispose"] as const) {
    const {session} = fixture(), first = deferred(), calls: string[] = [];
    const old = session.change("en", async () => {calls.push("en"); await first.promise;});
    await drain();
    const queued = session.change("ru", async () => {calls.push("ru");});
    session[end](); first.reject(new Error("late old failure"));
    assert.equal(await old, "stale"); assert.equal(await queued, "stale");
    assert.deepEqual(calls, ["en"]);
    session.mount(); session.bindPrincipal(202, "ru");
    assert.equal(await session.change("en", async () => {calls.push("new en");}), "persisted");
    assert.deepEqual(calls, ["en", "new en"]);
  }
});

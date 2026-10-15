import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { yogaLaunchSession, yogaReadDeadline, YogaReadTimeoutError } from "../src/runtime/yoga-mini-app";
import type { Dashboard } from "../src/api/types";
import { ProfileStats } from "../src/components/ProfileStats";
import { withoutExpiredDerived, type PricingProjection } from "../src/pricing/runtime";

const actor: Dashboard = { telegram_id: 123456789, locale: "en", first_name: "Verified fixture", balance: -4,
  referral_count: 3, orders: [], referral_payload: "r_ABCDEFGH" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

test("Two Yoga subscribers retain one verification; verified Life can finish before a slow account", async () => {
  const auth = deferred<unknown>();
  const account = deferred<Dashboard>();
  const calls: string[] = [];
  const api = { async request<T>(path: string): Promise<T> {
    calls.push(path);
    return (path.endsWith("yoga-session") ? auth.promise : path.endsWith("yoga-account") ? account.promise : { items: [] }) as Promise<T>;
  } };
  const launch = yogaLaunchSession();
  const first = launch(api, "opaque-signed-launch");
  const replay = launch(api, "opaque-signed-launch");
  assert.equal(first, replay);
  assert.equal(first.verified, replay.verified);
  assert.equal(first.account, replay.account);
  const key = first.viewInstanceKey;
  assert.equal(key.includes("123456789"), false);
  assert.equal(key.includes("opaque-signed-launch"), false);
  const life = first.verified.then((verified) => verified ? api.request("/mini-app/life-services") : null);
  assert.deepEqual(calls, ["/mini-app/auth/yoga-session"]);
  auth.resolve({ authenticated: true });
  assert.equal(await first.verified, true);
  await life;
  assert.deepEqual(calls, ["/mini-app/auth/yoga-session", "/mini-app/yoga-account", "/mini-app/life-services"]);
  let finishedAccount = false;
  void first.account.then(() => { finishedAccount = true; });
  await Promise.resolve();
  assert.equal(finishedAccount, false);
  account.resolve(actor);
  assert.equal((await first.account)?.balance, -4);
  assert.equal(first.viewInstanceKey, key, "Account completion cannot replace the Life view identity");
});

test("Rejected signature verification is retained, with no account read or automatic auth retry", async () => {
  const calls: string[] = [];
  const api = { async request<T>(path: string): Promise<T> { calls.push(path); throw new Error("signature rejected"); } };
  const launches = yogaLaunchSession();
  const launch = launches(api, "same-launch");
  await assert.rejects(launch.verified, /signature rejected/);
  await assert.rejects(launch.account, /signature rejected/);
  assert.equal(launches(api, "same-launch"), launch);
  assert.equal(launch.retryAccount(), launch.account, "A rejected verification is not reset");
  await assert.rejects(launch.retryAccount(), /signature rejected/);
  assert.deepEqual(calls, ["/mini-app/auth/yoga-session"]);
});

test("An explicit logical-account retry shares one read and never repeats auth or changes referral values", async () => {
  const calls: string[] = [];
  const retry = deferred<Dashboard>();
  let reads = 0;
  const api = { async request<T>(path: string): Promise<T> {
    calls.push(path);
    if (path.endsWith("yoga-session")) return { authenticated: true } as T;
    if (++reads === 1) throw Object.assign(new Error("temporary unavailable"), { status: 503 });
    return retry.promise as Promise<T>;
  } };
  const launch = yogaLaunchSession()(api, "signed");
  await assert.rejects(launch.account, /temporary unavailable/);
  assert.equal(calls.length, 2, "A rejection alone does not retry");
  const first = launch.retryAccount();
  assert.equal(launch.retryAccount(), first);
  retry.resolve(actor);
  const result = await first;
  assert.equal(result?.referral_link, "https://t.me/Yoga_ganster_bot?start=r_ABCDEFGH");
  assert.equal(result?.balance, -4);
  assert.equal(result?.referral_count, 3);
  assert.deepEqual(calls, ["/mini-app/auth/yoga-session", "/mini-app/yoga-account", "/mini-app/yoga-account"]);
});

test("Denied startup account invalidates its launch; a user read retry cannot restart auth or private requests", async () => {
  for (const status of [401, 403]) {
    const calls: string[] = [];
    const api = { async request<T>(path: string): Promise<T> {
      calls.push(path);
      if (path.endsWith("yoga-session")) return { authenticated: true } as T;
      throw Object.assign(new Error("session denied"), { status });
    } };
    const launch = yogaLaunchSession()(api, "signed");
    await assert.rejects(launch.account, /session denied/);
    assert.equal(launch.invalidated, true);
    await assert.rejects(launch.retryAccount(), /session denied/);
    assert.equal(calls.length, 2);
  }
});

test("Replacing a launch cancels its pending account; a late transport response cannot restore old personal data", async () => {
  const oldAccount = deferred<Dashboard>();
  let oldSignal: AbortSignal | null | undefined;
  const calls: string[] = [];
  let accountReads = 0;
  const api = { async request<T>(path: string, options?: RequestInit): Promise<T> {
    calls.push(path);
    if (path.endsWith("yoga-session")) return { authenticated: true } as T;
    if (++accountReads === 1) { oldSignal = options?.signal; return oldAccount.promise as Promise<T>; }
    return { ...actor, first_name: "New verified actor" } as T;
  } };
  const launches = yogaLaunchSession();
  const old = launches(api, "first-signed");
  await old.verified;
  const next = launches(api, "second-signed");
  assert.notEqual(next.viewInstanceKey, old.viewInstanceKey);
  assert.equal(old.invalidated, true);
  await assert.rejects(old.account, (error: Error) => error.name === "AbortError");
  assert.equal(oldSignal?.aborted, true);
  assert.equal((await next.account)?.first_name, "New verified actor");
  oldAccount.resolve({ ...actor, first_name: "Old actor arrived late" });
  await Promise.resolve();
  await assert.rejects(old.account, (error: Error) => error.name === "AbortError");
  assert.equal((await next.account)?.first_name, "New verified actor");
  assert.equal(calls.filter((path) => path.endsWith("yoga-session")).length, 2);
});

test("Replacing an unverified launch never starts its old account after a late auth acknowledgement", async () => {
  const oldAuth = deferred<unknown>();
  let authCalls = 0;
  let accountCalls = 0;
  const api = { async request<T>(path: string): Promise<T> {
    if (path.endsWith("yoga-session")) return (++authCalls === 1 ? oldAuth.promise : { authenticated: true }) as T;
    accountCalls++;
    return actor as T;
  } };
  const launches = yogaLaunchSession();
  const old = launches(api, "old");
  const next = launches(api, "new");
  oldAuth.resolve({ authenticated: true });
  await assert.rejects(old.account, (error: Error) => error.name === "AbortError");
  await next.account;
  assert.equal(accountCalls, 1);
});

test("Explicit read deadlines distinguish timeout, disposed view and server error, with no implicit retry", async () => {
  let reads = 0;
  let signal: AbortSignal | null = null;
  const never = (next: AbortSignal) => { reads++; signal = next; return new Promise<never>(() => {}); };
  await assert.rejects(yogaReadDeadline(never, undefined, 5), YogaReadTimeoutError);
  assert.equal(signal!.aborted, true);
  assert.equal(reads, 1);
  const controller = new AbortController();
  const cancelled = yogaReadDeadline(never, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, (error: Error) => error.name === "AbortError" && !(error instanceof YogaReadTimeoutError));
  assert.equal(signal!.aborted, true);
  assert.equal(reads, 2);
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(yogaReadDeadline(never, preAborted.signal), (error: Error) => error.name === "AbortError");
  assert.equal(reads, 2);
  const failure = Object.assign(new Error("service failure"), { status: 503 });
  await assert.rejects(yogaReadDeadline(async (next) => { signal = next; throw failure; }), (error) => error === failure);
  assert.equal(signal!.aborted, true, "Cancel sibling work owned by a failed read");
  await assert.rejects(yogaReadDeadline(async () => { throw undefined; }), (error) => error === undefined);
});

test("Pending Yoga account renders placeholders, not invented zero balances/network/orders", () => {
  // The Node test loader uses classic JSX for imported TSX; Vite uses the
  // automatic runtime. Supply React only inside this isolated SSR test process.
  Object.defineProperty(globalThis, "React", { value: React, configurable: true });
  const html = renderToStaticMarkup(createElement(ProfileStats, { dashboard: null, pending: true }));
  assert.deepEqual([...html.matchAll(/<strong>(.*?)<\/strong>/g)].map((match) => match[1]), ["—", "—", "—"]);
  const ready = renderToStaticMarkup(createElement(ProfileStats, { dashboard: actor }));
  assert.deepEqual([...ready.matchAll(/<strong>(.*?)<\/strong>/g)].map((match) => match[1]), ["-4", "3", "0"]);
});

test("Cached pricing expires without losing canonical IDR or mutating accepted values", () => {
  const projection: PricingProjection = {
    projection_id: "fixture", publication_version: 1, catalog_version_id: 1, catalog_version: 1,
    fx_snapshot_id: 7, formula_version: "canonical", accepted_at: "2026-01-01T00:00:00Z",
    derived_expires_at: "2026-01-01T00:01:00Z", max_refresh_lag_seconds: 60, currency: "IDR",
    fx: { version: 7, status: "fresh", ask_idr_per_usdt: "17635", is_manual_override: false },
    items: [{ sku: "fixture", entity_type: "VISA", entity_key: "E33G", option_code: "standard", label: { ru: "Стандарт", en: "Standard" }, price_qualifier: "EXACT", amount_idr: "12000000", show_price: true, fee_verification_status: "VERIFIED", fee_note: { ru: null, en: null }, display_usdt: "680.46", display_usd_approx: "680", sort_order: 0 }],
  };
  const source = JSON.stringify(projection);
  assert.equal(withoutExpiredDerived(projection, Date.parse("2026-01-01T00:00:30Z")), projection);
  const expired = withoutExpiredDerived(projection, Date.parse("2026-01-01T00:01:01Z"));
  assert.equal(expired.items[0].amount_idr, "12000000");
  assert.equal(expired.items[0].display_usdt, null);
  assert.equal(expired.items[0].display_usd_approx, null);
  assert.equal(expired.fx.ask_idr_per_usdt, null);
  assert.equal(JSON.stringify(projection), source);
});

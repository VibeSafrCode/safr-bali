import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateYogaMiniApp, miniAppAssetPath, miniAppDocumentPath, miniAppRequestPath, yogaDashboard, yogaLaunchAuthentication,
} from "../src/runtime/yoga-mini-app";
import { authenticatedLocale, normalizeLocale } from "../src/i18n/locale";
import type { Dashboard } from "../src/api/types";

const actor: Dashboard = { telegram_id: 123456789, locale: "en", balance: 0,
  referral_count: 0, orders: [], referral_link: "https://t.me/safr_bali_bot?start=old", referral_payload: "r_ABCDEFGH" };

test("Yoga requests use the nested same-origin API without widening to web/admin", () => {
  for (const path of ["/mini-app/me", "/mini-app/yoga-account", "/mini-app/auth/yoga-session", "/mini-app/auth/refresh",
    "/mini-app/auth/logout", "/mini-app/locale", "/mini-app/chat/messages", "/mini-app/exchange/quotes",
    "/mini-app/exchange/requests", "/mini-app/visa-cases/1/documents/2", "/mini-app/life-services/1/notifications"]) {
    assert.equal(miniAppRequestPath(path, true), `/yoga-preview/mini-app/api${path}`);
  }
  assert.equal(miniAppRequestPath("/api/catalog/pricing", true), "/yoga-preview/mini-app/api/catalog/pricing");
  assert.equal(miniAppDocumentPath("/mini-app/visa-cases/1/documents/2", true), "/yoga-preview/mini-app/api/mini-app/visa-cases/1/documents/2");
  for (const path of ["/api/web/account", "/api/web/admin/clients", "https://other.invalid/mini-app/me",
    "//other.invalid/mini-app/me", "/mini-app/../admin", "/mini-app/%2e%2e/admin", "/mini-app//me", "/mini-app/auth/session"]) {
    assert.throws(() => miniAppRequestPath(path, true));
  }
  assert.equal(miniAppRequestPath("/api/web/account", false), "/api/web/account");
  assert.equal(miniAppRequestPath("/mini-app/auth/session", false), "/mini-app/auth/session");
});

test("Yoga assets and existing guide stay under their reviewed Yoga mounts", () => {
  assert.equal(miniAppAssetPath("/assets/heroes/bali.jpg", true), "/yoga-preview/mini-app/assets/heroes/bali.jpg");
  assert.equal(miniAppAssetPath("/downloads/guide.pdf", true), "/yoga-preview/downloads/guide.pdf");
  assert.equal(miniAppAssetPath("https://other.invalid/image.jpg", true), "https://other.invalid/image.jpg");
  assert.equal(miniAppAssetPath("/assets/heroes/bali.jpg", false), "/assets/heroes/bali.jpg");
  for (const guide of ["/downloads/all-indonesia-client-guide-safrway-2026.pdf", "https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf"]) {
    assert.equal(miniAppAssetPath(guide, true), "/yoga-preview/downloads/all-indonesia-client-guide-yoga-2026.pdf");
    assert.equal(miniAppAssetPath(guide, false), guide);
  }
  for (const other of ["https://other.invalid/downloads/all-indonesia-client-guide-safrway-2026.pdf", "https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf?x=1", "https://safrway.online/downloads/other.pdf"]) {
    assert.equal(miniAppAssetPath(other, true), other);
  }
});

test("Yoga first exchanges opaque initData, then reads its canonical dashboard", async () => {
  const calls: Array<{ path: string; options?: RequestInit }> = [];
  const api = { async request<T>(path: string, options?: RequestInit): Promise<T> {
    calls.push({ path, options });
    return (path.endsWith("/yoga-account") ? actor : { authenticated: true }) as T;
  } };
  const signal = new AbortController().signal;
  const result = await authenticateYogaMiniApp(api, "query_id=opaque&hash=signed", signal);
  assert.deepEqual(calls.map((row) => row.path), ["/mini-app/auth/yoga-session", "/mini-app/yoga-account"]);
  assert.equal(calls[0].options?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].options?.body)), { init_data: "query_id=opaque&hash=signed" });
  assert.equal(calls[0].options?.signal, signal);
  assert.equal(result?.referral_link, "https://t.me/Yoga_ganster_bot?start=r_ABCDEFGH");
  assert.equal(calls[1].options?.method, "POST");
  assert.equal(calls[1].options?.body, "{}");
  assert.equal(actor.referral_link, "https://t.me/safr_bali_bot?start=old");
});

test("Missing or rejected Yoga initData never reads a cached dashboard or refreshes Main", async () => {
  let calls = 0;
  const api = { async request<T>(): Promise<T> { calls++; throw new Error("rejected"); } };
  assert.equal(await authenticateYogaMiniApp(api, "  "), null);
  assert.equal(calls, 0);
  await assert.rejects(authenticateYogaMiniApp(api, "signed"), /rejected/);
  assert.equal(calls, 1);
});

test("A missing verified canonical actor never produces a referral URL", () => {
  for (const id of [0, -1, NaN, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => yogaDashboard({ ...actor, telegram_id: id }));
  }
});

test("A replayed React effect shares one launch exchange without an effect abort signal", async () => {
  const calls: Array<{ path: string; signal?: AbortSignal | null }> = [];
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const api = { async request<T>(path: string, options?: RequestInit): Promise<T> {
    calls.push({ path, signal: options?.signal });
    if (path.endsWith("yoga-session")) await wait;
    return (path.endsWith("/yoga-account") ? actor : { authenticated: true }) as T;
  } };
  const launch = yogaLaunchAuthentication();
  const first = launch(api, "same-signed-launch");
  const replay = launch(api, "same-signed-launch");
  assert.equal(first, replay);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal, undefined);
  release();
  await first;
  assert.deepEqual(calls.map((row) => row.path), ["/mini-app/auth/yoga-session", "/mini-app/yoga-account"]);
  assert.equal(await launch(api, "same-signed-launch"), await replay);
  assert.equal(calls.length, 2);
});

test("The reused locale utility remains RU/EN only", () => {
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("ru-RU"), "ru");
  assert.equal(normalizeLocale("zh"), "ru");
  assert.equal(authenticatedLocale("en", null), "en");
});

test("Yoga never constructs a numeric fallback or trusts an arbitrary legacy/Main referral URL", () => {
  for (const payload of [undefined, "ref_123456789", "TG123456789", "ABCDEFGH", "r_ABCDEFG0"]) {
    assert.throws(() => yogaDashboard({ ...actor, referral_payload: payload }));
  }
  assert.equal(yogaDashboard({ ...actor, referral_payload: null }).referral_link, null);
  assert.equal(yogaDashboard({ ...actor, referral_link: "https://untrusted.invalid" }).referral_link,
    "https://t.me/Yoga_ganster_bot?start=r_ABCDEFGH");
});

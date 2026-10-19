import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
class ApiError extends Error { constructor(readonly status?: number, readonly details?: unknown) { super("synthetic"); } }
const copy = { ru: { welcome_text: "Инструкция", followup_text: "Вопрос?" }, en: { welcome_text: "Instruction", followup_text: "Question?" } };
const policy = { bot_key: "safrway", revision: 0, enabled: true, published_version: 1,
  draft: { locales: copy }, prepared: { locales: copy }, preview: { ru: { valid: true, parts: ["Инструкция"] }, en: { valid: true, parts: ["Instruction"] } } };
const preview = { campaign_id: 17, revision: 1, snapshot_sha256: "a".repeat(64), recipient_count: 1,
  bot_key: "safrway", kind: "announcement", content: { ru: "Сообщение", en: "Message" }, content_version: null };
function nodes(n: any): any[] { if (!n || typeof n !== "object") return []; if (Array.isArray(n)) return n.flatMap(nodes); return [n, ...nodes(n.props?.children)]; }
function text(n: any): string { if (n == null || typeof n === "boolean") return ""; return Array.isArray(n) ? n.map(text).join("") : typeof n === "object" ? text(n.props?.children) : String(n); }
class Harness {
  slots: any[] = []; cursor = 0; tree: any; pending: Array<() => void> = []; live = true; lateWrites = 0;
  effects = new Map<number, { deps?: any[]; cleanup?: () => void }>();
  calls: Array<{ path: string; options: RequestInit }> = []; timers = new Map<number, () => void>();
  component: any; storage: Map<string, string>;
  handler: (path: string, options: RequestInit) => any = path => path.includes("/policy/") ? policy : path.endsWith("/preview") ? preview
    : path.endsWith("/recipients") ? { items: [{ user_id: 4, name: "Synthetic client", locale: "ru", state: "PREVIEW", deliveries: {} }] }
    : path.endsWith("/confirm") ? { id: 17, state: "QUEUED" } : path.endsWith("/audience-options") ? { service_categories: ["visa", "insurance"] } : path.endsWith("/campaigns") ? { items: [] } : {};
  constructor(readonly locale = "ru", storage = new Map<string, string>()) {
    this.storage = storage;
    const slot = (v: any) => { const i = this.cursor++; if (!(i in this.slots)) this.slots[i] = typeof v === "function" ? v() : v; return i; };
    const hooks = { ...React, useState: (v: any) => { const i = slot(v); return [this.slots[i], (v: any) => { if (!this.live) { this.lateWrites++; return; } this.slots[i] = typeof v === "function" ? v(this.slots[i]) : v; }]; },
      useRef: (v: any) => this.slots[slot(() => ({ current: v }))],
      useEffect: (fn: () => any, deps?: any[]) => { const i = this.cursor++, old = this.effects.get(i); if (!old || !deps || deps.some((v, k) => !Object.is(v, old.deps?.[k]))) { this.effects.set(i, { deps }); this.pending.push(() => { old?.cleanup?.(); this.effects.set(i, { deps, cleanup: fn() }); }); } } };
    const source = fs.readFileSync(new URL("../src/components/AdminMessaging.tsx", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const exports: any = {};
    const imports = (name: string) => name === "./admin-messaging.css" ? {} : name === "react" ? hooks : name === "react/jsx-runtime" ? require(name) : name === "../api/client" ? {
      ApiError, apiErrorMessage: () => "synthetic error", appApiClient: () => ({ request: (path: string, options: RequestInit = {}) => { this.calls.push({ path, options }); return Promise.resolve().then(() => this.handler(path, options)); } }) } : (() => { throw Error(name); })();
    const window = { setTimeout: (fn: () => void) => { const i = this.timers.size + 1; this.timers.set(i, fn); return i; }, clearTimeout: (i: number) => this.timers.delete(i) };
    const sessionStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) };
    new Function("require", "exports", "window", "crypto", "sessionStorage", "AbortController", compiled)(imports, exports, window, { randomUUID: () => "synthetic-confirmation-0001" }, sessionStorage, AbortController);
    this.component = exports.AdminMessaging; this.render();
  }
  render() { this.cursor = 0; this.tree = this.component({ csrfToken: "synthetic-csrf", locale: this.locale }); for (const fn of this.pending.splice(0)) fn(); }
  all() { return nodes(this.tree); }
  button(label: string) { const n = this.all().find(n => n.type === "button" && text(n) === label); assert.ok(n, label); return n; }
  async settle() { for (let i = 0; i < 18; i++) { await Promise.resolve(); this.render(); } }
  async prepare() {
    await this.settle();
    const title = this.all().find(n => n.type === "input" && n.props.maxLength === 200);
    title.props.onChange({ target: { value: "Synthetic reviewed campaign" } }); this.render();
    for (const [i, value] of [[0, "Сообщение"], [1, "Message"]] as const) { this.all().filter(n => n.type === "textarea").slice(-2)[i].props.onChange({ target: { value } }); this.render(); }
    this.handler = (path, options) => path.endsWith("/campaigns") && options.method === "POST" ? { id: 17, revision: 0 } : path.endsWith("/preview") ? preview
      : path.endsWith("/recipients") ? { items: [{ user_id: 4, name: "Synthetic client", locale: "ru", state: "PREVIEW", deliveries: {} }] }
      : path.endsWith("/confirm") ? { id: 17, state: "QUEUED" } : path.includes("/policy/") ? policy : { items: [] };
    this.button(this.locale === "ru" ? "Подготовить текст и список — без отправки" : "Prepare copy and audience — no sending").props.onClick(); await this.settle();
  }
  approve() { this.all().find(n => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } }); this.render(); }
  unmount() { this.live = false; for (const e of this.effects.values()) e.cleanup?.(); }
}

test("RU/EN preparation never sends; confirmation requires reviewed copy/audience and is single-flight", async () => {
  for (const locale of ["ru", "en"]) {
    const h = new Harness(locale); await h.prepare();
    const label = locale === "ru" ? "Подтвердить и поставить в очередь" : "Confirm and queue";
    assert.equal(h.button(label).props.disabled, true);
    assert.equal(h.calls.some(c => c.path.endsWith("/confirm")), false);
    h.approve(); const click = h.button(label).props.onClick; click(); click(); await h.settle();
    const sends = h.calls.filter(c => c.path.endsWith("/confirm")); assert.equal(sends.length, 1);
    assert.deepEqual(JSON.parse(String(sends[0].options.body)), { expected_revision: 1, snapshot_sha256: "a".repeat(64), idempotency_key: "synthetic-confirmation-0001" });
    assert.equal((sends[0].options.headers as Record<string, string>)["X-CSRF-Token"], "synthetic-csrf");
    assert.equal(h.storage.size, 0);
  }
});

test("lost ACK survives navigation, and auth denial cannot clear uncertain confirmation", async () => {
  const h = new Harness(); await h.prepare(); h.approve();
  h.handler = () => { throw new ApiError(); };
  h.button("Подтвердить и поставить в очередь").props.onClick(); await h.settle();
  const first = h.calls.find(c => c.path.endsWith("/confirm"))!;
  assert.equal(h.storage.size, 1); h.unmount();
  const reopened = new Harness("ru", h.storage); await reopened.settle();
  reopened.handler = () => { throw new ApiError(401); };
  reopened.button("Проверить / повторить тот же запрос").props.onClick(); await reopened.settle();
  assert.equal(h.storage.size, 1);
  const retry = reopened.calls.find(c => c.path.endsWith("/confirm"))!;
  assert.equal(retry.options.body, first.options.body);
  reopened.handler = path => path.endsWith("/confirm") ? { id: 17, state: "QUEUED", idempotent_replay: true } : path.includes("/policy/") ? policy : { items: [] };
  reopened.button("Проверить / повторить тот же запрос").props.onClick(); await reopened.settle();
  assert.equal(h.storage.size, 0);
});

test("only a bound explicit API non-confirmation proof permits a fresh preview", async () => {
  const h = new Harness(); await h.prepare(); h.approve();
  h.handler = () => { throw new ApiError(409, { detail: { safe_to_repreview: true, campaign_id: 17, request_key: "synthetic-confirmation-0001" } }); };
  h.button("Подтвердить и поставить в очередь").props.onClick(); await h.settle();
  assert.equal(h.storage.size, 0);
  assert.equal(h.all().some(n => n.type === "button" && text(n) === "Подтвердить и поставить в очередь"), false);
});

test("results of campaign B never replace the reviewed recipient list of A", async () => {
  const h = new Harness(); await h.prepare(); h.approve();
  h.handler = path => path.endsWith("/campaigns") ? { items: [{ id: 99, title: "Other campaign", bot_key: "yoga", state: "QUEUED", counts: {}, revision: 2 }] }
    : path.endsWith("/99/recipients") ? { items: [{ user_id: 999, name: "Other synthetic person", locale: "en", state: "DELIVERED", deliveries: {} }] } : {};
  h.button("Обновить результаты").props.onClick(); await h.settle();
  h.button("Результаты по получателям").props.onClick(); await h.settle();
  const confirmation = h.all().find(n => n.type === "section" && n.props["aria-label"] === "Подтверждение рассылки");
  assert.match(text(confirmation), /Synthetic client/);
  assert.doesNotMatch(text(confirmation), /Other synthetic person/);
  const results = h.all().find(n => n.type === "section" && n.props["aria-label"] === "Результаты отдельной кампании");
  assert.match(text(results), /Other synthetic person/);
  assert.equal(h.button("Подтвердить и поставить в очередь").props.disabled, false);
});

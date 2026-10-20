import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";

// Execute the actual component with deterministic hooks/API/clock facades.
// This proves handlers and state transitions, not ReactDOM or visual acceptance.
const require = createRequire(import.meta.url);
class ApiError extends Error { constructor(readonly status?: number) { super("synthetic"); } }
const child = { id: 4, name: "Synthetic child", status: "active" };
const previous = { id: 2, name: "Synthetic previous", status: "active" };
const parent = { id: 3, name: "Synthetic parent", status: "active" };
function preview(extra = {}) { return { child_user_id: 4, previous_parent_user_id: 2,
  new_parent_user_id: 3, referral_row_id: 8, last_correction_id: 0,
  child, previous_parent: previous, new_parent: parent, reward_ledger_rows: 0,
  existing_order_count: 0, existing_points_count: 0, executable: true, conflicts: [], ...extra }; }
function nodes(node: any): any[] { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
function text(node: any): string { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(text).join(""); return typeof node === "object" ? text(node.props?.children) : String(node); }
function deferred() { let resolve!: (value: any) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

class Harness {
  slots: any[] = []; cursor = 0; tree: any; live = true; lateWrites = 0;
  effects = new Map<number, { deps?: any[]; cleanup?: () => void }>(); pending: Array<() => void> = [];
  timers = new Map<number, () => void>(); timerId = 0; calls: Array<{ path: string; options: RequestInit }> = [];
  changed = 0; component: any;
  props: any;
  handler: (path: string, options: RequestInit) => any = (_path, options) => options.method === "POST" ? { correction_id: 1 } : preview();
  constructor(readonly locale: "ru" | "en" = "ru", options: { name?: string; props?: any } = {}) {
    this.props = options.props ?? {};
    const state = (initial: any) => { const index = this.cursor++; if (!(index in this.slots)) this.slots[index] = typeof initial === "function" ? initial() : initial; return index; };
    const hooks = { ...React,
      useState: (initial: any) => { const i = state(initial); return [this.slots[i], (value: any) => { if (!this.live) { this.lateWrites++; return; } this.slots[i] = typeof value === "function" ? value(this.slots[i]) : value; }]; },
      useRef: (initial: any) => this.slots[state(() => ({ current: initial }))],
      useEffect: (effect: () => any, deps?: any[]) => { const i = this.cursor++; const old = this.effects.get(i); if (!old || !deps || deps.some((v, n) => !Object.is(v, old.deps?.[n]))) { this.effects.set(i, { deps, cleanup: old?.cleanup }); this.pending.push(() => { old?.cleanup?.(); const cleanup = effect(); this.effects.set(i, { deps, cleanup }); }); } },
    };
    const source = fs.readFileSync(new URL("../src/components/AdminReferralCorrection.tsx", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const exports: any = {};
    const moduleRequire = (name: string) => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "./AdminDialog") return { AdminDialog: (props: any) => React.createElement("div", props, props.children) };
      if (name === "../api/client") return { ApiError, apiErrorMessage: () => "synthetic API error", appApiClient: () => ({ request: (path: string, options: RequestInit = {}) => { this.calls.push({ path, options }); return Promise.resolve().then(() => this.handler(path, options)); } }) };
      throw Error("Unexpected import: " + name);
    };
    const window = { setTimeout: (fn: () => void) => { const id = ++this.timerId; this.timers.set(id, fn); return id; }, clearTimeout: (id: number) => this.timers.delete(id) };
    new Function("require", "exports", "window", "crypto", "AbortController", compiled)(moduleRequire, exports, window, { randomUUID: () => "synthetic-operation-0001" }, AbortController);
    this.component = exports[options.name ?? "ReferralCorrectionDialog"];
    this.render();
  }
  render() { this.cursor = 0; this.tree = this.component({ locale: this.locale, csrfToken: "synthetic-csrf", initialChild: child, onClose: () => {}, onChanged: () => { this.changed++; }, ...this.props }); for (const effect of this.pending.splice(0)) effect(); }
  all() { return nodes(this.tree); }
  button(label: string) { const found = this.all().find(n => n.type === "button" && text(n) === label); assert.ok(found, `Missing button ${label}`); return found; }
  chooseParent() { const picker = this.all().find(n => n.props?.label === (this.locale === "ru" ? "Новый пригласивший" : "New inviter")); picker.props.onChange(parent); this.render(); }
  async settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); this.render(); } }
  async check() { this.chooseParent(); this.button(this.locale === "ru" ? "Проверить перенос" : "Preview change").props.onClick(); await this.settle(); }
  confirm() { this.all().find(n => n.type === "textarea").props.onChange({ target: { value: "Synthetic verified correction" } }); this.render(); this.all().find(n => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } }); this.render(); }
  unmount() { this.live = false; for (const effect of this.effects.values()) effect.cleanup?.(); }
}

test("RU/EN actual correction opener uses the scoped minimum44 button treatment without changing authority", () => {
  for (const locale of ["ru", "en"] as const) {
    const h = new Harness(locale, { name: "AdminReferralCorrection" });
    const button = h.button(locale === "ru" ? "Сменить пригласившего" : "Change inviter");
    assert.equal(button.props.type, "button");
    assert.equal(button.props.className, "button secondary admin-referral-opener");
    assert.equal(h.calls.length, 0, "Opening control does not perform a correction");
    button.props.onClick(); h.render();
    assert.ok(h.all().some(node => node.type?.name === "ReferralCorrectionDialog"));
    assert.equal(h.calls.length, 0);
  }
  const css = fs.readFileSync(new URL("../src/admin-design.css", import.meta.url), "utf8");
  assert.match(css, /\.admin-shell \.button\.admin-referral-opener\s*\{min-height:44px;min-width:44px;max-width:100%;white-space:normal;\}/);
});

test("RU/EN form requires preview, reason and confirmation; POST includes canonical CAS and CSRF", async () => {
  for (const locale of ["ru", "en"] as const) {
    const h = new Harness(locale);
    assert.equal(h.button(locale === "ru" ? "Проверить перенос" : "Preview change").props.disabled, true);
    await h.check();
    assert.match(text(h.tree), /Synthetic previous/);
    assert.match(text(h.tree), /Synthetic parent/);
    assert.equal(h.button(locale === "ru" ? "Подтвердить перенос" : "Confirm change").props.disabled, true);
    h.confirm();
    const click = h.button(locale === "ru" ? "Подтвердить перенос" : "Confirm change").props.onClick;
    click(); click(); await h.settle();
    const writes = h.calls.filter(call => call.options.method === "POST");
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(String(writes[0].options.body)), { child_user_id: 4, new_parent_user_id: 3,
      expected_parent_user_id: 2, expected_last_correction_id: 0, expected_referral_row_id: 8,
      reason: "Synthetic verified correction", idempotency_key: "synthetic-operation-0001" });
    assert.equal((writes[0].options.headers as Record<string, string>)["X-CSRF-Token"], "synthetic-csrf");
    assert.equal(h.changed, 1);
  }
});

test("blocked null identities render a refusal without a confirm button", async () => {
  const h = new Harness(); h.handler = () => preview({ child: null, previous_parent: null,
    previous_parent_user_id: null, referral_row_id: null, executable: false, conflicts: ["child_missing"] });
  await h.check();
  assert.ok(h.all().some(n => n.props?.role === "alert"));
  assert.equal(h.all().some(n => n.type === "textarea"), false);
  assert.equal(h.calls.filter(c => c.options.method === "POST").length, 0);
});

test("lost ACK retries exact bytes/key and then reads the actual current parent", async () => {
  const h = new Harness(); await h.check(); h.confirm();
  let attempts = 0;
  h.handler = (_path, options) => { if (options.method === "POST" && ++attempts === 1) throw new ApiError(); return options.method === "POST" ? { idempotent_replay: true } : preview({ previous_parent: { id: 9, name: "Later inviter" }, previous_parent_user_id: 9 }); };
  h.button("Подтвердить перенос").props.onClick(); await h.settle();
  assert.match(text(h.tree), /Результат пока неизвестен/);
  assert.equal(h.all().filter(n => n.props?.label).every(n => n.props.disabled), true);
  h.button("Повторить тот же запрос").props.onClick(); await h.settle();
  const writes = h.calls.filter(c => c.options.method === "POST");
  assert.equal(writes.length, 2); assert.equal(writes[0].options.body, writes[1].options.body);
  assert.match(text(h.tree), /Later inviter/); assert.equal(h.changed, 1);
});

test("stalled POST is bounded and remains retryable without claiming no write", async () => {
  const h = new Harness(); await h.check(); h.confirm();
  h.handler = (_path, options) => new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new ApiError())));
  h.button("Подтвердить перенос").props.onClick(); await h.settle();
  assert.equal(h.tree.props.closeDisabled, true);
  for (const timer of [...h.timers.values()]) timer();
  await h.settle();
  assert.equal(h.tree.props.closeDisabled, false);
  assert.equal(h.button("Повторить тот же запрос").props.disabled, false);
  assert.match(text(h.tree), /Результат пока неизвестен/);
});

test("late preview is discarded after the dialog unmounts", async () => {
  const h = new Harness(); const late = deferred(); h.handler = () => late.promise;
  h.chooseParent(); h.button("Проверить перенос").props.onClick(); await h.settle();
  h.unmount(); late.resolve(preview()); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.lateWrites, 0);
});

test("closing and reopening an unresolved dialog retains the same body/key in its owner", async () => {
  const owner = new Harness("ru", { name: "AdminReferralCorrection" });
  owner.button("Сменить пригласившего").props.onClick(); owner.render();
  const firstProps = owner.all().find(n => n.type?.name === "ReferralCorrectionDialog").props;
  const first = new Harness("ru", { props: firstProps }); await first.check(); first.confirm();
  first.handler = () => { throw new ApiError(); };
  first.button("Подтвердить перенос").props.onClick(); await first.settle();
  const firstBody = first.calls.find(c => c.options.method === "POST")!.options.body;
  first.button("Закрыть").props.onClick(); first.unmount(); owner.render();
  owner.button("Проверить результат переноса").props.onClick(); owner.render();
  const secondProps = owner.all().find(n => n.type?.name === "ReferralCorrectionDialog").props;
  const second = new Harness("ru", { props: secondProps });
  assert.match(text(second.tree), /неподтверждённым результатом/);
  second.button("Повторить тот же запрос").props.onClick(); await second.settle(); owner.render();
  assert.equal(second.calls.find(c => c.options.method === "POST")!.options.body, firstBody);
  assert.ok(owner.button("Сменить пригласившего"));
});

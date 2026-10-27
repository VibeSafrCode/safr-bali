/** Actual current AdminVisaCRM callbacks with synthetic hooks/transport/DOM.
 * Not a browser, HTTP authorization, production or assistive-technology proof.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";
import * as editor from "../src/components/visaEditorState";
import * as saveSession from "../src/components/adminVisaSaveSession";
import * as staySelection from "../src/components/adminVisaStaySelection";
import * as staffStay from "../src/components/adminVisaStayActionDraft";
import * as presence from "../src/components/client-service-filter";

const app = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(app, "package.json"));
const nodes = (v: any): any[] => !v || typeof v !== "object" ? [] : Array.isArray(v) ? v.flatMap(nodes) : [v, ...nodes(v.props?.children)];
const text = (v: any): string => v == null || typeof v === "boolean" ? "" : Array.isArray(v) ? v.map(text).join("") : typeof v === "object" ? text(v.props?.children) : String(v);
const deferred = () => { let resolve!: (value: any) => void, reject!: (value: any) => void; const promise = new Promise<any>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const record = (id = 31) => ({ id, visa_type: { id: 1, version: 1, code: "E33G", name: "Synthetic visa" }, country_code: "ID", service_status: "PURCHASED", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED", notifications_enabled: true, issued_on: "2026-10-01", entered_on: "2026-10-02", entry_deadline: "2026-11-01", stay_end: "2027-10-01", date_source: "IMMIGRATION", version: 1, processes: [{ id: 41, type: "APPLICATION", external_status: "PROCESSING" }], documents: [], assignments: [], deliveries: [] });
const detail = (id: number) => ({ client: { id, first_name: "Synthetic " + id, telegram_id_mask: "***", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }, visa_cases: [record(id === 21 ? 31 : 32)], notes: [], credentials: [], dialogue: { id: null, status: "OPEN", messages: [] } });
const delivery = (label: string) => ({ delivery_id: 91, audience: "client", audience_label: "Synthetic client", type: "CASE_UPDATED", type_label: label, state: "PENDING", state_label: "Synthetic queued", attempts: 0, created_at: "2026-10-23T12:00:00Z", updated_at: "2026-10-23T12:00:00Z", retry_allowed: false });

function fixture(locale: "ru" | "en" = "ru", options: { managers?: boolean; storage?: boolean; casePatch?: Record<string, unknown> } = {}) {
  const effects: Array<() => void> = [], slots: any[] = [];
  let cursor = 0, dirty = true, mounted = true, tree: any, serial = 0;
  let props = { csrfToken: "synthetic-csrf", actorId: 11, initialClientId: 21, locale, actorRole: "admin" };
  const calls: Array<{ path: string; options: RequestInit }> = [], writes: ReturnType<typeof deferred>[] = [];
  const detailWaits = new Map<number, ReturnType<typeof deferred>>();
  const historyWaits = new Map<number, Array<ReturnType<typeof deferred>>>();
  const caseWaits = new Map<number, ReturnType<typeof deferred>>();
  const mutations: ReturnType<typeof deferred>[] = [], uploads: ReturnType<typeof deferred>[] = [];
  const listeners = new Map<string, Set<(event: any) => void>>();
  const docListeners = new Map<string, Set<(event: any) => void>>();
  const dom = new Map<string, any>(); let elementMap = new WeakMap<object, any>();
  const document: any = { body: { style: {} }, activeElement: null,
    getElementById: () => null,
    addEventListener: (kind: string, fn: any) => { if (!docListeners.has(kind)) docListeners.set(kind, new Set()); docListeners.get(kind)!.add(fn); },
    removeEventListener: (kind: string, fn: any) => docListeners.get(kind)?.delete(fn) };
  document.activeElement = document.body;
  const window: any = { location: { origin: "https://synthetic.example", pathname: "/admin/clients/21/", search: "" }, scrollY: 0,
    history: { state: {}, replaceState(state: any) { this.state = state; }, pushState(state: any) { this.state = state; }, back() {} },
    addEventListener: (kind: string, fn: any) => { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind)!.add(fn); },
    removeEventListener: (kind: string, fn: any) => listeners.get(kind)?.delete(fn),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, scrollTo() {} };
  const react: any = { ...React,
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (value: any) => { if (!mounted) return; const next = typeof value === "function" ? value(slots[i].value) : value; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; } }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useId() { const i = cursor++; return "synthetic-id-" + i; },
  };
  const effect = (fn: any, deps: any[]) => {
    const i = cursor++, previous = slots[i];
    if (!previous || !deps || deps.some((value: any, at: number) => !Object.is(value, previous.deps?.[at]))) {
      const slot = { deps, cleanup: previous?.cleanup }; slots[i] = slot;
      effects.push(() => { slot.cleanup?.(); slot.cleanup = fn(); });
    }
  };
  react.useEffect = effect; react.useLayoutEffect = effect;
  async function request(url: string, options: RequestInit = {}) {
    calls.push({ path: url, options });
    if (options.method === "PATCH") { const wait = deferred(); writes.push(wait); return wait.promise; }
    if (options.method === "POST") { const wait = deferred(); mutations.push(wait); return wait.promise; }
    const client = url.match(/^\/api\/web\/admin\/clients\/(\d+)$/);
    if (client) {
      const result = detail(Number(client[1]));
      return detailWaits.get(Number(client[1]))?.promise ?? { ...result, visa_cases: result.visa_cases.map(item => ({ ...item, ...fixtureOptions.casePatch })) };
    }
    if (url.startsWith("/api/web/admin/clients?")) return { items: [detail(21).client, detail(22).client], total: 2 };
    const history = url.match(/\/visa-cases\/(\d+)\/notification-history$/);
    if (history) return historyWaits.get(Number(history[1]))?.shift()?.promise ?? { items: [] };
    const caseRead = url.match(/^\/api\/web\/admin\/visa-cases\/(\d+)$/);
    if (caseRead) return caseWaits.get(Number(caseRead[1]))?.promise ?? record(Number(caseRead[1]));
    if (url.endsWith("/types")) return { items: [{ id: 1, code: "E33G", name: "Synthetic visa", version: 1, rules_verified: false }] };
    if (url.endsWith("/readiness")) return { ready: fixtureOptions.storage === true };
    if (url.endsWith("/staff/visa-managers")) return { enabled: fixtureOptions.managers === true, items: fixtureOptions.managers ? [{ user_id: 77, name: "Synthetic manager", role_code: "visa_manager" }] : [] };
    if (url.endsWith("/staff")) return { items: [] };
    throw Error("UNEXPECTED_SYNTHETIC_REQUEST " + url);
  }
  const fixtureOptions = options;
  const fakeFetch = async (_url: URL, _options: RequestInit) => { const wait = deferred(); uploads.push(wait); return wait.promise; };
  function AdminVisaTile() { return null; }
  function AdminVisaStayPeriod() { return null; }
  function AdminVisaStayAction() { return null; }
  const empty = () => null;
  const scoped = (id: string): any => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return require(id);
    if (id.endsWith(".css")) return {};
    if (id === "../api/client") return { appApiClient: () => ({ origin: window.location.origin, request }), apiErrorMessage: () => "Synthetic error" };
    if (id === "./AdminServiceCountdown") return { useBaliToday: () => "2026-10-23" };
    if (id === "./AdminVisaTile") return { AdminVisaTile };
    if (id === "./AdminVisaDatePreview") return { AdminVisaDatePreview: empty };
    if (id === "./AdminVisaStayPeriod") return { AdminVisaStayPeriod };
    if (id === "./AdminVisaStayAction") return { AdminVisaStayAction };
    if (id === "./adminVisaStayActionDraft") return staffStay;
    if (id === "./adminVisaStaySelection") return staySelection;
    if (id === "./VisaStatusHelp") return { VisaStatusHelp: empty };
    if (id === "./AdminLifeServices") return { AdminLifeServices: empty };
    if (id === "./AdminReferralCorrection") return { AdminReferralCorrection: empty };
    if (id === "./client-service-filter") return presence;
    if (id === "./visaEditorState") return editor;
    if (id === "./adminVisaSaveSession") return saveSession;
    throw Error("UNEXPECTED_ADMIN_IMPORT " + id);
  };
  const file = path.join(app, "src/components/AdminVisaCRM.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: any = {};
  vm.runInThisContext("(function(require,module,exports,window,document,crypto,fetch){" + compiled + "\n})", { filename: file })(scoped, { exports }, exports, window, document, { randomUUID: () => "synthetic-runtime-key-" + ++serial }, fakeFetch);
  function commit(v: any, key = "0", inDialog = false) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((child, i) => commit(child, key + "." + i, inDialog)); return; }
    inDialog ||= typeof v.type === "function" && v.type.name === "Dialog";
    if (typeof v.type === "string") {
      let el = dom.get(key);
      if (!el) { el = { ownerDocument: document, focus() { document.activeElement = el; for (const fn of docListeners.get("focusin") ?? []) fn({ target: el, type: "focusin" }); }, closest: (selector: string) => selector === '[role="dialog"]' && inDialog ? el : null, matches: (selector: string) => selector === ":disabled" && el.disabled }; dom.set(key, el); }
      el.isConnected = true; el.disabled = !!v.props.disabled;
      if (el.disabled && document.activeElement === el) document.activeElement = document.body;
      elementMap.set(v, el);
      if (v.props.ref && typeof v.props.ref === "object") v.props.ref.current = el;
    }
    commit(v.props?.children, key + ".c", inDialog);
  }
  function flush() {
    let budget = 30;
    while (dirty) {
      assert.ok(--budget > 0, "synthetic render must settle"); dirty = false; cursor = 0;
      for (const el of dom.values()) el.isConnected = false;
      tree = exports.AdminVisaCRM(props); elementMap = new WeakMap(); commit(tree);
      if (document.activeElement !== document.body && !document.activeElement.isConnected) document.activeElement = document.body;
      for (const fn of effects.splice(0)) fn();
    }
  }
  async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); flush(); } }
  const find = (predicate: (v: any) => boolean) => { const result = nodes(tree).find(predicate); assert.ok(result, "expected synthetic node; current text=" + text(tree).slice(0, 1800)); return result; };
  const button = (label: string) => find(v => v.type === "button" && text(v) === label);
  function click(v: any) { const el = elementMap.get(v); if (el) document.activeElement = el; v.props.onClick?.({ currentTarget: el, preventDefault() {} }); flush(); }
  return { flush, settle, calls, writes, mutations, uploads, document, docListeners,
    openCase(id = 31) { find(v => v.type === AdminVisaTile && v.props.item.id === id).props.onOpen(); flush(); },
    save() { const v = find(v => v.type === "button" && v.props.className?.includes("crm-save-near-dates")); click(v); },
    input(label: string, value: string) { const parent = find(v => v.type === "label" && text(v).startsWith(label)); const input = nodes(parent).find(v => ["input", "textarea", "select"].includes(v.type)); assert.ok(input); input.props.onChange({ target: { value } }); flush(); },
    checkbox(label: string) { const parent = find(v => v.type === "label" && text(v).startsWith(label)); const input = nodes(parent).find(v => v.type === "input" && v.props.type === "checkbox"); assert.ok(input); input.props.onChange({ target: { checked: true } }); flush(); },
    submit(name: string) { find(v => v.type === "form" && v.props.onSubmit?.name === name).props.onSubmit({ preventDefault() {} }); flush(); },
    file() { find(v => v.type === "input" && v.props.type === "file").props.onChange({ target: { files: [{ name: "synthetic.pdf", type: "application/pdf" }] } }); flush(); },
    clickButton(label: string) { click(button(label)); },
    visible: () => text(tree),
    period() { return find(v => v.type === AdminVisaStayPeriod).props; },
    staffAction() { return find(v => v.type === AdminVisaStayAction).props; },
    changeStaffAction(draft: staffStay.StaffStayDraft) { find(v => v.type === AdminVisaStayAction).props.onChange(draft); flush(); },
    changePeriod(draft: staySelection.AdminStaySelectionDraft) { find(v => v.type === AdminVisaStayPeriod).props.onChange(draft); flush(); },
    lifecycle(value: string) { find(v => typeof v.type === "function" && v.type.name === "StatusPicker" && v.props.kind === "lifecycle").props.onChange(value); flush(); },
    hasEditor: () => nodes(tree).some(v => v.props?.className === "crm-visa-editor"),
    requestBody(at: number) { const r = calls.filter(c => c.options.method === "PATCH")[at]; return JSON.parse(String(r.options.body)); },
    navigate(id: number) { window.location.pathname = "/admin/clients/" + id + "/"; for (const fn of listeners.get("popstate") ?? []) fn({ state: {} }); flush(); },
    deferDetail(id: number) { const wait = deferred(); detailWaits.set(id, wait); return wait; },
    deferHistory(id: number) { const wait = deferred(); const queue = historyWaits.get(id) ?? []; queue.push(wait); historyWaits.set(id, queue); return wait; },
    deferCase(id: number) { const wait = deferred(); caseWaits.set(id, wait); return wait; },
    changeActor(actorId: number) { props = { ...props, actorId }; dirty = true; flush(); },
    moveFocus() { const other = { isConnected: true }; for (const fn of docListeners.get("pointerdown") ?? []) fn({ target: other, type: "pointerdown" }); document.activeElement = other; return other; },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); },
  };
}

for (const locale of ["ru", "en"] as const) test("actual Admin save keeps editor/date outcome and rebases process ids: " + locale, async () => {
  const f = fixture(locale); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.input(locale === "ru" ? "Разрешено находиться до" : "Permitted stay until", "2027-11-01");
  f.clickButton(locale === "ru" ? "+ Добавить процесс вручную" : "+ Add process manually");
  const detailCalls = f.calls.filter(c => c.path === "/api/web/admin/clients/21").length;
  f.save(); assert.equal(f.writes.length, 1);
  f.writes[0].resolve({ ...record(), version: 2, stay_end: "2027-11-01", processes: [...record().processes, { id: 88, type: "APPLICATION", external_status: "UNKNOWN" }] }); await f.settle();
  assert.ok(f.hasEditor()); assert.match(f.visible(), locale === "ru" ? /Сохранено без уведомления/ : /Saved without notifying/);
  assert.equal(f.calls.filter(c => c.path === "/api/web/admin/clients/21").length, detailCalls);
  f.save(); assert.deepEqual(f.requestBody(1).processes, []); assert.equal(f.requestBody(1).expected_version, 2);
  f.writes[1].resolve({ ...record(), version: 3, stay_end: "2027-11-01", processes: [{ id: 41, type: "APPLICATION", external_status: "PROCESSING" }, { id: 88, type: "APPLICATION", external_status: "UNKNOWN" }] }); await f.settle(); f.unmount();
});

test("uncertain failed save keeps draft and same key/body on actual retry", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle(); f.input("Разрешено находиться до", "2027-11-01"); f.save();
  const first = f.requestBody(0); f.writes[0].reject(Error("synthetic lost reply")); await f.settle();
  assert.ok(f.hasEditor()); assert.match(f.visible(), /Сохранение не подтверждено/);
  f.save(); assert.deepEqual(f.requestBody(1), first); f.writes[1].resolve({ ...record(), version: 2, stay_end: "2027-11-01" }); await f.settle(); f.unmount();
});

const savedEstimates = () => ({
  initial: { purpose: "INITIAL", state: "READY", estimated: true, provenance: "administrator_provisional", confirmation_required: true,
    base: "2026-10-02", estimated_end: "2027-10-02", rule: { rule_id: "provisional:" + "a".repeat(64), version: 1, variant_id: "manual-initial-day-365", unit: "day", duration: 365, counting_policy: "base_excluded", month_end_policy: "clamp" } },
  extension: { purpose: "EXTENSION", state: "NOT_SELECTED", estimated: true, base: null, estimated_end: null },
});

test("actual aggregate Save sends explicit E33G selection, then rebases to KEEP without changing document expiry", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.changePeriod({ ...staySelection.e33g365Selection(f.period().item, "INITIAL")!, acknowledged: true });
  f.save(); const first = f.requestBody(0);
  assert.equal(first.stay_estimate_selection.duration, 365); assert.equal(first.stay_estimate_selection.visa_type_id, 1);
  assert.equal(first.stay_estimate_selection.visa_type_version, 1); assert.equal(first.stay_end, undefined);
  f.writes[0].resolve({ ...record(), version: 2, stay_estimates: savedEstimates() }); await f.settle();
  assert.equal(f.period().draft.action, "KEEP"); assert.equal(f.period().draft.binding.version, 2);
  assert.equal(f.period().item.stay_end, "2027-10-01"); assert.equal(f.period().item.stay_estimates.initial.estimated_end, "2027-10-02");
  f.save(); assert.equal(f.requestBody(1).stay_estimate_selection, undefined); assert.equal(f.requestBody(1).expected_version, 2);
  f.writes[1].resolve({ ...record(), version: 3, stay_estimates: savedEstimates() }); await f.settle(); f.unmount();
});

test("period acknowledgement is mandatory and uncertainty keeps exact key/body, including missing projection", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle();
  const draft = staySelection.e33g365Selection(f.period().item, "INITIAL")!;
  f.changePeriod(draft); f.save(); assert.equal(f.writes.length, 0); assert.match(f.visible(), /Расчёт не сохранён/);
  f.changePeriod({ ...draft, acknowledged: true }); f.save(); const first = f.requestBody(0);
  f.writes[0].resolve({ ...record(), version: 2 }); await f.settle(); assert.match(f.visible(), /Сохранение не подтверждено/);
  assert.equal(f.period().draft.action, "SELECT"); f.save(); assert.deepEqual(f.requestBody(1), first);
  f.writes[1].resolve({ ...record(), version: 2, stay_estimates: savedEstimates() }); await f.settle(); f.unmount();
});

test("CLEAR is an exact two-field command and a retired period handler cannot change another case", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle();
  const old = f.period(); f.changePeriod({ ...old.draft, action: "CLEAR" }); f.save();
  assert.deepEqual(f.requestBody(0).stay_estimate_selection, { action: "CLEAR", purpose: "INITIAL" });
  f.navigate(22); await f.settle(); f.openCase(32); await f.settle();
  old.onChange({ ...old.draft, action: "CLEAR" }); f.flush(); assert.equal(f.period().draft.action, "KEEP");
  assert.equal(f.period().draft.binding.caseId, 32); f.unmount(); f.writes[0].resolve({ ...record(), version: 2, stay_estimates: savedEstimates() });
});

test("period validation and panel receive the lifecycle draft actually sent to the server", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.changePeriod({ ...staySelection.e33g365Selection(f.period().item, "INITIAL")!, acknowledged: true });
  f.lifecycle("EXPIRED"); assert.equal(f.period().item.lifecycle_status, "EXPIRED");
  f.save(); assert.equal(f.writes.length, 0); assert.match(f.visible(), /Расчёт не сохранён/); f.unmount();
});

test("late save response cannot reopen old editor under another client", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle(); f.save();
  f.navigate(22); await f.settle(); assert.equal(f.hasEditor(), false); f.openCase(32); await f.settle();
  f.writes[0].resolve({ ...record(), version: 2, stay_end: "2099-12-31" }); await f.settle();
  assert.ok(f.hasEditor()); assert.doesNotMatch(f.visible(), /Сохранено/); f.save();
  assert.equal(f.calls.filter(c => c.options.method === "PATCH")[1].path, "/api/web/admin/visa-cases/32/aggregate");
  f.writes[1].resolve({ ...record(32), version: 2 }); await f.settle(); f.unmount();
});

test("late detail response cannot replace a newer client selection", async () => {
  const f = fixture(); f.flush(); await f.settle(); const old = f.deferDetail(21);
  f.navigate(21); f.navigate(22); await f.settle(); assert.match(f.visible(), /Synthetic 22/);
  old.resolve(detail(21)); await f.settle(); assert.match(f.visible(), /Synthetic 22/); assert.doesNotMatch(f.visible(), /Synthetic 21/); f.unmount();
});

test("actor change invalidates old handler/reply and performs fresh reads", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle(); f.save(); f.changeActor(12); await f.settle();
  assert.equal(f.hasEditor(), false); f.writes[0].resolve({ ...record(), version: 2 }); await f.settle();
  assert.equal(f.hasEditor(), false); assert.doesNotMatch(f.visible(), /Сохранено/); f.unmount();
});

test("saved outcome recovers disabled-source focus only if user did not move", async () => {
  for (const moved of [false, true]) {
    const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle(); f.save();
    assert.equal(f.document.activeElement, f.document.body);
    if (moved) { f.moveFocus(); f.document.activeElement = f.document.body; }
    f.writes[0].resolve({ ...record(), version: 2 }); await f.settle();
    assert.equal(f.document.activeElement === f.document.body, moved);
    assert.equal(f.docListeners.get("focusin")?.size ?? 0, 0); assert.equal(f.docListeners.get("pointerdown")?.size ?? 0, 0); f.unmount();
  }
});

test("late assignment follow-up GET cannot reopen old case or clear new save state", async () => {
  const f = fixture("ru", { managers: true }); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.input("Добавить сотрудника", "77"); f.input("Причина назначения", "Synthetic reviewed assignment");
  f.clickButton("Проверить назначение"); f.clickButton("Да, добавить"); assert.equal(f.mutations.length, 1);
  const oldCase = f.deferCase(31); f.mutations[0].resolve({}); await f.settle();
  assert.ok(f.calls.some(c => c.path === "/api/web/admin/visa-cases/31"));
  f.navigate(22); await f.settle(); f.openCase(32); await f.settle(); f.save();
  oldCase.resolve({ ...record(), version: 2, stay_end: "2099-12-31" }); await f.settle();
  assert.ok(f.hasEditor()); assert.match(f.visible(), /Сохраняем всё/); assert.doesNotMatch(f.visible(), /Менеджер добавлен к визе/);
  f.writes[0].resolve({ ...record(32), version: 2 }); await f.settle(); f.unmount();
});

test("late upload follow-up GET cannot apply its case under another client", async () => {
  const f = fixture("ru", { storage: true }); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.file(); const oldCase = f.deferCase(31); f.submit("uploadProtectedDocument"); assert.equal(f.uploads.length, 1);
  f.uploads[0].resolve({ ok: true, status: 200 }); await f.settle();
  f.navigate(22); await f.settle(); f.openCase(32); await f.settle(); f.save();
  oldCase.resolve({ ...record(), version: 2, stay_end: "2099-12-31" }); await f.settle();
  assert.ok(f.hasEditor()); assert.match(f.visible(), /Сохраняем всё/); assert.doesNotMatch(f.visible(), /Документ проверен, зашифрован и сохранён/);
  f.writes[0].resolve({ ...record(32), version: 2 }); await f.settle(); f.unmount();
});

test("late client mutation cannot start a fresh navigation back to its previous client", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.input("Новая заметка", "Synthetic note"); f.submit("addNote");
  assert.equal(f.mutations.length, 1); const before = f.calls.filter(c => c.path === "/api/web/admin/clients/21").length;
  f.navigate(22); await f.settle(); f.openCase(32); await f.settle(); f.save();
  f.mutations[0].resolve({}); await f.settle();
  assert.equal(f.calls.filter(c => c.path === "/api/web/admin/clients/21").length, before);
  assert.ok(f.hasEditor()); assert.match(f.visible(), /Synthetic 22/); assert.match(f.visible(), /Сохраняем всё/);
  f.writes[0].resolve({ ...record(32), version: 2 }); await f.settle(); f.unmount();
});

for (const failed of [false, true]) test("stale case history cannot replace another client's deliveries/error: " + failed, async () => {
  const f = fixture(); f.flush(); await f.settle(); const old = f.deferHistory(31); f.openCase(); await f.settle();
  f.navigate(22); await f.settle(); f.openCase(32); await f.settle();
  if (failed) old.reject(Error("Synthetic old case history failure")); else old.resolve({ items: [delivery("SYNTHETIC_OLD_CASE_HISTORY")] });
  await f.settle(); assert.doesNotMatch(f.visible(), /SYNTHETIC_OLD_CASE_HISTORY|Не удалось загрузить историю/); f.unmount();
});

test("save-and-notify refreshes history and old pre-save history cannot overwrite it", async () => {
  const f = fixture(); f.flush(); await f.settle(); const old = f.deferHistory(31); f.openCase(); await f.settle();
  f.checkbox("Уведомить об изменениях"); f.save(); f.clickButton("Подтвердить сохранение");
  assert.equal(f.requestBody(0).notify_client, true);
  const fresh = f.deferHistory(31); f.writes[0].resolve({ ...record(), version: 2 }); await f.settle();
  assert.match(f.visible(), /Загружаем историю уведомлений/);
  fresh.resolve({ items: [delivery("SYNTHETIC_FRESH_AFTER_SAVE")] }); await f.settle();
  old.resolve({ items: [delivery("SYNTHETIC_STALE_BEFORE_SAVE")] }); await f.settle();
  assert.match(f.visible(), /SYNTHETIC_FRESH_AFTER_SAVE/); assert.doesNotMatch(f.visible(), /SYNTHETIC_STALE_BEFORE_SAVE/);
  assert.match(f.visible(), /Обновить историю/); f.unmount();
});

test("assignment version change supersedes pending old history without a stuck loading state", async () => {
  const f = fixture("ru", { managers: true }); f.flush(); await f.settle(); const old = f.deferHistory(31);
  f.openCase(); await f.settle(); f.input("Добавить сотрудника", "77"); f.input("Причина назначения", "Synthetic versioned assignment");
  f.clickButton("Проверить назначение"); f.clickButton("Да, добавить"); const caseRead = f.deferCase(31);
  f.mutations[0].resolve({}); await f.settle(); const fresh = f.deferHistory(31);
  caseRead.resolve({ ...record(), version: 2 }); await f.settle();
  fresh.resolve({ items: [delivery("SYNTHETIC_AFTER_ASSIGNMENT")] }); await f.settle();
  old.resolve({ items: [delivery("SYNTHETIC_BEFORE_ASSIGNMENT")] }); await f.settle();
  assert.match(f.visible(), /SYNTHETIC_AFTER_ASSIGNMENT/);
  assert.doesNotMatch(f.visible(), /Загружаем историю уведомлений|SYNTHETIC_BEFORE_ASSIGNMENT/); f.unmount();
});

test("period-only rebind after a version refresh preserves unrelated date drafts and old handlers stay retired", async () => {
  const f = fixture("ru", { managers: true }); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.input("Разрешено находиться до", "2027-11-01"); const old = f.period();
  f.changePeriod({ ...staySelection.e33g365Selection(old.item, "INITIAL")!, acknowledged: true });
  f.input("Добавить сотрудника", "77"); f.input("Причина назначения", "Synthetic period rebind assignment");
  f.clickButton("Проверить назначение"); f.clickButton("Да, добавить"); const caseRead = f.deferCase(31);
  f.mutations[0].resolve({}); await f.settle(); caseRead.resolve({ ...record(), version: 2 }); await f.settle();
  assert.equal(f.period().draft.binding.version, 1); assert.equal(f.period().item.version, 2);
  old.onChange({ ...old.draft, action: "CLEAR" }); f.flush(); assert.equal(f.period().draft.action, "SELECT");
  f.changePeriod(staySelection.newAdminStaySelection(f.period().item, "INITIAL"));
  assert.equal(f.period().draft.binding.version, 2); assert.equal(f.period().draft.purpose, "INITIAL");
  assert.equal(f.period().item.stay_end, "2027-11-01"); f.save(); assert.equal(f.requestBody(0).expected_version, 2);
  assert.equal(f.requestBody(0).stay_end, "2027-11-01"); f.writes[0].resolve({ ...record(), version: 3, stay_end: "2027-11-01" }); await f.settle(); f.unmount();
});

test("staff entry uses real aggregate save, same retry body and resets only after verified response", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.changeStaffAction({ ...staffStay.newStaffStayDraft(f.staffAction().item, "CONFIRM_ENTRY"), source: "Synthetic verified stamp",
    reason: "Synthetic staff confirmation", acknowledged: true });
  f.save(); const first = f.requestBody(0);
  assert.equal(first.stay_action.kind, "CONFIRM_ENTRY"); assert.equal(first.entered_on, undefined);
  assert.equal(first.lifecycle_status, undefined); assert.equal(first.reason, "Synthetic staff confirmation");
  f.writes[0].reject(Error("lost acknowledgement")); await f.settle(); f.save();
  assert.deepEqual(f.requestBody(1), first);
  f.writes[1].resolve({ ...record(), version: 2, stay_reports: { entry_provenance: "staff_confirmed" } }); await f.settle();
  assert.equal(f.staffAction().draft.kind, "NONE"); assert.match(f.visible(), /Сохранено без уведомления/); f.unmount();
});

test("unconfirmed staff response retains action and retired case handlers cannot affect another case", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle(); const old = f.staffAction();
  f.changeStaffAction({ ...staffStay.newStaffStayDraft(old.item, "CONFIRM_ENTRY"), source: "Synthetic stamp", reason: "Synthetic reason", acknowledged: true });
  f.save(); f.writes[0].resolve({ ...record(), version: 2 }); await f.settle();
  assert.equal(f.staffAction().draft.kind, "CONFIRM_ENTRY"); assert.match(f.visible(), /Сохранение не подтверждено/);
  f.navigate(22); await f.settle(); f.openCase(32); await f.settle(); old.onChange({ ...old.draft, kind: "CONFIRM_ENTRY" }); f.flush();
  assert.equal(f.staffAction().draft.kind, "NONE"); assert.equal(f.staffAction().draft.caseId, 32); f.unmount();
});

test("staff action never silently drops ordinary date or lifecycle edits", async () => {
  for (const field of ["date", "status"]) {
    const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle();
    if (field === "date") f.input("Разрешено находиться до", "2028-10-01"); else f.lifecycle("EXPIRING");
    f.changeStaffAction({ ...staffStay.newStaffStayDraft(f.staffAction().item, "CONFIRM_ENTRY"), source: "Synthetic stamp", reason: "Synthetic reason", acknowledged: true });
    f.save(); assert.equal(f.writes.length, 0); assert.match(f.visible(), /Действие не сохранено/); f.unmount();
  }
});

test("staff entry rejects an incompatible CLEAR selection without PATCH and preserves draft", async () => {
  const f = fixture(); f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.changeStaffAction({ ...staffStay.newStaffStayDraft(f.staffAction().item, "CONFIRM_ENTRY"), source: "Synthetic stamp", reason: "Synthetic reason", acknowledged: true });
  f.changePeriod({ ...f.period().draft, action: "CLEAR" }); f.save();
  assert.equal(f.writes.length, 0); assert.equal(f.staffAction().draft.kind, "CONFIRM_ENTRY"); assert.match(f.visible(), /Расчёт не сохранён/); f.unmount();
});

for (const omitted of [true, false]) test("extension response must explicitly acknowledge forecast clearing: " + omitted, async () => {
  const f = fixture("ru", { casePatch: { extensions_used: 0, expected_stay_end: "2028-10-01", processes: [{ id: 41, type: "EXTENSION", external_status: "ISSUED" }] } });
  f.flush(); await f.settle(); f.openCase(); await f.settle();
  f.changeStaffAction({ ...staffStay.newStaffStayDraft(f.staffAction().item, "CONFIRM_EXTENSION"), documentEnd: "2028-10-01",
    source: "Synthetic extension document", reason: "Synthetic reason", clearExpected: true, acknowledged: true });
  f.save(); const first = f.requestBody(0);
  const response: any = { ...record(), version: 2, lifecycle_status: "EXTENDED", stay_end: "2028-10-01", extensions_used: 1 };
  if (!omitted) response.expected_stay_end = "2028-10-01";
  f.writes[0].resolve(response); await f.settle();
  assert.equal(f.staffAction().draft.kind, "CONFIRM_EXTENSION"); assert.match(f.visible(), /Сохранение не подтверждено/);
  f.save(); assert.deepEqual(f.requestBody(1), first);
  f.writes[1].resolve({ ...response, expected_stay_end: null }); await f.settle();
  assert.equal(f.staffAction().draft.kind, "NONE"); f.unmount();
});

test("staff draft review after an assignment refresh preserves evidence with a new acknowledgement", async () => {
  const f = fixture("ru", { managers: true }); f.flush(); await f.settle(); f.openCase(); await f.settle();
  const draft = { ...staffStay.newStaffStayDraft(f.staffAction().item, "CONFIRM_ENTRY"), source: "Synthetic stamp", reason: "Synthetic reason", acknowledged: true };
  f.changeStaffAction(draft); const retired = f.staffAction();
  f.input("Добавить сотрудника", "77"); f.input("Причина назначения", "Synthetic assignment");
  f.clickButton("Проверить назначение"); f.clickButton("Да, добавить"); const caseRead = f.deferCase(31);
  f.mutations[0].resolve({}); await f.settle(); caseRead.resolve({ ...record(), version: 2 }); await f.settle();
  assert.equal(f.staffAction().draft.version, 1); retired.onChange({ ...draft, source: "Stale edit" }); f.flush();
  assert.equal(f.staffAction().draft.source, "Synthetic stamp");
  f.changeStaffAction(staffStay.reviewStaffStayDraft(f.staffAction().draft, f.staffAction().item));
  assert.equal(f.staffAction().draft.source, "Synthetic stamp"); assert.equal(f.staffAction().draft.acknowledged, false);
  f.changeStaffAction({ ...f.staffAction().draft, acknowledged: true }); f.save();
  assert.equal(f.requestBody(0).expected_version, 2); assert.equal(f.requestBody(0).stay_action.source_reference, "Synthetic stamp");
  f.writes[0].resolve({ ...record(), version: 3, stay_reports: { entry_provenance: "staff_confirmed" } }); await f.settle(); f.unmount();
});

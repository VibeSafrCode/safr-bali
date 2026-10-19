import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";

// Execute the actual component/effect. These DOM facades model effective
// disabled/visibility semantics; actual browser acceptance is a separate gate.
const require = createRequire(import.meta.url);
class Harness {
  active: any = { name: "opener", focus: () => { this.active = this.opener; } };
  opener = this.active;
  refs: any[] = []; cursor = 0; effects: Array<() => any> = [];
  frames: Array<() => void> = []; listener?: (event: any) => void;
  cleanup?: () => void; closed = 0; body = { style: { overflow: "scroll" } };
  candidates: any[] = []; dialogs: any[]; overlay: any; component: any;
  constructor() {
    this.overlay = { querySelectorAll: () => this.candidates.filter(n => !n.directDisabled) };
    this.dialogs = [this.overlay];
    const hooks = { useRef: (value: any) => {
      const i = this.cursor++; return this.refs[i] ??= { current: value };
    }, useEffect: (effect: () => any) => { if (!this.cleanup) this.effects.push(effect); } };
    const source = fs.readFileSync(new URL("../src/components/AdminDialog.tsx", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const exports: any = {};
    const doc = { body: this.body, get activeElement() { return owner.active; },
      querySelectorAll: () => this.dialogs,
      addEventListener: (_name: string, fn: any) => { this.listener = fn; },
      removeEventListener: (_name: string, fn: any) => { if (this.listener === fn) this.listener = undefined; } };
    const owner = this;
    const win = { requestAnimationFrame: (fn: () => void) => { this.frames.push(fn); },
      getComputedStyle: (node: any) => ({ visibility: node.visibility }) };
    new Function("require", "exports", "document", "window", compiled)(
      (name: string) => name === "react" ? hooks : require(name), exports, doc, win);
    this.component = exports.AdminDialog;
  }
  node(name: string, options: Record<string, any> = {}) {
    const node: any = { name, directDisabled: false, effectiveDisabled: false,
      hidden: false, ancestorHidden: false, inert: false, rendered: true, visibility: "visible", ...options };
    node.hasAttribute = (name: string) => name === "hidden" && node.hidden;
    node.matches = (selector: string) => selector === ":disabled" && (node.directDisabled || node.effectiveDisabled);
    node.closest = () => node.hidden || node.ancestorHidden || node.inert ? {} : null;
    node.getClientRects = () => node.rendered ? [{}] : [];
    node.focus = () => {
      if (!node.directDisabled && !node.effectiveDisabled && !node.hidden && !node.ancestorHidden && !node.inert && node.rendered && node.visibility === "visible") this.active = node;
    };
    this.candidates.push(node); return node;
  }
  mount(closeDisabled = false) {
    this.cursor = 0;
    const tree = this.component({ labelledBy: "title", onClose: () => { this.closed++; }, closeDisabled, children: React.createElement("span") });
    tree.props.ref.current = this.overlay;
    for (const effect of this.effects.splice(0)) this.cleanup = effect();
  }
  frame() { for (const fn of this.frames.splice(0)) fn(); }
  key(key: string, shiftKey = false) {
    const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
    this.listener?.(event); return event;
  }
  locked() {
    this.node("Choose another child", { effectiveDisabled: true });
    this.node("Choose another parent", { effectiveDisabled: true });
    const retry = this.node("Retry"); const close = this.node("Close");
    this.mount(); this.frame(); return { retry, close };
  }
}

test("unresolved reopen initially focuses enabled Retry, not disabled fieldset descendants", () => {
  const h = new Harness(); const { retry } = h.locked(); assert.equal(h.active, retry);
});

test("forward wrap skips effectively disabled controls", () => {
  const h = new Harness(); const { retry, close } = h.locked(); close.focus();
  assert.equal(h.key("Tab").prevented, true); assert.equal(h.active, retry);
});

test("reverse wrap starts at enabled Retry", () => {
  const h = new Harness(); const { retry, close } = h.locked(); retry.focus();
  assert.equal(h.key("Tab", true).prevented, true); assert.equal(h.active, close);
});

test("hidden/inert ancestors, no layout and CSS-hidden controls cannot capture initial focus", () => {
  const h = new Harness();
  h.node("hidden attribute", { hidden: true });
  h.node("hidden ancestor", { ancestorHidden: true });
  h.node("inert ancestor", { inert: true });
  h.node("display none", { rendered: false });
  h.node("visibility hidden", { visibility: "hidden" });
  h.node("visibility collapse", { visibility: "collapse" });
  const retry = h.node("Retry"); h.mount(); h.frame(); assert.equal(h.active, retry);
});

test("ordinary trap, Escape, latest closeDisabled, overflow and opener return stay intact", () => {
  const h = new Harness(); const first = h.node("First"), last = h.node("Last");
  h.mount(); h.frame(); assert.equal(h.active, first); assert.equal(h.body.style.overflow, "hidden");
  assert.equal(h.key("Tab", true).prevented, true); assert.equal(h.active, last);
  assert.equal(h.key("Tab").prevented, true); assert.equal(h.active, first);
  h.mount(true); assert.equal(h.key("Escape").prevented, false); assert.equal(h.closed, 0);
  h.mount(false); assert.equal(h.key("Escape").prevented, true); assert.equal(h.closed, 1);
  h.cleanup?.(); h.frame(); assert.equal(h.active, h.opener); assert.equal(h.body.style.overflow, "scroll");
  assert.equal(h.listener, undefined);
});

test("only the topmost dialog handles keyboard and an empty list traps Tab", () => {
  const h = new Harness(); h.mount(); h.frame();
  h.dialogs.push({ nested: true }); assert.equal(h.key("Escape").prevented, false); assert.equal(h.closed, 0);
  h.dialogs.pop(); assert.equal(h.key("Tab").prevented, true);
});

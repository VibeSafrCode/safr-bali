import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  CLIENT_AUTH_LOGOUT_EVENT, CLIENT_UI_LOCALE_STORAGE_KEY,
  publishClientAuthLogout, subscribeClientAuthLogout,
} from "../src/runtime/client-auth-lifecycle";
import { browserClientUiLocaleEnvironment, createClientUiLocaleSession } from "../src/i18n/client-ui-locale";

class FakeChannel {
  static active = new Set<FakeChannel>();
  closed = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { FakeChannel.active.add(this); }
  postMessage(data: unknown) {
    const recipients = [...FakeChannel.active].filter(value => value !== this && value.name === this.name);
    queueMicrotask(() => recipients.forEach(value => { if (!value.closed) value.onmessage?.({data}); }));
  }
  close() { this.closed = true; FakeChannel.active.delete(this); }
}

function environment(options: { blocked?: boolean; channelUnavailable?: boolean } = {}) {
  const values = new Map([[CLIENT_UI_LOCALE_STORAGE_KEY, "ar"], ["unrelated", "preserve"]]);
  const removed: string[] = [];
  const storage = {
    getItem(key: string) { if (options.blocked) throw Error("unavailable"); return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (options.blocked) throw Error("unavailable"); values.set(key, value); },
    removeItem(key: string) { if (options.blocked) throw Error("unavailable"); removed.push(key); values.delete(key); },
  };
  const html = {lang: "ar", dir: "rtl", dataset: {} as Record<string,string>, style: {colorScheme: "dark"}};
  const windowMock = Object.assign(new EventTarget(), {localStorage: storage});
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [name,value] of Object.entries({window: windowMock, document: {documentElement: html}, localStorage: storage,
    navigator:{languages:['en-US'],language:'en-US'},
    BroadcastChannel: options.channelUnavailable ? undefined : FakeChannel})) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, value});
  }
  return {values, removed, storage, html, windowMock, restore() {
    for (const channel of [...FakeChannel.active]) channel.close();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }};
}

function source(relative: string) {
  const text = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  return ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function functionBody(file: ts.SourceFile, name: string) {
  let body: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) {
      body = node.body.getText(file).slice(1,-1);
    }
    ts.forEachChild(node, visit);
  }
  visit(file); assert(body, `actual ${name} callback missing`); return body;
}

test("real locale session clears successful logout and a fresh other actor does not inherit the old UI preference", async () => {
  const env = environment();
  try {
    const session = createClientUiLocaleSession(browserClientUiLocaleEnvironment());
    session.mount(); session.bindPrincipal(101, "ru");
    assert.equal(session.snapshot().locale, "ar");
    let notifications = 0;
    const stop = subscribeClientAuthLogout(() => { notifications++; session.logout(); });
    publishClientAuthLogout(); await Promise.resolve();
    assert.equal(notifications, 1, "same-tab broadcast must not invalidate twice");
    assert.equal(session.snapshot().actor, null); assert.equal(session.snapshot().locale, "en");
    assert.equal(env.html.lang, "en"); assert.equal(env.html.dir, "ltr");
    assert.equal(env.values.has(CLIENT_UI_LOCALE_STORAGE_KEY), false);
    assert.equal(env.values.get("unrelated"), "preserve");
    assert(env.removed.every(key => key === CLIENT_UI_LOCALE_STORAGE_KEY));
    const next = createClientUiLocaleSession(browserClientUiLocaleEnvironment());
    next.mount(); next.bindPrincipal(202, "en");
    assert.equal(next.snapshot().locale, "en"); assert.equal(next.snapshot().actor, 202);
    stop(); next.dispose(); session.dispose();
    assert.equal(FakeChannel.active.size, 0);
  } finally { env.restore(); }
});

test("storage and cross-tab constructor denial cannot prevent same-window logout invalidation", () => {
  const env = environment({blocked: true, channelUnavailable: true});
  try {
    let calls = 0; const stop = subscribeClientAuthLogout(() => calls++);
    assert.doesNotThrow(publishClientAuthLogout);
    assert.equal(calls, 1); assert.equal(env.html.lang, "en"); assert.equal(env.html.dir, "ltr");
    stop(); env.windowMock.dispatchEvent(new Event(CLIENT_AUTH_LOGOUT_EVENT)); assert.equal(calls, 1);
  } finally { env.restore(); }
});

test("cross-tab signal clears UI only, ignores malformed signals and closes listeners on cleanup", async () => {
  const env = environment();
  try {
    let calls = 0; const stop = subscribeClientAuthLogout(() => calls++);
    const remote = new FakeChannel("safr:client-auth-lifecycle");
    for (const data of [null, "logout", {type: "other", sender: "external-tab"}, {type: "logout"}]) remote.postMessage(data);
    await Promise.resolve(); assert.equal(calls, 0);
    remote.postMessage({type: "logout", sender: "external-tab"});
    await Promise.resolve(); assert.equal(calls, 1);
    assert.equal(env.values.has(CLIENT_UI_LOCALE_STORAGE_KEY), false);
    assert.equal(env.values.get("unrelated"), "preserve");
    stop(); remote.postMessage({type: "logout", sender: "external-tab"});
    await Promise.resolve(); assert.equal(calls, 1); remote.close();
    assert.equal(FakeChannel.active.size, 0);
  } finally { env.restore(); }
});

const appearance = source("../src/components/AppearanceControls.tsx");
const readTheme = new Function("window", "STORAGE_KEY", "isYogaBrand", functionBody(appearance,"initialTheme")) as
  (window: unknown, key: string, yoga?:boolean) => string;
test("actual appearance initializer retains existing valid/default theme and tolerates denied getItem/property access", () => {
  for (const [saved, expected] of [["light", "light"], ["dark", "dark"], [null, "dark"], ["invalid", "dark"]]) {
    assert.equal(readTheme({localStorage:{getItem: () => saved}}, "safrway:appearance"), expected);
  }
  assert.equal(readTheme({localStorage:{getItem() {throw Error("blocked");}}}, "safrway:appearance"), "dark");
  assert.equal(readTheme(Object.defineProperty({}, "localStorage", {get() {throw Error("blocked");}}), "safrway:appearance"), "dark");
  assert.equal(readTheme(Object.defineProperty({}, "localStorage", {get() {throw Error("Yoga must not read Main theme");}}), "yoga-gangster:appearance",true),"dark");
});

test("actual appearance layout callback applies in-memory theme even when persistence throws", () => {
  let body: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useLayoutEffect") {
      const callback = node.arguments[0];
      if (ts.isArrowFunction(callback) && ts.isBlock(callback.body)) body = callback.body.getText(appearance).slice(1,-1);
    }
    ts.forEachChild(node,visit);
  }
  visit(appearance); assert(body);
  const apply = new Function("window", "document", "theme", "STORAGE_KEY", "isYogaBrand", body);
  const document = {documentElement:{dataset:{} as Record<string,string>,style:{colorScheme:"dark"}}};
  assert.doesNotThrow(() => apply({localStorage:{setItem() {throw Error("blocked");}}}, document,"light","safrway:appearance"));
  assert.equal(document.documentElement.dataset.theme, "light");
  assert.equal(document.documentElement.style.colorScheme, "light");
});

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const logoutNames=['readOnly','loggingOut','loadVersion','cancelRefresh','loadActive','client',
  'appApiClient','supportIntentMemory','publishClientAuthLogout','clearPrincipal',
  'setAuth','setDashboard','setSupportOpen','setCopied','setStatus','setError'];
const actualLogout = new AsyncFunction(...logoutNames,functionBody(source("../src/surfaces/AccountApp.tsx"),"logout"));
function logoutFixture(request:()=>Promise<void>,readOnly=false){
  const order:string[]=[],loggingOut={current:false},loadVersion={current:0};
  const scope:Record<string,any>={readOnly,loggingOut,loadVersion,cancelRefresh(){},loadActive:{current:null},client:{controller:{beginLoad(){}}},
    appApiClient:()=>({request:async(route:string,options:{method:string})=>{assert.equal(route,'/api/web/auth/logout');assert.equal(options.method,'POST');order.push('request');await request();}}),
    supportIntentMemory:{clear:()=>order.push('clear')},publishClientAuthLogout:()=>{order.push('invalidate');publishClientAuthLogout();},
    clearPrincipal:(next:string)=>order.push('principal:'+next),setAuth:()=>order.push('auth'),setDashboard:()=>order.push('dashboard'),
    setSupportOpen(){},setCopied(){},setStatus:(next:string)=>order.push('status:'+next),setError:()=>order.push('error')};
  return{order,loggingOut,loadVersion,run:()=>actualLogout(...logoutNames.map(name=>scope[name]))};
}
test("actual AccountApp logout publishes invalidation only after successful server logout", async () => {
  const env = environment();
  let release!:()=>void,result:Promise<void>|undefined;
  try {
    const pending = new Promise<void>(resolve => {release = resolve;});
    const fixture=logoutFixture(()=>pending);result=fixture.run();
    assert.deepEqual(fixture.order,['clear','auth','dashboard','status:loading','request']);
    assert.equal(env.values.get(CLIENT_UI_LOCALE_STORAGE_KEY),'ar');
    await fixture.run();assert.equal(fixture.order.filter(v=>v==='request').length,1);
    release();await result;assert.deepEqual(fixture.order,['clear','auth','dashboard','status:loading','request','invalidate','principal:guest']);
    assert.equal(fixture.loggingOut.current,false);
    assert.equal(env.values.has(CLIENT_UI_LOCALE_STORAGE_KEY),false);
  } finally {release?.();await result?.catch(()=>{});env.restore();}
});

test("failed logout clears private draft but not preference; read-only logout has no side effects", async () => {
  const env = environment();
  try {
    const failed=logoutFixture(async()=>{throw Error('rejected');});await failed.run();
    assert.deepEqual(failed.order,['clear','auth','dashboard','status:loading','request','error','status:error']);assert.equal(failed.loggingOut.current,false);
    const preview=logoutFixture(async()=>{throw Error('preview must not send');},true);await preview.run();assert.deepEqual(preview.order,[]);
    assert.equal(env.values.get(CLIENT_UI_LOCALE_STORAGE_KEY),"ar");
    assert.equal(env.html.lang,"ar"); assert.equal(env.html.dir,"rtl");
  } finally { env.restore(); }
});
test('late logout acknowledgement cannot invalidate a superseding actor view',async()=>{
  const env=environment();let release!:()=>void,result:Promise<void>|undefined;
  try{const pending=new Promise<void>(resolve=>{release=resolve;}),fixture=logoutFixture(()=>pending);result=fixture.run();fixture.loadVersion.current++;release();await result;assert.ok(!fixture.order.includes('invalidate'));assert.ok(!fixture.order.includes('principal:guest'));assert.equal(env.values.get(CLIENT_UI_LOCALE_STORAGE_KEY),'ar');assert.equal(fixture.loggingOut.current,false);}
  finally{release?.();await result?.catch(()=>{});env.restore();}
});

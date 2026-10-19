import assert from "node:assert/strict";
import test from "node:test";
import {CLIENT_RUNTIME_LOCALES} from "../src/i18n/client-runtime";
import {createClientUiPreferenceAdapter, requireClientUiPreference,
  ClientUiPreferenceConflict, ClientUiPreferenceRejected, type ClientUiPreference} from "../src/i18n/client-ui-preference";
const defer = <T,>() => {let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});return {promise, resolve, reject};};
async function drain() {for (let i = 0; i < 20; i++) await Promise.resolve();}
function fixture(initial: ClientUiPreference = {ui_locale: "ru", revision: 6}) {
  let server = {...initial}, shown: string = "ar", reads = 0;
  const writes: {actor: number; value: unknown; signal: AbortSignal}[] = [], applied: string[] = [];
  const timers = new Map<number, () => void>();let timer = 0;
  const transport = {
    async write(actor: number, value: {ui_locale: typeof CLIENT_RUNTIME_LOCALES[number]; expected_revision: number}, signal: AbortSignal): Promise<unknown> {
      writes.push({actor, value, signal});
      if (value.expected_revision !== server.revision) throw new ClientUiPreferenceConflict({...server});
      server = {ui_locale: value.ui_locale, revision: server.revision + 1};return {...server};
    },
    async read(_actor: number, _signal: AbortSignal) {reads++;return {actor: 101, preference: {...server}};},
  };
  const adapter = createClientUiPreferenceAdapter({transport, applyLocal: value => {shown = value;applied.push(value);},
    schedule: callback => {const id = ++timer;timers.set(id, callback);return () => {timers.delete(id);};}});
  adapter.mount();adapter.bindPrincipal(101, initial, "ru");
  return {adapter, transport, writes, applied, shown: () => shown, reads: () => reads,
    server: () => server, setServer: (value: ClientUiPreference) => {server = {...value};},
    timers: () => timers.size, expire: () => {const next = [...timers.entries()][0];assert(next);timers.delete(next[0]);next[1]();}};
}
test("strict exact10 nullable projection and bounded independent revision", () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) assert.deepEqual(requireClientUiPreference({ui_locale: locale, revision: 3}), {ui_locale: locale, revision: 3});
  assert.deepEqual(requireClientUiPreference({ui_locale: null, revision: 0}), {ui_locale: null, revision: 0});
  for (const value of [null, [], {}, {ui_locale: "ru"}, {ui_locale: "ru", revision: true}, {ui_locale: "en", revision: "1"},
    {ui_locale: "ru", revision: -1}, {ui_locale: "ru", revision: 1.5}, {ui_locale: "ru", revision: NaN}, {ui_locale: "ru", revision: 2147483648},
    {ui_locale: "zh-cn", revision: 1}, {ui_locale: "fa", revision: 1}, {ui_locale: " ar", revision: 1},
    {ui_locale: "ru", revision: 1, actor: 202}, {ui_locale: "ru", revision: 1, csrf_token: "synthetic"}]) assert.throws(() => requireClientUiPreference(value));
});
test("bootstrap all10 canonical choices win without importing anonymous cache", () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const f = fixture({ui_locale: locale, revision: 9});assert.equal(f.shown(), locale);assert.equal(f.writes.length, 0);assert.equal(f.adapter.snapshot().status, "idle");f.adapter.dispose();
  }
  const f = fixture({ui_locale: null, revision: 0});assert.equal(f.shown(), "ru");assert.equal(f.writes.length, 0);f.adapter.dispose();
});
test("missing/malformed preference and guests are explicitly local-only", async () => {
  const f = fixture();
  for (const [actor, preference] of [[null, {ui_locale: "ja", revision: 1}], [101, undefined], [101, {ui_locale: "xx", revision: 1}]] as const) {
    f.adapter.bindPrincipal(actor, preference);assert.equal(await f.adapter.choose("de"), "local");assert.equal(f.adapter.snapshot().enabled, false);assert.equal(f.shown(), "de");
  }
  assert.equal(f.writes.length, 0);assert.equal(f.reads(), 0);
  for (const actor of [undefined, 0, -1, true, "101", 1.5, NaN]) assert.throws(() => f.adapter.bindPrincipal(actor, undefined));
  f.adapter.dispose();
});
test("every explicit choice ×10, including equal value, sends only locale and expected revision", async () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const f = fixture({ui_locale: locale, revision: 6});assert.equal(await f.adapter.choose(locale), "saved");
    assert.deepEqual(f.writes[0].value, {ui_locale: locale, expected_revision: 6});assert.equal(f.writes[0].actor, 101);
    assert.equal(f.server().revision, 7);assert.equal(f.adapter.snapshot().projection?.revision, 7);assert.equal(f.reads(), 0);assert.equal(f.timers(), 0);f.adapter.dispose();
  }
});
test("successful same-context FIFO advances CAS without replacing newest visible choice", async () => {
  const f = fixture(), first = defer<unknown>(), original = f.transport.write;
  f.transport.write = async (...args) => {if (!f.writes.length) {f.writes.push({actor: args[0],value: args[1],signal: args[2]});return first.promise;}return original(...args);};
  const a = f.adapter.choose("en");await drain();const b = f.adapter.choose("ja");await drain();assert.equal(f.writes.length, 1);assert.equal(f.shown(), "ja");
  f.setServer({ui_locale: "en", revision: 7});first.resolve({ui_locale: "en", revision: 7});
  assert.equal(await a, "stale");assert.equal(await b, "saved");assert.deepEqual(f.writes.map(x => x.value), [{ui_locale: "en", expected_revision: 6}, {ui_locale: "ja", expected_revision: 7}]);
  assert.equal(f.shown(), "ja");assert.equal(f.server().ui_locale, "ja");f.adapter.dispose();
});
test("409 reconciles current metadata, keeps choice visibly unsaved, never blindly retries", async () => {
  const f = fixture();f.setServer({ui_locale: "ar", revision: 7});
  assert.equal(await f.adapter.choose("de"), "conflict");assert.equal(f.shown(), "de");assert.equal(f.adapter.snapshot().status, "conflict");
  assert.deepEqual(f.adapter.snapshot().projection, {ui_locale: "ar", revision: 7});assert.equal(f.writes.length, 1);
  await drain();assert.equal(f.writes.length, 1);
  assert.equal(await f.adapter.retry("de"), "saved");assert.equal(f.reads(), 1);assert.deepEqual(f.writes[1].value, {ui_locale: "de", expected_revision: 7});f.adapter.dispose();
});
test("lost acknowledgement after commit reads same actor and current value, without replay", async () => {
  const f = fixture(), original = f.transport.write;
  f.transport.write = async (...args) => {await original(...args);throw new Error("synthetic lost ACK");};
  assert.equal(await f.adapter.choose("ar"), "saved");assert.equal(f.writes.length, 1);assert.equal(f.reads(), 1);
  assert.deepEqual(f.adapter.snapshot().projection, {ui_locale: "ar", revision: 7});assert.equal(f.shown(), "ar");f.adapter.dispose();
});
test("failed fresh retry read invalidates already queued newer choice without a stale-base write", async () => {
  const f=fixture();f.setServer({ui_locale:"ar",revision:7});assert.equal(await f.adapter.choose("de"),"conflict");
  const read=defer<{actor:unknown;preference:unknown}>();f.transport.read=async()=>read.promise as Promise<any>;
  const retry=f.adapter.retry("de");await drain();const queued=f.adapter.choose("ja");await drain();
  read.reject(new Error("synthetic refresh failed"));assert.equal(await retry,"unknown");assert.equal(await queued,"conflict");
  assert.equal(f.writes.length,1);assert.equal(f.adapter.snapshot().status,"conflict");assert.equal(f.shown(),"ja");f.adapter.dispose();
});
test("foreign actor during fresh retry read disables queued writes before transport", async () => {
  const f=fixture();f.setServer({ui_locale:"ar",revision:7});assert.equal(await f.adapter.choose("de"),"conflict");
  const read=defer<{actor:unknown;preference:unknown}>();f.transport.read=async()=>read.promise as Promise<any>;
  const retry=f.adapter.retry("de");await drain();const queued=f.adapter.choose("ja");await drain();
  read.resolve({actor:202,preference:{ui_locale:"ko",revision:88}});assert.equal(await retry,"unknown");assert.equal(await queued,"unknown");
  assert.equal(f.writes.length,1);assert.equal(f.adapter.snapshot().enabled,false);assert.equal(f.adapter.snapshot().status,"unavailable");
  assert.equal(f.adapter.snapshot().projection?.revision,7);assert.equal(f.shown(),"ja");f.adapter.dispose();
});
test("missing or malformed projection in a fresh retry also fences already queued work",async()=>{
  for(const preference of [undefined,{ui_locale:"xx",revision:8}]){
    const f=fixture();f.setServer({ui_locale:"ar",revision:7});assert.equal(await f.adapter.choose("de"),"conflict");
    const read=defer<{actor:unknown;preference:unknown}>();f.transport.read=async()=>read.promise as Promise<any>;
    const retry=f.adapter.retry("de");await drain();const queued=f.adapter.choose("ja");await drain();
    read.resolve({actor:101,preference});assert.equal(await retry,"unknown");assert.notEqual(await queued,"saved");
    assert.equal(f.writes.length,1);assert.equal(f.adapter.snapshot().projection?.revision,7);f.adapter.dispose();
  }
});
test("unknown at unchanged revision stays unknown; queued older intent is not rebased", async () => {
  const f = fixture(), delay = defer<unknown>(), original = f.transport.write;
  f.transport.write = async (actor, value, signal) => {f.writes.push({actor,value,signal});return delay.promise;};
  const a = f.adapter.choose("en");await drain();const b = f.adapter.choose("ja");await drain();
  delay.reject(new Error("synthetic network failure"));assert.equal(await a, "unknown");assert.equal(await b, "conflict");
  assert.equal(f.writes.length, 1);assert.equal(f.adapter.snapshot().status, "conflict");assert.equal(f.shown(), "ja");
  f.transport.write = original;assert.equal(await f.adapter.retry("ja"), "saved");assert.equal(f.writes.length, 2);assert.equal(f.reads(), 2);f.adapter.dispose();
});
test("never-settling write is bounded; a fresh same-base B fences late A without cancelling server work", async () => {
  const f = fixture(), aTransport = defer<unknown>(), original = f.transport.write;
  let oldBody!: {ui_locale: typeof CLIENT_RUNTIME_LOCALES[number]; expected_revision: number};
  f.transport.write = async (actor, value, signal) => {oldBody = value;f.writes.push({actor,value,signal});return aTransport.promise;};
  const a = f.adapter.choose("en");await drain();f.expire();assert.equal(await a, "unknown");
  assert.equal(f.adapter.snapshot().projection?.revision, 6);assert.equal(f.adapter.snapshot().status, "unknown");assert.equal(f.writes[0].signal.aborted, true);
  f.transport.write = original;assert.equal(await f.adapter.choose("ja"), "saved");assert.equal(f.server().revision, 7);
  assert.notEqual(oldBody.expected_revision, f.server().revision);aTransport.reject(new ClientUiPreferenceConflict({...f.server()}));await drain();
  assert.equal(f.server().ui_locale, "ja");assert.equal(f.adapter.snapshot().status, "saved");assert.equal(f.timers(), 0);f.adapter.dispose();
});
test("never-settling reconciliation is bounded and does not poison future explicit choices", async () => {
  const f = fixture(), originalRead = f.transport.read;
  f.transport.write = async () => {throw new Error("synthetic unavailable");};f.transport.read = async () => new Promise(() => {});
  const a = f.adapter.choose("de");await drain();f.expire();assert.equal(await a, "unknown");assert.equal(f.timers(), 0);
  f.transport.read = originalRead;f.transport.write = async (_actor, value) => {f.setServer({ui_locale:value.ui_locale,revision:value.expected_revision+1});return {...f.server()};};
  assert.equal(await f.adapter.retry("ja"), "saved");f.adapter.dispose();
});
test("wrong actor reconciliation disables persistence without adopting foreign preference", async () => {
  const f = fixture();f.transport.write = async () => {throw new Error("synthetic unknown");};
  f.transport.read = async () => ({actor: 202, preference: {ui_locale: "ko", revision: 88}});
  assert.equal(await f.adapter.choose("de"), "unknown");assert.equal(f.shown(), "de");assert.equal(f.adapter.snapshot().enabled, false);
  assert.equal(f.adapter.snapshot().projection?.revision, 6);assert.equal(f.adapter.snapshot().status, "unavailable");f.adapter.dispose();
});
test("actor switch detaches blocked queue; late A cannot write or render as B", async () => {
  const f = fixture(), old = defer<unknown>(), original = f.transport.write;
  f.transport.write = async (actor, value, signal) => {if(actor === 101) {f.writes.push({actor,value,signal});return old.promise;}return original(actor,value,signal);};
  const a = f.adapter.choose("en");await drain();const queued = f.adapter.choose("ja");
  f.adapter.bindPrincipal(202, {ui_locale: "fr", revision: 6});f.setServer({ui_locale:"fr",revision:6});
  assert.equal(await f.adapter.choose("ko"), "saved");assert.equal(await a, "stale");assert.equal(await queued, "stale");
  old.resolve({ui_locale:"en",revision:7});await drain();assert.equal(f.adapter.snapshot().actor,202);assert.equal(f.shown(),"ko");
  assert.deepEqual(f.writes.map(x=>x.actor),[101,202]);f.adapter.dispose();
});
test("logout, disposal and StrictMode remount invalidate unsent/late work and timers", async () => {
  for (const action of ["logout","dispose"] as const) {
    const f = fixture(), never = defer<unknown>();f.transport.write = async () => never.promise;
    const pending=f.adapter.choose("en");await drain();f.adapter[action]();assert.equal(await pending,"stale");assert.equal(f.timers(),0);
    f.adapter.mount();f.adapter.bindPrincipal(202,{ui_locale:"ja",revision:2});never.resolve({ui_locale:"en",revision:7});await drain();
    assert.equal(f.shown(),"ja");assert.equal(f.adapter.snapshot().actor,202);assert.equal(f.adapter.snapshot().projection?.revision,2);f.adapter.dispose();
  }
});
test("invalid ACKs and malformed/downgraded conflict data cannot claim saved", async () => {
  for (const ack of [{ui_locale:"de",revision:6},{ui_locale:"de",revision:8},{ui_locale:"ja",revision:7},{ui_locale:"de",revision:7,extra:true}]) {
    const f=fixture();f.transport.write=async()=>ack;assert.equal(await f.adapter.choose("de"),"unknown");assert.equal(f.adapter.snapshot().status,"unknown");f.adapter.dispose();
  }
  const f=fixture();f.transport.write=async()=>{throw new ClientUiPreferenceConflict({ui_locale:"ja",revision:5});};
  assert.equal(await f.adapter.choose("de"),"unknown");assert.equal(f.adapter.snapshot().projection?.revision,6);f.adapter.dispose();
});
test("confirmed rejection and revision overflow never turn into automatic writes", async () => {
  const f=fixture();f.transport.write=async()=>{throw new ClientUiPreferenceRejected(true);};
  assert.equal(await f.adapter.choose("de"),"rejected");assert.equal(f.adapter.snapshot().enabled,false);assert.equal(f.reads(),0);f.adapter.dispose();
  const max=fixture({ui_locale:"ru",revision:2147483647});assert.equal(await max.adapter.choose("en"),"rejected");assert.equal(max.writes.length,0);max.adapter.dispose();
});

import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshLoop } from "../../shared/runtime/refresh-loop";

const flush = async () => { for (let i=0; i<16; i++) await Promise.resolve(); };
function environment() {
  let visible = true, online = true;
  const document = new EventTarget(), window = new EventTarget();
  return {document, window, visible: () => visible, online: () => online,
    hide(value:boolean) { visible = !value; document.dispatchEvent(new Event("visibilitychange")); },
    disconnect(value:boolean) { online = !value; window.dispatchEvent(new Event(value ? "offline" : "online")); },
    focus() { window.dispatchEvent(new Event("focus")); }};
}
test("pricing loop has no work before start; events and consumers share one pending request", async t => {
  t.mock.timers.enable({apis:["setTimeout", "Date"], now:1000});
  const env = environment(); let calls=0; let resolve!:(value:number)=>void; const values:number[]=[];
  const loop=createRefreshLoop({environment:env, load:async()=>{calls++; return new Promise<number>(r=>{resolve=r;});}, onValue:v=>values.push(v), onSettled:()=>{}});
  assert.equal(calls,0); loop.start(); await flush();
  for(let i=0;i<100;i++){env.focus(); void loop.refresh();}
  await flush(); assert.equal(calls,1); resolve(42); await flush(); assert.deepEqual(values,[42]);
  for(let i=0;i<10;i++)env.focus(); await flush(); assert.equal(calls,1);
  t.mock.timers.tick(59_999); await flush(); assert.equal(calls,1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls,2); loop.stop();
});
test("hidden/offline pages do not poll; recovery refreshes once and honors cooldown", async t => {
  t.mock.timers.enable({apis:["setTimeout", "Date"], now:1000});
  const env=environment(); env.hide(true); let calls=0;
  const loop=createRefreshLoop({environment:env,load:async()=>++calls,onValue:()=>{},onSettled:()=>{}});
  loop.start(); t.mock.timers.tick(600_000); await flush(); assert.equal(calls,0);
  env.hide(false); await flush(); assert.equal(calls,1);
  env.disconnect(true); t.mock.timers.tick(600_000); await flush(); assert.equal(calls,1);
  env.disconnect(false); env.focus(); await flush(); assert.equal(calls,2);
  loop.stop(); t.mock.timers.tick(600_000); env.focus(); await flush(); assert.equal(calls,2);
});
test("timeout aborts a hung request, ignores its late response and backs off failures", async t => {
  t.mock.timers.enable({apis:["setTimeout", "Date"], now:1000});
  const env=environment(); let calls=0, signal:AbortSignal|undefined, late!:(v:number)=>void;
  const values:number[]=[];
  const loop=createRefreshLoop({environment:env,load:async s=>{calls++; signal=s; if(calls===1)return new Promise<number>(r=>{late=r;}); throw Error("offline");},onValue:v=>values.push(v),onSettled:()=>{}});
  loop.start(); await flush(); t.mock.timers.tick(8000); await flush(); assert.ok(signal?.aborted);
  late(42); await flush(); assert.deepEqual(values,[]);
  for(let i=0;i<100;i++)env.focus(); await flush(); assert.equal(calls,1);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls,2);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls,2);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls,3);
  t.mock.timers.tick(240000); await flush(); assert.equal(calls,4);
  t.mock.timers.tick(300000); await flush(); assert.equal(calls,5); loop.stop();
});
test("stop aborts pending work, discards late values and permits a clean new lifecycle", async t => {
  t.mock.timers.enable({apis:["setTimeout", "Date"], now:1000});
  const env=environment(); const resolvers:Array<(v:number)=>void>=[], signals:AbortSignal[]=[], values:number[]=[];
  const loop=createRefreshLoop({environment:env, load:async s=>{signals.push(s); return new Promise<number>(r=>resolvers.push(r));},onValue:v=>values.push(v),onSettled:()=>{}});
  loop.start(); await flush(); loop.stop(); assert.ok(signals[0].aborted);
  loop.start(); await flush(); resolvers[0](1); resolvers[1](2); await flush(); assert.deepEqual(values,[2]);
  loop.stop();
});

test("offline visibility/focus invalidates stale display without starting a request", async t => {
  t.mock.timers.enable({apis:["setTimeout", "Date"], now:1000});
  const env=environment(); let calls=0, wakes=0;
  const loop=createRefreshLoop({environment:env,load:async()=>++calls,onValue:()=>{},onSettled:()=>{},onWake:()=>{wakes++;}});
  loop.start(); await flush(); env.disconnect(true); env.hide(true);
  const before=wakes; env.hide(false); env.focus(); await flush();
  assert.equal(calls,1); assert.ok(wakes>=before+2); loop.stop();
});

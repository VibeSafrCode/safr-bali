import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import * as bindings from "../src/i18n/client-ui-bindings";
import * as legacy from "../src/i18n/runtime";
import {ApiError} from "../src/api/client";
import {presentationCopy} from "../src/ui/presentation-copy";
import * as yogaRuntime from "../src/runtime/yoga-mini-app";
import {CLIENT_RUNTIME_LOCALES, clientRuntimeText} from "../src/i18n/client-runtime";
import {CLIENT_PATH_KEYS} from "../../shared/scripts/client-path-runtime-projection.mjs";

// Actual TSX + React SSR. Callback-only probes below use explicit useState/context
// mocks, not ReactDOM, layout, browser, real clipboard/session or transport proof.
const app = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(app,"package.json"));
// tsx's default classic JSX is not the app's Vite automatic JSX mode. Compile
// the unchanged actual provider through the same automatic-JSX TS path as the
// components and share its one real React context; do not patch product source.
const legacySsr: typeof legacy = (()=>{
  const filename=path.join(app,"src/i18n/runtime.tsx"),exports:any={};
  const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const scoped=(specifier:string)=>{
    if(specifier==="react"||specifier==="react/jsx-runtime")return require(specifier);
    if(specifier==="../api/client")return {ApiError};
    if(specifier==="../ui/presentation-copy")return {presentationCopy};
    if(specifier==="../../../shared/content/generated/i18n/mini-app.v1.json")return JSON.parse(fs.readFileSync(path.join(app,"../shared/content/generated/i18n/mini-app.v1.json"),"utf8"));
    throw Error("UNEXPECTED_LEGACY_TEST_MODULE "+specifier);
  };
  vm.runInThisContext("(function(require,module,exports){"+compiled+"\n})",{filename})(scoped,{exports},exports);return exports;
})();
const base = process.env.SAFR_TEST_ACCOUNT_CHILD_BASE;
assert.ok(base && path.isAbsolute(base), "Exact baseline required for byte-pinned legacy comparison");
const sha=(b: string | Buffer)=>createHash("sha256").update(b).digest("hex");
const baselinePins={
  BottomNavigation:"0a01677159e75670494f577acb95ad88468a26261e0964a06faa87212d1707d7",
  ProfileIdentity:"7e54c510f20d3a88dd3f62a2c4873a656e5c494a9fa50e00aa206f6e847b1623",
  RequestsEntry:"1c779788dc7ac42b0f00a6b44f80932f7558b3725feb980c578b28b68bfd4c52",
} as const;
type Name=keyof typeof baselinePins;
for(const[name,pin]of Object.entries(baselinePins))assert.equal(sha(fs.readFileSync(path.join(base,name+".tsx"))),pin);
const currentRuntime=JSON.parse(fs.readFileSync(path.join(app,"../shared/content/client-ui/client-runtime.v1.json"),"utf8"));
assert.equal(Object.keys(currentRuntime.entries).length,354);
assert.equal(sha(JSON.stringify({...currentRuntime,entries:Object.fromEntries(Object.entries(currentRuntime.entries).filter(([key])=>!CLIENT_PATH_KEYS.includes(key)))},null,2)+"\n"),"aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a","All3430 child baseline values reconstructed exactly");
const profileKeys={
  signIn:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#aa07eaf646cf",
  account:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#2fb9b8587b32",
  referral:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#a7def16423f1",
  unavailable:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#680536c8f97e",
  copyLabel:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#aa6e245d18a3",
  copied:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#6ee579abfae4",
  action:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#dc9bf0b2ec69",
  error:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#659b181479db",
  success:"inline:06 Development/react-app/src/components/ProfileIdentity.tsx#a1b96c012ee2",
} as const;
const requestKeys=["inline:06 Development/react-app/src/components/RequestsEntry.tsx#c0b8ac51fa23","inline:06 Development/react-app/src/components/RequestsEntry.tsx#13bbaae95518"] as const;
const navKeys=["nav.aria","nav.home","nav.services","nav.profile","nav.support","inline:06 Development/react-app/src/components/BottomNavigation.tsx#eaedf211c154"] as const;
const escape=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
const includes=(html:string,value:string)=>assert.ok(html.includes(escape(value)),"Expected exact source text: "+value);

function load(name:Name, options:{baseline?:boolean; react?:typeof React; legacy?:typeof legacy}={}) {
  const filename=options.baseline?path.join(base!,name+".tsx"):path.join(app,"src/components",name+".tsx");
  const exports:any={};
  const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const scoped=(specifier:string)=>{
    if(specifier==="react")return options.react??React;
    if(specifier==="react/jsx-runtime")return require(specifier);
    if(specifier==="../i18n/client-ui-bindings")return bindings;
    if(specifier==="../runtime/yoga-mini-app")return yogaRuntime;
    if(specifier==="../i18n/runtime")return options.legacy??legacySsr;
    if(specifier.endsWith(".css"))return {};
    if(specifier==="./AppIcon"){
      const f=path.join(app,"src/components/AppIcon.tsx"),m:any={exports:{}};
      const js=ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
      vm.runInThisContext("(function(require,module,exports){"+js+"\n})",{filename:f})(require,m,m.exports);return m.exports;
    }
    throw new Error("UNEXPECTED_TEST_MODULE "+specifier);
  };
  vm.runInThisContext("(function(require,module,exports){"+compiled+"\n})",{filename})(scoped,{exports},exports);
  return exports[name] as React.ComponentType<any>;
}
function render(name:Name,props:Record<string,unknown>,contact:"ru"|"en"="ru",baseline=false){
  return renderToStaticMarkup(React.createElement(legacySsr.I18nProvider,{locale:contact},React.createElement(load(name,{baseline}),props)));
}
const profile={locale:"ru",copied:false,onCopy:async()=>{}};
const requests={locale:"ru",count:3,onOpen:()=>{}};
const nav={activeTab:"profile",onNavigate:()=>{}};

for(const locale of CLIENT_RUNTIME_LOCALES)test("three actual components consume exact accepted labels and local direction: "+locale,()=>{
  const ui=bindings.createClientUiBindings(locale);
  const p=render("ProfileIdentity",{...profile,ui});
  for(const key of [profileKeys.signIn,profileKeys.account,profileKeys.referral,profileKeys.unavailable,profileKeys.copyLabel,profileKeys.action])includes(p,clientRuntimeText(locale,key));
  assert.match(p,/disabled=""/);
  const copied=render("ProfileIdentity",{...profile,ui,copied:true,referralLink:"https://t.me/fixture_bot?start=ref_opaque"});
  for(const key of [profileKeys.copied,profileKeys.success])includes(copied,clientRuntimeText(locale,key));
  const r=render("RequestsEntry",{...requests,ui});for(const key of requestKeys)includes(r,clientRuntimeText(locale,key));includes(r," · 3");
  const n=render("BottomNavigation",{...nav,ui});for(const key of navKeys)includes(n,clientRuntimeText(locale,key));
  for(const html of [p,r,n]){assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes('dir="'+(locale==="ar"?"rtl":"ltr")+'"'));}
});

for(const contact of ["ru","en"] as const)test("prop-absent legacy RUEN markup stays byte-identical to exact baseline: "+contact,()=>{
  for(const copied of [false,true])for(const identity of [{},{username:"synthetic_actor",firstName:"Synthetic"},{firstName:"Synthetic",referralLink:"https://t.me/fixture_bot?start=ref_opaque"}]){
    const props={...profile,locale:contact,copied,...identity};assert.equal(render("ProfileIdentity",props,contact),render("ProfileIdentity",props,contact,true));
  }
  for(const count of [0,1,40]){const props={...requests,locale:contact,count};assert.equal(render("RequestsEntry",props,contact),render("RequestsEntry",props,contact,true));}
  for(const activeTab of ["home","services","life","profile","support"]){const props={...nav,activeTab};assert.equal(render("BottomNavigation",props,contact),render("BottomNavigation",props,contact,true));}
});

test("explicit client binding wins over opposite contact/context without changing it",()=>{
  const ar=bindings.createClientUiBindings("ar"),before=Object.keys(ar);for(const[name,props]of [["ProfileIdentity",profile],["RequestsEntry",requests],["BottomNavigation",nav]] as const){
    const html=render(name,{...props,locale:"en",ui:ar},"en");assert.ok(html.includes('lang="ar"'));assert.ok(html.includes('dir="rtl"'));}
  assert.deepEqual(Object.keys(ar),before);assert.equal(bindings.serverContactLocale("en"),"en");
});

test("forged/admin/null/inherited bindings fail closed instead of legacy RU fallback",()=>{
  for(const ui of [null,{role:"admin",locale:"en"},{role:"client",locale:"ar",text:()=>"forged"},Object.create(bindings.createClientUiBindings("ar"))]){
    for(const[name,props]of [["ProfileIdentity",profile],["RequestsEntry",requests],["BottomNavigation",nav]] as const)assert.throws(()=>render(name,{...props,ui}),/BINDING_ROLE_OR_PROVENANCE/);
  }
});

test("customer identity/referral bytes are escaped but never translated or rewritten",()=>{
  const ui=bindings.createClientUiBindings("ja"),link='https://t.me/fixture_bot?start=ref_opaque&tag=<synthetic>',firstName='<script>synthetic</script>';
  const html=render("ProfileIdentity",{...profile,ui,firstName,referralLink:link});includes(html,firstName);includes(html,link);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<a '));
  includes(render("ProfileIdentity",{...profile,ui,username:"synthetic_actor"}),"@synthetic_actor");
});

function nodes(value:any):any[]{if(!value||typeof value!=="object")return[];if(Array.isArray(value))return value.flatMap(nodes);return[value,...nodes(value.props?.children)];}
function text(value:any):string{if(value===null||value===undefined||typeof value==="boolean")return"";if(typeof value!=="object")return String(value);if(Array.isArray(value))return value.map(text).join("");return text(value.props?.children);}
for(const locale of CLIENT_RUNTIME_LOCALES)test("copy failure/success callbacks retain exact locale without new transport: "+locale,async()=>{
  let state=false,calls=0,reject=true;
  const hooks={...React,useState:()=>[state,(value:boolean)=>{state=value;}]} as unknown as typeof React;
  const Component=load("ProfileIdentity",{react:hooks}) as (props:any)=>React.ReactNode;
  const props={...profile,ui:bindings.createClientUiBindings(locale),referralLink:"https://t.me/fixture_bot?start=ref_opaque",onCopy:async()=>{calls++;if(reject)throw Error("synthetic clipboard denial");}};
  const click=()=>nodes(Component(props)).find(n=>n.type==="button").props.onClick();click();for(let i=0;i<4;i++)await Promise.resolve();
  assert.equal(calls,1);assert.equal(state,true);assert.ok(text(Component(props)).includes(clientRuntimeText(locale,profileKeys.error)));
  reject=false;click();for(let i=0;i<4;i++)await Promise.resolve();assert.equal(calls,2);assert.equal(state,false);
  assert.ok(text(Component({...props,copied:true})).includes(clientRuntimeText(locale,profileKeys.success)));
});

test("request and navigation callbacks keep exact destination identities and active semantics",()=>{
  let opened=0;const Requests=load("RequestsEntry") as (props:any)=>any;Requests({...requests,ui:bindings.createClientUiBindings("ar"),onOpen:()=>opened++}).props.onClick();assert.equal(opened,1);
  const legacyMock={...legacy,useI18n:()=>({locale:"en" as const,t:(key:any)=>legacy.translate("en",key)})};
  const Nav=load("BottomNavigation",{legacy:legacyMock}) as (props:any)=>any;const destinations:string[]=[];
  const buttons=nodes(Nav({...nav,ui:bindings.createClientUiBindings("ar"),onNavigate:(next:string)=>destinations.push(next)})).filter(n=>n.type==="button");
  assert.equal(buttons.length,5);assert.deepEqual(buttons.map(b=>b.props["aria-current"]),[undefined,undefined,undefined,"page",undefined]);
  buttons.forEach(b=>b.props.onClick());assert.deepEqual(destinations,["home","services","life","profile","support"]);
});

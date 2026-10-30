// Public source/current-built-DAG contract, NOT comparison with an old build.
// The unchanged private module remains mandatory on the same release tuple.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import vm from 'node:vm';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import test from 'node:test';import ts from 'typescript';import {tsImport} from 'tsx/esm/api';
import {clientBootstrapCodeComparator} from './fixtures/client-bootstrap-code-comparators.mjs';
assert.equal(process.env.SAFR_CLIENT_TEST_CONTRACT,'PUBLIC_DERIVATIVE');
const app=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(app,'package.json'));
const main=fs.readFileSync(app+'/src/main.tsx','utf8'),old=clientBootstrapCodeComparator('main'),lifecycle=fs.readFileSync(app+'/src/components/ClientApplicationLifecycle.tsx','utf8'),pwa=fs.readFileSync(app+'/src/components/PwaLifecycle.tsx','utf8'),provenance=fs.readFileSync(app+'/src/i18n/client-ui-provenance.ts','utf8');
const {restoreAcceptedSourceHistory}=await tsImport('./fixtures/client-source-history.ts',import.meta.url);
function functionBody(source,name){const file=ts.createSourceFile('test.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);assert.ok(node,name);return node.body.getText(file);}
test('public predecessors preserve exact lifecycle subscribe-read/cleanup, PWA and lightweight validator bodies',()=>{
 assert.equal(functionBody(lifecycle,'ClientApplicationLifecycle'),functionBody(old,'ClientApplicationLifecycle'));
 assert.equal(functionBody(pwa,'PwaLifecycle'),functionBody(clientBootstrapCodeComparator('pwa'),'PwaLifecycle'));
 assert.equal(functionBody(provenance,'requireClientUiBindings'),functionBody(clientBootstrapCodeComparator('bindings'),'requireClientUiBindings'));
 assert.doesNotMatch(main,/from\s+['"]\.\/i18n\/client-(ui-bindings|ui-locale|runtime)/);assert.doesNotMatch(main,/import\("\.\/components\/ClientApplicationLifecycle"\)/);
 for(const name of ['AccountApp','WebCalculatorApp'])assert.equal(functionBody(restoreAcceptedSourceHistory(name==='AccountApp'?'bootstrapAccount':'bootstrapCalculator',fs.readFileSync(name==='AccountApp'?app+'/tests/fixtures/accepted-6adadff/AccountApp.tsx.txt':app+'/src/surfaces/'+name+'.tsx','utf8')),name),functionBody(clientBootstrapCodeComparator(name==='AccountApp'?'account':'calculator'),name),'Original surface body restored through fixed accepted later-source spans');
 assert.match(provenance,/import type/);assert.doesNotMatch(provenance,/import\s*\{[^}]*\}\s*from/);assert.doesNotMatch(provenance,/\.json|fetch\(|localStorage|sessionStorage/);
});
test('canonical binding factory and lightweight PWA validator share their actual provenance set',async()=>{
 const bindings=await tsImport('./fixtures/client-bootstrap-imports.ts',import.meta.url);
 assert.equal(bindings.requireClientUiBindings,bindings.requireLightClientUiBindings);
 for(const option of bindings.CLIENT_UI_LANGUAGE_OPTIONS){const ui=bindings.createClientUiBindings(option.code);assert.equal(bindings.requireLightClientUiBindings(ui),ui);assert.ok(Object.isFrozen(ui));for(const forged of [{...ui},Object.create(ui),null,{role:'admin',locale:'ru'}])assert.throws(()=>bindings.requireLightClientUiBindings(forged),/BINDING_ROLE_OR_PROVENANCE/);}
});
function dispatch(source,pathname){let tree;const file=ts.createSourceFile('main.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),body=file.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(file)).join('\n');
 const jsx=require('react/jsx-runtime'),symbol=label=>{const f=()=>null;f.displayName=label;return f;};
 function composition(file,name,surface){const raw=fs.readFileSync(app+'/src/surfaces/'+file+'.tsx','utf8'),ast=ts.createSourceFile('entry.tsx',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);assert.ok(node);const code=ts.transpileModule(node.getText(ast).replace(/^export\s+/,'')+'\nmodule.exports='+name,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,module={exports:{}};new vm.Script(code).runInNewContext({module,exports:module.exports,require:id=>require(id),[surface]:symbol(surface),ClientApplicationLifecycle:symbol('ClientApplicationLifecycle')});module.exports.__testComposition=true;return module.exports;}
 const globals={require:id=>{assert.equal(id,'react/jsx-runtime');return jsx;},lazy:factory=>{const text=String(factory);if(text.includes('AccountClientEntry'))return composition('AccountApp','AccountClientEntry','AccountApp');if(text.includes('WebCalculatorClientEntry'))return composition('WebCalculatorApp','WebCalculatorClientEntry','WebCalculatorApp');const match=text.match(/(?:surfaces|components)\/([A-Za-z]+)/);assert.ok(match,text);return symbol(match[1]);},createRoot:()=>({render(value){tree=value;}}),StrictMode:symbol('StrictMode'),Suspense:symbol('Suspense'),PwaLifecycle:symbol('PwaLifecycle'),DestinationBackdrop:symbol('DestinationBackdrop'),PricingProvider:symbol('PricingProvider'),window:{location:{pathname}},document:{getElementById:()=>({}),documentElement:{dataset:{}}}};
 const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new vm.Script(js).runInNewContext({...globals,exports:{}});
 function normalize(v){if(v==null||typeof v!=='object')return v;if(Array.isArray(v))return Array.from(v,normalize);if(v.type.__testComposition)return normalize(v.type(v.props));return{type:v.type.displayName??v.type.name,props:Object.fromEntries(Object.entries(v.props).map(([k,x])=>[k,k==='children'||k==='fallback'?normalize(x):x]))};}
 return normalize(tree);
}
for(const route of ['/account/','/account/profile/','/account/preview/7/','/calculator/','/admin/','/admin/users/','/admin/clients/7/preview/','/mini-app/','/other/'])test('public entry dispatch/render structure preserves the independent source predecessor: '+route,()=>{
 assert.deepEqual(dispatch(main,route),dispatch(old,route));
});

function graph(root){const files=fs.readdirSync(root+'/assets').filter(f=>f.endsWith('.js')),code=new Map(files.map(f=>['assets/'+f,fs.readFileSync(root+'/assets/'+f,'utf8')])),edges=new Map();
 for(const[file,body]of code){const ast=ts.createSourceFile(file,body,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(ast.parseDiagnostics.length,0);const refs=[];for(const s of ast.statements)if((ts.isImportDeclaration(s)||ts.isExportDeclaration(s))&&s.moduleSpecifier){assert.ok(s.moduleSpecifier.text.startsWith('./'));refs.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),s.moduleSpecifier.text)));}edges.set(file,refs);}
 const html=fs.readFileSync(root+'/account/index.html','utf8'),initial=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["'](\/assets\/[^"']+\.js)["']/g)].map(m=>m[1].slice(1));assert.ok(initial.length>0);
 function closure(entry){const seen=new Set();function visit(f){if(seen.has(f))return;assert.ok(code.has(f),f);seen.add(f);for(const ref of edges.get(f)??[])visit(ref);}for(const ref of initial)visit(ref);if(entry)visit(files.find(f=>f.startsWith(entry+'-'))?'assets/'+files.find(f=>f.startsWith(entry+'-')):'MISSING_ENTRY');return[...seen].map(f=>code.get(f)).join('\n');}
 return{closure};
}
const RUNTIME_SHA256='098aa0534cdebbaeaec997dc5d4eefad6bbf59557a20c2147afb735ffd5a9b20';
const runtimeRaw=fs.readFileSync(path.resolve(app,'../shared/content/client-ui/client-runtime.v1.json'));assert.equal(createHash('sha256').update(runtimeRaw).digest('hex'),RUNTIME_SHA256);
const runtime=JSON.parse(runtimeRaw);assert.equal(Object.keys(runtime.entries).length,354);
const markers=['CLIENT_RUNTIME_KEY_WHITELIST',...Object.keys(runtime.entries).filter(key=>/^(inline:|source:)/.test(key))];
test('actual current HTML and ordinary Admin static closures contain only the five unchanged PWA marker references',()=>{
 const current=graph(app+'/dist');
 const pwaRefs=['90f188900739','55d5e1de67c3','e51845477f02','10b98a0f0034','b439c637e388'].map(id=>'inline:06 Development/react-app/src/components/PwaLifecycle.tsx#'+id).sort();
 for(const entry of [undefined,'AdminApp']){const code=current.closure(entry);assert.deepEqual(markers.filter(marker=>code.includes(marker)).sort(),pwaRefs);assert.ok(!code.includes(RUNTIME_SHA256));}
});
test('actual selected current client route closures retain every pinned runtime identity',()=>{
 const current=graph(app+'/dist');for(const entry of ['AccountApp','MiniApp','WebCalculatorApp'])assert.equal(markers.filter(marker=>current.closure(entry).includes(marker)).length,markers.length);
});
// Prior compiled graph completeness and baseline dictionary loading are NOT
// established here. Only the unchanged private comparator can prove them.

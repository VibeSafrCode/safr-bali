import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createClientUiBindings,requireClientUiBindings} from '../src/i18n/client-ui-bindings';
import {clientVisaLifeText,type ClientVisaLifeKey} from '../src/i18n/client-visa-life-copy';
import {visaStatusDescription,visaStatusLabel,visaStatusOptions} from '../src/components/visaEditorState';
import {clientVisaStatusLabel} from '../src/i18n/client-visa-presentation';
import {presentationCopy} from '../src/ui/presentation-copy';

const source=process.env.SAFR_VISA_HELP12_SOURCE;
assert.ok(source,'Explicit private source pack required');
const bytes=fs.readFileSync(source);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'edb7feea05fa280326b0d33f79ea5318d58eb25b614b9c498fe28ff1d347ab14');
const pack=JSON.parse(bytes.toString('utf8'));
const externalSource=process.env.SAFR_VISA_EXTERNAL38_SOURCE;
assert.ok(externalSource,'Explicit immutable current external38 pack required');
const externalBytes=fs.readFileSync(externalSource);
assert.equal(createHash('sha256').update(externalBytes).digest('hex'),'24cc715048756128cbf04724f76da5241d3d5563c756e2684c75981c6a869d55');
const externalRows=new Map<string,Record<string,string>>(JSON.parse(externalBytes.toString('utf8')).rows.map((r:{key:string;values:Record<string,string>})=>[r.key,r.values]));
const baselineSource=process.env.SAFR_VISA_HELP_BASELINE;
assert.ok(baselineSource,'Explicit immutable prior caller path required');
assert.equal(createHash('sha256').update(fs.readFileSync(baselineSource)).digest('hex'),'64c491d61e0585b081c8c50579318f518a096c39ae9221426270e5edcf87a702');
const currentSource=path.resolve(import.meta.dirname,'../src/components/ClientVisaStatusHelp.tsx');
const sharedSource=path.resolve(import.meta.dirname,'../src/components/VisaStatusHelp.tsx');
const require=createRequire(currentSource);
function loadComponent(file:string):any{
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 const scoped=(id:string)=>{
  if(id==='react')return React;
  if(id==='react/jsx-runtime')return require(id);
  if(id==='./visaEditorState')return{visaStatusDescription,visaStatusLabel,visaStatusOptions};
  if(id==='./VisaStatusHelp')return loadComponent(sharedSource);
  if(id==='../runtime/yoga-mini-app')return{YOGA_MINI_APP:false};
  if(id==='../ui/presentation-copy')return{presentationCopy};
  if(id==='../i18n/client-ui-bindings')return{requireClientUiBindings};
  if(id==='../i18n/client-visa-life-copy')return{clientVisaLifeText};
  if(id==='../i18n/client-visa-presentation')return{clientVisaStatusLabel};
  throw Error('UNEXPECTED_HELP_IMPORT '+id);
 };
 vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename:file})(scoped,{exports},exports);
 return exports;
}
const {ClientVisaStatusHelp:VisaStatusHelp,clientStatusHelpText:statusHelpText}=loadComponent(currentSource),baseline=loadComponent(baselineSource);
const rows=new Map<string,Record<string,string>>(pack.rows.map((r:{key:string;values:Record<string,string>})=>[r.key,r.values]));
const prefix='source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.';
const codes=[...rows.keys()].filter(k=>k.startsWith(prefix+'visa.')).map(k=>k.slice((prefix+'visa.').length));
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
assert.equal(codes.length,10);

for(const locale of locales)test('actual VisaStatusHelp SSR all10 lifecycle codes and aria/disclaimer: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const code of codes){
  const expected=rows.get(prefix+'visa.'+code)![locale];
  assert.equal(statusHelpText('visa',code,'ru',ui),expected);
  const html=renderToStaticMarkup(<VisaStatusHelp kind="visa" code={code} locale="ru" ui={ui}/>);
  const label=rows.get(prefix+'aria')![locale].replace('{code}',code);
  assert.ok(html.includes('aria-label="'+escape(label)+'"'));
  assert.ok(html.includes('<code>'+code+'</code>'));
  assert.ok(html.includes(escape(expected)+'<small>'+escape(rows.get(prefix+'disclaimer')![locale])+'</small>'));
  assert.equal(html.includes('{code}'),false);
 }
});

for(const locale of ['ru','en'] as const)test('bound RUEN output exactly preserves unbound status-help markup: '+locale,()=>{
 for(const code of [...codes,'FUTURE_STATUS'])for(const showCode of [true,false]){
  const render=(ui?:ReturnType<typeof createClientUiBindings>)=>renderToStaticMarkup(<VisaStatusHelp kind="visa" code={code} locale={locale} showCode={showCode} ui={ui}/>);
  const original=renderToStaticMarkup(<baseline.VisaStatusHelp kind="visa" code={code} locale={locale} showCode={showCode}/>);
  assert.equal(render(createClientUiBindings(locale)),original);
  assert.equal(render(),original);
 }
 for(const code of ['PAID','PROCESSING','APPROVED','CANCELLED','FUTURE_STATUS'])
  assert.equal(statusHelpText('external',code,locale,createClientUiBindings(locale)),statusHelpText('external',code,locale));
});

for(const locale of locales.slice(2))test('all18 current external labels/help and both unknown fallbacks replay literal accepted source: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const code of visaStatusOptions('external')){
  const prefix='source:06 Development/shared/content/visa-workflow-statuses.v1.json#';
  const label=externalRows.get(prefix+'external.label.'+code)![locale],help=externalRows.get(prefix+'help.external.'+code)![locale];
  assert.equal(statusHelpText('external',code,'ru',ui),help);
  const html=renderToStaticMarkup(<VisaStatusHelp kind="external" code={code} locale="ru" ui={ui}/>);
  assert.ok(html.includes('<code>'+escape(label)+'</code>'));assert.ok(html.includes(escape(help)));
  assert.ok(html.includes('aria-label="'+escape(rows.get('source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.aria')![locale].replace('{code}',label))+'"'));
 }
 for(const [kind,key] of [['visa','source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.fallback'],['external','source:06 Development/react-app/src/components/visaEditorState.ts#help.external.fallback']] as const){
  const html=renderToStaticMarkup(<VisaStatusHelp kind={kind} code="FUTURE_STATUS" locale="ru" ui={ui}/>);
  assert.ok(html.includes(escape(externalRows.get(key)![locale])));assert.ok(html.includes('<code>FUTURE_STATUS</code>'));
 }
});

test('aria template interpolates literal values once, rejects getters/prototype/extra inputs without invoking them',()=>{
 const ui=createClientUiBindings('ar'),key=(prefix+'aria') as ClientVisaLifeKey;
 const raw=rows.get(prefix+'aria')!.ar;
 assert.equal(clientVisaLifeText(ui,key,{code:'$&{code}<tag>'}),raw.replace('{code}',()=>'$&{code}<tag>'));
 let called=0;
 const getter=Object.defineProperty({},'code',{enumerable:true,get(){called++;return 'PAID';}});
 const inherited=Object.create({code:'PAID'});
 for(const variables of [null,'PAID',getter,inherited,{}, {code:'PAID',extra:1},{code:{toString(){called++;return 'PAID';}}},{code:NaN},{code:'PAID',[Symbol('x')]:1}])
  assert.throws(()=>clientVisaLifeText(ui,key,variables as never),/CLIENT_VISA_LIFE_VARIABLE/);
 assert.equal(called,0);
});

test('forged bindings cannot request status help or render component',()=>{
 for(const ui of [{role:'client',locale:'fr'}, {...createClientUiBindings('ar')},Object.create(createClientUiBindings('ja'))]){
  assert.throws(()=>statusHelpText('visa','ACTIVE','en',ui as never),/CLIENT_UI_BINDING_ROLE_OR_PROVENANCE/);
  assert.throws(()=>renderToStaticMarkup(<VisaStatusHelp kind="visa" code="ACTIVE" locale="en" ui={ui as never}/>),/CLIENT_UI_BINDING_ROLE_OR_PROVENANCE/);
 }
});

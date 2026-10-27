import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

// Execute the current effect with explicit DOM doubles. This is not a browser,
// CSS layout, real dialog, session, chat submission or assistive-technology test.
const app=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(app,'package.json'));
function fixture(){
 const document:{activeElement:Element|null}={activeElement:null};
 class Element{
  isConnected=true;tabIndex=0;visible=true;inert=false;disabled=false;visibility='visible';focuses=0;
  getClientRects(){return this.visible?[{}]:[];}
  closest(_selector:string):unknown{return this.inert?this:null;}
  matches(_selector:string){return this.disabled;}
  focus(){this.focuses++;document.activeElement=this;}
 }
 const fab=new Element(),navigation=new Element(),outside=new Element(),inside=new Element();
 class Dialog extends Element{
  open=false;
  show(){this.open=true;}
  close(){this.open=false;}
  contains(element:Element|null){return element===this||element===inside;}
  closest(selector:string):unknown{return selector==='.account-shell, .app-shell'?{querySelector:(query:string)=>{
   assert.equal(query,'[data-support-trigger="true"]');return navigation;
  }}:super.closest(selector);}
 }
 const dialog=new Dialog(),refs=[{current:dialog},{current:fab},{current:null as Element|null}];
 let cursor=0,effects:Array<()=>unknown>=[];
 const hooks={...React,useRef:()=>refs[cursor++],useState:()=>[false,()=>{}],useEffect:(fn:()=>unknown)=>effects.push(fn)};
 const filename=path.join(app,'src/components/SupportDrawer.tsx'),exports:any={};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const scoped=(id:string)=>{
  if(id==='react')return hooks;if(id==='react/jsx-runtime')return require(id);
  if(id==='../i18n/runtime')return{useI18n:()=>({locale:'en'})};
  if(id==='../runtime/yoga-mini-app')return{YOGA_MINI_APP:false};
  if(id==='../i18n/client-ui-bindings')return{requireClientUiBindings:()=>{throw Error('Unexpected client binding');}};
  if(id==='../api/account-preview')return{isAccountPreview:()=>false};
  if(id==='../i18n/client-support-copy')return{clientSupportDrawerText:()=>{throw Error('Unexpected client copy');}};
  if(id==='./SectionBoundary')return{SectionBoundary:()=>null};if(id==='./AppIcon')return{AppIcon:()=>null};
  throw Error('Unexpected fixture import '+id);
 };
 vm.runInThisContext('(function(require,module,exports,document,HTMLElement,getComputedStyle,window){'+code+'\n})',{filename})(scoped,{exports},exports,document,Element,(element:Element)=>({visibility:element.visibility}),{addEventListener(){},removeEventListener(){}});
 const render=(open:boolean)=>{cursor=0;effects=[];exports.SupportDrawer({open,onClose(){},onOpen(){},apiPrefix:'/mini-app',onOpenTelegram(){}});effects[0]();};
 return{document,fab,navigation,outside,inside,dialog,render};
}
test('close returns to the actual visible navigation opener, not hidden FAB',()=>{
 const h=fixture();h.fab.visible=false;h.document.activeElement=h.navigation;h.render(true);
 assert.equal(h.document.activeElement,h.dialog);h.document.activeElement=h.inside;h.render(false);
 assert.equal(h.document.activeElement,h.navigation);assert.equal(h.navigation.focuses,1);assert.equal(h.fab.focuses,0);
});
test('pointer/body or removed opener falls back to the visible Support navigation',()=>{
 for(const kind of ['body','removed','hidden','disabled','inert','visibility'] as const){
  const h=fixture();h.fab.visible=false;h.document.activeElement=h.outside;h.render(true);
  if(kind==='body')h.outside.tabIndex=-1;if(kind==='removed')h.outside.isConnected=false;
  if(kind==='hidden')h.outside.visible=false;if(kind==='disabled')h.outside.disabled=true;
  if(kind==='inert')h.outside.inert=true;if(kind==='visibility')h.outside.visibility='hidden';
  h.document.activeElement=h.inside;h.render(false);assert.equal(h.document.activeElement,h.navigation,kind);
 }
});
test('desktop FAB and caller focus are retained; an already external focus is not stolen',()=>{
 const h=fixture();h.document.activeElement=h.fab;h.render(true);h.document.activeElement=h.inside;h.render(false);
 assert.equal(h.document.activeElement,h.fab);
 h.document.activeElement=h.navigation;h.render(true);h.document.activeElement=h.outside;h.render(false);
 assert.equal(h.document.activeElement,h.outside);assert.equal(h.navigation.focuses,0);
});
test('repeated open effects do not replace the opener with the dialog itself',()=>{
 const h=fixture();h.fab.visible=false;h.document.activeElement=h.navigation;h.render(true);h.render(true);
 h.document.activeElement=h.inside;h.render(false);assert.equal(h.document.activeElement,h.navigation);
});
test('no hidden/disconnected/inert fallback is focused',()=>{
 const h=fixture();h.document.activeElement=h.outside;h.render(true);
 h.outside.isConnected=false;h.fab.visible=false;h.navigation.inert=true;
 h.document.activeElement=h.inside;h.render(false);assert.equal(h.fab.focuses,0);assert.equal(h.navigation.focuses,0);
});
test('mobile CSS suppresses the duplicate FAB only for the visa cabinet',()=>{
 const css=fs.readFileSync(path.join(app,'src/components/client-navigation.css'),'utf8');
 assert.match(css,/@media\(max-width:699px\)[\s\S]*\.account-shell:has\(\.visa-cabinet\) > \.support-fab,\s*html\[data-app-design\] \.app-shell:has\(\.visa-cabinet\) > \.app-content > \.support-fab \{ display: none; \}/);
 assert.match(css,/\.account-shell > \.client-bottom-nav \{ display: grid !important; \}/);
 assert.ok(!/\.app-shell > \.app-content > \.support-fab \{ display: none/.test(css));
});

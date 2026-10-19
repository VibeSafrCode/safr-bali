import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import test from 'node:test';import ts from 'typescript';
const app=path.resolve(import.meta.dirname,'..'),main=app+'/dist/assets',yoga=app+'/dist-yoga-mini-app/assets',ids=['e33g','d12','d1-d2','c1','voa'];
const files=root=>fs.readdirSync(root).filter(f=>f.endsWith('.js')),mainFiles=files(main),yogaFiles=files(yoga),packs=mainFiles.filter(f=>ids.some(id=>f.startsWith(id+'.v1-')));
const source=JSON.parse(fs.readFileSync(path.resolve(app,'../shared/content/client-ui/client-catalog-runtime.v1.json'),'utf8'));
test('Main emits exactly five full visa packs, all fifty source article identities retained',()=>{
 assert.equal(packs.length,5);for(const id of ids){const names=packs.filter(f=>f.startsWith(id+'.v1-'));assert.equal(names.length,1);const body=fs.readFileSync(main+'/'+names[0],'utf8');assert.ok(body.includes('client-visa-pack'));for(const article of source.articles.filter(a=>a.contentId===(id==='d1-d2'?'d1_d2':id))){assert.ok(body.includes(article.bodySha256));assert.ok(body.includes(article.metadataSha256));}}
});
test('Yoga emitted files exclude every Main article pack, not merely its import edges',()=>{
 assert.ok(!yogaFiles.some(f=>ids.some(id=>f.startsWith(id+'.v1-'))));const all=yogaFiles.map(f=>fs.readFileSync(yoga+'/'+f,'utf8')).join('\n');assert.ok(!all.includes('client-visa-pack'));assert.ok(!all.includes('client-catalog-cards'));
 // The pre-split Yoga catalog already has these two D12 RUEN provenance
 // references. Preserve them; prohibit all new full-pack article identities.
 assert.deepEqual(source.articles.filter(article=>all.includes(article.bodySha256)).map(a=>({contentId:a.contentId,locale:a.locale,bodySha256:a.bodySha256})),[
  {contentId:'d12',locale:'ru',bodySha256:'f7a60e363a5b21fb1809a20cac8089b67a6c5c27c01cc38e941e5e913838ff7e'},
  {contentId:'d12',locale:'en',bodySha256:'69d197157405ccd207092342a1f4f7274cedf2ea00f3e7aa8e817338b125d112'},
 ]);
});
test('Home and Catalog static dependency closures exclude all five article packs',()=>{
 const seenByRoute={};for(const entry of mainFiles.filter(f=>/^(HomeView|CatalogView)-/.test(f))){const seen=new Set();function walk(file){if(seen.has(file))return;seen.add(file);const ast=ts.createSourceFile(file,fs.readFileSync(main+'/'+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(ast.parseDiagnostics.length,0);for(const s of ast.statements)if((ts.isImportDeclaration(s)||ts.isExportDeclaration(s))&&s.moduleSpecifier){const id=s.moduleSpecifier.text;assert.ok(id.startsWith('./'));walk(path.posix.normalize(path.posix.join(path.posix.dirname(file),id)));}}walk(entry);for(const pack of packs)assert.ok(!seen.has(pack));seenByRoute[entry]=seen.size;}assert.equal(Object.keys(seenByRoute).length,2);
});
test('chosen full article pack imports no other article or application module',()=>{
 for(const file of packs){const ast=ts.createSourceFile(file,fs.readFileSync(main+'/'+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);function visit(n){assert.ok(!(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)&&n.moduleSpecifier||ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword));ts.forEachChild(n,visit);}visit(ast);}
});

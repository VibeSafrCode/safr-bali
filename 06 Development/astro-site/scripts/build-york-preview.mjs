import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir,copyFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import {previewBrand,previewHref,previewLocale} from '../../shared/src/preview-brand.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
assert.ok(process.argv.slice(2).every(arg=>arg==='--https-preview'),'Unknown preview build argument');
const basePath=process.argv.includes('--https-preview')?'/yoga-preview':'';
const output=path.join(root,basePath?'dist-yoga-https-preview':'dist-york-preview');
const brand=previewBrand('york-gangster');
const env={...process.env,SAFRWAY_PREVIEW_BRAND:brand.brandId,SAFRWAY_PREVIEW_BASE_PATH:basePath};
function run(args,cwd=root) {
  const result=spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',stdio:['ignore','pipe','inherit'],maxBuffer:4*1024*1024});
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.status!==0)throw new Error('Preview build failed: '+args[0]);
  return result.stdout??'';
}
// No catalog generation, API updater or production preview plugins are run.
// Shared inputs are imported directly, at the currently reconciled baseline.
const astroBuild=run(['node_modules/astro/bin/astro.mjs','build']);
const builtPages=Number(stripVTControlCharacters(astroBuild).match(/\[build\]\s+(\d+) page\(s\) built/)?.[1]);
assert.ok(builtPages>0,'Astro did not generate preview pages');
run(['node_modules/vite/bin/vite.js','build','--config','vite.york-preview.config.ts'],path.resolve(root,'../react-app'));

async function files(directory,{source=false}={}) {
  const entries=await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.filter(entry=>!source||!['.astro','node_modules'].includes(entry.name)).map(entry=>{
    if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))throw new Error('Unsupported preview input');
    return entry.isDirectory()?files(path.join(directory,entry.name),{source}):[path.join(directory,entry.name)];
  }))).flat();
}
function demoLink(href,locale) {
  if(/^https:\/\/t\.me\//i.test(href))return previewHref('/bot-demo/',locale);
  if(/^https:\/\/(app|api)\.safrway\.online(?:\/|$)/i.test(href)||/^\/(api|auth|mini|admin)(\/|$)/.test(href))return previewHref('/contacts/',locale);
  if(/^https:\/\/safrway\.online(?:\/|$)/i.test(href)) {
    try{return new URL(href).pathname;}catch{return previewHref('/contacts/',locale);}
  }
  if(/^\/(en\/)?account\/(login|profile)(\/|$)/.test(href))return previewHref('/account/',locale);
  return href;
}

const htmlFiles=(await files(output)).filter(file=>file.endsWith('.html'));
assert.equal(htmlFiles.length,builtPages,'Stale or extra HTML in preview output');
const downloads=new Set();
for(const file of htmlFiles) {
  const relative=path.relative(output,file).split(path.sep).join('/');
  const locale=previewLocale('/'+relative);
  const original=await readFile(file,'utf8');
  const safe=original.replace(/href=(['"])([^'"]*)\1/g,(_match,quote,href)=>'href='+quote+demoLink(href,locale)+quote);
  if(!safe.includes('data-preview-only="true"')||!safe.includes('noindex,nofollow,noarchive'))throw new Error('Missing preview boundary: '+relative);
  if(/rel=["']canonical|hreflang=|data-support-open|data-auth-|analytics-consent|<iframe|<form/.test(safe))throw new Error('Live public shell leaked into preview: '+relative);
  for(const link of safe.matchAll(/href=["'](\/downloads\/[^"']+\.pdf)["']/g))downloads.add(link[1]);
  const mounted=basePath?safe.replace(/(href|src)=(["'])(\/[^"']*)\2/g,(_match,key,quote,url)=>{
    assert.ok(!url.startsWith('//'),'Protocol-relative links are forbidden');
    return key+'='+quote+basePath+url+quote;
  }):safe;
  if(mounted!==original)await writeFile(file,mounted);
}
for(const download of downloads) {
  const publicRoot=await realpath(path.join(root,'public'));
  const source=await realpath(path.resolve(publicRoot,'.'+download));
  if(!source.startsWith(publicRoot+path.sep))throw new Error('Invalid shared download');
  const target=path.resolve(output,'.'+download);
  if(!target.startsWith(output+path.sep))throw new Error('Invalid preview download');
  await mkdir(path.dirname(target),{recursive:true});await copyFile(source,target);
}

const sourceFiles=[
  'content/generated/catalog-runtime.v1.json','content/generated/i18n/public.v1.json',
  'contracts/ecosystem-routes.v1.json','content/registry-public-build.v1.json',
  'content/registry-d1-d2-build.v1.json','content/service-registry.v1.json',
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const inputs=await Promise.all(sourceFiles.map(async file=>({source:'shared/'+file,sha256:sha(await readFile(path.resolve(root,'../shared',file)))})));
const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
if(revision.status!==0)throw new Error('Unable to record source revision');
const integrationFiles=[
  ...(await files(path.join(root,'src-york'),{source:true})),
  ...(await files(path.resolve(root,'../react-app/src/york-preview'),{source:true})),
  ...['astro.config.mjs','package.json','tsconfig.json','scripts/build-york-preview.mjs','scripts/serve-york-preview.mjs','scripts/check-york-preview.mjs','scripts/package-york-preview.mjs','scripts/verify-york-package.mjs'].map(file=>path.join(root,file)),
  ...['vite.york-preview.config.ts','tsconfig.york-preview.json'].map(file=>path.resolve(root,'../react-app',file)),
  path.resolve(root,'../shared/brands/preview-brands.v1.json'),path.resolve(root,'../shared/src/preview-brand.mjs'),
  path.resolve(root,'../deploy/nginx/yoga-closed-preview.conf.template'),
  path.resolve(root,'../deploy/nginx/yoga-preview-mount.conf.template'),
].sort();
// Generated Astro types belong to the isolated project root, not source inputs.
const sourceIntegrationFiles=integrationFiles.filter(file=>!path.relative(root,file).split(path.sep).includes('.astro'));
const integrationInputs=await Promise.all(sourceIntegrationFiles.map(async file=>({source:path.relative(path.resolve(root,'..'),file).split(path.sep).join('/'),sha256:sha(await readFile(file))})));
const status=spawnSync('git',['status','--porcelain','--',...integrationFiles.map(file=>path.relative(root,file))],{cwd:root,encoding:'utf8'});
if(status.status!==0)throw new Error('Unable to record preview worktree state');
const outputFiles=await Promise.all((await files(output)).filter(file=>path.basename(file)!=='preview-build.json').sort().map(async file=>{
  const bytes=await readFile(file);
  return {file:path.relative(output,file).split(path.sep).join('/'),size:bytes.length,sha256:sha(bytes)};
}));
await writeFile(path.join(output,'preview-build.json'),JSON.stringify({
  schemaVersion:1,brandId:brand.brandId,stage:'LOCAL_SYNTHETIC_PREVIEW',basePath,
  runtimeBaseline:'c890cae8064cb3104c776e5d32843a43d30d8bff',sourceHead:revision.stdout.trim(),
  includesUncommittedPreviewWork:Boolean(status.stdout.trim()),sourceTreeSha256:sha(JSON.stringify(integrationInputs)),generatedAt:new Date().toISOString(),
  htmlPages:htmlFiles.length,locales:brand.locales,inputs,integrationInputs,
  outputFiles,outputSha256:sha(JSON.stringify(outputFiles)),
  liveApi:false,telegram:false,authentication:false,ledger:false,migrations:false,
  pricing:'Canonical bindings reused; no live projection loaded, no copied prices or FX calculations',
},null,2)+'\n');
console.log(`York offline preview ready: ${htmlFiles.length} HTML pages; separate dist-york-preview; no upstream calls.`);

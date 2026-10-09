import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {regularFiles,sha256,verifyPackage,verifyArchive} from './verify-york-package.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));
const allowedExtensions=new Set(['.html','.css','.js','.json','.txt','.xml','.pdf']);

async function verifyCurrentInputs(receipt) {
  assert.equal(sha256(JSON.stringify(receipt.integrationInputs)),receipt.sourceTreeSha256,'Source input digest mismatch');
  for(const record of [...receipt.inputs,...receipt.integrationInputs]) {
    assert.ok(typeof record.source==='string'&&!record.source.includes('\\')&&!record.source.split('/').some(part=>part.startsWith('.')),'Unsafe input path');
    assert.ok(/^(?:astro-site\/(?:src-york\/|scripts\/|astro\.config\.mjs$|package\.json$|tsconfig\.json$)|react-app\/(?:src\/york-preview\/|vite\.york-preview\.config\.ts$|tsconfig\.york-preview\.json$)|shared\/(?:content\/|contracts\/|brands\/|src\/preview-brand\.mjs$)|deploy\/nginx\/yoga-(?:closed-preview|preview-mount)\.conf\.template$)/.test(record.source),'Unexpected preview input');
    const file=path.resolve(project,'..',record.source);
    assert.ok((await lstat(file)).isFile(),'Input must be a regular file');
    assert.equal(sha256(await readFile(file)),record.sha256,'Preview source changed; rebuild before packaging');
  }
}

export async function verifyPreviewOutput(directory) {
  assert.ok(!(await lstat(directory)).isSymbolicLink(),'Output cannot be a link');
  const receipt=JSON.parse(await readFile(path.join(directory,'preview-build.json'),'utf8'));
  assert.equal(receipt.brandId,'york-gangster');
  assert.equal(receipt.stage,'LOCAL_SYNTHETIC_PREVIEW');
  assert.ok(['','/yoga-preview'].includes(receipt.basePath??''),'Invalid build base path');
  assert.deepEqual(receipt.locales,['ru','en']);
  for(const key of ['liveApi','telegram','authentication','ledger','migrations'])assert.equal(receipt[key],false);
  assert.ok(Array.isArray(receipt.outputFiles)&&receipt.outputFiles.length>0,'Rebuild preview to record output checksums');
  assert.equal(sha256(JSON.stringify(receipt.outputFiles)),receipt.outputSha256,'Output manifest digest mismatch');
  const names=(await regularFiles(directory)).filter(file=>file!=='preview-build.json');
  assert.deepEqual(receipt.outputFiles.map(record=>record.file).sort(),names,'Output inventory changed');
  assert.equal(names.filter(file=>file.endsWith('.html')).length,receipt.htmlPages);
  assert.ok(receipt.htmlPages>0,'Empty preview');
  let total=0;
  for(const record of receipt.outputFiles) {
    assert.ok(names.includes(record.file)&&allowedExtensions.has(path.extname(record.file)),'Unsupported output file');
    const bytes=await readFile(path.join(directory,record.file));
    assert.equal(bytes.length,record.size,'Output size mismatch');
    assert.equal(sha256(bytes),record.sha256,'Output checksum mismatch');
    total+=bytes.length;
    assert.ok(bytes.length<=8*1024*1024&&total<=64*1024*1024,'Preview exceeds bounded package size');
    if(record.file.endsWith('.html')) {
      const html=bytes.toString('utf8');
      assert.match(html,/data-preview-only="true"/);
      assert.match(html,/noindex,nofollow,noarchive/);
      assert.doesNotMatch(html,/<iframe\b|<form\b|rel=["']canonical|hreflang=|src=["']https?:\/\//i);
      assert.doesNotMatch(html,/href=["']https:\/\/(?:t\.me|app\.safrway\.online|api\.safrway\.online)/i);
    }
  }
  assert.equal(await readFile(path.join(directory,'robots.txt'),'utf8'),'User-agent: *\nDisallow: /\n');
  assert.doesNotMatch(await readFile(path.join(directory,'sitemap.xml'),'utf8'),/<loc>/);
  return receipt;
}

export async function createPreviewPackage({output=path.join(project,'dist-york-preview'),artifacts=path.join(project,'.preview-artifacts')}={}) {
  const receipt=await verifyPreviewOutput(output);
  await verifyCurrentInputs(receipt);
  await mkdir(artifacts,{recursive:true});
  const directory=await mkdtemp(path.join(artifacts,'yoga-preview-'));
  for(const record of receipt.outputFiles) {
    const destination=path.join(directory,'site',record.file);
    await mkdir(path.dirname(destination),{recursive:true});
    await copyFile(path.join(output,record.file),destination);
  }
  await mkdir(path.join(directory,'evidence'));
  await copyFile(path.join(output,'preview-build.json'),path.join(directory,'evidence/build.json'));
  await mkdir(path.join(directory,'deploy'));
  await copyFile(path.resolve(project,'../deploy/nginx/yoga-closed-preview.conf.template'),path.join(directory,'deploy/nginx.conf.template'));
  await copyFile(path.resolve(project,'../deploy/nginx/yoga-preview-mount.conf.template'),path.join(directory,'deploy/mount.conf.template'));
  await mkdir(path.join(directory,'tools'));
  await copyFile(fileURLToPath(new URL('./verify-york-package.mjs',import.meta.url)),path.join(directory,'tools/verify.mjs'));
  const files=await Promise.all((await regularFiles(directory)).map(async file=>{
    const bytes=await readFile(path.join(directory,file));
    return {file,size:bytes.length,sha256:sha256(bytes)};
  }));
  const manifest={
    schemaVersion:1,brandId:receipt.brandId,displayName:'Yoga Ganster',stage:'INERT_PREVIEW_PACKAGE',
    sourceHead:receipt.sourceHead,sourceTreeSha256:receipt.sourceTreeSha256,
    runtimeBaseline:receipt.runtimeBaseline,buildOutputSha256:receipt.outputSha256,
    locales:receipt.locales,basePath:receipt.basePath??'',htmlPages:receipt.htmlPages,requiresPrivateHttpsGate:true,
    activated:false,totalBytes:files.reduce((sum,file)=>sum+file.size,0),files,
  };
  await writeFile(path.join(directory,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  await verifyPackage(directory);
  // Copy-time changes must not be promoted into a newly trusted manifest.
  for(const record of receipt.outputFiles) {
    const copied=files.find(file=>file.file==='site/'+record.file);
    assert.equal(copied?.sha256,record.sha256,'Output changed while packaging');
  }
  const archive=directory+'.tar.gz';
  // macOS otherwise adds hidden AppleDouble/xattr members which its own tar
  // silently omits during listing/extraction, unlike a Linux deployment.
  const packed=spawnSync('tar',['--format=ustar','-czf',archive,'-C',directory,'.'],{encoding:'utf8',env:{...process.env,COPYFILE_DISABLE:'1'}});
  assert.equal(packed.status,0,'Unable to create preview archive');
  await verifyArchive(archive,manifest);
  const result={archive:path.basename(archive),sha256:sha256(await readFile(archive)),htmlPages:receipt.htmlPages,files:files.length,sourceTreeSha256:receipt.sourceTreeSha256,buildOutputSha256:receipt.outputSha256,activated:false};
  await writeFile(archive+'.receipt.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  return {...result,directory,archive};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every(arg=>arg==='--https-preview'),'Unknown packaging argument');
  const options=process.argv.includes('--https-preview')?{output:path.join(project,'dist-yoga-https-preview')}:{};
  console.log(JSON.stringify(await createPreviewPackage(options),null,2));
}

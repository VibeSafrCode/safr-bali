import assert from 'node:assert/strict';
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
// Inspect raw transport bytes rather than platform tar's filtered listing.
// The preview uses short portable ustar names; links/PAX/hidden metadata are
// not needed and must not cross the deployment boundary.
export async function verifyArchive(archive,manifest) {
  const packed=await readFile(archive);
  assert.ok(packed.length<=64*1024*1024,'Archive exceeds size limit');
  const raw=gunzipSync(packed,{maxOutputLength:128*1024*1024});
  const expected=new Map(manifest.files.map(row=>[row.file,row]));
  expected.set('MANIFEST.json',null);
  const seen=new Set(),seenEntries=new Set();
  const field=(header,start,length)=>header.subarray(start,start+length).toString('utf8').replace(/\0.*$/s,'');
  let cursor=0,ended=false;
  while(cursor+512<=raw.length) {
    const header=raw.subarray(cursor,cursor+512);cursor+=512;
    if(header.every(byte=>byte===0)) {assert.ok(raw.subarray(cursor).every(byte=>byte===0),'Unexpected archive trailer');ended=true;break;}
    assert.ok(header.subarray(257,263).equals(Buffer.from('ustar\0'))&&header.subarray(263,265).equals(Buffer.from('00')),'Unsupported tar format');
    const checksumField=field(header,148,8).trim();
    assert.match(checksumField,/^[0-7]+$/,'Invalid tar header checksum');
    const checksum=header.reduce((sum,byte,index)=>sum+(index>=148&&index<156?32:byte),0);
    assert.equal(parseInt(checksumField,8),checksum,'Invalid tar header checksum');
    const prefix=field(header,345,155),leaf=field(header,0,100);
    let name=(prefix?prefix+'/'+leaf:leaf).replace(/^\.\//,'');
    const type=header[156],sizeField=field(header,124,12).trim();
    assert.match(sizeField,/^[0-7]+$/,'Unsupported archive size encoding');
    const size=parseInt(sizeField,8);
    assert.ok(Number.isSafeInteger(size)&&size<=8*1024*1024&&cursor+size<=raw.length,'Invalid archive member size');
    assert.ok([0,48,53].includes(type),'Links, metadata and special archive entries forbidden');
    if(type===53)name=name.replace(/\/$/,'');
    const entryName=name===''?'.':name;
    assert.ok(!seenEntries.has(entryName),'Duplicate archive entry');seenEntries.add(entryName);
    if(type===53) {
      assert.equal(size,0,'Directory carries bytes');
      assert.ok(name==='.'||name===''||(!name.split('/').some(part=>part.startsWith('.'))&&[...expected.keys()].some(file=>file.startsWith(name+'/'))),'Unsafe or unlisted archive directory');
    } else {
      assert.ok(expected.has(name)&&!seen.has(name),'Hidden, unlisted or duplicate archive member');
      const bytes=raw.subarray(cursor,cursor+size),record=expected.get(name);
      if(record){assert.equal(size,record.size,'Archive member size mismatch');assert.equal(sha256(bytes),record.sha256,'Archive member checksum mismatch');}
      else assert.deepEqual(JSON.parse(bytes.toString('utf8')),manifest,'Archived manifest differs');
      seen.add(name);
    }
    cursor+=Math.ceil(size/512)*512;
  }
  assert.ok(ended,'Missing archive end marker');
  assert.deepEqual([...seen].sort(),[...expected.keys()].sort(),'Archive inventory differs from manifest');
  return {files:seen.size,hiddenMetadata:false};
}
export async function regularFiles(directory,prefix='') {
  assert.ok((await lstat(directory)).isDirectory(),'Expected a real directory');
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    assert.ok(!entry.isSymbolicLink()&&(entry.isFile()||entry.isDirectory()),'Links and special files are forbidden');
    assert.ok(!entry.name.startsWith('.')&&!entry.name.includes('\\'),'Hidden files are forbidden');
    const relative=prefix+entry.name;
    if(entry.isDirectory())result.push(...await regularFiles(path.join(directory,entry.name),relative+'/'));
    else result.push(relative);
  }
  return result.sort();
}

export async function verifyPackage(directory) {
  assert.ok(!(await lstat(directory)).isSymbolicLink(),'Package root cannot be a link');
  const root=await realpath(directory);
  const manifest=JSON.parse(await readFile(path.join(root,'MANIFEST.json'),'utf8'));
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.brandId,'york-gangster');
  assert.equal(manifest.stage,'INERT_PREVIEW_PACKAGE');
  assert.deepEqual(manifest.locales,['ru','en']);
  assert.ok(['','/yoga-preview'].includes(manifest.basePath),'Invalid package base path');
  assert.equal(manifest.requiresPrivateHttpsGate,true);
  assert.equal(manifest.activated,false);
  assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0);
  const names=manifest.files.map(record=>record.file);
  assert.equal(new Set(names).size,names.length,'Duplicate package files');
  const actual=(await regularFiles(root)).filter(file=>file!=='MANIFEST.json');
  assert.deepEqual([...names].sort(),actual,'Package files differ from manifest');
  let total=0;
  for(const record of manifest.files) {
    assert.ok(/^[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9_-]+)+$/.test(record.file),'Unsafe package filename');
    assert.ok(!record.file.split('/').some(part=>part==='..'),'Unsafe package path');
    assert.ok(/^[a-f0-9]{64}$/.test(record.sha256),'Invalid digest');
    const bytes=await readFile(path.join(root,record.file));
    assert.equal(bytes.length,record.size,'Package size mismatch');
    assert.equal(sha256(bytes),record.sha256,'Package checksum mismatch');
    total+=bytes.length;
  }
  assert.equal(total,manifest.totalBytes);
  const receipt=JSON.parse(await readFile(path.join(root,'evidence/build.json'),'utf8'));
  assert.equal(receipt.schemaVersion,1);
  assert.equal(receipt.brandId,manifest.brandId);
  assert.equal(receipt.stage,'LOCAL_SYNTHETIC_PREVIEW');
  assert.deepEqual(receipt.locales,manifest.locales);
  assert.equal(receipt.basePath??'',manifest.basePath);
  assert.equal(receipt.htmlPages,manifest.htmlPages);
  assert.equal(receipt.sourceHead,manifest.sourceHead);
  assert.equal(receipt.runtimeBaseline,manifest.runtimeBaseline);
  assert.ok(Array.isArray(receipt.integrationInputs)&&receipt.integrationInputs.length>0);
  assert.ok(Array.isArray(receipt.outputFiles)&&receipt.outputFiles.length>0);
  assert.equal(sha256(JSON.stringify(receipt.integrationInputs)),receipt.sourceTreeSha256,'Source input digest mismatch');
  assert.equal(sha256(JSON.stringify(receipt.outputFiles)),receipt.outputSha256,'Build output digest mismatch');
  assert.equal(receipt.sourceTreeSha256,manifest.sourceTreeSha256);
  assert.equal(receipt.outputSha256,manifest.buildOutputSha256);
  for(const key of ['liveApi','telegram','authentication','ledger','migrations'])assert.equal(receipt[key],false);
  assert.ok(!names.includes('site/preview-build.json'),'Evidence must be outside the web root');
  const expectedSite=receipt.outputFiles.map(record=>({...record,file:'site/'+record.file}));
  assert.deepEqual(manifest.files.filter(record=>record.file.startsWith('site/')),expectedSite,'Package differs from recorded build');
  assert.deepEqual([...names].sort(),[...expectedSite.map(record=>record.file),'evidence/build.json','deploy/nginx.conf.template','deploy/mount.conf.template','tools/verify.mjs'].sort(),'Unexpected package layout');
  for(const [file,source] of [
    ['deploy/nginx.conf.template','deploy/nginx/yoga-closed-preview.conf.template'],
    ['deploy/mount.conf.template','deploy/nginx/yoga-preview-mount.conf.template'],
    ['tools/verify.mjs','astro-site/scripts/verify-york-package.mjs'],
  ]) {
    const pins=receipt.integrationInputs.filter(record=>record.source===source);
    assert.equal(pins.length,1,'Missing unique build pin');
    assert.equal(manifest.files.find(record=>record.file===file)?.sha256,pins[0].sha256,'Packaged tool differs from recorded source');
  }
  assert.equal(names.filter(file=>file.startsWith('site/')&&file.endsWith('.html')).length,manifest.htmlPages);
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const manifest=await verifyPackage(process.argv[2]??fileURLToPath(new URL('../',import.meta.url)));
  console.log(JSON.stringify({status:'PASS',brandId:manifest.brandId,htmlPages:manifest.htmlPages,files:manifest.files.length,privateHttpsGateRequired:true}));
}

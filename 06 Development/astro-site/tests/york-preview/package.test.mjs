import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import path from 'node:path';
import {createPreviewPackage,verifyPreviewOutput} from '../../scripts/package-york-preview.mjs';
import {regularFiles,sha256,verifyPackage,verifyArchive} from '../../scripts/verify-york-package.mjs';

async function temporary(t) {
  const root=await mkdtemp(path.join(tmpdir(),'yoga-package-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}

async function syntheticOutput(root) {
  const output=path.join(root,'output');await mkdir(output);
  const source={
    'index.html':'<html data-preview-only="true"><meta name="robots" content="noindex,nofollow,noarchive"></html>',
    'demo.js':'export const demo=1;',
    'robots.txt':'User-agent: *\nDisallow: /\n',
    'sitemap.xml':'<urlset></urlset>',
  };
  const outputFiles=[];
  for(const file of Object.keys(source).sort()) {
    const bytes=Buffer.from(source[file]);await writeFile(path.join(output,file),bytes);
    outputFiles.push({file,size:bytes.length,sha256:sha256(bytes)});
  }
  const receipt={brandId:'york-gangster',stage:'LOCAL_SYNTHETIC_PREVIEW',locales:['ru','en'],htmlPages:1,liveApi:false,telegram:false,authentication:false,ledger:false,migrations:false,outputFiles,outputSha256:sha256(JSON.stringify(outputFiles))};
  await writeFile(path.join(output,'preview-build.json'),JSON.stringify(receipt));
  return output;
}

test('preview archive survives isolated extraction and standalone verification',async t=>{
  const root=await temporary(t);
  const result=await createPreviewPackage({artifacts:path.join(root,'artifacts')});
  const extracted=path.join(root,'extracted');await mkdir(extracted);
  assert.equal(spawnSync('tar',['-xzf',result.archive,'-C',extracted]).status,0);
  const manifest=await verifyPackage(extracted);
  assert.equal(manifest.htmlPages,204);
  assert.equal(sha256(await readFile(result.archive)),result.sha256);
  assert.ok(!(await regularFiles(path.join(extracted,'site'))).includes('preview-build.json'));
  const standalone=spawnSync(process.execPath,['tools/verify.mjs','.'],{cwd:extracted,encoding:'utf8'});
  assert.equal(standalone.status,0,standalone.stderr);
  assert.equal(JSON.parse(standalone.stdout).status,'PASS');
  const template=await readFile(path.join(extracted,'deploy/nginx.conf.template'),'utf8');
  assert.match(template,/listen 127\.0\.0\.1:__PREVIEW_PORT__/);
  assert.match(template,/auth_basic_user_file __PREVIEW_AUTH_FILE__/);
  assert.match(template,/connect-src 'none'/);
  assert.doesNotMatch(template,/proxy_pass|auth_basic off|satisfy any/);
});

test('raw archive rejects hidden metadata, native-format disagreements and duplicate directories',async t=>{
  const root=await temporary(t);
  const result=await createPreviewPackage({artifacts:path.join(root,'artifacts')});
  const manifest=await verifyPackage(result.directory);
  assert.deepEqual(await verifyArchive(result.archive,manifest),{files:manifest.files.length+1,hiddenMetadata:false});
  const raw=gunzipSync(await readFile(result.archive));
  const header=Buffer.alloc(512);
  header.write('./site/._index.html',0);
  header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
  header.write('00000000000\0',124);header.write('00000000000\0',136);
  header.fill(32,148,156);header[156]=48;header.write('ustar\0',257);header.write('00',263);
  const sum=header.reduce((total,byte)=>total+byte,0);
  header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
  const unsafe=path.join(root,'metadata.tar.gz');
  await writeFile(unsafe,gzipSync(Buffer.concat([header,raw])));
  await assert.rejects(verifyArchive(unsafe,manifest),/Hidden, unlisted or duplicate archive member/);
  const wrongFormat=Buffer.from(raw);wrongFormat[257]=120;
  await writeFile(unsafe,gzipSync(wrongFormat));
  await assert.rejects(verifyArchive(unsafe,manifest),/Unsupported tar format/);
  const wrongChecksum=Buffer.from(raw);wrongChecksum[0]^=1;
  await writeFile(unsafe,gzipSync(wrongChecksum));
  await assert.rejects(verifyArchive(unsafe,manifest),/Invalid tar header checksum/);
  await writeFile(unsafe,gzipSync(Buffer.concat([raw.subarray(0,512),raw])));
  await assert.rejects(verifyArchive(unsafe,manifest),/Duplicate archive entry/);
});

test('preview packaging rejects bytes changed after build',async t=>{
  const output=await syntheticOutput(await temporary(t));
  await verifyPreviewOutput(output);
  await writeFile(path.join(output,'demo.js'),'export const demo=2;');
  await assert.rejects(verifyPreviewOutput(output),/checksum mismatch/);
});

test('preview packaging rejects hidden files and symbolic links',async t=>{
  const root=await temporary(t);const output=await syntheticOutput(root);
  await writeFile(path.join(output,'.env'),'synthetic fixture only');
  await assert.rejects(verifyPreviewOutput(output),/Hidden files/);
  await rm(path.join(output,'.env'));
  await symlink(path.join(output,'demo.js'),path.join(output,'linked.js'));
  await assert.rejects(verifyPreviewOutput(output),/Links and special files/);
});

test('package verification rejects tampering and unlisted files',async t=>{
  const root=await temporary(t);
  const result=await createPreviewPackage({artifacts:path.join(root,'artifacts')});
  const html=path.join(result.directory,'site/index.html');
  const original=await readFile(html);
  await writeFile(html,Buffer.concat([original,Buffer.from('tampered')]));
  await assert.rejects(verifyPackage(result.directory),/size mismatch|checksum mismatch/);
  await writeFile(html,original);
  await writeFile(path.join(result.directory,'unexpected.json'),'{}');
  await assert.rejects(verifyPackage(result.directory),/differ from manifest/);
});

test('package checksums cannot disguise a different build or changed source pins',async t=>{
  const root=await temporary(t);
  const result=await createPreviewPackage({artifacts:path.join(root,'artifacts')});
  const manifestPath=path.join(result.directory,'MANIFEST.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const receiptPath=path.join(result.directory,'evidence/build.json');
  const original=await readFile(receiptPath);
  const receipt=JSON.parse(original);
  receipt.integrationInputs[0].sha256='0'.repeat(64);
  const altered=Buffer.from(JSON.stringify(receipt));
  await writeFile(receiptPath,altered);
  const record=manifest.files.find(file=>file.file==='evidence/build.json');
  manifest.totalBytes+=altered.length-record.size;
  record.size=altered.length;record.sha256=sha256(altered);
  await writeFile(manifestPath,JSON.stringify(manifest));
  await assert.rejects(verifyPackage(result.directory),/Source input digest mismatch/);
  await writeFile(receiptPath,original);
  manifest.totalBytes+=original.length-record.size;record.size=original.length;record.sha256=sha256(original);
  const htmlPath=path.join(result.directory,'site/index.html');
  const before=await readFile(htmlPath,'utf8');
  const changed=Buffer.from(before.replace('Yoga Ganster','Yoga Ganstrr'));
  assert.notEqual(changed.toString(),before);
  await writeFile(htmlPath,changed);
  const htmlRecord=manifest.files.find(file=>file.file==='site/index.html');
  manifest.totalBytes+=changed.length-htmlRecord.size;htmlRecord.size=changed.length;htmlRecord.sha256=sha256(changed);
  await writeFile(manifestPath,JSON.stringify(manifest));
  await assert.rejects(verifyPackage(result.directory),/differs from recorded build/);
});

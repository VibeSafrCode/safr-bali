// Private byte transport only: no equivalence/provenance/QA/publication certificate.
// Public APIs always derive the exact240 bindings from independently fixed
// owner-public source-manifest anchors. Consumers/CI/release remain separate.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const CONTENT_ROOT=fileURLToPath(new URL('../../shared/content/',import.meta.url));
const MAX_FILE=8*1024*1024,MAX_TOTAL=64*1024*1024,MAX_METADATA=2*1024*1024,MAX_FILES=10000;
const uid=()=>process.getuid();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
const compact=value=>Buffer.from(JSON.stringify(value),'utf8');
const order=rows=>[...rows].sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
const LOCALES=['ar','de','en','es','fr','hi','ja','ko','ru','zh-Hans'];
export const PRIVATE_EDITORIAL_SOURCE_ANCHORS=Object.freeze([
  Object.freeze({file:'registry-business-build.v1.json',sha256:'c976b403300fd518f2440f9bc2373e435f11dd3b4da32a5074dd941fea128496',field:'sourceMarkdownFile',hashField:'sourceMarkdownSha256',group:'business'}),
  Object.freeze({file:'registry-documents-build.v1.json',sha256:'9fe047020fe59c8f0c0edd31cdbdd728b37a9224b1dfba10137284ecc0b0e671',field:'sourceMarkdownFile',hashField:'sourceMarkdownSha256',group:'documents'}),
  Object.freeze({file:'registry-ready-editorial-build.v1.json',sha256:'af322a2729e5ec697e06bb06a229471746bba62652de485fdfc870346e780703',field:'sourceFile',hashField:'sourceFileSha256',group:'ready'}),
  Object.freeze({file:'registry-working-build.v1.json',sha256:'d01eeeb25554863864eaee440922aead1a9600a8c449fc3e4833b1467215fb2c',field:'sourceMarkdownFile',hashField:'sourceMarkdownSha256',group:'working'}),
]);

export class PrivateEditorialInputError extends Error {
  constructor(code){super(code);this.name='PrivateEditorialInputError';this.code=code;}
}
const requireInput=(ok,code)=>{if(!ok)throw new PrivateEditorialInputError(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fingerprint=s=>({dev:String(s.dev),ino:String(s.ino),mode:Number(s.mode),uid:Number(s.uid),
  nlink:Number(s.nlink),size:Number(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs)});
const facts=file=>fs.lstatSync(file,{bigint:true});
const utf8=bytes=>{try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new PrivateEditorialInputError('INVALID_UTF8');}return bytes;};
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value),expected);
function relativeFile(file){
  requireInput(typeof file==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(file)&&
    path.posix.normalize(file)===file&&!file.split('/').some(p=>!p||p.startsWith('.'))&&
    file.split('/').length<=32,'INVALID_RELATIVE_INPUT_PATH');
  return file;
}
function canonicalRoot(root,{privateRoot=false}={}){
  const original=root instanceof URL?fileURLToPath(root):root;
  requireInput(typeof original==='string'&&path.isAbsolute(original),'ABSOLUTE_INPUT_ROOT_REQUIRED');
  const absolute=path.resolve(original);
  requireInput(fs.realpathSync(absolute)===absolute,'INPUT_ROOT_ALIAS');
  const s=facts(absolute),mode=Number(s.mode)&0o777;
  requireInput(s.isDirectory()&&Number(s.uid)===uid()&&!(mode&0o022),'UNPROTECTED_INPUT_ROOT');
  if(privateRoot){
    requireInput((Number(s.mode)&0o7777)===0o700,'PRIVATE_INPUT_ROOT_MODE');
    requireInput(![path.parse(absolute).root,os.homedir(),process.cwd(),path.resolve(CONTENT_ROOT),fs.realpathSync(os.tmpdir())].includes(absolute),'BROAD_PRIVATE_INPUT_ROOT');
  }
  return absolute;
}
function confined(root,file,{privateRoot=false}={}){
  relativeFile(file);
  const absolute=path.resolve(root,...file.split('/'));
  requireInput(absolute.startsWith(root+path.sep),'INPUT_PATH_ESCAPE');
  requireInput(fs.realpathSync(absolute)===absolute,'INPUT_PATH_ALIAS');
  let parent=path.dirname(absolute);
  while(parent===root||parent.startsWith(root+path.sep)){
    const s=facts(parent),mode=Number(s.mode)&0o777;
    requireInput(s.isDirectory()&&!s.isSymbolicLink()&&Number(s.uid)===uid()&&!(mode&0o022),'UNPROTECTED_INPUT_ANCESTOR');
    if(privateRoot)requireInput((Number(s.mode)&0o7777)===0o700,'PRIVATE_INPUT_DIRECTORY_MODE');
    if(parent===root)break;
    parent=path.dirname(parent);
  }
  return absolute;
}
function readPinned(root,file,{expectedSha256,privateRoot=false,limit=MAX_FILE}={}){
  const absolute=confined(root,file,{privateRoot}),before=facts(absolute);
  requireInput(before.isFile()&&!before.isSymbolicLink()&&Number(before.nlink)===1&&Number(before.uid)===uid()&&
    !(Number(before.mode)&0o022)&&Number(before.size)<=limit,'UNPROTECTED_INPUT_FILE');
  if(privateRoot)requireInput((Number(before.mode)&0o7777)===0o600,'PRIVATE_INPUT_FILE_MODE');
  if(expectedSha256!==undefined)requireInput(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256),'INVALID_EXPECTED_INPUT_HASH');
  const fd=fs.openSync(absolute,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    requireInput(same(fingerprint(fs.fstatSync(fd,{bigint:true})),fingerprint(before)),'INPUT_FILE_CHANGED');
    const buffer=Buffer.alloc(Number(before.size)+1);let length=0;
    while(length<buffer.length){const n=fs.readSync(fd,buffer,length,buffer.length-length,null);if(n===0)break;length+=n;}
    requireInput(length===Number(before.size)&&same(fingerprint(fs.fstatSync(fd,{bigint:true})),fingerprint(before))&&
      same(fingerprint(facts(absolute)),fingerprint(before))&&fs.realpathSync(absolute)===absolute,'INPUT_FILE_CHANGED');
    const bytes=buffer.subarray(0,length);
    requireInput(expectedSha256===undefined||sha(bytes)===expectedSha256,'INPUT_HASH_CHANGED');
    return {bytes:utf8(bytes),fingerprint:fingerprint(before),absolute};
  }finally{fs.closeSync(fd);}
}
function safe(operation){
  try{return operation();}catch(error){
    if(error instanceof PrivateEditorialInputError)throw error;
    throw new PrivateEditorialInputError(error.code==='ENOENT'?'INPUT_MISSING':error.code??'INPUT_OPERATION_FAILED');
  }
}

export function derivePrivateEditorialBindings({contentRoot=CONTENT_ROOT}={}){
  return safe(()=>{
    const root=canonicalRoot(contentRoot),files=[],seen=new Set(),manifests=[],snapshots=[];
    for(const anchor of PRIVATE_EDITORIAL_SOURCE_ANCHORS){
      const read=readPinned(root,anchor.file,{expectedSha256:anchor.sha256,limit:MAX_METADATA});
      const manifest=JSON.parse(read.bytes.toString('utf8'));
      requireInput(same(read.bytes,json(manifest))&&manifest.schemaVersion===1&&Array.isArray(manifest.records)&&manifest.records.length===6,'ANCHORED_MANIFEST_SHAPE');
      const identities=new Set();let count=0;
      for(const record of manifest.records){
        requireInput(typeof record.contentId==='string'&&!identities.has(record.contentId)&&
          same(Object.keys(record.locales??{}).sort(),LOCALES),'ANCHORED_MANIFEST_SCOPE');identities.add(record.contentId);
        for(const pin of Object.values(record.locales)){
          const file=relativeFile(pin[anchor.field]),digest=pin[anchor.hashField];
          requireInput(typeof digest==='string'&&/^[a-f0-9]{64}$/.test(digest)&&!seen.has(file),'PRIVATE_BINDING_DUPLICATE_OR_INVALID');
          requireInput(anchor.group==='ready'?/^registry-copy\/[a-z0-9_-]+\.source\.json$/.test(file):
            file.startsWith('registry-copy/'+anchor.group+'_source_pack/')&&file.endsWith('.md'),'PRIVATE_BINDING_SCOPE');
          seen.add(file);files.push(Object.freeze({file,sha256:digest}));count++;
        }
      }
      requireInput(count===60,'PRIVATE_GROUP_COUNT');
      manifests.push(Object.freeze({file:anchor.file,sha256:anchor.sha256}));
      snapshots.push(Object.freeze({file:anchor.file,fingerprint:read.fingerprint}));
    }
    requireInput(files.length===240,'PRIVATE_BINDING_COUNT');
    const result=Object.freeze({files:Object.freeze(order(files)),sourceManifestPins:Object.freeze(order(manifests)),
      bindingSha256:sha(compact(order(files))),contentRoot:root,manifestSnapshots:Object.freeze(snapshots)});
    return result;
  });
}
function assertAnchorsUnchanged(inventory){
  for(const row of inventory.manifestSnapshots){
    const absolute=confined(inventory.contentRoot,row.file);
    requireInput(same(fingerprint(facts(absolute)),row.fingerprint),'ANCHORED_MANIFEST_CHANGED');
  }
}
function bundleManifest(rows,pins){
  return {schemaVersion:1,kind:'SAFRWAY_PRIVATE_EDITORIAL_INPUT_BUNDLE',sourceManifestPins:order(pins),files:order(rows)};
}
function manifestContract(bytes,expected){
  const manifest=JSON.parse(utf8(bytes).toString('utf8'));
  requireInput(keys(manifest,['schemaVersion','kind','sourceManifestPins','files'])&&manifest.schemaVersion===1&&
    manifest.kind==='SAFRWAY_PRIVATE_EDITORIAL_INPUT_BUNDLE'&&same(bytes,json(manifest)),'PRIVATE_BUNDLE_MANIFEST_SHAPE');
  requireInput(same(manifest.sourceManifestPins,order(expected.sourceManifestPins)),'PRIVATE_BUNDLE_ANCHORS_CHANGED');
  requireInput(Array.isArray(manifest.files)&&manifest.files.length===expected.files.length&&manifest.files.length<=MAX_FILES,'PRIVATE_BUNDLE_MEMBERSHIP');
  const wanted=new Map(expected.files.map(row=>[row.file,row.sha256])),seen=new Set();let total=0;
  for(const row of manifest.files){
    requireInput(keys(row,['file','sha256','size']),'PRIVATE_BUNDLE_FILE_SHAPE');relativeFile(row.file);
    requireInput(!seen.has(row.file)&&wanted.has(row.file)&&wanted.get(row.file)===row.sha256,'PRIVATE_BUNDLE_MEMBERSHIP');seen.add(row.file);
    requireInput(Number.isSafeInteger(row.size)&&row.size>=0&&row.size<=MAX_FILE,'PRIVATE_BUNDLE_SIZE');total+=row.size;
  }
  requireInput(same(manifest.files,order(manifest.files))&&total<=MAX_TOTAL,'PRIVATE_BUNDLE_ORDER_OR_TOTAL');
  return {manifest,total};
}
function privateTree(root,maxEntries){
  const files=new Map(),directories=new Map();let entries=0;
  function visit(directory,relative){
    const before=facts(directory);
    requireInput(before.isDirectory()&&!before.isSymbolicLink()&&Number(before.uid)===uid()&&(Number(before.mode)&0o7777)===0o700,'PRIVATE_INPUT_DIRECTORY_MODE');
    requireInput(fs.realpathSync(directory)===directory,'INPUT_PATH_ALIAS');directories.set(directory,fingerprint(before));
    for(const item of fs.readdirSync(directory,{withFileTypes:true})){
      requireInput(++entries<=maxEntries&&!item.name.startsWith('.'),'PRIVATE_BUNDLE_TREE_LIMIT_OR_HIDDEN');
      const file=relative?relative+'/'+item.name:item.name;relativeFile(file);
      const absolute=path.join(directory,item.name);
      requireInput(!item.isSymbolicLink(),'PRIVATE_BUNDLE_SYMLINK');
      if(item.isDirectory())visit(absolute,file);
      else{requireInput(item.isFile(),'PRIVATE_BUNDLE_SPECIAL');files.set(file,fingerprint(facts(absolute)));}
    }
    requireInput(same(fingerprint(facts(directory)),fingerprint(before)),'PRIVATE_BUNDLE_DIRECTORY_CHANGED');
  }
  visit(root,'');
  return {files,directories};
}
function assertBundleUnchanged(state){
  requireInput(canonicalRoot(state.root,{privateRoot:true})===state.root,'INPUT_ROOT_ALIAS');
  for(const [absolute,before] of state.directories)requireInput(same(fingerprint(facts(absolute)),before)&&fs.realpathSync(absolute)===absolute,'PRIVATE_BUNDLE_DRIFT');
  for(const [file,before] of state.files)requireInput(same(fingerprint(facts(path.join(state.root,file))),before),'PRIVATE_BUNDLE_DRIFT');
}
function verifyByteBundle(directory,expected){
  const root=canonicalRoot(directory,{privateRoot:true});
  const read=readPinned(root,'manifest.json',{privateRoot:true,limit:MAX_METADATA});
  const {manifest,total}=manifestContract(read.bytes,expected);
  const tree=privateTree(root,(manifest.files.length+1)*32);
  const wanted=['manifest.json',...manifest.files.map(row=>'files/'+row.file)].sort();
  requireInput(same([...tree.files.keys()].sort(),wanted),'PRIVATE_BUNDLE_MEMBERSHIP');
  const wantedDirs=new Set([root]);
  for(const row of manifest.files){
    let parent=path.dirname(path.join(root,'files',row.file));
    while(parent!==root){wantedDirs.add(parent);parent=path.dirname(parent);}
    const input=readPinned(root,'files/'+row.file,{privateRoot:true,expectedSha256:row.sha256});
    requireInput(input.bytes.length===row.size,'PRIVATE_BUNDLE_SIZE_CHANGED');
  }
  requireInput(same([...tree.directories.keys()].sort(),[...wantedDirs].sort()),'PRIVATE_BUNDLE_EXTRA_DIRECTORY');
  const state={root,manifest,total,manifestSha256:sha(read.bytes),files:tree.files,directories:tree.directories};
  assertBundleUnchanged(state);
  return state;
}
function readBundleFile(state,file){
  relativeFile(file);assertBundleUnchanged(state);
  const pin=state.manifest.files.find(row=>row.file===file);
  requireInput(pin,'PRIVATE_BUNDLE_INPUT_NOT_BOUND');
  const input=readPinned(state.root,'files/'+file,{privateRoot:true,expectedSha256:pin.sha256});
  requireInput(input.bytes.length===pin.size,'PRIVATE_BUNDLE_SIZE_CHANGED');assertBundleUnchanged(state);
  return input.bytes;
}
function fsyncDirectory(directory){const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function writeExclusive(file,bytes){
  const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fsyncDirectory(path.dirname(file));
}
function prepareByteBundle(sourceRoot,expected){
  const source=canonicalRoot(sourceRoot),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'safr-private-editorial-inputs-'));
  fs.chmodSync(root,0o700);const rows=[];let total=0;
  for(const row of order(expected.files)){
    const read=readPinned(source,row.file,{expectedSha256:row.sha256});total+=read.bytes.length;
    requireInput(total<=MAX_TOTAL,'PRIVATE_BUNDLE_TOTAL_LIMIT');
    const target=path.join(root,'files',row.file),parents=[];let parent=path.dirname(target);
    while(parent!==root){parents.push(parent);parent=path.dirname(parent);}
    for(const directory of parents.reverse()){
      if(!fs.existsSync(directory)){fs.mkdirSync(directory,{mode:0o700});fs.chmodSync(directory,0o700);fsyncDirectory(path.dirname(directory));}
      requireInput((Number(facts(directory).mode)&0o777)===0o700&&fs.realpathSync(directory)===directory,'PRIVATE_INPUT_DIRECTORY_MODE');
    }
    writeExclusive(target,read.bytes);rows.push({file:row.file,sha256:row.sha256,size:read.bytes.length});
  }
  writeExclusive(path.join(root,'manifest.json'),json(bundleManifest(rows,expected.sourceManifestPins)));fsyncDirectory(root);
  return verifyByteBundle(root,expected);
}

export function verifyPrivateEditorialBundle(directory,{contentRoot=CONTENT_ROOT}={}){
  return safe(()=>{
    const inventory=derivePrivateEditorialBindings({contentRoot}),state=verifyByteBundle(directory,inventory);assertAnchorsUnchanged(inventory);
    return {manifestSha256:state.manifestSha256,fileCount:state.manifest.files.length,totalBytes:state.total,bindingSha256:inventory.bindingSha256};
  });
}
export function preparePrivateEditorialBundle({contentRoot=CONTENT_ROOT}={}){
  return safe(()=>{
    const inventory=derivePrivateEditorialBindings({contentRoot}),state=prepareByteBundle(inventory.contentRoot,inventory);assertAnchorsUnchanged(inventory);
    return {root:state.root,manifestSha256:state.manifestSha256,fileCount:state.manifest.files.length,totalBytes:state.total,bindingSha256:inventory.bindingSha256};
  });
}
function looksLikeUnboundPrivate(file,bindings){
  return bindings.some(row=>row.file.toLowerCase()===file.toLowerCase())||
    /^registry-copy\/(?:documents|business|working)_source_pack\/.+\.md$/i.test(file)||
    /^registry-copy\/(?:student|retirement|second_home|knowledge_student_documents|knowledge_retirement_e33f_vs_e33e|knowledge_second_home_requirements)_.+\.source\.json$/i.test(file);
}
export function createEditorialInputResolver({contentRoot=CONTENT_ROOT,privateRoot=process.env.SAFR_PRIVATE_EDITORIAL_INPUT_ROOT}={}){
  return safe(()=>{
    const inventory=derivePrivateEditorialBindings({contentRoot}),bindings=new Map(inventory.files.map(row=>[row.file,row.sha256]));
    const state=privateRoot===undefined?null:verifyByteBundle(privateRoot,inventory);
    return file=>safe(()=>{
      relativeFile(file);assertAnchorsUnchanged(inventory);
      if(bindings.has(file))return state?readBundleFile(state,file):readPinned(inventory.contentRoot,file,{expectedSha256:bindings.get(file)}).bytes;
      requireInput(!looksLikeUnboundPrivate(file,inventory.files),'UNBOUND_PRIVATE_INPUT_SELECTOR');
      return readPinned(inventory.contentRoot,file).bytes;
    });
  });
}
let defaultResolver,defaultRoot;
export function readEditorialInput(file){
  const configured=process.env.SAFR_PRIVATE_EDITORIAL_INPUT_ROOT;
  if(!defaultResolver||configured!==defaultRoot){defaultResolver=createEditorialInputResolver({privateRoot:configured});defaultRoot=configured;}
  return defaultResolver(file);
}

// Generic byte-pinning primitives for isolated synthetic FS tests. These do not
// derive accepted source bindings or approve provenance; production resolver,
// prepare/verify APIs above never accept replacement manifests/anchors/inventory.
export const privateEditorialBytePrimitives=Object.freeze({verifyByteBundle:(root,expected)=>safe(()=>verifyByteBundle(root,expected)),
  prepareByteBundle:(source,expected)=>safe(()=>prepareByteBundle(source,expected)),readBundleFile:(state,file)=>safe(()=>readBundleFile(state,file)),
  readPinned:(root,file,options)=>safe(()=>readPinned(canonicalRoot(root),file,options)),manifestContract:(bytes,expected)=>safe(()=>manifestContract(bytes,expected))});

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);let result;
    if(args.length===0||same(args,['--plan'])){const inventory=derivePrivateEditorialBindings();result={mode:'READ_ONLY_PLAN',fileCount:inventory.files.length,manifestCount:inventory.sourceManifestPins.length,bindingSha256:inventory.bindingSha256,prepared:false};}
    else if(same(args,['--prepare']))result={mode:'PRIVATE_BYTE_BUNDLE_PREPARED',...preparePrivateEditorialBundle()};
    else if(args.length===2&&args[0]==='--verify')result={mode:'READ_ONLY_BUNDLE_VERIFY',...verifyPrivateEditorialBundle(args[1])};
    else throw new PrivateEditorialInputError('CLI_USAGE');
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){process.stderr.write(JSON.stringify({mode:'REFUSED',code:error.code??'PRIVATE_INPUT_FAILED'})+'\n');process.exitCode=1;}
}

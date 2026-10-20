import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');

// Independently fixed chain: original child26 83d4c78... + the two existing
// additive354 edits = d16310c...; exactly four later test-loader imports/stubs
// yielded515ba041 in published0889167 and the accepted TSX V8 snapshot.
// No component, referral assertion, baseline pin or runtime byte is changed.
export function restoreChildTestBeforeYogaImports(source:string):string{
 assert.equal(typeof source,'string','Plain source text required');
 assert.equal(sha(source),'515ba041813e34e79d69b8d909dd56d06e4301f2ec89312000fc65008646e134','Exact independently accepted child test source');
 for(const line of [
  'import {presentationCopy} from "../src/ui/presentation-copy";\n',
  'import * as yogaRuntime from "../src/runtime/yoga-mini-app";\n',
  '    if(specifier==="../ui/presentation-copy")return {presentationCopy};\n',
  '    if(specifier==="../runtime/yoga-mini-app")return yogaRuntime;\n',
 ]){assert.equal(source.split(line).length,2,'Exactly one accepted loader insertion');source=source.replace(line,'');}
 assert.equal(sha(source),'d16310c10824bb17bbff9393a232e739451b3eba6d0cbd9043711da0214e205e','Exact original child26 plus only two354 edits');
 return source;
}

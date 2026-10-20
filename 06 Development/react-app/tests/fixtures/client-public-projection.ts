import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PUBLIC_CLIENT_PROJECTION_SHA256='8e8e57d9d360d4395144d790ee99547b6b13b85aa6b34a437f238e24e62bdea5';
const raw=fs.readFileSync(new URL('./client-public-projection.json',import.meta.url));
assert.equal(createHash('sha256').update(raw).digest('hex'),PUBLIC_CLIENT_PROJECTION_SHA256);
type Values=Record<string,string>;
export const publicClientProjection=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw)) as {
 schemaVersion:number;contract:string;locales:string[];visaLifeEntries:Record<string,Values>;
 supplementKeys:string[];externalKeys:string[];countRows:{key:string;placeholder:string;values:Record<string,Values>}[];
 staleWaiting:{key:string;values:Values};
};
assert.deepEqual(Object.keys(publicClientProjection),['schemaVersion','contract','locales','visaLifeEntries','countRows','staleWaiting','externalKeys','supplementKeys']);
assert.equal(publicClientProjection.schemaVersion,1);assert.equal(publicClientProjection.contract,'PUBLIC_DERIVATIVE');
assert.deepEqual(publicClientProjection.locales,['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
assert.equal(Object.keys(publicClientProjection.visaLifeEntries).length,178);assert.equal(publicClientProjection.supplementKeys.length,113);
assert.equal(new Set(publicClientProjection.supplementKeys).size,113);assert.equal(publicClientProjection.countRows.length,4);
assert.equal(publicClientProjection.externalKeys.length,38);assert.equal(new Set(publicClientProjection.externalKeys).size,38);
// Public customer literals only. Native responses/IDs/source plans stay private;
// their unchanged test modules remain a separate mandatory same-candidate gate.

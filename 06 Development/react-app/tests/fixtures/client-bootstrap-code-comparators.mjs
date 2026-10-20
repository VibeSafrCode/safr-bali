import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const raw=fs.readFileSync(new URL('./client-bootstrap-code-comparators.json',import.meta.url));
assert.equal(sha(raw),'77555832deffa3fd92816a504380ab930d089b654ba43cc4be59fe64124e54cb');
const pins={
 main:'e76c9d0fb5d73a3b88a90433c605b375a41e95a18ed3cb9eee7ccbd73df3a92c',
 pwa:'8294d6420c51374b4e4725c66867935d82d78d6c37d7d87caa669791bb37e080',
 bindings:'8913a18609594956f952e0b608f354fabc4d6bddbbbd19f95f964b75d0085cef',
 account:'eb453837fff3a77319b02f63dfee672c62469dc801e25c27e4676508d9e0b837',
 calculator:'2d317033a156fdcfef6fd045c07204e6f31d7d3911b52c2e2b713c11467d10f8',
};
const data=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
assert.deepEqual(Object.keys(data),['schemaVersion','rows']);assert.equal(data.schemaVersion,1);
assert.deepEqual(data.rows.map(row=>row.id),Object.keys(pins));
for(const row of data.rows){
 assert.deepEqual(Object.keys(row),['id','sha256','source']);assert.equal(typeof row.source,'string');
 assert.equal(row.sha256,pins[row.id]);assert.equal(sha(row.source),row.sha256);
}
export const CLIENT_BOOTSTRAP_COMPARATOR_IDS=Object.freeze(Object.keys(pins));
// Five whole independently fixed public-code predecessors only. No generated
// old graph, filesystem locations, private receipts or candidate-derived oracle.
export function clientBootstrapCodeComparator(id){
 assert(typeof id==='string'&&Object.hasOwn(pins,id),'Known public bootstrap comparator required');
 const row=data.rows.find(row=>row.id===id);assert(row);return row.source;
}

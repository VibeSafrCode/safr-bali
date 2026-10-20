import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const raw=fs.readFileSync(new URL('./client-code-comparators.json',import.meta.url));
assert.equal(sha(raw),'227c72cf321b65a77e2b68cfe6ac52c4279c0d938dd1ba21c48347514156f8b9');
const pins={historical343:'f997296da50cefadc35d62a9e7a0d10c09961c6165ef36e64e2424a174d534a8',historicalChild26:'83d4c78aee49b9a10a3fe203a40b128f81b110407d9af70fe4365a0c0b6700ea',pricing283:'b1bcb3e15efbbdf5dad089397dd493cd84857417c0ba7c4170ca6d86c395def7'};
const data=JSON.parse(raw.toString('utf8')) as {schemaVersion:number;rows:{id:keyof typeof pins;file:string;sha256:string;source:string}[]};
assert.deepEqual(Object.keys(data),['schemaVersion','rows']);assert.equal(data.schemaVersion,1);
assert.deepEqual(data.rows.map(row=>row.id),Object.keys(pins));
for(const row of data.rows){assert.equal(row.sha256,pins[row.id]);assert.equal(sha(row.source),row.sha256);}
// Entire independent public-code predecessors, not originals reconstructed from
// the candidate or a current checkout selected by an environment variable.
export function clientCodeComparator(id:keyof typeof pins):string{
 const row=data.rows.find(row=>row.id===id);assert.ok(row,'Known comparator');return row.source;
}

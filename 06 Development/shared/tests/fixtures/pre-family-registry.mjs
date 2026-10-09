import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const contentRoot=new URL('../../content/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const registryBytes=registry=>Buffer.from(JSON.stringify(registry,null,2)+'\n');
const readFixture=(file,hash)=>{
  const bytes=readFileSync(new URL('registry-copy/'+file,contentRoot));
  assert.equal(sha(bytes),hash,'Exact approved pre-import fixture: '+file);
  return JSON.parse(bytes);
};
const partners=readFixture('partners_b2b_preimport_registry_records.json','6d320f72d7eb5ad816d01e0d95913ba3d1663a3d377566b8556bc3ac99151e9c');
const family=readFixture('family_kitas_preimport_registry_records.json','54e12507b3aa37703b4214f88489cf566583b3f03dd5ebd8c5b31187530ff635');

// Replay the older importers against exact approved historical bytes, not a
// permissive current Registry or synthetic records with reset approval flags.
export function restorePreFamilyRegistry(current) {
  assert.equal(current.records.length,153);
  assert.equal(partners.schemaVersion,1);assert.equal(partners.sourceRegistryRecordCount,153);
  assert.equal(partners.sourceRegistrySha256,'c688e475b29bbcca02bb56d34b4732d368580d5928c4cc19f12916e8d7d829f3');
  assert.deepEqual(partners.removeAddedContentIds,[]);assert.deepEqual(partners.records.map(r=>r.contentId),['partners']);
  assert.equal(family.schemaVersion,1);assert.equal(family.sourceRegistryRecordCount,152);
  assert.equal(family.sourceRegistrySha256,'475c94f82d3a583bef640e53d88de0c80ddd00d28404ff18c4bdd12aceb067cc');
  assert.deepEqual(family.removeAddedContentIds,['knowledge_family_documents']);
  assert.deepEqual(family.records.map(r=>r.contentId),['family','family_spouse','family_child','family_parent']);
  const previous=structuredClone(current);
  for(const [fixture,label] of [[partners,'Partners pre-import153'],[family,'Family pre-import152']]) {
    const replacements=new Map(fixture.records.map(r=>[r.contentId,r]));
    previous.records=previous.records.filter(r=>!fixture.removeAddedContentIds.includes(r.contentId))
      .map(r=>structuredClone(replacements.get(r.contentId)??r));
    assert.equal(previous.records.length,fixture.sourceRegistryRecordCount);
    assert.equal(sha(registryBytes(previous)),fixture.sourceRegistrySha256,
      'Only the exact authorized replacements/addition may differ from '+label);
  }
  return previous;
}

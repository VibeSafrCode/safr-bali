// Finite reconciliation of an older planning reference, not a publication map.
// No filesystem, renderer, legal/translation QA or commercial authority here.
import assert from 'node:assert/strict';

const apostille = Object.freeze({
  route:'/bali/knowledge/documents/apostille-vs-legalization/',
  contentId:'knowledge_apostille_vs_legalization',
  suppliedContentId:'bali-knowledge-apostille-vs-legalization',
  bodyFile:'registry-copy/knowledge_apostille_vs_legalization_ru_documents_20261009.md',
  bodySha256:'4db4e89413888faa72dddb2349274d53453679c8cbacf94d6f87f5d06c2add08',
  metadataFile:'registry-copy/knowledge_apostille_vs_legalization_ru_documents_20261009.meta.json',
  metadataSha256:'8aa7c09df425cbf215975b7f4f1baf4bb053f1cffd93c7b52f49fc716802f525',
});
const sha = value => typeof value==='string' && /^[0-9a-f]{64}$/.test(value);
const file = value => typeof value==='string' && /^registry-copy\/[A-Za-z0-9_.-]+$/.test(value);

function oneRecord(registry,contentId) {
  const found=registry.records.filter(row=>row.contentId===contentId);
  assert.equal(found.length,1,'Unknown or ambiguous Knowledge identity');
  return found[0];
}
function boundLocales(registry,record) {
  if(!record)return [];
  const candidate=record.candidate??{},revision=candidate.revision;
  return registry.locales.flatMap(language=>{
    const payload=language.code==='ru'?candidate.ru:candidate.translations?.[language.code];
    if(!payload?.bodyFile)return [];
    assert.ok(file(payload.bodyFile)&&file(payload.metadataFile)&&sha(payload.bodySha256)&&sha(payload.metadataSha256),
      'Knowledge body/metadata binding drift');
    if(language.code!=='ru')assert.ok(payload.complete===true&&payload.sourceRevision===revision,
      'Incomplete or stale Knowledge source binding');
    return [language.code];
  });
}

/** Return detached planning rows. A non-null identity remains its own identity;
 * no merge/section alias or candidate URL becomes a new public page. */
export function reconciledKnowledgePlanRows(registry) {
  assert.ok(registry&&Array.isArray(registry.records)&&Array.isArray(registry.locales)
    &&Array.isArray(registry.routingPlan?.knowledge),'Knowledge planning input required');
  return registry.routingPlan.knowledge.map(intent=>{
    let id=intent.contentId,reconciled=false;
    if(id===null&&intent.proposedRoute===apostille.route) {
      assert.equal(intent.sourceEditorialState,'STAGED_EDITORIAL','Knowledge historical source state drift');
      assert.equal(intent.label,'Apostille vs legalization','Knowledge historical label drift');
      const record=oneRecord(registry,apostille.contentId),candidate=record.candidate;
      assert.equal(record.kind,'knowledge');assert.equal(record.parentId,'documents');
      assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
      assert.equal(candidate.route,apostille.route,'Knowledge canonical reconciliation drift');
      assert.equal(candidate.ru.bodyFile,apostille.bodyFile);
      assert.equal(candidate.ru.bodySha256,apostille.bodySha256);
      assert.equal(candidate.revision,'sha256:'+apostille.bodySha256);
      assert.equal(candidate.ru.metadataFile,apostille.metadataFile);
      assert.equal(candidate.ru.metadataSha256,apostille.metadataSha256);
      id=apostille.contentId;reconciled=true;
    }
    assert.ok(id===null||typeof id==='string','Knowledge reference type');
    const record=id===null?null:oneRecord(registry,id);
    if(record)assert.ok(['knowledge','guide','knowledge_hub'].includes(record.kind),'Non-Knowledge reference');
    return {...intent,declaredContentId:intent.contentId,contentId:id,
      identityReconciledFromKnowledgeCanonical:reconciled,
      sourceBoundLocales:boundLocales(registry,record),
      sourceEvidenceScope:'REGISTRY_BODY_METADATA_BINDING_ONLY_NOT_WHOLE_SOURCE_QA',
      publicationAuthority:false,commercialAuthority:false};
  });
}

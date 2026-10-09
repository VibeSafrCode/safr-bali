import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateRegistry } from "../src/service-registry.mjs";
import {metadataEnvelope} from "./import-sync-bundle.mjs";
import {nextStageIdentityBindings} from "./import-next-stage-drafts.mjs";
import {d12E28APriceOperations} from './import-d12-e28a-bundle.mjs';

const contentRoot = new URL("../content/", import.meta.url);
export function readRegistry() {
  return JSON.parse(readFileSync(new URL("service-registry.v1.json", contentRoot), "utf8"));
}
export function validateAuthoredRegistry(registry = readRegistry()) {
  const seed = JSON.parse(readFileSync(new URL("../../backend/app/data/catalog_price_seed.v1.json", import.meta.url), "utf8"));
  const serviceSeed = readFileSync(new URL("../../backend/app/scripts/seed.py", import.meta.url), "utf8");
  const serviceBlock = serviceSeed.slice(serviceSeed.indexOf("services = {"), serviceSeed.indexOf("modes = {"));
  const serviceSlugs = [...serviceBlock.matchAll(/slug="([^"]+)"/g)].map(x => x[1]);
  // Authorised option identities are not a price fallback or proof of live
  // availability. Amounts remain exclusively in the published price catalog.
  const extensions = JSON.parse(readFileSync(new URL("registry-pricing-bindings.v1.json",contentRoot),"utf8"));
  if(extensions.schemaVersion!==1 || extensions.bindings.length!==2 ||
    extensions.bindings.some(b=>b.serviceId!=="visa-extension" || b.entity_type!=="SERVICE" ||
      b.entity_key!=="visa-extension" || !["c1-extension","voa-extension"].includes(b.option_code)))throw Error("Invalid approved extension binding");
  const nextStage = JSON.parse(readFileSync(new URL("next-stage-decisions.v1.json",contentRoot),"utf8"));
  const identities = nextStageIdentityBindings(nextStage);
  const d12Bindings=Object.values(d12E28APriceOperations).map(({sourceSnapshotIdr,...identity})=>identity);
  const result = validateRegistry(registry, {prices: [...seed.items,...extensions.bindings,...identities,...d12Bindings], serviceSlugs});
  for (const record of registry.records) {
    for (const [locale, content] of [["ru", record.candidate.ru], ...Object.entries(record.candidate.translations)]) {
      if (!content.bodyFile) continue;
      const bytes = readFileSync(new URL(content.bodyFile, contentRoot));
      if (createHash("sha256").update(bytes).digest("hex") !== content.bodySha256) {
        throw new Error(`Content revision/hash drift: ${record.contentId}/${locale}; update candidate evidence, not live approvals`);
      }
      if(content.metadataFile){
        const metadataBytes=readFileSync(new URL(content.metadataFile,contentRoot));
        const metadata=JSON.parse(metadataBytes);
        if(createHash("sha256").update(metadataBytes).digest("hex")!==content.metadataSha256 ||
          metadata.bodySha256!==content.bodySha256 || metadata.sourceRevision!==(locale==="ru"?record.candidate.revision:content.sourceRevision) || metadata.locale!==locale){
          throw new Error(`Metadata revision/hash drift: ${record.contentId}/${locale}`);
        }
        if(metadata.fullPayloadKind==="D1_D2_FULL_JSON_V1") {
          // Supplied D1/D2 uses the complete immutable JSON wire envelope,
          // not the older five-field Markdown+metadata envelope. Every source
          // field survives verbatim; aliases are additional adapter fields.
          assert.match(metadata.sourceFile,/^registry-copy\/[a-z0-9_-]+\.source\.json$/);
          const wire=readFileSync(new URL(metadata.sourceFile,contentRoot));
          const supplied=JSON.parse(wire),wireSha=createHash("sha256").update(wire).digest("hex");
          assert.equal(wireSha,metadata.sourceFileSha256,"Full JSON wire drift");
          for(const key of Object.keys(supplied))assert.deepEqual(metadata[key],supplied[key],`Full metadata field lost: ${record.contentId}/${locale}/${key}`);
          assert.equal(supplied.bodyMarkdown,bytes.toString("utf8"));
          assert.equal(supplied.bodyRevision,"sha256:"+content.bodySha256);
          assert.equal(supplied.sourceBodyRevision,record.candidate.revision);
          assert.equal(metadata.seoTitle,supplied.seo.title);assert.equal(metadata.metaDescription,supplied.seo.description);
          assert.equal(supplied.approval.nativeSpeakerReview,false);assert.equal(supplied.approval.browserReview,false);
          const ruMeta=JSON.parse(readFileSync(new URL(record.candidate.ru.metadataFile,contentRoot)));
          assert.match(ruMeta.sourceFile,/^registry-copy\/[a-z0-9_-]+\.source\.json$/);
          const ruWire=readFileSync(new URL(ruMeta.sourceFile,contentRoot)),ruSupplied=JSON.parse(ruWire);
          const ruWireSha=createHash("sha256").update(ruWire).digest("hex");
          assert.equal(ruWireSha,record.candidate.ru.sourceEnvelopeSha256,"RU JSON source pin drift");
          assert.equal(content.sourceEnvelopeSha256,ruWireSha,"Translation RU JSON source pin drift");
          assert.equal(supplied.sourcePayloadRevision,ruSupplied.payloadRevision);
          assert.equal(metadata.sourceEnvelopeSha256,ruWireSha);
          assert.equal(metadata.resolvedContentId,record.contentId);
        } else if(locale==="ru" && metadataEnvelope(bytes,metadata)!==content.sourceEnvelopeSha256)throw new Error(`RU envelope drift: ${record.contentId}`);
      }
      if (locale !== "ru" && content.qa === "passed") {
        const qa = JSON.parse(readFileSync(new URL(content.qaFile ?? "registry-copy/c1_translation_qa_t2.json", contentRoot), "utf8"));
        const items = Array.isArray(qa.records) ? qa.records : qa.items;
        if (!Array.isArray(items) || !items.some(q => (!content.qaPage || q.page === content.qaPage) &&
          q.locale === locale && q.bodySha256 === "sha256:" + content.bodySha256 &&
          q.sourceRevision === record.candidate.revision && (q.status === "QA_PASSED_SEMANTIC" ||
            (q.status === "MODEL_REVIEWED_PENDING_RENDER_QA" && q.sourceOriginReconciled===true &&
              q.sourceEnvelopeSha256===content.sourceEnvelopeSha256)))) {
          throw new Error(`Translation evidence drift: ${record.contentId}/${locale}`);
        }
      }
    }
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(validateAuthoredRegistry()));
}

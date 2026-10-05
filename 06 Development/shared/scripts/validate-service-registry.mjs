import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateRegistry } from "../src/service-registry.mjs";
import {metadataEnvelope} from "./import-sync-bundle.mjs";
import {nextStageIdentityBindings} from "./import-next-stage-drafts.mjs";

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
  const result = validateRegistry(registry, {prices: [...seed.items,...extensions.bindings,...identities], serviceSlugs});
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
        if(locale==="ru" && metadataEnvelope(bytes,metadata)!==content.sourceEnvelopeSha256)throw new Error(`RU envelope drift: ${record.contentId}`);
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

// Extract approved RU/EN fragments verbatim. No translation or new visa rules.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../content/",import.meta.url));
const registry=JSON.parse(readFileSync(resolve(root,"service-registry.v1.json")));
const presentation=JSON.parse(readFileSync(resolve(root,"registry-presentation-approvals.v1.json")));
const hash=x=>createHash("sha256").update(x).digest("hex");
const clean=s=>s.replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/^#{1,4} /gm,"").replaceAll("**","").trim();
const selected={c1:[2,3,4,6],voa:[3,5,6,7,10],e33g:[7,9,10,12,13,14]};
const keys={c1:"C1",voa:"VOA",e33g:"E33G"};
const entries={};
for(const [id,indices] of Object.entries(selected)){
  const record=registry.records.find(r=>r.contentId===id);
  entries[keys[id]]={};
  for(const locale of ["ru","en"]){
    const p=locale==="ru"?record.candidate.ru:record.candidate.translations[locale];
    const source=readFileSync(resolve(root,p.bodyFile),"utf8"),metaBytes=readFileSync(resolve(root,p.metadataFile));
    if(hash(source)!==p.bodySha256 || hash(metaBytes)!==p.metadataSha256)throw Error("Source hash drift");
    const meta=JSON.parse(metaBytes),starts=[...source.matchAll(/^## (.+)$/gm)];
    const sections=starts.map((s,i)=>({heading:s[1],text:source.slice(s.index+s[0].length,starts[i+1]?.index??source.length).trim()}));
    const facts=meta.factBlock.items.map(x=>x.text).filter(s=>!s.includes("{{USD") && !s.includes("{{PRICE"));
    const chunks=[meta.h1,facts.map(s=>"— "+clean(s)).join("\n")];
    if(id==="e33g"){
      const documents=sections[5];
      chunks.push(documents.heading+"\n"+clean(documents.text.split(/^### /m)[0]));
      const bank=documents.text.split("\n").find(s=>locale==="ru"?s.startsWith("Официально требуется банковская выписка"):s.startsWith("Officially, a bank statement"));
      if(!bank)throw Error("Missing exact approved bank sentence");
      chunks.push(bank);
    }
    for(const i of indices){
      const s=sections[i];if(!s)throw Error("Summary section drift");
      // Catalog displays all money. Do not embed a second tariff in bot copy.
      const text=s.text.split(/\n\n/).filter(para=>!/(?:12[ ,.\u00a0]000[ ,.\u00a0]000|14[ ,.\u00a0]000[ ,.\u00a0]000|\{\{USD)/.test(para)).join("\n\n");
      chunks.push(s.heading+"\n"+clean(text));
    }
    const route=record.published?.routes[locale];
    if(!route || !/^\/(?:en\/)?bali\/visas\/(?:c1|voa|e33g)\/$/.test(route))throw Error("No proven public page route");
    const body=chunks.filter(Boolean).join("\n\n");
    if(/\{\{|\b(?:850[ ,.]000|2[ ,.]000[ ,.]000)\s*IDR/.test(body))throw Error("Static price leaked into bot summary");
    entries[keys[id]][locale]={body,bodySha256:hash(body),priceUnitNote:id==="e33g"?presentation.e33gUnitNotes[locale]:null,sourceRevision:record.candidate.revision,
      metadataSha256:p.metadataSha256,publicUrl:"https://safrway.online"+route,
      extraction:{sectionIndices:indices,factBlock:true,translatedByImporter:false},
      unpublishedRelated:record.relatedContentIds.filter(cid=>!registry.records.find(r=>r.contentId===cid)?.published)};
  }
}
const result={schemaVersion:1,authority:"Founder answers 1–6, 2026-10-04",entries};
const output=process.argv[2]?resolve(process.argv[2]):resolve(root,"generated/bot-visa-summaries.v1.json");
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({summaries:6,characters:Object.fromEntries(Object.entries(entries).map(([key,rows])=>[key,Object.fromEntries(Object.entries(rows).map(([locale,x])=>[locale,x.body.length]))])),translatedByImporter:false}));

// Real Astro rendering + protected loopback HTTP. This is NOT browser/visual QA.
import {dev} from "astro";
import {randomBytes} from "node:crypto";
import assert from "node:assert/strict";
const token=randomBytes(24).toString("hex"),auth="Basic "+Buffer.from("preview:"+token).toString("base64");
// The public JS API avoids Astro CLI's AI-daemon/lock handling entirely.
// Never stop/replace an existing Founder-owned dev server or write its lock.
const previousToken=process.env.SAFR_REGISTRY_PREVIEW_TOKEN;
process.env.SAFR_REGISTRY_PREVIEW_TOKEN=token;
const server=await dev({configFile:"./scripts/registry-preview.config.mjs",server:{host:"127.0.0.1",port:0},logLevel:"silent"});
const port=server.address.port;
const request=(path,authorized=true,options={})=>fetch("http://127.0.0.1:"+port+path,{...options,
  headers:{...(authorized?{Authorization:auth}:{}),...options.headers},signal:AbortSignal.timeout(8000),redirect:"error"});
const ids=["e33g","knowledge_e33g_overview","knowledge_e33g_documents","knowledge_e33g_family"];
const cases=[];
try {
  for(const locale of ["ru","en","de","zh-Hans","ja","ar"])for(const id of ids){
    const res=await request("/_registry/"+id+"/?locale="+locale),html=await res.text();
    assert.equal(res.status,200,id+"/"+locale);
    assert.match(res.headers.get("cache-control"),/no-store/);
    assert.match(res.headers.get("x-robots-tag"),/noindex/);
    assert.match(html,new RegExp('<html[^>]*lang="'+locale+'"[^>]*dir="'+(locale==="ar"?"rtl":"ltr")+'"'));
    assert.equal((html.match(/<h1(?:\s|>)/g)??[]).length,1);
    assert.doesNotMatch(html,/\{\{(?:USD|PRICE_IDR)|Source locale:|QA_PASSED/);
    assert.match(html,/data-language-button/);assert.match(res.headers.get("content-security-policy"),/form-action 'none'/);
    if(id==="e33g")assert.match(html,/e33g-tariff-grid/);
    if(id==="knowledge_e33g_family"&&locale==="ar")assert.match(html,/<bdi dir="ltr">E31B<\/bdi>/);
    cases.push({contentId:id,locale,status:200,dir:locale==="ar"?"rtl":"ltr",rendered:true});
  }
  assert.equal((await request("/_registry/e33g/",false)).status,401);
  assert.equal((await request("/_registry/e33g/",true,{method:"POST"})).status,405);
  assert.equal((await request("/@fs/private/registry-copy/e33g_ru_e33g_supplied.md?import",false)).status,404);
  assert.equal((await request("/_registry/e33g/?locale=invalid")).status,404);
  console.log(JSON.stringify({gate:"ASTRO_SSR_HTTP_NOT_BROWSER",cases,authCases:4,externalBrowserStarted:false,publicPricingFetched:false,visualQA:"NOT_RUN"}));
} finally {
  await server.stop();
  if(previousToken===undefined)delete process.env.SAFR_REGISTRY_PREVIEW_TOKEN;
  else process.env.SAFR_REGISTRY_PREVIEW_TOKEN=previousToken;
}

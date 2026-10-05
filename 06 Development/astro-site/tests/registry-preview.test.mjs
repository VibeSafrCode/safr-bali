import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { registryPreview, registryPreviewMiddleware, renderRegistryPreview } from "../scripts/registry-preview.mjs";
import { readRegistry } from "../../shared/scripts/validate-service-registry.mjs";

const registry = readRegistry();
const token = "unit-test-only-no-real-credential-0123456789";
const authorization = "Basic " + Buffer.from("preview:" + token).toString("base64");
function request(overrides = {}, options = {}) {
  const headers = {};
  const res = {statusCode:200, setHeader:(k,v)=>{headers[k]=v}, end:body=>{res.body=body}};
  let next = false;
  registryPreviewMiddleware({token, ...options})({
    url:"/_registry/voa_extension/",method:"GET",socket:{remoteAddress:"127.0.0.1"},
    headers:{host:"127.0.0.1:4321",authorization}, ...overrides,
  },res,()=>{next=true});
  return {res, headers, next};
}
test("all 146 records have a protected common shell; supplied RU bodies are escaped", () => {
  for (const r of registry.records) {
    const html = renderRegistryPreview(registry, r.contentId, "ru", () => "<script>not executed</script>");
    assert.ok(html.includes(r.contentId));
    assert.match(html, /noindex,nofollow/);
    assert.doesNotMatch(html, /<script>|<form|<iframe/);
  }
});
test("absent token, incorrect credential, non-loopback, rebinding and forwarded requests fail closed", () => {
  for (const headers of [{host:"localhost"}, {host:"localhost",authorization:"Basic invalid"},
    {host:"evil.example",authorization}, {host:"localhost",authorization,"x-forwarded-host":"localhost"},
    {host:"localhost",authorization,forwarded:"for=127.0.0.1"}]) {
    assert.equal(request({headers}).res.statusCode, 401);
  }
  assert.equal(request({socket:{remoteAddress:"10.0.0.10"}}).res.statusCode,401);
  assert.equal(request({}, {token:undefined}).res.statusCode,401);
  assert.equal(request({}, {token:"short"}).res.statusCode,401);
});
test("authenticated GET/HEAD only; traversal and unknown locales rejected; no caching/framing", () => {
  const ok = request();
  assert.equal(ok.res.statusCode,200); assert.match(ok.res.body,/850 000 IDR/);
  assert.equal(ok.headers["Cache-Control"],"no-store");
  assert.match(ok.headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.equal(request({method:"HEAD"}).res.body, undefined);
  assert.equal(request({method:"POST"}).res.statusCode,405);
  assert.equal(request({url:"/_registry/%2e%2e/"}).res.statusCode,404);
  assert.equal(request({url:"/_registry/voa_extension/?locale=isv"}).res.statusCode,404);
  assert.equal(request({url:"/_registry/absent/"}).res.statusCode,404);
  assert.equal(request({}, {validate:()=>{throw Error("private diagnostic")}}).res.statusCode,503);
  assert.equal(request({url:"/bali/visas/voa/"}).next,true);
});
test("foreign shell does not fall back to RU body or pretend translation QA", () => {
  for (const locale of registry.locales.filter(x=>x.code!=="ru").map(x=>x.code)) {
    const html = renderRegistryPreview(registry, "voa_extension", locale, () => {throw Error("RU read");});
    assert.match(html, /Перевод и языковой QA отсутствуют/); assert.doesNotMatch(html,/850 000/);
  }
});
test("preview not installed for production/static-preview and raw source paths explicitly denied", () => {
  const plugin = registryPreview();
  assert.equal(plugin.apply,"serve"); assert.equal(Object.hasOwn(plugin,"configurePreviewServer"),false);
  const config=readFileSync(new URL("../astro.config.mjs",import.meta.url),"utf8");
  assert.match(config,/\*\*\/shared\/content\/service-registry\.v1\.json/);
  assert.match(config,/\*\*\/shared\/content\/registry-presentation-approvals\.v1\.json/);
  assert.match(config,/\*\*\/shared\/content\/registry-copy\/\*\*/);
});
test("raw and Markdown module imports cannot bypass preview auth via Astro/Vite loaders", () => {
  for (const url of [
    "/@fs/workspace/shared/content/registry-copy/voa_extension_ru_v3.md",
    "/@fs/workspace/shared/content/registry-copy/voa_extension_ru_v3.md?import",
    "/@fs/workspace/shared/content/registry-copy/voa_extension_ru_v3.md?raw",
    "/@fs/workspace/shared/content/service-registry.v1.json?import",
    "/@fs/workspace/shared/content/registry-approvals.v1.json?import",
    "/@fs/workspace/shared/content/registry-presentation-approvals.v1.json?import",
    "/@fs/workspace/shared/content/registry-presentation-approvals.v1.json?raw",
    "/@fs/workspace/shared/content%252fregistry-presentation-approvals.v1.json?import",
    "/@fs/workspace/shared/content/%72egistry-copy/voa_extension_ru_v3.md?import",
    "/@fs/workspace/shared/content%252fregistry-copy%252fvoa_extension_ru_v3.md?import",
  ]) {
    const result = request({url, headers:{host:"localhost"}});
    assert.equal(result.res.statusCode,404,url); assert.equal(result.next,false,url);
    assert.equal(result.res.body,undefined);
  }
});
test("bounded loopback HTTP integration: auth, escaped content, raw import deny and no client submission", async () => {
  const middleware = registryPreviewMiddleware({token});
  const server = createServer((req,res) => middleware(req,res,()=>{res.statusCode=404;res.end();}));
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    const get = (url, headers = {}) => fetch(origin + url, {headers, signal:AbortSignal.timeout(2000)});
    assert.equal((await get("/_registry/voa_extension/")).status,401);
    const page = await get("/_registry/voa_extension/", {authorization});
    assert.equal(page.status,200); assert.equal(page.headers.get("cache-control"),"no-store");
    assert.match(await page.text(), /850 000 IDR/);
    assert.equal((await get("/@fs/workspace/shared/content/registry-copy/voa_extension_ru_v3.md?import")).status,404);
    const post = await fetch(origin+"/_registry/", {method:"POST",headers:{authorization},signal:AbortSignal.timeout(2000)});
    assert.equal(post.status,405);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});

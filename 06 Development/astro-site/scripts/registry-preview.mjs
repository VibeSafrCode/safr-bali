// Protected tooling in the EXISTING Vite dev server, not a second public router.
// Never installed in build or static-preview; no pricing fetches or form submits.
import { timingSafeEqual, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { readRegistry, validateAuthoredRegistry } from "../../shared/scripts/validate-service-registry.mjs";
import { buildRegistryDocument } from "./registry-document.mjs";
import {isBusinessDraft} from './registry-business-preview.mjs';

const escape = v => String(v).replace(/[&<>"']/g, c =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[c]);
const localAddress = address => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
function authorized(req, token) {
  if (typeof token !== "string" || token.length < 32 || !localAddress(req.socket?.remoteAddress)) return false;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? "")) return false;
  // Do not trust a reverse proxy/DNS rebinding to turn this into hosted preview.
  if (req.headers["x-forwarded-for"] || req.headers["x-forwarded-host"] || req.headers.forwarded) return false;
  const expected = Buffer.from("Basic " + Buffer.from("preview:" + token).toString("base64"));
  const actual = Buffer.from(req.headers.authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function document(body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <meta name="robots" content="noindex,nofollow"><title>SAFRWAY — Registry preview</title>
  <style>body{font:16px/1.6 system-ui;margin:auto;padding:24px;max-width:1000px;color:#132a23;background:#f5f7f6}a{color:#155c45}li{margin:.5rem 0}article,aside{background:white;border:1px solid #ccd8d2;border-radius:12px;padding:20px;margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}code{overflow-wrap:anywhere}nav{display:flex;gap:16px;flex-wrap:wrap}:focus-visible{outline:3px solid #155c45;outline-offset:3px}</style></head><body>
  <header><h1>Registry preview</h1><p>Закрытый редакционный просмотр. Не опубликовано. Формы и отправка заявок отключены.</p></header>${body}</body></html>`;
}
export function renderRegistryPreview(registry, contentId, locale = "ru", readBody = () => "") {
  if (!registry.locales.some(x => x.code === locale)) return null;
  if (!contentId) return document(`<main><h2>Контентные записи — ${registry.records.length}</h2><ul>${registry.records.map(r =>
    `<li><a href="/_registry/${escape(r.contentId)}/?locale=${locale}">${escape(r.title)}</a> — ${escape(r.contentId)} · ${r.published ? "действующий адаптер" : escape(r.candidate.ru.status)}</li>`).join("")}</ul></main>`);
  const r = registry.records.find(x => x.contentId === contentId);
  if (!r) return null;
  const ru = r.candidate.ru;
  // A missing translation never displays RU body under a foreign locale.
  // Business must use its exact immutable structured renderer. Never let a
  // missing envelope expose rechecksummed raw copy through the old shell.
  const body = !isBusinessDraft(r) && locale === "ru" && ru.bodyFile ? readBody(ru.bodyFile) : "";
  const live = r.published?.routes[locale];
  return document(`<nav><a href="/_registry/?locale=${locale}">Все записи</a>${registry.locales.map(l =>
    `<a href="/_registry/${escape(r.contentId)}/?locale=${l.code}" lang="${l.code}" aria-current="${locale === l.code ? "page" : "false"}">${l.code}</a>`).join("")}</nav>
    <main><h2>${escape(r.title)}</h2><aside><dl>
    <dt>content_id / кандидатный URL</dt><dd><code>${escape(r.contentId)} · ${escape(r.candidate.route)}</code></dd>
    <dt>Локаль / редакция RU / видимость</dt><dd>${escape(locale)} · ${escape(ru.status)} · preview_only</dd>
    <dt>Бизнес-операция (Service.slug)</dt><dd>${escape(r.serviceId ?? "не установлена")}; доступность в production не проверена</dd>
    <dt>pricingRef</dt><dd>${escape(r.pricingRef ? JSON.stringify(r.pricingRef) : "не установлен — без подстановки цены")}</dd>
    </dl><p>Числа в редакционном черновике не заменяют действующий прайсинг. Публикация и переводы — отдельные этапы.</p>
    ${r.duplicateRisk ? `<p>${escape(r.duplicateRisk)}</p>` : ""}
    ${live ? `<a href="${escape(live)}">Открыть неизменённую действующую страницу локально</a>` : ""}</aside>
    <article aria-label="Предоставленный текст">${body ? `<pre>${escape(body)}</pre>` :
      `<p>${live ? "Действующий текст остаётся в существующем адаптере; ссылка выше." : locale === "ru" ? "Каркас создан. Текст ещё не предоставлен." : "Перевод и языковой QA отсутствуют; RU-текст не подставляется."}</p>`}</article>
    ${r.relatedContentIds.length ? `<nav aria-label="Связанные записи">${r.relatedContentIds.map(id =>
      `<a href="/_registry/${escape(id)}/?locale=${locale}">${escape(id)}</a>`).join("")}</nav>` : ""}</main>`);
}
export function registryPreviewMiddleware({token, load = readRegistry, validate = validateAuthoredRegistry, renderer} = {}) {
  return (req, res, next) => {
    // Vite fs.deny alone is insufficient: Astro's Markdown import loader can
    // read files before Vite's fallback fs guard. Block raw AND module-import
    // requests before either loader, even for authenticated preview users.
    let decoded = req.url ?? "";
    try {
      for (let n = 0; n < 4; n++) {
        const nextValue = decodeURIComponent(decoded);
        if (nextValue === decoded) break;
        decoded = nextValue;
      }
    } catch { res.statusCode = 400; return res.end(); }
    if (/(?:^|[\/\\])registry-copy(?:[\/\\]|$)|(?:^|[\/\\])(?:service-registry|registry-approvals|registry-presentation-approvals|registry-public-build|registry-d1-d2-build|registry-business-build|next-stage-decisions)\.v1\.json(?:$|[?#])/i.test(decoded)) {
      res.setHeader("Cache-Control", "no-store");
      res.statusCode = 404; return res.end();
    }
    const rawPath = req.url?.split("?")[0] ?? "";
    if (rawPath !== "/_registry" && !rawPath.startsWith("/_registry/")) return next();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const nonce = randomBytes(18).toString("base64");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (!authorized(req, token)) {
      res.statusCode = 401; res.setHeader("WWW-Authenticate", 'Basic realm="SAFRWAY local preview"');
      return res.end("Preview authentication required");
    }
    if (req.method !== "GET" && req.method !== "HEAD") {res.statusCode = 405; return res.end();}
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/^\/_registry(?:\/([a-z][a-z0-9_]*))?\/?$/);
    if (!match) {res.statusCode = 404; return res.end();}
    try {
      validate();
      const registry = load();
      const locale = url.searchParams.get("locale") ?? "ru";
      if (!registry.locales.some(l => l.code === locale)) {res.statusCode = 404;return res.end();}
      const finish = html => {
        res.statusCode = html ? 200 : 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(req.method === "HEAD" ? undefined : html ?? "Not found");
      };
      const fallback = () => isBusinessDraft(registry.records.find(row=>row.contentId===match[1])) ? null : renderRegistryPreview(registry, match[1], locale,
        file => readFileSync(new URL("../../shared/content/" + file, import.meta.url), "utf8"));
      if (!renderer || !match[1]) return finish(fallback());
      // Optional publication GET is explicit, bounded, and uses the EXISTING
      // canonical projection. No scheduler, refresh loop, FX request or mutation.
      const render = async () => {
        let projection = null;
        if (req.method === "GET" && ["c1","voa","e33g","c1_extension","voa_extension"].includes(match[1]) && url.searchParams.get("pricing") === "published") {
          try {
            const response = await fetch("https://safrway.online/api/catalog/pricing",
              {headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(5000),redirect:"error"});
            if (response.ok) projection = await response.json();
          } catch {} // preserve approved IDR, never invent or silently retain USD
        }
        return await renderer(registry, match[1], locale, {nonce,projection}) ?? fallback();
      };
      return render().then(finish).catch(() => {
        res.statusCode = 503;res.end("Protected renderer failed; inspect local diagnostics.");
      });
    } catch {
      res.statusCode = 503; res.end("Registry validation failed; inspect the local validator.");
    }
  };
}
export function registryPreview() {
  return {name: "safr-registry-preview", apply: "serve",
    configureServer(server) {
      let container;
      server.middlewares.use(registryPreviewMiddleware({token: process.env.SAFR_REGISTRY_PREVIEW_TOKEN,
        renderer: async (registry,id,locale,{nonce,projection}) => {
          const model = buildRegistryDocument(registry,id,locale,{projection,editorialPreview:true});
          if (!model) return null;
          const {experimental_AstroContainer} = await import("astro/container");
          container ??= await experimental_AstroContainer.create();
          const file = model.commercial ? "RegistryServicePage" : "RegistryKnowledgePage";
          const component = await server.ssrLoadModule("/src/components/registry/" + file + ".astro");
          const styleText = readFileSync(new URL("../../shared/design/tokens.v1.css",import.meta.url),"utf8") +
            readFileSync(new URL("../src/styles/registry-preview.css",import.meta.url),"utf8");
          return container.renderToString(component.default,{props:{model,nonce,styleText},partial:false});
        },
      }));
    }};
}

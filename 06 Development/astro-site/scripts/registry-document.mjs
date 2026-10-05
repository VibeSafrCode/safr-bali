// Source -> presentation adapter. No pricing formula, services or public routes.
import { Lexer } from "marked";
import { readFileSync } from "node:fs";
import {createHash} from "node:crypto";
import { languageChoices } from "./registry-language.mjs";
import { visaPriceText } from "../src/lib/visa-price-text.js";
import { e33gPublishedPrices } from "./registry-e33g-pricing.mjs";
import { extensionPublishedPrice } from "./registry-extension-pricing.mjs";
import {bindAuthoredPrices,priceDisplay,registryPrice} from "./registry-price-bindings.mjs";
import {familyApplicabilityNote} from "./registry-family-applicability.mjs";
import { approvedPresentationDecision, removeApprovedInternalInstructions } from "./registry-presentation-decisions.mjs";
import {bindD1Payload,d1PageKeys,renderPriceTemplate} from './registry-d1-d2-pricing.mjs';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const isolate = value => escapeHtml(value).replace(
  /(?:E33G Remote Worker KITAS|[\d][\d ,\.\u00a0]*\s*(?:IDR|USD)|\b(?:IDR|USD)\s*[\d][\d ,\.\u00a0]*|\$[\d.,]+|\b(?:D1\s*\/\s*D2|D1|D2|C1|D12|E33G|E31B|E31E|E31H|e-?VOA|VOA|All Indonesia|KITAS|SIM|IMEI)\b)/g,
  value => '<bdi dir="ltr">' + value + "</bdi>");
export const previewHref = (id, locale) => "/_registry/" + encodeURIComponent(id) + "/?locale=" + encodeURIComponent(locale);
const sourceRoot = new URL("../../shared/content/", import.meta.url);
const internalHeadings = /^(?:Inline link intents|Inline-Link-Ziele|Intentions de liens internes|Intenciones de enlaces internos|内部链接意图|内部リンク意図|내부 링크 의도|आंतरिक लिंक इरादे|نوايا الروابط الداخلية|Related |Связанн)/i;
const faqHeading = /^(?:FAQ|Частые вопросы|Frequently asked questions|Questions fréquentes|Häufige Fragen|अक्सर पूछे जाने वाले प्रश्न|Preguntas frecuentes|常见问题|常见问答|よくある質問|자주 묻는 질문|الأسئلة الشائعة)/i;
const primaryLabel = /^(?:Основная кнопка|Primary CTA|主要按钮|주요 CTA|CTA principal|Primärer CTA|主CTA|मुख्य CTA|CTA الرئيسي|CTA)$/;
const secondaryLabel = /^(?:Дополнительная кнопка|Secondary CTA|次要按钮|보조 CTA|CTA secondaire|Sekundärer CTA|副CTA|CTA secundario)$/;
const interfaceLabels = {
  ru:["Коротко","Связанные материалы","Написать менеджеру"],
  en:["At a glance","Related services & Knowledge","Message a manager"],
  "zh-Hans":["概要","相关服务与知识","联系经理"], ko:["요약","관련 서비스 및 정보","매니저에게 문의"],
  fr:["En bref","Services et articles liés","Écrire à un manager"], de:["Auf einen Blick","Verwandte Angebote und Wissen","Manager kontaktieren"],
  ja:["概要","関連サービス・記事","担当者に相談"],hi:["एक नज़र में","संबंधित सेवाएँ और जानकारी","मैनेजर को लिखें"],
  es:["En breve","Servicios y artículos relacionados","Escribir a un manager"],ar:["لمحة سريعة","الخدمات والمقالات ذات الصلة","مراسلة المدير"],
};
const languageLabels = {
  ru:["Язык:","Изменить","Выберите язык","Закрыть","Навигация"],
  en:["Language:","Change","Choose a language","Close","Breadcrumbs"],
  "zh-Hans":["语言：","更改","选择语言","关闭","路径导航"],ko:["언어:","변경","언어 선택","닫기","경로"],
  fr:["Langue :","Modifier","Choisir une langue","Fermer","Fil d’Ariane"],
  de:["Sprache:","Ändern","Sprache auswählen","Schließen","Seitennavigation"],
  ja:["言語：","変更","言語を選択","閉じる","パンくずリスト"],hi:["भाषा:","बदलें","भाषा चुनें","बंद करें","नेविगेशन"],
  es:["Idioma:","Cambiar","Elige un idioma","Cerrar","Ruta de navegación"],
  ar:["اللغة:","تغيير","اختر لغة","إغلاق","التنقل"],
};
const tableHints={ru:'Прокрутите таблицу в сторону, чтобы увидеть все столбцы.',en:'Scroll sideways to see all columns.',de:'Seitlich scrollen, um alle Spalten zu sehen.',fr:'Faites défiler horizontalement pour voir toutes les colonnes.',es:'Desliza horizontalmente para ver todas las columnas.','zh-Hans':'左右滑动表格，查看所有列。',ja:'表を左右にスクロールすると、すべての列を確認できます。',ko:'표를 좌우로 스크롤하면 모든 열을 볼 수 있습니다.',hi:'सभी कॉलम देखने के लिए तालिका को बाएँ-दाएँ स्क्रॉल करें।',ar:'مرّر الجدول أفقيًا لرؤية جميع الأعمدة.'};
const splitSections = value => {
  const starts = [...value.matchAll(/^## (.+)$/gm)];
  return {intro:value.slice(0, starts[0]?.index ?? value.length).trim(),
    sections:starts.map((m,i) => ({heading:m[1], text:value.slice(m.index + m[0].length, starts[i+1]?.index ?? value.length).trim()}))};
};
export function parseEditorial(source, {commercial = false, locale = "ru", compactDirect = false} = {}) {
  // Editorial fields may place the value on the next line. Never select a
  // numbered editorial H1 as customer copy, or execute blueprint instructions.
  const field = name => source.match(new RegExp("^\\*\\*" + name + ":\\*\\*[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)$","m"))?.[1]?.trim() ?? "";
  const titleLine = [...source.matchAll(/^# (.+)$/gm)];
  const h1Field = source.match(/^\*\*H1:\*\*[^\n]*(?:\n[^\n]+)?/m);
  if (!h1Field) throw Error("Missing authored H1");
  const title = field("H1");
  const titleValueEnd = h1Field.index + source.slice(h1Field.index).indexOf(title) + title.length;
  const metadataEnd = titleValueEnd;
  const clientTitle = titleLine.find(m => m.index >= metadataEnd && m[1].trim() === title);
  if (!title || (!clientTitle && titleLine.some(m=>m.index>metadataEnd))) throw Error("Ambiguous editorial body");
  const blueprint = clientTitle && /^# 7\. Canonical Russian commercial copy$/m.test(source.slice(0,clientTitle.index));
  const bodyStart = clientTitle ? clientTitle.index + clientTitle[0].length : metadataEnd;
  const preamble = source.slice(metadataEnd, clientTitle?.index ?? source.length).replace(/^---\s*$/gm,"");
  const metadata = splitSections(preamble).sections;
  const isDirect = heading => /^(?:Direct answer|إجابة مباشرة|सीधा उत्तर|सीधा जवाब)/i.test(heading) ||
    (compactDirect && /^(?:直接回答|結論|직접 답변|바로 답변|Réponse directe|Direkte Antwort|Respuesta directa|الإجابة المباشرة)/i.test(heading));
  const metadataDirect = metadata.find(s=>isDirect(s.heading)) ??
    (commercial && locale === "ru" ? null : metadata[0]);
  let direct = metadataDirect?.text ?? "";
  let fact = metadata.find(s=>/fact block|^Comparison$/i.test(s.heading)) ??
    metadata[commercial && locale === "ru" ? 0 : 1] ?? {heading:"",text:""};
  let bodyText = source.slice(bodyStart);
  if (blueprint) {
    const chunk = number => source.match(new RegExp("^# " + number + "\\. [^\\n]+\\n([\\s\\S]*?)(?=^---|^# |$(?![\\s\\S]))","m"))?.[1]?.trim() ?? "";
    fact = {heading:"",text:chunk(5).split("\nImportant:")[0].trim()};
    direct = chunk(6);
    const end = bodyText.search(/^# /m);
    if (end >= 0) bodyText = bodyText.slice(0,end);
    bodyText += "\n\n" + chunk(8);
  }
  const body = splitSections(bodyText);
  // Compact sources can omit the repeated H1. Only explicit direct-answer
  // metadata consumes the following fact block; arbitrary first sections stay.
  if (!clientTitle && isDirect(body.sections[0]?.heading ?? "")) {
    direct = body.sections.shift().text;
    fact = body.sections.shift() ?? {heading:"",text:""};
  } else if (!clientTitle) {direct="";fact={heading:"",text:""};}
  return {title, seoTitle:field("SEO Title"), description:field("Meta Description"),
    intro:body.intro, direct, fact, sections:body.sections};
}
export function parseStructuredEditorial(source,metadata) {
  const title=source.match(/^# (.+)$/m);
  if(!title || title[1]!==metadata.h1 || (source.match(/^# /gm)??[]).length!==1)throw Error("Structured H1/source drift");
  const body=splitSections(source.slice(title.index+title[0].length));
  const fact=metadata.factBlock;
  const items=(fact?.items??[]).map(item=>"- "+item.text).join("\n");
  const cell=value=>String(value).replaceAll("|","\\|").replaceAll("\n"," ");
  const table=Array.isArray(fact?.table) && fact.table.length ? fact.table.map((row,i)=>
    "| "+row.map(cell).join(" | ")+" |"+(i===0?"\n| "+row.map(()=>"---").join(" | ")+" |":"")).join("\n") : "";
  const direct=metadata.directAnswer??"";
  return {title:metadata.h1,seoTitle:metadata.seoTitle,description:metadata.metaDescription,
    intro:body.intro.trim()===direct.trim()?"":body.intro,direct,
    fact:{heading:fact?.heading??"",text:[items,table].filter(Boolean).join("\n\n")},sections:body.sections};
}
export function parseD1Editorial(metadata,{projection=null,locale,now=Date.now()}={}) {
  const source=metadata.bodyMarkdown,title=source.match(/^# (.+)$/m);
  if(!title||title[1]!==metadata.h1||(source.match(/^# /gm)??[]).length!==1)throw Error('D1 structured H1 drift');
  const body=splitSections(source.slice(title.index+title[0].length));
  return {title:metadata.h1,seoTitle:renderPriceTemplate(metadata.seo.title,projection,locale,now),
    description:renderPriceTemplate(metadata.seo.description,projection,locale,now),
    descriptionTemplate:metadata.seo.description,
    intro:body.intro.trim()===metadata.directAnswer.trim()?'':body.intro,
    direct:metadata.directAnswer,fact:{heading:'',text:metadata.factBlockMarkdown},sections:body.sections};
}
function resolveTarget(registry, route) {
  return registry.records.find(r => r.candidate.route === route ||
    Object.values(r.published?.routes ?? {}).includes(route)) ??
    registry.records.find(r => registry.traceability.knowledgeTopics.some(t =>
      t.sourceRoute === route && t.contentId === r.contentId)) ?? null;
}
export function safeMarkdown(source, {registry, locale, onUnmapped = () => {}, e33g = false, targetHref = previewHref}) {
  const inline = tokens => tokens.map(t => {
    if (t.type === "strong" || t.type === "em" || t.type === "del") {
      const tag = t.type === "strong" ? "strong" : t.type === "em" ? "em" : "del";
      return "<" + tag + ">" + inline(t.tokens) + "</" + tag + ">";
    }
    if (t.type === "link") {
      const target = resolveTarget(registry, t.href);
      const label = inline(t.tokens);
      if (!target) {onUnmapped(t.href); return label;}
      const href=targetHref(target.contentId,locale);
      return href ? '<a href="' + escapeHtml(href) + '">' + label + "</a>" : label;
    }
    if (t.type === "image") return isolate(t.text); // no remote media/network
    if (t.type === "codespan") return "<code>" + isolate(t.text) + "</code>";
    if (t.type === "br") return "<br>";
    if (t.tokens) return inline(t.tokens);
    return isolate(t.text ?? t.raw ?? "");
  }).join("");
  const block = tokens => tokens.map(t => {
    if (t.type === "space" || t.type === "def") return "";
    if (t.type === "heading") return "<h" + Math.max(2,t.depth) + ">" + inline(t.tokens) + "</h" + Math.max(2,t.depth) + ">";
    if (t.type === "paragraph" || t.type === "text") {
      // An evidence chain is not a visa-family dependency graph. Preserve
      // family arrows verbatim, but make authored document chains readable.
      if (e33g && t.text?.includes("→") && !/E31[BEH]/.test(t.text) && t.text.split("→").length >= 4) {
        const parts = t.text.replace(/^\*\*|\*\*$/g,"").split("→");
        return '<ol class="e33g-evidence-flow">' + parts.map(p=>'<li>'+inline(Lexer.lexInline(p.trim()))+'</li>').join("")+'</ol>';
      }
      return "<p>" + inline(t.tokens ?? Lexer.lexInline(t.text)) + "</p>";
    }
    if (t.type === "list") {
      const tag = t.ordered ? "ol" : "ul";
      const roles = e33g && t.items.length === 2 && /E31B/.test(t.raw) && /E31E/.test(t.raw);
      return "<" + tag + (roles ? ' class="e33g-family-roles"' : "") + (t.ordered ? ' start="' + Number(t.start) + '"' : "") + ">" +
        t.items.map(item => "<li>" + block(item.tokens) + "</li>").join("") + "</" + tag + ">";
    }
    if (t.type === "table") {
      const row = (cells,tag) => "<tr>" + cells.map(c => "<" + tag +
        (tag === "th" ? ' scope="col"' : "") + ">" + inline(c.tokens) + "</" + tag + ">").join("") + "</tr>";
      return '<p class="table-scroll-hint" data-table-scroll-hint><bdi dir="ltr" aria-hidden="true">⇆</bdi> '+escapeHtml(tableHints[locale]??tableHints.en)+'</p><div class="table-scroll" tabindex="0" data-columns="' + t.header.length + '" aria-label="'+escapeHtml(tableHints[locale]??tableHints.en)+'"><table><thead>' + row(t.header,"th") +
        "</thead><tbody>" + t.rows.map(r => row(r,"td")).join("") + "</tbody></table></div>";
    }
    if (t.type === "blockquote") return "<blockquote>" + block(t.tokens) + "</blockquote>";
    if (t.type === "hr") return "<hr>";
    return "<p>" + escapeHtml(t.text ?? t.raw ?? "") + "</p>"; // code/raw HTML is inert
  }).join("");
  return block(Lexer.lex(source,{gfm:true}));
}
export function buildRegistryDocument(registry, contentId, locale = "ru", {readBody, readMetadata, projection = null, now = Date.now(), targetHref = previewHref} = {}) {
  const record = registry.records.find(r => r.contentId === contentId);
  const language = registry.locales.find(l => l.code === locale);
  if (!record || !language) return null;
  const payload = locale === "ru" ? record.candidate.ru : record.candidate.translations[locale];
  if (!payload?.bodyFile || (locale !== "ru" && (!payload.complete || payload.qa !== "passed" ||
    payload.sourceRevision !== record.candidate.revision))) return null;
  const source = (readBody ?? (file => readFileSync(new URL(file,sourceRoot),"utf8")))(payload.bodyFile);
  const presentation = approvedPresentationDecision(record,locale,payload,source);
  // T1 extracted-copy shells have no structured editorial envelope. Keep
  // their existing renderer; do not turn preserved VOA preview into a 503.
  if (!payload.metadataFile && !/^\*\*H1:\*\*.+$/m.test(source)) return null;
  const commercial = record.kind !== "knowledge";
  const metadataReader=file=>JSON.parse((readMetadata??(file=>readFileSync(new URL(file,sourceRoot),"utf8")))(file));
  let metadata=null;
  if(payload.metadataFile){
    const bytes=(readMetadata??(file=>readFileSync(new URL(file,sourceRoot),"utf8")))(payload.metadataFile);
    if(createHash("sha256").update(bytes).digest("hex")!==payload.metadataSha256 ||
      createHash("sha256").update(source).digest("hex")!==payload.bodySha256)throw Error("Structured body/metadata approval drift");
    metadata=JSON.parse(bytes);
  }
  const fullD1=metadata?.fullPayloadKind==='D1_D2_FULL_JSON_V1';
  if(fullD1)metadata=bindD1Payload(metadata,{contentId,locale});
  const authored = fullD1 ? parseD1Editorial(metadata,{projection,locale,now}) : metadata ? parseStructuredEditorial(source,metadata) : parseEditorial(source,{commercial,locale,compactDirect:contentId.startsWith("knowledge_e33g_")});
  const omitted = [], unmapped = new Set(), unresolvedUsd = new Set();
  // Proven initial VISA operations only. Extensions cannot inherit a generic
  // SERVICE/default price. No seed amount, new FX provider or rounding formula.
  const pricingKey = record.pricingRef?.entityType === "VISA" &&
    record.pricingRef.optionCodes.length === 1 && record.pricingRef.optionCodes[0] === "standard" &&
    ((contentId === "c1" && record.pricingRef.entityKey === "C1") ||
      (contentId === "voa" && record.pricingRef.entityKey === "VOA")) ? record.pricingRef.entityKey : null;
  const initial = pricingKey !== null;
  // Knowledge references reuse the same operation, never a second service.
  const extensionId={knowledge_c1_extension:"c1_extension",knowledge_evoa_extension:"voa_extension"}[contentId] ?? contentId;
  const extensionRecord=registry.records.find(r=>r.contentId===extensionId);
  const extensionPrice=extensionPublishedPrice(extensionRecord,projection,now);
  const validProjection = projection && typeof projection.projection_id === "string" &&
    Number.isInteger(projection.catalog_version_id) && Number.isInteger(projection.fx_snapshot_id) &&
    Number.isFinite(Date.parse(projection.derived_expires_at)) && Array.isArray(projection.items) &&
    projection.currency === "IDR" && projection.fx?.status === "fresh" &&
    projection.display_usd_approx_formula_version === "IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1";
  const matches = validProjection ? projection.items.filter(i => i?.entity_type === "VISA" &&
    i.entity_key === pricingKey && i.option_code === "standard") : [];
  const accepted = initial && matches.length === 1 && matches[0].show_price === true &&
    typeof matches[0].amount_idr === "string" && /^[1-9]\d{0,17}$/.test(matches[0].amount_idr) &&
    (pricingKey !== "C1" || matches[0].amount_idr === "2000000") ? matches[0] : null;
  const idrText = accepted ? BigInt(accepted.amount_idr).toString().replace(/\B(?=(\d{3})+(?!\d))/g," ") : "";
  const usdSuffix = accepted ? visaPriceText(pricingKey,{...projection,items:[{...accepted,fee_note:{}}]},"en",
    {heading:"",feesIncluded:"",noExtra:"",line:"{usdSuffix}"},now).trim() : "";
  const safeUsdSuffix = extensionPrice?.usdSuffix ?? (/^\(≈ \$\d+(?:\.\d+)?\)$/.test(usdSuffix) ? usdSuffix : "");
  const e33g = ["e33g","knowledge_e33g_overview","knowledge_e33g_documents","knowledge_e33g_family"].includes(contentId);
  const e33gPrices = e33gPublishedPrices(record,projection,now);
  const e33gBinding = contentId === "e33g" && record.pricingRef?.entityKey === "E33G";
  const usdHtml = safeUsdSuffix ? '<span data-preview-usd-expires="' +
    escapeHtml(projection.derived_expires_at) + '"><bdi dir="ltr">' + escapeHtml(safeUsdSuffix) + '</bdi></span>' : "";
  const e33gHtml = option => e33gPrices?.[option].usdSuffix ? '<span data-preview-usd-expires="' +
    escapeHtml(e33gPrices[option].expires) + '"><bdi dir="ltr">' + escapeHtml(e33gPrices[option].usdSuffix) + '</bdi></span>' : "";
  const prepare = (md,area="section",sectionIndex=-1) => {
    const bound=bindAuthoredPrices(md,{contentId,area,sectionIndex,publicBuild:targetHref!==previewHref});
    let value = bound.text.split("\n").filter(line => {
      const field=line.match(/^\*\*([^*]+?)[:：]\s*\*\*/);
      return !field || !(primaryLabel.test(field[1].trim()) || secondaryLabel.test(field[1].trim()));
    }).join("\n").replaceAll("{{PRICE_IDR}}", accepted ? idrText + " IDR" :
      e33gPrices ? e33gPrices.standard.idr + " IDR" :
      e33gBinding && /12[ ,.\u00a0]000[ ,.\u00a0]000 IDR/.test(source) ? "12 000 000 IDR" : interfaceLabels[locale][2])
    // Only the approved extension's price token is rebound. Statutory fees,
    // document balances and other amounts are never rewritten.
    .replace(extensionId==="c1_extension" ? /(?:2[ ,.\u00a0]000[ ,.\u00a0]000)(?=\s*IDR)|(?<=IDR\s)2[ ,.\u00a0]000[ ,.\u00a0]000/g :
      extensionId==="voa_extension" ? /850[ ,.\u00a0]000(?=\s*IDR)|(?<=IDR\s)850[ ,.\u00a0]000/g : /$^/g,
      match=>extensionPrice ? extensionPrice.idr : match)
    .replace(/[ \t]*[(（][^()（）\n]*(?:\{\{USD(?:_\d+M)?\}\}|\$\[динамический USD[^\]]*\])[^()（）\n]*[)）]/g, match => {
      unresolvedUsd.add(match);
      if (e33gPrices) {
        const option=match.includes("USD_14M") ? "express" : "standard";
        return e33gPrices[option].usdSuffix ? " {{PREVIEW_USD_"+option.toUpperCase()+"}}" : "";
      }
      return (initial || extensionPrice) && safeUsdSuffix ? " {{PREVIEW_USD}}" : "";
    }).replace(/\{\{USD(?:_\d+M)?\}\}/g, match => {unresolvedUsd.add(match);return "";});
    if (presentation.removeInternalInstructions) {
      value = removeApprovedInternalInstructions(value,omitted,safeUsdSuffix ? "{{PREVIEW_USD}}" : "");
    }
    let html=safeMarkdown(value,{registry,locale,e33g,targetHref,onUnmapped:route=>unmapped.add(route)})
      .replaceAll("{{PREVIEW_USD}}",usdHtml)
      .replaceAll("{{PREVIEW_USD_STANDARD}}",e33gHtml("standard"))
      .replaceAll("{{PREVIEW_USD_EXPRESS}}",e33gHtml("express"));
    for(const {marker,operation} of bound.bindings){
      const price=registryPrice(operation,projection,now);
      const attrs=price ? ' data-projection-id="'+escapeHtml(price.projectionId)+'" data-catalog-version="'+price.catalogVersion+'" data-fx-version="'+price.fxVersion+'"' : "";
      html=html.replaceAll(marker,'<span dir="ltr" data-registry-price="'+operation+'"'+attrs+'><bdi dir="ltr">'+escapeHtml(priceDisplay(operation,projection,locale,now))+'</bdi></span>');
    }
    return html;
  };
  const related = new Set(record.relatedContentIds);
  const suppliedRelated=new Map((fullD1?metadata.relatedContent:[]).map(item=>
    [Object.keys(d1PageKeys).find(id=>d1PageKeys[id]===item.pageKey),item.label]));
  let relatedHeading=null;
  let afterTariffs = false;
  const sections = authored.sections.flatMap((s,i) => {
    if (internalHeadings.test(s.heading)) {
      if(fullD1)relatedHeading=s.heading;
      for (const m of s.text.matchAll(/\/(?:[a-z0-9-]+\/)+/g)) {
        const target = resolveTarget(registry,m[0]); if(target) related.add(target.contentId); else unmapped.add(m[0]);
      }
      omitted.push(s.heading); return [];
    }
    const cardStarts = [...s.text.matchAll(/^### (.+)$/gm)];
    const tariffs = contentId === "e33g" && cardStarts.length === 2 && s.text.includes("USD_12M") && s.text.includes("USD_14M");
    const timing = contentId === "e33g" && afterTariffs;
    afterTariffs = tariffs;
    const versionAttrs = e33gPrices ? ' data-catalog-version="'+e33gPrices.standard.catalogVersion+'" data-fx-version="'+e33gPrices.standard.fxVersion+'" data-projection-id="'+escapeHtml(e33gPrices.standard.projectionId)+'"' : "";
    const scopedPricing = presentation.priceUnitNote && s.text.includes("USD_12M") && s.text.includes("USD_14M");
    const unitNote = scopedPricing ? '<p class="e33g-price-unit" data-price-unit="per_person">'+isolate(presentation.priceUnitNote)+'</p>' : "";
    const html = tariffs ? prepare(s.text.slice(0,cardStarts[0].index),"section",i) + unitNote + '<div class="e33g-tariff-grid"'+versionAttrs+'>' +
      cardStarts.map((m,j)=>{const text=s.text.slice(m.index,cardStarts[j+1]?.index);
        return '<div class="e33g-tariff-card" data-price-option="'+(text.includes("USD_14M")?"express":"standard")+'">'+prepare(text,"section",i)+'</div>';
      }).join("") + '</div>' : unitNote + prepare(s.text,"section",i);
    return [{id:"section-" + i,heading:s.heading,html,faq:faqHeading.test(s.heading) &&
      // Legacy ZH issue bullets are not FAQ; supplied SYNC Q&A has H3 questions.
      !(e33g && locale==="zh-Hans" && s.heading==="常见问题" && !cardStarts.length),timing,tariffs}];
  });
  const labelFor = target => {
    if(suppliedRelated.has(target.contentId))return {label:suppliedRelated.get(target.contentId),lang:locale};
    const data = locale === "ru" ? target.candidate.ru : target.candidate.translations[locale];
    if (data?.bodyFile && (locale === "ru" || data.qa === "passed")) {
      const raw = (readBody ?? (file=>readFileSync(new URL(file,sourceRoot),"utf8")))(data.bodyFile);
      return {label:data.metadataFile ? metadataReader(data.metadataFile).h1 : raw.match(/^\*\*H1:\*\*\s*(.+)$/m)?.[1] ?? target.title,lang:locale};
    }
    return {label:target.title,lang:"ru"};
  };
  const labels=interfaceLabels[locale];
  const selectedLanguage=languageChoices.find(l=>l[0]===locale);
  const languageUi=languageLabels[locale];
  const suppliedLabel=[...source.matchAll(/^\*\*([^*]+?)[:：]\s*\*\*\s*(.+)$/gm)]
    .find(m=>primaryLabel.test(m[1].trim()))?.[2]?.trim();
  const nestedFactTitle=authored.fact.text.match(/^#{2,3} (.+)\n/);
  return {contentId,locale,dir:language.dir,commercial, title:authored.title,titleHtml:isolate(authored.title),seoTitle:authored.seoTitle,
    description:authored.description,introHtml:prepare(authored.intro,"intro"),directHtml:prepare(authored.direct,"direct"),
    factHeading:metadata?.factBlock?.heading ?? nestedFactTitle?.[1] ?? labels[0],
    factHtml:prepare(nestedFactTitle ? authored.fact.text.replace(nestedFactTitle[0],"") : authored.fact.text,"fact"),sections,
    wideFacts: /<table>/.test(prepare(authored.fact.text,"fact")),
    related:[...related].filter(id=>id!==contentId).map(id=>registry.records.find(r=>r.contentId===id))
      .filter(Boolean).map(r=>({contentId:r.contentId,kind:r.kind,href:targetHref(r.contentId,locale),...labelFor(r)})).filter(r=>r.href),
    languages:languageChoices.map(([code,short,label])=>({code,short,label,href:targetHref(contentId,code)})),
    currentShort:languageChoices.find(l=>l[0]===locale)[1],
    languageControlLabel:languageUi[0]+" "+selectedLanguage[2]+" ("+selectedLanguage[1]+"). "+languageUi[1],
    languageHeading:languageUi[2],closeLanguageLabel:languageUi[3],breadcrumbLabel:languageUi[4],
    previewNotice:locale==="ru" ? "Закрытый preview · Не опубликовано · Отправка заявок отключена" :
      "Protected preview · Not published · Lead submissions disabled",
    managerLabel:fullD1 ? metadata.cta[0].label : suppliedLabel?.replace(/^`(.+)`$/,"$1") ?? labels[2],relatedLabel:relatedHeading??labels[1],
    ctaActions:fullD1 ? metadata.cta.map(action=>{
      const target=Object.keys(d1PageKeys).find(id=>d1PageKeys[id]===action.targetPageKey);
      const navigation=['service_page','open_service','open_knowledge'].includes(action.actionIntent);
      const href=navigation&&target ? targetHref(target,locale) : null;
      if(navigation&&!href)throw Error('Unresolved supplied D1 CTA target');
      return {label:action.label,href,manager:!navigation,intent:action.actionIntent};
    }) : null,
    seoPriceTemplate:fullD1&&authored.descriptionTemplate.includes('{{CATALOG_PRICE:') ? authored.descriptionTemplate : null,
    faqSchema:fullD1 ? metadata.faq.map(item=>{const answerTemplate=item.answerMarkdown.replace(/\*\*|(?<!\w)_|_(?!\w)/g,'');
      return {question:item.question,answer:renderPriceTemplate(answerTemplate,projection,locale,now),answerTemplate};}) : null,
    pricingHref:targetHref===previewHref && (initial || e33gBinding || record.pricingRef?.entityKey==="visa-extension") ? previewHref(contentId,locale) + "&pricing=published" : null,
    tariffPrices:e33gPrices,
    priceUnit:presentation.priceUnit,
    familyApplicabilityNote:familyApplicabilityNote(contentId,locale),
    price:extensionPrice ?? (accepted ? {idr:idrText,
      usdSuffix:safeUsdSuffix,expires:projection.derived_expires_at,projectionId:projection.projection_id,
      catalogVersion:projection.catalog_version_id,fxVersion:projection.fx_snapshot_id} : null),
    diagnostics:{sourceHash:payload.bodySha256,sourceRevision:record.candidate.revision,
      qaMethod:locale==="ru" ? "founder_approved" : payload.qaMethod,
      presentationApproval:presentation.version,
      metadataHash:payload.metadataSha256??null,sourceEnvelopeSha256:payload.sourceEnvelopeSha256??null,
      omittedInstructions:omitted,unmappedTargets:[...unmapped],unresolvedUsd:[...unresolvedUsd]},
  };
}

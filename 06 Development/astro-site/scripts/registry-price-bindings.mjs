// Presentation bindings, never a second FX calculator or hard-coded tariff.
// Approved source amounts identify operations; live values come only from the
// versioned catalog projection. The original editorial files remain untouched.
export const priceOperations = Object.freeze({
  c1: {entity_type:"VISA",entity_key:"C1",option_code:"standard"},
  voa: {entity_type:"VISA",entity_key:"VOA",option_code:"standard"},
  c1_extension: {entity_type:"SERVICE",entity_key:"visa-extension",option_code:"c1-extension"},
  voa_extension: {entity_type:"SERVICE",entity_key:"visa-extension",option_code:"voa-extension"},
  e33g_standard: {entity_type:"VISA",entity_key:"E33G",option_code:"standard"},
  e33g_express: {entity_type:"VISA",entity_key:"E33G",option_code:"express"},
  d1_extension:{entity_type:"SERVICE",entity_key:"visa-extension",option_code:"d1-extension"},
  d2_extension:{entity_type:"SERVICE",entity_key:"visa-extension",option_code:"d2-extension"},
  e33g_extension:{entity_type:"SERVICE",entity_key:"visa-extension",option_code:"e33g-extension"},
  employment_review:{entity_type:"SERVICE",entity_key:"consultation",option_code:"e33g-document-review"},
  conversion_from_voa:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-voa"},
  conversion_from_kitas:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-kitas"},
  conversion_from_c1:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-c1"},
  conversion_from_d12:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-d12"},
  e33g_conversion_voa:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-voa"},
  e33g_conversion_kitas:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-kitas"},
  e33g_conversion_c1:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-c1"},
  e33g_conversion_d12:{entity_type:"VISA",entity_key:"E33G",option_code:"conversion-from-d12"},
  "d1-one-year-standard":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d1-one-year-standard"},
  "d1-one-year-express":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d1-one-year-express"},
  "d1-two-year-standard":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d1-two-year-standard"},
  "d1-two-year-express":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d1-two-year-express"},
  "d1-five-year-standard":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d1-five-year-standard"},
  "d1-five-year-express":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d1-five-year-express"},
  "d2-one-year-standard":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d2-one-year-standard"},
  "d2-one-year-express":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d2-one-year-express"},
  "d2-two-year-standard":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d2-two-year-standard"},
  "d2-two-year-express":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d2-two-year-express"},
  "d2-five-year-standard":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d2-five-year-standard"},
  "d2-five-year-express":{entity_type:"VISA",entity_key:"D1/D2",option_code:"d2-five-year-express"},
});
const compositions = new Set(["c1-issuance-plus-1-extension","c1-issuance-plus-2-extensions","c1-extension-x1","c1-extension-x2","c1-extension-x3","d1-extension-x2","d2-extension-x2"]);
const d1D2Compositions=new Set(['d1-extension-x2','d2-extension-x2']);
const sharedVariants=Object.freeze({
  'd1-d2-extension-equal':['d1_extension','d2_extension'],
  'd1-d2-extension-x2':['d1-extension-x2','d2-extension-x2'],
});
export function registryPrice(operation, projection, now=Date.now()) {
  if(Object.hasOwn(sharedVariants,operation)) {
    const values=sharedVariants[operation].map(variant=>registryPrice(variant,projection,now));
    if(values.some(value=>!value))return null;
    const [left,right]=values;
    return ['idr','usd','projectionId','catalogVersion','fxVersion','expires'].every(key=>left[key]===right[key]) ? left : null;
  }
  if(!projection?.projection_id || !Number.isInteger(projection.catalog_version_id) || projection.catalog_version_id<=0 ||
    !Number.isInteger(projection.fx_snapshot_id) || projection.fx_snapshot_id<=0 || projection.currency!=="IDR" || !Array.isArray(projection.items)) return null;
  const spec=priceOperations[operation];
  const d1D2Option=spec&&(spec.entity_key==='D1/D2'||operation==='d1_extension'||operation==='d2_extension');
  const d1D2Composition=d1D2Compositions.has(operation);
  if(d1D2Composition&&!Array.isArray(projection.compositions))return null;
  const rows=spec ? projection.items.filter(item=>Object.entries(spec).every(([key,value])=>item?.[key]===value)) :
    compositions.has(operation) ? (projection.compositions??[]).filter(item=>item?.recipe_code===operation) : [];
  if(rows.length!==1) return null;
  const item=rows[0];
  if(item.show_price!==true || (spec && item.price_qualifier!=="EXACT") || typeof item.amount_idr!=="string" || !/^[1-9]\d{0,17}$/.test(item.amount_idr)) return null;
  // D1/D2 consumes the full canonical contract. Keep legacy C1/E33G adapters
  // unchanged; never reinterpret an unverified option or mixed-version total.
  if(d1D2Option&&item.fee_verification_status!=='VERIFIED')return null;
  if(d1D2Composition) {
    if(item.price_qualifier!=='EXACT'||item.currency!==projection.currency||
      !Number.isInteger(projection.publication_version)||projection.publication_version<=0||
      !Number.isInteger(projection.catalog_version)||projection.catalog_version<=0||
      !Number.isInteger(projection.fx?.version)||projection.fx.version<=0||
      typeof projection.derived_expires_at!=='string'||!Number.isFinite(Date.parse(projection.derived_expires_at))||
      typeof projection.formula_version!=='string'||!projection.formula_version||
      typeof projection.display_usd_approx_formula_version!=='string'||!projection.display_usd_approx_formula_version||
      !['publication_version','derived_expires_at','formula_version','display_usd_approx_formula_version']
        .every(key=>item[key]===projection[key])||item.fx_status!==projection.fx.status)return null;
  }
  if(!spec && (item.projection_id!==projection.projection_id || item.catalog_version!==projection.catalog_version || item.fx_version!==projection.fx?.version)) return null;
  const expiry=Date.parse(projection.derived_expires_at);
  const usd=typeof item.display_usd_approx==="string" && /^\d{1,18}$/.test(item.display_usd_approx) && BigInt(item.display_usd_approx)%5n===0n &&
    Number.isFinite(expiry) && now<=expiry && ["fresh","stale"].includes(projection.fx?.status) && projection.display_usd_approx_formula_version==="IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1"
      ? item.display_usd_approx : null;
  return {idr:BigInt(item.amount_idr).toString().replace(/\B(?=(\d{3})+(?!\d))/g," "),usd,
    projectionId:projection.projection_id,catalogVersion:projection.catalog_version_id,fxVersion:projection.fx_snapshot_id,expires:projection.derived_expires_at};
}
export const unavailablePrice = {
  ru:"Актуальная цена временно недоступна", en:"Current price temporarily unavailable", "zh-Hans":"当前价格暂不可用",ko:"현재 가격을 확인할 수 없습니다",fr:"Tarif actuel temporairement indisponible",de:"Aktueller Preis vorübergehend nicht verfügbar",ja:"現在の料金は一時的に確認できません",hi:"वर्तमान कीमत अस्थायी रूप से उपलब्ध नहीं है",es:"Precio actual temporalmente no disponible",ar:"السعر الحالي غير متاح مؤقتًا",
};
export function priceDisplay(operation,projection,locale,now=Date.now()) {
  const price=registryPrice(operation,projection,now);
  return price ? price.idr+" IDR"+(price.usd!==null?" (≈ $"+price.usd+")":"") : unavailablePrice[locale]??unavailablePrice.en;
}
export function registryPriceTemplate(template,projection,locale,now=Date.now()) {
  return String(template).replace(/\{\{CATALOG_PRICE:([a-z0-9_-]+)\}\}/g,
    (_,operation)=>priceDisplay(operation,projection,locale,now));
}
// C1 price article is intentionally mixed: initial filing and extensions are
// different editable operations even though their approved amounts coincide.
const c1Sections = {
  0:["c1","c1_extension"], 1:["c1","c1_extension","c1_extension"],
  2:["c1"],3:["c1_extension"],4:["c1","c1_extension"],
  5:["c1","c1_extension","c1_extension"],8:["c1","c1_extension"],
};
const amountPattern = /(?:(?:IDR\s*)?([246][ ,.\u00a0]000[ ,.\u00a0]000|850[ ,.\u00a0]000|1[24][ ,.\u00a0]000[ ,.\u00a0]000)(?:\s*IDR)?)(?:[ \t]*[(（][^()（）\n]*\{\{USD(?:_\d+M)?\}\}[^()（）\n]*[)）])?/g;
export function bindAuthoredPrices(markdown,{contentId,area="section",sectionIndex=-1,publicBuild=false}={}) {
  let twos=0;
  const bindings=[];
  const withInitialTokens=markdown.replace(/\{\{PRICE_IDR\}\}(?:[ \t]*[(（][^()（）\n]*\{\{USD(?:_\d+M)?\}\}[^()（）\n]*[)）])?/g,match=>{
    const operation={voa:'voa',c1:'c1',e33g:'e33g_standard'}[contentId];
    if(!operation)throw Error('Unbound initial price token: '+contentId);
    const marker='{{REGISTRY_PRICE_'+bindings.length+'}}';bindings.push({marker,operation,source:match});return marker;
  });
  const staged=withInitialTokens.replace(/\{\{CATALOG_PRICE:([a-z0-9_-]+)\}\}/g,(match,operation)=>{
    if(!priceOperations[operation]&&!compositions.has(operation)&&!Object.hasOwn(sharedVariants,operation))throw Error('Unknown catalog operation: '+operation);
    const marker='{{REGISTRY_PRICE_'+bindings.length+'}}';bindings.push({marker,operation,source:match});return marker;
  });
  const text=staged.replace(amountPattern,(match,amount)=>{
    const digits=amount.replace(/\D/g,"");
    let operation=null;
    if(contentId==="knowledge_c1_price") {
      if(digits==="4000000") operation="c1-issuance-plus-1-extension";
      else if(digits==="6000000") operation="c1-issuance-plus-2-extensions";
      else if(digits==="2000000") operation=area==="section" ? c1Sections[sectionIndex]?.[twos++] : "c1";
      // Other sections do not discuss a standalone 2m tariff. Fail closed if
      // future editorial revisions move operations without updating bindings.
      if(digits==="2000000" && !operation) throw Error("Unbound C1 price operation: "+area+"/"+sectionIndex);
    } else if(contentId==="knowledge_c1_extension") {
      operation=digits==='2000000'?(match.includes('USD_2M')?'c1':'c1_extension'):
        ({"4000000":"c1-issuance-plus-1-extension","6000000":"c1-issuance-plus-2-extensions"})[digits];
    } else if(["c1","knowledge_c1_overview"].includes(contentId) && digits==="2000000") operation="c1";
    else if(contentId==="c1_extension" && digits==="2000000") operation="c1_extension";
    else if(["voa_extension","knowledge_evoa_extension"].includes(contentId) && digits==="850000") operation="voa_extension";
    else if(["voa","knowledge_evoa_online","knowledge_evoa_vs_voa"].includes(contentId) && digits==="850000") operation="voa";
    else if(contentId==="e33g" || contentId.startsWith("knowledge_e33g_")) operation=({"12000000":"e33g_standard","14000000":"e33g_express"})[digits];
    if(!operation) return match;
    const marker="{{REGISTRY_PRICE_"+bindings.length+"}}";
    bindings.push({marker,operation,source:match});
    return marker;
  });
  return {text,bindings,publicBuild};
}

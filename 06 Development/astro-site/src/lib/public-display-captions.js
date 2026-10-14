// Public display-only literals replayed from actual DEV3_020 / DEV4_008 MD sources.
// No financial amounts, source QA, private candidates or publication authority.
const locales=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
const captions=Object.freeze(Object.fromEntries(Object.entries({
  "public.live.og.category.visaOverview": {
    "ru": "ВИЗОВАЯ СПРАВКА",
    "en": "VISA OVERVIEW",
    "es": "INFORMACIÓN GENERAL SOBRE VISAS",
    "de": "VISA IM ÜBERBLICK",
    "fr": "APERÇU DES VISAS",
    "hi": "वीज़ा की जानकारी",
    "ar": "نظرة عامة على التأشيرات",
    "zh-Hans": "签证概览",
    "ja": "ビザの概要",
    "ko": "비자 개요"
  },
  "public.live.og.category.travelGuide": {
    "ru": "ПУТЕВОДИТЕЛЬ",
    "en": "TRAVEL GUIDE",
    "es": "GUÍA DE VIAJE",
    "de": "REISEFÜHRER",
    "fr": "GUIDE DE VOYAGE",
    "hi": "यात्रा मार्गदर्शिका",
    "ar": "دليل السفر",
    "zh-Hans": "旅行指南",
    "ja": "旅行ガイド",
    "ko": "여행 가이드"
  },
  "public.live.og.category.travelServices": {
    "ru": "ПОЕЗДКИ И УСЛУГИ",
    "en": "TRAVEL & SERVICES",
    "es": "VIAJES Y SERVICIOS",
    "de": "REISEN & DIENSTLEISTUNGEN",
    "fr": "VOYAGES ET SERVICES",
    "hi": "यात्राएँ और सेवाएँ",
    "ar": "السفر والخدمات",
    "zh-Hans": "旅行与服务",
    "ja": "旅行とサービス",
    "ko": "여행 및 서비스"
  },
  "public.live.price.onRequest": {
    "ru": "Цена по запросу",
    "en": "Price on request",
    "es": "Precio a consultar",
    "de": "Preis auf Anfrage",
    "fr": "Prix sur demande",
    "hi": "कीमत पूछताछ पर",
    "ar": "السعر عند الطلب",
    "zh-Hans": "价格请咨询",
    "ja": "価格はお問い合わせください",
    "ko": "가격 문의"
  },
  "public.live.price.fromPrefix": {
    "ru": "от ",
    "en": "from ",
    "es": "desde ",
    "de": "ab ",
    "fr": "à partir de ",
    "hi": "शुरुआती कीमत ",
    "ar": "ابتداءً من ",
    "zh-Hans": "起价 ",
    "ja": "最低料金 ",
    "ko": "시작 가격 "
  },
  "public.live.price.temporarilyUnavailable": {
    "ru": "Цена временно недоступна",
    "en": "Price temporarily unavailable",
    "es": "Precio temporalmente no disponible",
    "de": "Preis vorübergehend nicht verfügbar",
    "fr": "Prix temporairement indisponible",
    "hi": "कीमत अस्थायी रूप से उपलब्ध नहीं है",
    "ar": "السعر غير متاح مؤقتًا",
    "zh-Hans": "价格暂时不可用",
    "ja": "価格情報は一時的にご利用いただけません",
    "ko": "가격 정보를 일시적으로 확인할 수 없습니다"
  }
}).map(([key,row])=>[key,Object.freeze(row)])));
function caption(key,locale){
  if(typeof locale!=='string'||!locales.includes(locale))throw Error('Unsupported public display locale');
  if(typeof key!=='string'||!Object.hasOwn(captions,key))throw Error('Unknown public display caption');
  return captions[key][locale];
}
const priceKeys=Object.freeze({onRequest:'public.live.price.onRequest',fromPrefix:'public.live.price.fromPrefix',temporarilyUnavailable:'public.live.price.temporarilyUnavailable'});
export function publicPriceLabel(key,locale){
  if(typeof key!=='string'||!Object.hasOwn(priceKeys,key))throw Error('Unknown public price label');
  return caption(priceKeys[key],locale);
}
export function publicOgCategory(visa,guide,locale){
  if(typeof visa!=='boolean'||typeof guide!=='boolean')throw Error('Invalid public artwork category');
  return caption(visa?'public.live.og.category.visaOverview':guide?'public.live.og.category.travelGuide':'public.live.og.category.travelServices',locale);
}

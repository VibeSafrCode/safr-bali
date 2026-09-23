import catalogSnapshot from "../../shared/content/generated/catalog-runtime.v1.json";
import publicI18n from "../../shared/content/generated/i18n/public.v1.json";
import type { LocaleCode } from "./i18n/locale";
import { insuranceService, insertInsurance } from '../../shared/src/insurance';

export type CatalogStatus = "available" | "soon";

export type CatalogItem = {
  id: string;
  name: string;
  icon: string;
  summary: string;
  status?: CatalogStatus;
  note?: string;
  content?: string;
  publiclyHidden?: boolean;
  download?: {
    href: string;
    fileName: string;
    mediaType: "application/pdf";
    sizeBytes: number;
    language: "ru";
    updatedAt: string;
    label: string;
    recommendation: string;
    meta: string;
  };
  children?: readonly CatalogItem[];
};

export type Destination = {
  id: "bali" | "thailand" | "russia" | "nepal" | "uae";
  number: string;
  name: string;
  icon: string;
  color: "coral" | "blue" | "violet" | "orange";
  className: string;
  eyebrow: string;
  description: string;
  services: readonly CatalogItem[];
};

const baseDestinations =
  [...catalogSnapshot.destinations, {id:'uae',number:'05',name:'ОАЭ',icon:'◇',color:'orange',className:'uae',eyebrow:'ОАЭ',description:'Сервисы готовятся к запуску.',services:[{id:'visas',name:'Визы',icon:'▣',summary:'Уточните доступность визового сопровождения.',status:'soon'},{id:'housing',name:'Жильё',icon:'⌂',summary:'Уточните доступность поиска жилья.',status:'soon'},{id:'assistant',name:'Ассистент',icon:'✦',summary:'Помощь с поездкой в ОАЭ.',status:'soon'}]}] as readonly Destination[];

type PublicRuntimeEntry = { ru: string; en: string };

export const destinations: readonly Destination[] = baseDestinations.map(destination =>
  destination.id === 'uae' ? {...destination, services:insertInsurance<CatalogItem>(destination.services,insuranceService())} : destination,
);

function localizedValue(
  key: string,
  locale: LocaleCode,
  fallback: string | undefined,
) {
  const entry = (publicI18n.entries as Record<string, PublicRuntimeEntry>)[key];
  return entry?.[locale] ?? fallback;
}

function localizedItem(
  item: CatalogItem,
  prefix: string,
  locale: LocaleCode,
): CatalogItem {
  return {
    ...item,
    name: localizedValue(`${prefix}.name`, locale, item.name) ?? item.name,
    summary: localizedValue(`${prefix}.summary`, locale, item.summary) ?? item.summary,
    note: localizedValue(`${prefix}.note`, locale, item.note),
    content: localizedValue(`${prefix}.content`, locale, item.content),
    download: item.download
      ? {
          ...item.download,
          label:
            localizedValue(`${prefix}.downloadLabel`, locale, item.download.label) ??
            item.download.label,
          recommendation:
            localizedValue(
              `${prefix}.downloadRecommendation`,
              locale,
              item.download.recommendation,
            ) ?? item.download.recommendation,
          meta:
            localizedValue(`${prefix}.downloadMeta`, locale, item.download.meta) ??
            item.download.meta,
        }
      : undefined,
    children: item.children?.map((child) =>
      localizedItem(child, `${prefix}.${child.id}`, locale),
    ),
  };
}

const localizedDestinations = new Map<LocaleCode, readonly Destination[]>();

export function destinationsForLocale(locale: LocaleCode = "ru") {
  const cached = localizedDestinations.get(locale);
  if (cached) return cached;
  const translated = destinations.map((destination) => ({
    ...destination,
    name:
      localizedValue(
        `catalog.destination.${destination.id}.name`,
        locale,
        destination.name,
      ) ?? destination.name,
    eyebrow:
      localizedValue(
        `catalog.destination.${destination.id}.eyebrow`,
        locale,
        destination.eyebrow,
      ) ?? destination.eyebrow,
    description:
      localizedValue(
        `catalog.destination.${destination.id}.description`,
        locale,
        destination.description,
      ) ?? destination.description,
    services: destination.services.map((service) =>
      localizedItem(
        service,
        `catalog.${destination.id}.${service.id}`,
        locale,
      ),
    ),
  })) as readonly Destination[];
  if(locale==='en') { const uae=translated.find(d=>d.id==='uae'); if(uae){uae.name='UAE';uae.description='Services are being prepared.';uae.services=uae.services.map(s=>s.id==='insurance'?s:({...s,name:({visas:'Visas',housing:'Stays',assistant:'Assistant'} as Record<string,string>)[s.id],summary:'Ask the team about availability.'}));}}
  localizedDestinations.set(locale, translated);
  return translated;
}

export function destinationById(id: string | null, locale: LocaleCode = "ru") {
  return destinationsForLocale(locale).find((destination) => destination.id === id) ?? null;
}

export function canonicalDestinationName(id: Destination["id"]) {
  return destinations.find((destination) => destination.id === id)?.name ?? id;
}

export function canonicalCatalogItemName(
  destinationId: Destination["id"],
  serviceId: string,
  itemId?: string,
) {
  if (serviceId === 'insurance' && destinationId !== 'russia') return insuranceService().name;
  const destination = destinations.find((entry) => entry.id === destinationId);
  const service = destination?.services.find((entry) => entry.id === serviceId);
  if (!itemId) return service?.name ?? serviceId;
  return service?.children?.find((entry) => entry.id === itemId)?.name ?? itemId;
}

export function activeServices(destination: Destination, locale:LocaleCode="ru") {
  const services = destination.services.filter(service=>!service.publiclyHidden);
  if(destination.id!=='bali')return services;
  return [...services.slice(0,2),{id:'bikes',name:locale==='en'?'Bikes':'Байки',icon:'bike',summary:locale==='en'?'Bike enquiries through your assistant.':'Помощь с выбором байка через ассистента.',content:locale==='en'?'Tell your assistant your area, dates and preferences. Availability and price are confirmed individually.':'Напишите район, даты и пожелания. Наличие и стоимость уточняются индивидуально.',status:'available' as const},...services.slice(2)];
}

export function activeDestinations(locale: LocaleCode = "ru") {
  const order=['bali','thailand','uae','nepal','russia'];
  return [...destinationsForLocale(locale)].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
}

export const catalogSnapshotMeta = {
  id: catalogSnapshot.snapshotId,
  revision: catalogSnapshot.contentRevision,
};

/** Founder-approved enquiry service; no live quotes or coverage guarantees. */
export const INSURANCE_COUNTRIES = ["bali", "thailand", "nepal", "uae"] as const;
export const insuranceProviders = [
  { name: "LUMA", url: "https://www.lumahealth.com/", description: {
    ru: "Медицинское страхование и страхование путешествий с фокусом на Азию.",
    en: "Health and travel insurance with a focus on Asia.",
  } },
  { name: "SafetyWing", url: "https://safetywing.com/", description: {
    ru: "Медицинское страхование для путешественников и удалённых работников.",
    en: "Medical insurance for travellers and remote workers.",
  } },
] as const;

export const insuranceCopy = {
  ru: {
    title: "Страховки",
    summary: "LUMA и SafetyWing — подберём вариант под вашу поездку.",
    price: "Стоимость рассчитывается индивидуально для каждого клиента.",
    contact: "Напишите менеджеру — согласуем подходящий вариант и стоимость.",
    availability: "Доступность программы и условия уточним для вашей страны, дат и ситуации.",
    cta: "Написать менеджеру",
    brandLink: "О бренде",
  },
  en: {
    title: "Insurance",
    summary: "LUMA and SafetyWing — find an option for your trip.",
    price: "The price is calculated individually for each client.",
    contact: "Message your manager to agree on a suitable option and price.",
    availability: "We will confirm plan availability and terms for your destination, dates and circumstances.",
    cta: "Message a manager",
    brandLink: "About the brand",
  },
} as const;

export function insuranceService(locale: "ru" | "en" = "ru") {
  const text = insuranceCopy[locale];
  return { id: "insurance", name: text.title, icon: "shield", status: "available" as const,
    summary: text.summary, note: text.price,
    content: [...insuranceProviders.map(p => `${p.name}\n${p.description[locale]}`), text.price, text.contact, text.availability].join("\n\n"),
  };
}

export function insertInsurance<T extends { id: string }>(services: readonly T[], insurance: T): T[] {
  const existing = services.filter(service => service.id !== "insurance");
  const anchor = ["bikes", "housing", "property", "visas"].map(id => existing.findIndex(service => service.id === id)).find(index => index >= 0);
  const index = anchor === undefined ? existing.length : anchor + 1;
  return [...existing.slice(0, index), insurance, ...existing.slice(index)];
}

export function insuranceEnquiry(country: string, brand: string, locale: "ru" | "en") {
  return locale === "en" ? `I would like an individual insurance quote: ${brand}, ${country}.` : `Хочу согласовать страховку и индивидуальную стоимость: ${brand}, ${country}.`;
}

export function insuranceRouteContext(countryId: string, brand: string) {
  const country = ({bali:'Бали',thailand:'Таиланд',nepal:'Непал',uae:'ОАЭ'} as Record<string,string>)[countryId];
  if (!country || !insuranceProviders.some(provider => provider.name === brand)) return null;
  return {country, section:'Страховки', service:brand};
}

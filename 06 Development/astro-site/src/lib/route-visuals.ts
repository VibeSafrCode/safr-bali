import baliCountry from "../../../react-app/public/assets/heroes/bali-country-hero-approved.jpg?url";
import nepalCountry from "../../../react-app/public/assets/heroes/nepal-country-hero-approved.jpg?url";
import russiaCountry from "../../../react-app/public/assets/heroes/russia-country-hero-approved.jpg?url";
import russiaCaucasus from "../../../react-app/public/assets/heroes/russia-caucasus-region-header-approved.jpg?url";
import russiaSpb from "../../../react-app/public/assets/heroes/russia-spb-city-header-approved.jpg?url";
import russiaUral from "../../../react-app/public/assets/heroes/russia-ural-region-header-approved.jpg?url";
import thailandCountry from "../../../react-app/public/assets/heroes/thailand-country-hero-approved.jpg?url";
import baliVilla from "../../../react-app/public/assets/heroes/bali-villa-service-approved.jpg?url";
import russiaSpbBoat from "../../../react-app/public/assets/heroes/russia-spb-boat-service-approved.jpg?url";

import type { PublicPage } from "./public-catalog";

export type PublicRouteClass =
  | "home"
  | "country"
  | "location"
  | "collection"
  | "leaf"
  | "visa-list"
  | "visa-detail"
  | "calculator-gate"
  | "legal";

export type PublicVisual = {
  src: string;
  alt: string;
  position: string;
  label: string;
  title?: string;
};

const countryVisuals: Record<string, PublicVisual> = {
  bali: {
    src: baliCountry,
    alt: "Храм Пура Улун Дану Братан у озера на Бали",
    position: "60% 16%",
    label: "Направление",
    title: "Бали",
  },
  thailand: {
    src: thailandCountry,
    alt: "Традиционная лодка у известняковых островов Таиланда",
    position: "58% 30%",
    label: "Направление",
    title: "Таиланд",
  },
  russia: {
    src: russiaCountry,
    alt: "Московский Кремль и набережная Москвы-реки на рассвете",
    position: "58% 46%",
    label: "Направление",
    title: "Россия",
  },
  nepal: {
    src: nepalCountry,
    alt: "Буддийская ступа на фоне Гималаев в Непале",
    position: "60% 16%",
    label: "Направление",
    title: "Непал",
  },
};

const locationVisuals: Record<string, PublicVisual> = {
  "/russia/spb/": {
    src: russiaSpb,
    alt: "Петропавловская крепость и набережная Невы на рассвете",
    position: "62% 22%",
    label: "Город · Россия",
    title: "Санкт-Петербург",
  },
  "/russia/ural/": {
    src: russiaUral,
    alt: "Лесистые Уральские хребты и река утром",
    position: "68% 48%",
    label: "Регион · Россия",
    title: "Урал",
  },
  "/russia/caucasus/": {
    src: russiaCaucasus,
    alt: "Высокогорная долина Кавказа с рекой",
    position: "68% 48%",
    label: "Регион · Россия",
    title: "Кавказ",
  },
};

const serviceVisuals: Record<string, PublicVisual> = {
  "/bali/housing/villa/": {
    src: baliVilla,
    alt: "Вилла на Бали с небольшим бассейном и тропическим садом",
    position: "56% 48%",
    label: "Бали · жильё",
  },
  "/russia/spb/boat-spb/": {
    src: russiaSpbBoat,
    alt: "Небольшой катер на Неве утром в Санкт-Петербурге",
    position: "62% 54%",
    label: "Санкт-Петербург · прогулки",
  },
};

const locationRoutes = new Set(Object.keys(locationVisuals));

export function routeClassFor(page: PublicPage): PublicRouteClass {
  if (page.route === "/") return "home";
  if (page.kind === "legal") return "legal";
  if (page.route === "/bali/visas/") return "visa-list";
  if (page.route.startsWith("/bali/visas/")) return "visa-detail";
  if (page.route === "/bali/exchange/usdt-idr/") return "calculator-gate";
  if (locationRoutes.has(page.route)) return "location";
  if (/^\/[a-z-]+\/$/.test(page.route)) return "country";
  if (page.cards.length > 0) return "collection";
  return "leaf";
}

export function heroForRoute(route: string): PublicVisual | null {
  if (locationVisuals[route]) return locationVisuals[route];
  for (const locationRoute of ["/russia/spb/", "/russia/ural/"]) {
    if (route.startsWith(locationRoute)) return locationVisuals[locationRoute];
  }
  const countryId = route.split("/").filter(Boolean)[0];
  return countryVisuals[countryId] ?? null;
}

export function cardVisualForRoute(route: string): PublicVisual | null {
  return locationVisuals[route] ?? serviceVisuals[route] ?? null;
}

export function serviceVisualForRoute(route: string): PublicVisual | null {
  return serviceVisuals[route] ?? null;
}

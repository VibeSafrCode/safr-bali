import type { CSSProperties } from "react";

import type { Destination } from "./catalog";
import type { LocaleCode } from "./i18n/locale";
import { translate } from "./i18n/runtime";

export type CountryHeroAsset = {
  src: string;
  alt: string;
  srcSet?: string;
  position: string;
};

export type LocationHeaderTheme = {
  label: string;
  name: string;
  hero: CountryHeroAsset;
};

export type ServiceVisual = CountryHeroAsset;

export type CountryTheme = {
  slug: Destination["id"];
  name: string;
  locativeName: string;
  hero: CountryHeroAsset | null;
  accent: string;
  accentSoft: string;
};

const NEUTRAL_ACCENT = "#103c32";
const NEUTRAL_ACCENT_SOFT = "#e4ece5";

const HERO_ROOT = "/assets/heroes";

const countryVisuals: Record<
  Destination["id"],
  Pick<CountryTheme, "locativeName" | "hero">
> = {
  bali: {
    locativeName: "на Бали",
    hero: {
      src: `${HERO_ROOT}/bali-country-hero-approved.jpg`,
      srcSet: `${HERO_ROOT}/bali-country-hero-approved-768.jpg 768w, ${HERO_ROOT}/bali-country-hero-approved.jpg 1536w`,
      alt: "Храм Пура Улун Дану Братан у озера на Бали",
      position: "60% 16%",
    },
  },
  thailand: {
    locativeName: "в Таиланде",
    hero: {
      src: `${HERO_ROOT}/thailand-country-hero-approved.jpg`,
      srcSet: `${HERO_ROOT}/thailand-country-hero-approved-768.jpg 768w, ${HERO_ROOT}/thailand-country-hero-approved.jpg 1536w`,
      alt: "Традиционная лодка у известняковых островов Таиланда",
      position: "58% 30%",
    },
  },
  russia: {
    locativeName: "в России",
    hero: {
      src: `${HERO_ROOT}/russia-country-hero-approved.jpg`,
      srcSet: `${HERO_ROOT}/russia-country-hero-approved-768.jpg 768w, ${HERO_ROOT}/russia-country-hero-approved.jpg 1536w`,
      alt: "Московский Кремль и набережная Москвы-реки на рассвете",
      position: "58% 46%",
    },
  },
  nepal: {
    locativeName: "в Непале",
    hero: {
      src: `${HERO_ROOT}/nepal-country-hero-approved.jpg`,
      srcSet: `${HERO_ROOT}/nepal-country-hero-approved-768.jpg 768w, ${HERO_ROOT}/nepal-country-hero-approved.jpg 1536w`,
      alt: "Буддийская ступа на фоне Гималаев в Непале",
      position: "60% 16%",
    },
  },
};

const cityHeaders: Record<string, LocationHeaderTheme> = {
  "russia/spb": {
    label: "Город",
    name: "Санкт-Петербург",
    hero: {
      src: `${HERO_ROOT}/russia-spb-city-header-approved.jpg`,
      srcSet: `${HERO_ROOT}/russia-spb-city-header-approved-768.jpg 768w, ${HERO_ROOT}/russia-spb-city-header-approved.jpg 1536w`,
      alt: "Петропавловская крепость и набережная Невы на рассвете",
      position: "62% 22%",
    },
  },
  "russia/ural": {
    label: "Регион",
    name: "Урал",
    hero: {
      src: `${HERO_ROOT}/russia-ural-region-header-approved.jpg`,
      srcSet: `${HERO_ROOT}/russia-ural-region-header-approved-768.jpg 768w, ${HERO_ROOT}/russia-ural-region-header-approved.jpg 1536w`,
      alt: "Лесистые Уральские хребты и река утром",
      position: "68% 48%",
    },
  },
  "russia/caucasus": {
    label: "Регион",
    name: "Кавказ",
    hero: {
      src: `${HERO_ROOT}/russia-caucasus-region-header-approved.jpg`,
      srcSet: `${HERO_ROOT}/russia-caucasus-region-header-approved-768.jpg 768w, ${HERO_ROOT}/russia-caucasus-region-header-approved.jpg 1536w`,
      alt: "Высокогорная долина Кавказа с рекой",
      position: "68% 48%",
    },
  },
};

const serviceVisuals: Record<string, ServiceVisual> = {
  "bali/housing/villa": {
    src: `${HERO_ROOT}/bali-villa-service-approved.jpg`,
    srcSet: `${HERO_ROOT}/bali-villa-service-approved-768.jpg 768w, ${HERO_ROOT}/bali-villa-service-approved.jpg 1536w`,
    alt: "Вилла на Бали с небольшим бассейном и тропическим садом",
    position: "56% 48%",
  },
  "russia/spb/boat-spb": {
    src: `${HERO_ROOT}/russia-spb-boat-service-approved.jpg`,
    srcSet: `${HERO_ROOT}/russia-spb-boat-service-approved-768.jpg 768w, ${HERO_ROOT}/russia-spb-boat-service-approved.jpg 1536w`,
    alt: "Небольшой катер на Неве утром в Санкт-Петербурге",
    position: "62% 54%",
  },
};

export function countryTheme(
  destination: Destination,
  locale: LocaleCode = "ru",
): CountryTheme {
  const key = destination.id as "bali" | "thailand" | "russia" | "nepal";
  return {
    slug: destination.id,
    name: destination.name,
    locativeName: translate(locale, `theme.${key}.locative`),
    hero: countryVisuals[destination.id]?.hero
      ? {
          ...countryVisuals[destination.id]!.hero!,
          alt: translate(locale, `theme.${key}.heroAlt`),
        }
      : null,
    accent: NEUTRAL_ACCENT,
    accentSoft: NEUTRAL_ACCENT_SOFT,
  };
}

export function locationHeaderTheme(
  destinationId: Destination["id"],
  serviceId: string,
  locale: LocaleCode = "ru",
) {
  const theme = cityHeaders[`${destinationId}/${serviceId}`];
  if (!theme) return null;
  const key = serviceId === "spb" ? "spb" : serviceId === "ural" ? "ural" : "caucasus";
  return {
    ...theme,
    label: translate(locale, key === "spb" ? "theme.location.city" : "theme.location.region"),
    name: translate(locale, `theme.${key}.name`),
    hero: { ...theme.hero, alt: translate(locale, `theme.${key}.heroAlt`) },
  };
}

export function serviceVisualForRoute(
  destinationId: Destination["id"],
  serviceId: string,
  itemId?: string | null,
  locale: LocaleCode = "ru",
) {
  const key = [destinationId, serviceId, itemId].filter(Boolean).join("/");
  const visual = serviceVisuals[
    key
  ] ?? null;
  if (!visual) return null;
  return {
    ...visual,
    alt: translate(
      locale,
      key === "bali/housing/villa" ? "theme.baliVilla.heroAlt" : "theme.spbBoat.heroAlt",
    ),
  };
}

export function countryThemeStyle(theme: CountryTheme): CSSProperties {
  return {
    "--country-accent": theme.accent,
    "--country-accent-soft": theme.accentSoft,
  } as CSSProperties;
}

import type { CSSProperties } from "react";

import type { Destination } from "./catalog";

export type CountryHeroAsset = {
  src: string;
  alt: string;
  srcSet?: string;
  position: string;
};

export type LocationHeaderTheme = {
  label: "Город";
  name: string;
  hero: CountryHeroAsset;
};

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
};

export function countryTheme(destination: Destination): CountryTheme {
  return {
    slug: destination.id,
    name: destination.name,
    locativeName: countryVisuals[destination.id]?.locativeName ?? destination.name,
    hero: countryVisuals[destination.id]?.hero ?? null,
    accent: NEUTRAL_ACCENT,
    accentSoft: NEUTRAL_ACCENT_SOFT,
  };
}

export function locationHeaderTheme(
  destinationId: Destination["id"],
  serviceId: string,
) {
  return cityHeaders[`${destinationId}/${serviceId}`] ?? null;
}

export function countryThemeStyle(theme: CountryTheme): CSSProperties {
  return {
    "--country-accent": theme.accent,
    "--country-accent-soft": theme.accentSoft,
  } as CSSProperties;
}

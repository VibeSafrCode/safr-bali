// Structural route primitives only: constructing a URL does not publish it,
// establish translation coverage, grant access or authorize indexing.
export const PUBLIC_ROUTE_LOCALES = Object.freeze([
  "ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar",
] as const);

export type PublicRouteLocale = (typeof PUBLIC_ROUTE_LOCALES)[number];
export type PublicRouteDirection = "ltr" | "rtl";
type LocaleInfo = Readonly<{
  code: PublicRouteLocale;
  prefix: string;
  dir: PublicRouteDirection;
  og: string;
}>;

// Exact existing Registry conventions, not language-tag aliases. Tests bind
// code/prefix/direction to the actual Registry locale table.
export const PUBLIC_ROUTE_LOCALE_INFO: readonly LocaleInfo[] = Object.freeze([
  Object.freeze({ code: "ru", prefix: "", dir: "ltr", og: "ru_RU" } as const),
  Object.freeze({ code: "en", prefix: "/en", dir: "ltr", og: "en_US" } as const),
  Object.freeze({ code: "zh-Hans", prefix: "/zh-cn", dir: "ltr", og: "zh_CN" } as const),
  Object.freeze({ code: "ko", prefix: "/ko", dir: "ltr", og: "ko_KR" } as const),
  Object.freeze({ code: "fr", prefix: "/fr", dir: "ltr", og: "fr_FR" } as const),
  Object.freeze({ code: "de", prefix: "/de", dir: "ltr", og: "de_DE" } as const),
  Object.freeze({ code: "ja", prefix: "/ja", dir: "ltr", og: "ja_JP" } as const),
  Object.freeze({ code: "hi", prefix: "/hi", dir: "ltr", og: "hi_IN" } as const),
  Object.freeze({ code: "es", prefix: "/es", dir: "ltr", og: "es_ES" } as const),
  Object.freeze({ code: "ar", prefix: "/ar", dir: "rtl", og: "ar_AR" } as const),
]);

export function publicLocaleInfo(locale: unknown): LocaleInfo {
  const match = typeof locale === "string"
    ? PUBLIC_ROUTE_LOCALE_INFO.find((entry) => entry.code === locale)
    : undefined;
  if (!match) throw new Error("Unsupported public locale");
  return match;
}

export const publicLocaleDirection = (locale: unknown): PublicRouteDirection =>
  publicLocaleInfo(locale).dir;
export const publicLocaleOgCode = (locale: unknown): string =>
  publicLocaleInfo(locale).og;

const nonLocalizedRoots = new Set([
  "api", "account", "admin", "auth", "_registry", "preview", "private",
  "mini-app", "cabinet", "login", "assets", "downloads", "og",
]);
const worldIds = Object.freeze(["bali", "thailand", "russia", "nepal", "uae", "vietnam"]);
const prefixForSegment = (segment: string): LocaleInfo | undefined =>
  PUBLIC_ROUTE_LOCALE_INFO.find((entry) => entry.prefix === "/" + segment);

// Prefix-like root segments are reserved for locale routing, not guessed from
// an unknown language or normalized into a supported language automatically.
function assertSourceRoot(segment: string | undefined) {
  if (!segment || nonLocalizedRoots.has(segment)) return;
  const folded = segment.toLowerCase();
  if (/^[a-z]{2}(?:-[a-z0-9]+)*$/i.test(segment) || folded === "ru") {
    throw new Error("Unsupported or repeated public locale prefix");
  }
}

function splitInternalPath(route: unknown): { path: string; suffix: string } {
  if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")
    || /[\s\u0000-\u001f\u007f\\]/u.test(route)) {
    throw new Error("Expected a safe internal route path");
  }
  const boundary = route.search(/[?#]/);
  const path = boundary < 0 ? route : route.slice(0, boundary);
  const suffix = boundary < 0 ? "" : route.slice(boundary);
  // Never decode percent-encoded path separators/dot segments or normalize a
  // traversal, double slash, protocol-relative URL or arbitrary external exit.
  if (path.includes("//") || !/^\/(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]*\/?$/.test(path)
    || path.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Expected a canonical internal route path");
  }
  return { path, suffix };
}

export function publicSourceRoute(route: string): string {
  const { path, suffix } = splitInternalPath(route);
  const first = path.split("/")[1];
  const locale = prefixForSegment(first);
  if (!locale) {
    assertSourceRoot(first);
    return path + suffix;
  }
  const source = path.slice(locale.prefix.length) || "/";
  const next = source.split("/")[1];
  if (prefixForSegment(next)) throw new Error("Multiple public locale prefixes");
  assertSourceRoot(next);
  return source + suffix;
}

export function localizedPublicRoute(route: string, locale: unknown): string {
  const info = publicLocaleInfo(locale);
  // Accept an unqualified source or one existing locale prefix. Re-localizing
  // never stacks prefixes; ambiguous double prefixes fail instead of trimming.
  const source = publicSourceRoute(route);
  const { path, suffix } = splitInternalPath(source);
  // Account/auth/API/download exits retain their actual unqualified route.
  // This is not a public-inventory allowlist or an access-control decision.
  if (nonLocalizedRoots.has(path.split("/")[1])) return source;
  return info.prefix + path + suffix;
}

export function publicWorldRoute(id: string, locale: unknown): string {
  publicLocaleInfo(locale);
  if (!worldIds.includes(id)) throw new Error("Unsupported destination identity");
  return localizedPublicRoute(`/${id}/`, locale);
}

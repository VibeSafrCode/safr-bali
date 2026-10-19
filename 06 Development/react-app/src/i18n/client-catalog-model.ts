export const CLIENT_CATALOG_LOCALES = Object.freeze([
  "ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar",
] as const);
export type ClientCatalogLocale = (typeof CLIENT_CATALOG_LOCALES)[number];
export type ClientVisaId = "e33g" | "d12" | "d1-d2" | "c1" | "voa";
export const CLIENT_CATALOG_RUNTIME_BYTES = 1863767;
export const CLIENT_CATALOG_RUNTIME_SHA256 = "36744ab98bb2ed9ee3e151b075c20bafec169a3ccbe74575957b115eb56b8ca4";

export type ClientCatalogNode = Readonly<{
  id: string; name: string | null; icon: string; summary?: string | null;
  number?: string; color?: string; className?: string;
  eyebrow?: string | null; description?: string | null;
  status?: "available" | "soon"; note?: string | null; content?: string | null;
  articleRef?: Readonly<{visaId: ClientVisaId; contentId: string}>;
  publiclyHidden?: boolean; children?: readonly ClientCatalogNode[];
  services?: readonly ClientCatalogNode[];
  download?: Readonly<Record<string, string | number | null>>;
}>;
export type ClientCatalogProjection = Readonly<{
  locale: ClientCatalogLocale; dir: "ltr" | "rtl"; complete: boolean;
  heldKeys: readonly string[]; destinations: readonly ClientCatalogNode[];
}>;
export type ClientVisaArticle = Readonly<{
  contentId: string; locale: ClientCatalogLocale; dir: "ltr" | "rtl";
  route: string; canonicalPath: string; sourceRevision: string;
  bodySha256: string; metadataSha256: string; bodyMarkdown: string;
  title: string; seoTitle: string; description: string;
  metadata: Readonly<Record<string, unknown>>;
  sections: readonly Readonly<{id: string; heading: string; html: string;
    faq: boolean; timing: boolean; tariffs: boolean}>[];
  faqSchema: readonly Readonly<Record<string, unknown>>[] | null;
  directHtml: string; introHtml: string; factHtml: string;
}>;

export class ClientCatalogSourceHoldError extends Error {
  readonly heldKeys: readonly string[];
  constructor(keys: readonly string[]) {
    super("CLIENT_CATALOG_SOURCE_HOLD: " + keys.join(","));
    this.name = "ClientCatalogSourceHoldError";
    this.heldKeys = Object.freeze([...keys]);
  }
}

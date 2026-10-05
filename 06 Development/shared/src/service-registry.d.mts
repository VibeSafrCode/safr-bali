/** Authored content contract v1. Not a new Service table or price authority. */
export type PublicContentLocale = "ru" | "en" | "zh-Hans" | "ko" | "fr" | "de" | "ja" | "hi" | "es" | "ar";
export type Exposure = "preview_only" | "public_noindex" | "public_indexable";
export interface PricingRef {
  entityType: "VISA" | "SERVICE";
  entityKey: string;
  optionCodes: string[];
}
export interface TranslationState {
  sourceRevision: string;
  status: "missing" | "translated" | "stale";
  complete: boolean;
  qa: "not_done" | "passed" | "failed";
  /** Exact localized editorial source, not native-language certification. */
  bodyFile?: string;
  bodySha256?: string;
  qaEvidence?: string;
  qaMethod?: "supplied_model_semantic";
  /** Versioned, repository-local QA/provenance for this exact page-locale. */
  qaFile?: string;
  qaPage?: string;
  metadataFile?: string;
  metadataSha256?: string;
  sourceEnvelopeSha256?: string;
}
export interface ServiceContentRecord {
  contentId: string;
  kind: string;
  title: string;
  parentId: string | null;
  relatedContentIds: string[];
  inlineLinkTargets: {
    sourceRoute: string;
    contentId: string | null;
    status: "resolved_content_id" | "planned_unmapped";
  }[];
  /** Stable Service.slug, NOT its integer database primary key. */
  serviceId: string | null;
  pricingRef: PricingRef | null;
  bindingStatus: "seed_confirmed" | "unresolved" | "not_applicable";
  availability: "not_verified";
  bindingEvidence: string[];
  /** Existing adapter/policy owns published text, hashes, URLs and indexability. */
  published: { source: "legacy_catalog"; routes: {ru: string; en: string} } | null;
  candidate: {
    route: string;
    exposure: Exposure;
    revision: string;
    ru: {
      status: "missing" | "draft" | "owner_approved_semantics" | "legacy_preserved";
      bodyFile: string | null;
      bodySha256: string | null;
      approvalEvidence: string | null;
      approvalRevision: string | null;
      metadataFile?: string;
      metadataSha256?: string;
      sourceEnvelopeSha256?: string;
    };
    translations: Partial<Record<Exclude<PublicContentLocale, "ru">, TranslationState>>;
  };
  /** Prior equivalents and merge suggestions are NOT redirect instructions. */
  reuseRoutes: string[];
  mergeTargetId: string | null;
  duplicateRisk: string | null;
  release: "not_authorized";
}
export interface ServiceRegistry {
  schemaVersion: 1;
  sourceBatch: string;
  serviceIdNamespace: "Service.slug";
  locales: {code: PublicContentLocale; prefix: string; dir: "ltr" | "rtl"}[];
  experimentalLocales: {code: string; enabled: false}[];
  records: ServiceContentRecord[];
  traceability: {
    originalIds: string[];
    products: {id: string; contentId: string}[];
    capabilities: {id: string; contentId: string}[];
    additional: {id: string; contentId: string}[];
    knowledgeTopics: {number: number; contentId: string; sourceRoute: string}[];
  };
}
export const PUBLIC_LOCALES: PublicContentLocale[];
export function validateRegistry(registry: unknown, options?: {
  prices?: {entity_type: string; entity_key: string; option_code: string}[] | null;
  serviceSlugs?: string[] | null;
}): {records: number; publishedBindings: number; previewOnly: number};
export function preservePublishedPages<T extends {route: string}>(registry: unknown, pages: T[], locale: string): T[];
export function publishedTargets(registry: unknown, ids: string[], locale: string, isIndexable?: (route: string) => boolean): {contentId: string; route: string; locale: string}[];
export function markTranslationsStale(record: ServiceContentRecord, nextRuRevision: string): ServiceContentRecord;

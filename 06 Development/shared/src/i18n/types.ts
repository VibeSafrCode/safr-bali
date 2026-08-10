export const LOCALE_CODES = ["ru", "en"] as const;

export type LocaleCode = (typeof LOCALE_CODES)[number];

export type TranslationReviewStatus =
  | "TRANSLATED"
  | "HUMAN_REVIEW_REQUIRED";

export type SourceVerificationStatus =
  | "LOCAL_SOURCE_CAPTURED"
  | "verified"
  | "needs_review"
  | "legacy_needs_sources";

export type TranslationUnit = {
  ru: string;
  en: string;
  source: string;
  sourceVerification: SourceVerificationStatus;
  review: TranslationReviewStatus;
  protectedTokens?: readonly string[];
  note?: string;
};

export type TranslationCorpus<
  Domain extends string,
  Entries extends Record<string, TranslationUnit>,
> = {
  domain: Domain;
  capturedAt: "2026-08-10";
  entries: Entries;
};

export function defineCorpus<
  const Domain extends string,
  const Entries extends Record<string, TranslationUnit>,
>(corpus: TranslationCorpus<Domain, Entries>) {
  return corpus;
}

export type CorpusKey<Corpus extends TranslationCorpus<string, Record<string, TranslationUnit>>> =
  keyof Corpus["entries"];

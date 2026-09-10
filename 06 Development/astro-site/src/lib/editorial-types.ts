export type EditorialSource = {
  id: string; title: string; publisher: string; url: string;
  section: string; updatedAt: string | null;
};
export type EditorialCopy = {
  title: string; description: string; lead: string;
  blocks: Array<{
    id: string; kind: "facts" | "requirements" | "restrictions" | "notice";
    heading: string; items: Array<{ text: string; sourceIds: string[] }>;
  }>;
  limitations: string[];
};
export type EditorialRecord = {
  lastModified: string; reviewedAt: string | null; reviewExpiresAt: string | null;
  reviewStatus: "verified" | "needs_review";
  publicationStatus: "published" | "draft" | "hidden" | "archived";
  requiresSources: boolean; hasSubstantialContent: boolean;
  reviewedVersion: Record<"ru" | "en", string>;
  sources: EditorialSource[];
  priceReference?: { type: "VISA"; key: string };
  locales: Record<"ru" | "en", EditorialCopy>;
};
export type EditorialPage = EditorialCopy & {
  sources: EditorialSource[]; reviewedAt: string | null;
  reviewExpiresAt: string | null; reviewStatus: string;
  priceReference?: EditorialRecord["priceReference"];
};

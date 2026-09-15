import { createHash } from "node:crypto";
import { visaEditorial } from "../content/visa-editorial.mjs";
import { evaluatePublication } from "./publication-policy.mjs";
import type { PublicPage } from "./public-catalog";
import type { EditorialRecord } from "./editorial-types";
import { getBotVisaCopy } from "./visa-bot-copy";
import visaCopyApproval from "../content/visa-copy-approval.json";

const records = visaEditorial as Record<string, EditorialRecord>;
// Deliberate editorial dispositions, not a word-count or availability heuristic.
const substantialRoutes = new Set([
  "/", "/bali/", "/bali/housing/", "/bali/housing/villa/",
  "/bali/housing/housing-videos/", "/bali/housing/housing-risks/",
]);
const hiddenRoutes = new Set(["/privacy/", "/bali/exchange/other-exchange/"]);
const sourceReviewRoutes = new Set(["/bali/guides/all-indonesia/"]);

export function editorialVersion(record: EditorialRecord, locale: "ru" | "en") {
  return createHash("sha256").update(JSON.stringify({
    content: record.locales[locale], sources: record.sources,
    priceReference: record.priceReference ?? null,
    reviewedAt: record.reviewedAt, reviewExpiresAt: record.reviewExpiresAt,
    lastModified: record.lastModified, requiresSources: record.requiresSources,
  })).digest("hex");
}

for (const [route, record] of Object.entries(records)) {
  const ids = new Set(record.sources.map((source) => source.id));
  if (ids.size !== record.sources.length) throw new Error(`Duplicate source: ${route}`);
  for (const source of record.sources) {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.username || url.password ||
        !(url.hostname === "imigrasi.go.id" || url.hostname.endsWith(".imigrasi.go.id"))) {
      throw new Error(`Untrusted editorial source: ${route}`);
    }
  }
  for (const locale of ["ru", "en"] as const) {
    const copy = record.locales[locale];
    if (!copy?.title || !copy.description || !copy.lead) throw new Error(`Missing editorial locale: ${route}:${locale}`);
    for (const block of copy.blocks) for (const item of block.items) {
      if (item.sourceIds.some((id) => !ids.has(id)) ||
          (record.reviewStatus === "verified" && block.kind !== "notice" && !item.sourceIds.length)) {
        throw new Error(`Uncovered editorial fact: ${route}:${locale}:${block.id}`);
      }
    }
  }
}

export function applyPublication(page: PublicPage, locale: "ru" | "en", asOf = new Date(), localeComplete = true) : PublicPage {
  const route = page.route === "/en/" ? "/" : page.route.replace(/^\/en\//, "/");
  const botCopy = getBotVisaCopy(route, locale);
  if (botCopy) {
    // Founder explicitly accepted these restored texts. Do not transfer the
    // audit's source-review badge or silently approve later copy changes.
    const approvedVersion = (visaCopyApproval.versions as Record<string, Record<string, string>>)[route]?.[locale];
    const contentVersion = createHash("sha256").update(JSON.stringify({
      key: botCopy.key, body: botCopy.fullBody, disclaimers: botCopy.disclaimers, priceCopy: botCopy.priceCopy,
    })).digest("hex");
    const decision = evaluatePublication({
      publicationStatus: "published", reviewStatus: "owner_approved", requiresSources: true,
      hasSubstantialContent: true, locale, availableLocales: localeComplete ? [locale] : [],
      contentVersion, lastModified: visaCopyApproval.approvedAt,
      ownerApproval: { authority: visaCopyApproval.authority as "founder", approvedAt: visaCopyApproval.approvedAt, contentVersion: approvedVersion },
    }, { asOf });
    if (!decision.indexable) {
      // Never ship a placeholder or a noindex replacement for Founder copy.
      // Stop this candidate; the already deployed approved page stays intact.
      throw new Error(`Founder-approved visa publication drift: ${route}:${locale}:${decision.reason}. Preserve the deployed copy and report the change.`);
    }
    return { ...page, title: botCopy.title, lead: botCopy.lead, body: botCopy.fullBody,
      editorial: undefined, indexable: decision.indexable, publication: decision };
  }
  const record = records[route];
  const requiresSources = Boolean(record?.requiresSources) || route.split("/").includes("visas") || sourceReviewRoutes.has(route);
  const copy = record?.locales[locale];
  const decision = evaluatePublication({
    publicationStatus: hiddenRoutes.has(route) ? "hidden" : record?.publicationStatus ?? "published",
    reviewStatus: record?.reviewStatus ?? (requiresSources ? "needs_review" : "not_required"),
    requiresSources,
    hasSubstantialContent: record?.hasSubstantialContent ?? substantialRoutes.has(route),
    locale, availableLocales: copy || localeComplete ? [locale] : [],
    reviewedAt: record?.reviewedAt ?? undefined,
    reviewExpiresAt: record?.reviewExpiresAt ?? undefined,
    lastModified: record?.lastModified,
    sources: record?.sources,
    contentVersion: record ? editorialVersion(record, locale) : undefined,
    reviewedVersion: record?.reviewedVersion[locale],
  }, { asOf });
  return {
    ...page, indexable: decision.indexable, publication: decision,
    ...(copy ? {
      title: copy.title, description: copy.description, lead: copy.lead, body: "",
      editorial: {
        ...copy, sources: record.sources, reviewedAt: record.reviewedAt,
        reviewExpiresAt: record.reviewExpiresAt, reviewStatus: record.reviewStatus,
        priceReference: record.priceReference,
      },
    } : {}),
    // Original catalogue summaries must not turn into review placeholders.
    cards: page.cards,
  };
}

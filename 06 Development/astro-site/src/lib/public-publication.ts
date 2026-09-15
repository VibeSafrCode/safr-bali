import { createHash } from "node:crypto";
import { evaluatePublication } from "./publication-policy.mjs";
import type { PublicPage } from "./public-catalog";
import type { EditorialRecord } from "./editorial-types";
import { getBotVisaCopy } from "./visa-bot-copy";
import visaCopyApproval from "../content/visa-copy-approval.json";

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

export function visaHubVersion(page: PublicPage) {
  return createHash("sha256").update(JSON.stringify({
    kind: "visa-catalog", title: page.title, description: page.description, lead: page.lead, cards: page.cards,
  })).digest("hex");
}

export function applyPublication(page: PublicPage, locale: "ru" | "en", asOf = new Date(), localeComplete = true) : PublicPage {
  const route = page.route === "/en/" ? "/" : page.route.replace(/^\/en\//, "/");
  const botCopy = getBotVisaCopy(route, locale);
  if (botCopy || route === "/bali/visas/") {
    // Founder explicitly accepted these restored texts. Do not transfer the
    // audit's source-review badge or silently approve later copy changes.
    const approvedVersion = (visaCopyApproval.versions as Record<string, Record<string, string>>)[route]?.[locale];
    const contentVersion = botCopy ? createHash("sha256").update(JSON.stringify({
      key: botCopy.key, body: botCopy.fullBody, disclaimers: botCopy.disclaimers, priceCopy: botCopy.priceCopy,
    })).digest("hex") : visaHubVersion(page);
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
    return { ...page, ...(botCopy ? { title: botCopy.title, lead: botCopy.lead, body: botCopy.fullBody } : { body: "" }),
      editorial: undefined, indexable: decision.indexable, publication: decision };
  }
  const requiresSources = route.split("/").includes("visas") || sourceReviewRoutes.has(route);
  const decision = evaluatePublication({
    publicationStatus: hiddenRoutes.has(route) ? "hidden" : "published",
    reviewStatus: requiresSources ? "needs_review" : "not_required",
    requiresSources,
    hasSubstantialContent: substantialRoutes.has(route),
    locale, availableLocales: localeComplete ? [locale] : [],
  }, { asOf });
  return {
    ...page, indexable: decision.indexable, publication: decision,
    editorial: undefined,
    // Original catalogue summaries must not turn into review placeholders.
    cards: page.cards,
  };
}

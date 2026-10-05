// T2–T5 integration contracts ONLY. No collection, DB migration or new endpoints.
import type { PublicContentLocale, PricingRef } from "../src/service-registry.mjs";

export interface ContentIdentity {
  contentId: string;
  serviceId: string | null; // Service.slug; server resolves integer ID
  locale: PublicContentLocale;
  revision: string;
  sourceRoute: string; // normalized own path, no query/contact data
}
export interface PublicationProjection extends ContentIdentity {
  canonical: string;
  alternates: {locale: PublicContentLocale; route: string}[];
  indexable: boolean;
  lastModified: string | null; // editorial revision, never build time
  pricingRef: PricingRef | null;
  renderedSchemaTypes: string[]; // only schema backed by visible content
}
export interface RedirectAuditEntry {
  sourcePath: string;
  expectedTarget: string;
  allowedStatus: (301 | 302 | 307 | 308)[];
  evidence: string; // an actual published route/intent, not a planned alias
}
export interface UrlAuditRun {
  runId: string; baselineRunId: string | null; capturedAt: string;
  allowedOrigins: string[]; maxPages: number; maxDepth: number;
  concurrency: number; timeoutMs: number; llmCalls: 0;
  checks: {path: string; status: number; findings: string[]}[];
  artifacts: {json: string; html: string; markdown: string};
}
export interface Attribution {
  correlationId: string; attributionId: string | null;
  // Sanitized campaign identifiers and origin only, never arbitrary full URLs.
  campaign: {source?: string; medium?: string; campaign?: string};
  referrerOrigin: string | null;
}
export type ClientContentEvent = ContentIdentity & Attribution & {
  eventId: string;
  event: "page_view" | "service_view" | "guide_view" | "cta_click" |
    "form_start" | "form_submit_attempt" | "language_switch";
};
export type ConfirmedBusinessEvent = ContentIdentity & Attribution & (
  { event: "lead_accepted"; leadId: string; serverEvidenceId: string } |
  { event: "order_paid"; orderId: string; serverEvidenceId: string }
);
export interface MessageBoundLeadContext {
  messageId: number;
  identity: Readonly<ContentIdentity>;
  attribution: Readonly<Attribution>;
  // Persist alongside the exact outbox event; never resolve latest-message context.
}
export interface AnalyticsPolicy {
  enabled: boolean; consentRequired: boolean; retentionDays: number;
  allowedAdminRoles: string[]; discardFormText: true; discardContacts: true;
}
export type SearchConsoleState =
  {status: "not_connected"; metrics: null} |
  {status: "connected"; source: "gsc_read_only"; capturedAt: string; property: string};

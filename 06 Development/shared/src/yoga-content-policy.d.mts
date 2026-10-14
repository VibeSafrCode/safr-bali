/** Types only: the existing Yoga projection/runtime policy is unchanged. */
export const YOGA_CONTENT_POLICY: "YOGA_HIDE_EXCHANGE_2026_10_09";

export function yogaRouteAllowed(route: unknown): boolean;
export function yogaOverviewCopy(text: string): string;

export function yogaPublicPage<T extends {
  route: string;
  description: string;
  lead: string;
  body: string;
  cards: Array<{ href: string; summary: string; note?: string }>;
  relatedRoutes: Array<{ href: string }>;
  breadcrumbs: Array<{ href: string }>;
}>(page: T): T;

export function yogaRegistrySections<T extends { html: string }>(
  sections: T[], contentId: string,
): T[];

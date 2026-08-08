import { getCollection, type CollectionEntry } from "astro:content";

import pilotSnapshot from "../data/generated/pilot-snapshot.v1.json";

export type PilotPage = CollectionEntry<"pilotPages">;
export type SnapshotContent = (typeof pilotSnapshot.entries)[number]["content"];

const routeOrder = [
  "/",
  "/bali/",
  "/bali/visas/",
  "/bali/visas/e33g/",
  "/bali/visas/d12/",
  "/bali/visas/voa/",
] as const;

export async function getPilotPages(): Promise<PilotPage[]> {
  const pages = await getCollection("pilotPages");
  const index = new Map(routeOrder.map((route, position) => [route, position]));
  return pages.sort(
    (left, right) =>
      (index.get(left.data.route as (typeof routeOrder)[number]) ?? 999) -
      (index.get(right.data.route as (typeof routeOrder)[number]) ?? 999),
  );
}

export async function getPilotPage(route: string): Promise<PilotPage> {
  const page = (await getPilotPages()).find(
    (candidate) => candidate.data.route === route,
  );
  if (!page) {
    throw new Error(`Pilot page is missing for ${route}`);
  }
  return page;
}

export function getSnapshotContent(contentId?: string): SnapshotContent | null {
  if (!contentId) return null;
  return (
    pilotSnapshot.entries.find(
      (entry) => entry.content.contentId === contentId,
    )?.content ?? null
  );
}

export const pilotSnapshotMeta = {
  id: pilotSnapshot.snapshotId,
  revision: pilotSnapshot.contentRevision,
  generatedAt: pilotSnapshot.generatedAt,
  immutable: pilotSnapshot.immutable,
};

export const pilotRoutes = routeOrder;

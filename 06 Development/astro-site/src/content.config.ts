import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const breadcrumbSchema = z.object({
  label: z.string().min(1),
  href: z.string().regex(/^\/(?:[^?#]*\/)?$/),
});

const pilotPages = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/pilot-pages",
  }),
  schema: z.object({
    route: z.string().regex(/^\/(?:[^?#]*\/)?$/),
    title: z.string().min(1).max(70),
    description: z.string().min(50).max(180),
    eyebrow: z.string().min(1),
    kind: z.enum(["landing", "directions", "direction", "visa-list", "visa"]),
    indexable: z.boolean(),
    lastmod: z.coerce.date(),
    snapshotContentId: z.string().optional(),
    breadcrumbs: z.array(breadcrumbSchema),
    relatedRoutes: z.array(breadcrumbSchema).default([]),
  }),
});

export const collections = {
  pilotPages,
};

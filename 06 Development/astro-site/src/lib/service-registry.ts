// Server/build adapter only. Never import editorial records into a client bundle.
import registry from "../../../shared/content/service-registry.v1.json";
import { preservePublishedPages, validateRegistry } from "../../../shared/src/service-registry.mjs";
import type { PublicPage } from "./public-catalog";

validateRegistry(registry);

export function preserveRegistryProjection(pages: PublicPage[], locale: "ru" | "en"): PublicPage[] {
  return preservePublishedPages(registry, pages, locale);
}

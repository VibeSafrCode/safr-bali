/** Shared canonical shape/localization/visibility/bike projection. No data imports. */
import {CLIENT_CATALOG_LOCALES,ClientCatalogSourceHoldError,type ClientCatalogLocale,type ClientCatalogNode,type ClientCatalogProjection} from "./client-catalog-model";
import {guard,frozen,isClientCatalogLocale} from "./client-catalog-integrity";
export function createClientCatalogProjectionApi(data:any,text:(key:string,locale:ClientCatalogLocale)=>string|null){
  const cache = new Map<ClientCatalogLocale, ClientCatalogProjection>();
  const item = (node: any, prefix: string, locale: ClientCatalogLocale): any => {
    const next: any = {...node};
    for (const field of ["name", "summary", "note", "content"]) {
      if (Object.hasOwn(node, field)) next[field] = text(prefix + "." + field, locale);
    }
    if (node.download) {
      next.download = {...node.download};
      for (const [field, suffix] of [["label", "downloadLabel"],
        ["recommendation", "downloadRecommendation"], ["meta", "downloadMeta"]]) {
        next.download[field] = text(prefix + "." + suffix, locale);
      }
    }
    if (node.children) next.children = node.children.map((child: any) =>
      item(child, prefix + "." + child.id, locale));
    return next;
  };
  const inspect = (locale: unknown): ClientCatalogProjection => {
    guard(isClientCatalogLocale(locale), "CLIENT_CATALOG_UNKNOWN_LOCALE");
    const hit = cache.get(locale);
    if (hit) return hit;
    const destinations = data.baseDestinations.map((destination: any) => ({
      ...destination,
      ...Object.fromEntries(["name", "eyebrow", "description"].map(field => [
        field, text("catalog.destination." + destination.id + "." + field, locale),
      ])),
      services: destination.services.map((service: any) =>
        item(service, "catalog." + destination.id + "." + service.id, locale)),
    }));
    const heldKeys = locale === "ru" || locale === "en" ? [] : [...data.heldKeys];
    const result = frozen({locale, dir: locale === "ar" ? "rtl" as const : "ltr" as const,
      complete: heldKeys.length === 0, heldKeys, destinations}) as ClientCatalogProjection;
    cache.set(locale, result);
    return result;
  };
  return Object.freeze({
    locales: CLIENT_CATALOG_LOCALES,
    inspect,
    destinations(locale: unknown): readonly ClientCatalogNode[] {
      const result = inspect(locale);
      if (!result.complete) throw new ClientCatalogSourceHoldError(result.heldKeys);
      return result.destinations;
    },
    activeServices(destinationId: unknown, locale: unknown): readonly ClientCatalogNode[] {
      guard(typeof destinationId === "string" && data.destinationIds.includes(destinationId),
        "CLIENT_CATALOG_UNKNOWN_DESTINATION");
      guard(isClientCatalogLocale(locale), "CLIENT_CATALOG_UNKNOWN_LOCALE");
      const destination = inspect(locale).destinations.find(row => row.id === destinationId)!;
      const services = [...destination.services!].filter(row => !row.publiclyHidden);
      if (destinationId !== "bali") return frozen(services);
      const bikes = item(data.bikes, "catalog.bali.bikes", locale);
      return frozen([...services.slice(0, 2), bikes, ...services.slice(2)]);
    },
  });
}

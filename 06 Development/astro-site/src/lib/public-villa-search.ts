import {localizedPublicRoute, PUBLIC_ROUTE_LOCALES} from "./public-locale";
import {villaSearchCopy} from "./villa-search-copy";

export const VILLA_SEARCH_ROUTE = "/villa-search/";

export function publicVillaSearchEntries() {
  return PUBLIC_ROUTE_LOCALES.map((locale) => {
    const route = localizedPublicRoute(VILLA_SEARCH_ROUTE, locale);
    const {title, description} = villaSearchCopy[locale];
    return {
      kind: "villa-search" as const,
      sourceRoute: VILLA_SEARCH_ROUTE,
      route,
      locale,
      page: {
        route,
        title,
        description,
        indexable: true,
        publication: {indexable: true, independentReviewClaim: false},
      },
    };
  });
}

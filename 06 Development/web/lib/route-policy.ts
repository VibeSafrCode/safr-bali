import { destinations } from "./catalog";

export type RouteClass =
  | "indexable"
  | "public_noindex"
  | "private_noindex"
  | "api";

export type PublicRoutePolicy = {
  buildPath: string;
  publicUrl: string;
  routeClass: Exclude<RouteClass, "api">;
};

const siteOrigin =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export function publicUrlForBuildPath(buildPath: string) {
  if (buildPath === "/mini-app/") return "https://app.safrway.online/";
  return `${siteOrigin}${buildPath}`;
}

export function classifyRoute(pathname: string): RouteClass {
  if (pathname.startsWith("/api/")) return "api";
  if (pathname === "/privacy/" || pathname === "/privacy") {
    return "public_noindex";
  }
  if (
    pathname === "/account/" ||
    pathname === "/account" ||
    pathname === "/mini-app/" ||
    pathname === "/mini-app" ||
    pathname.startsWith("/auth/")
  ) {
    return "private_noindex";
  }
  return "indexable";
}

export function catalogBuildPaths() {
  return destinations.flatMap((destination) => [
    `/directions/${destination.id}/`,
    ...destination.services.flatMap((service) => [
      `/directions/${destination.id}/${service.id}/`,
      ...(service.children ?? []).map(
        (item) =>
          `/directions/${destination.id}/${service.id}/${item.id}/`,
      ),
    ]),
  ]);
}

export function publicRoutePolicies(): PublicRoutePolicy[] {
  const buildPaths = [
    "/",
    "/directions/",
    "/account/",
    "/privacy/",
    "/mini-app/",
    ...catalogBuildPaths(),
  ];

  return buildPaths.map((buildPath) => ({
    buildPath,
    publicUrl: publicUrlForBuildPath(buildPath),
    routeClass: classifyRoute(buildPath) as Exclude<RouteClass, "api">,
  }));
}

export function indexableSiteRoutes() {
  return publicRoutePolicies().filter(
    (route) => route.routeClass === "indexable",
  );
}

export type ClientTab = "home" | "services" | "life" | "orders" | "visas" | "profile" | "support";
export type AccountSection = ClientTab | "overview" | "points" | "referrals";
export const clientNavigationTabs = ["home", "services", "life", "profile", "support"] as const;
const sections: AccountSection[] = [...clientNavigationTabs, "orders", "visas", "overview", "points", "referrals"];

export function miniRouteSegments(hash: string, search: string) {
  const screen = new URLSearchParams(search).get("screen") ?? "";
  const value = (hash.startsWith("#/") ? hash.slice(2) : "") || (/^[a-z0-9/-]{1,200}$/.test(screen) ? screen : "") || "life";
  const route = value.split("/").filter(Boolean);
  return route.join("/") === "profile/life" ? ["life"] : route;
}

export function accountRouteTab(pathname: string, hash = ""): AccountSection {
  if (/^\/account\/profile\/life\/?$/.test(pathname)) return "life";
  if (pathname.startsWith("/account/services/")) return "services";
  const section = pathname.match(/^\/account\/([a-z0-9_-]+)\/?$/)?.[1] ?? hash.replace(/^#\/?/, "");
  return sections.includes(section as AccountSection) ? section as AccountSection : "life";
}

export function clientNavigationTab(section: AccountSection): typeof clientNavigationTabs[number] {
  if (section === "visas") return "life";
  if (section === "orders") return "services";
  if (["overview", "points", "referrals"].includes(section)) return "profile";
  return section as typeof clientNavigationTabs[number];
}

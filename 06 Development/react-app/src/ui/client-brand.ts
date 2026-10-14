/** Presentation configuration only. Never supplies identity, permissions,
 * referral ownership, API routes or pricing. Selected explicitly at build time. */
const selected = import.meta.env.VITE_CLIENT_BRAND || "safrway";
if (selected !== "safrway" && selected !== "yoga-gangster") {
  throw new Error("Unknown client presentation brand");
}

// This first variant is confined to the Mini App; other surfaces keep their brand.
const miniAppSurface = !/^\/(account|admin|calculator)(\/|$)/.test(window.location.pathname);
export const clientBrand = Object.freeze({
  id: selected === "yoga-gangster" && miniAppSurface ? "yoga-gangster" : "safrway",
  name: selected === "yoga-gangster" && miniAppSurface ? "Yoga Gangster" : "SAFRWAY",
});

export const isYogaBrand = clientBrand.id === "yoga-gangster";

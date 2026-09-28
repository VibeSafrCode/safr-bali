export type BackdropAsset = { src: string; srcSet?: string; position?: string };
const focal: Record<string, string> = {
  bali: "76% 50%", thailand: "65% 50%", uae: "50% 50%", nepal: "65% 50%", russia: "60% 50%",
};

export function backdropPosition(id: string, mobile: boolean): string {
  return mobile ? focal[id] ?? "50% 50%" : "50% 50%";
}

export function nightBackdrop(id: string): BackdropAsset | null {
  if (!Object.hasOwn(focal, id)) return null;
  const root = `/assets/heroes/${id}-hero-night-ai-v1`;
  return { src: `${root}-1536.webp`, srcSet: `${root}-768.webp 768w, ${root}-1536.webp 1536w` };
}

export async function decodeBackdrop(asset: BackdropAsset): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  image.sizes = "100vw";
  if (asset.srcSet) image.srcset = asset.srcSet;
  image.src = asset.src;
  await image.decode();
  return image.currentSrc || image.src;
}

export async function loadBackdrop(id: string, theme: string, day: BackdropAsset, nightAsset = nightBackdrop(id)): Promise<string> {
  const night = theme === "dark" ? nightAsset : null;
  if (night) {
    try { return await decodeBackdrop(night); } catch { /* Day is the explicit fallback. */ }
  }
  return decodeBackdrop(day);
}

/** Only encode the authenticated dashboard's bounded Telegram invitation URL. */
export function safeReferralLink(value?: string | null): string | null {
  if (!value || value.length > 256) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "t.me" || url.port || url.username || url.password || url.hash) return null;
    if (!/^\/[A-Za-z0-9_]{5,32}$/.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].join(",") !== "start") return null;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(url.searchParams.get("start") ?? "")) return null;
    return value;
  } catch { return null; }
}

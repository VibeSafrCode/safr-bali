export type AccountPreview = { userId: number; accountPath: string; basePath: string };

export function accountPreview(pathname: string): AccountPreview | null {
  const match = /^\/account\/preview\/([1-9]\d*)\/(.*)$/.exec(pathname);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
  return { userId: Number(match[1]), accountPath: `/account/${match[2]}`, basePath: `/account/preview/${match[1]}/` };
}

export function isAccountPreview() {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/account/preview/");
}

export function previewAccountPath(path: string, pathname: string) {
  const preview = accountPreview(pathname);
  return preview && path.startsWith("/account/") ? preview.basePath + path.slice("/account/".length) : path;
}

// Defence against accidental customer actions, not an authorization boundary.
// Every mapped endpoint separately authenticates the administrator on the server.
export function previewRequestPath(path: string, method: string, pathname: string): string {
  if (!pathname.startsWith("/account/preview/")) return path;
  const preview = accountPreview(pathname);
  if (!preview || method.toUpperCase() !== "GET") throw new Error("Client preview is read-only");
  if (path === "/api/catalog/pricing") return path;
  const match = /^\/api\/web\/(account|life-services|visa-cases(?:\/[1-9]\d*)?|chat)$/.exec(path);
  if (!match) throw new Error("This request is unavailable in client preview");
  return `/api/web/admin/clients/${preview.userId}/account-preview/${match[1]}`;
}

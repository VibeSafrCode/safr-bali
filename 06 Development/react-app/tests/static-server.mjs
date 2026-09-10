import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.SAFR_REACT_TEST_PORT || 4323);
const strictPwaHeaders = process.env.SAFR_REACT_TEST_PWA_CSP === "1";
const pwaCsp = "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'self'";
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://test").pathname);
  const safe = normalize(pathname)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.(\/|\\|$))+/, "");
  let file = /^\/account\/(?:[A-Za-z0-9_-]+\/)*$/.test(pathname)
    ? join(root, "account/index.html")
    : /^\/admin\/(?:[A-Za-z0-9_-]+\/)*$/.test(pathname)
      ? join(root, "admin/index.html")
      : pathname === "/calculator/"
        ? join(root, "index.html")
        : join(root, safe);
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      ...(strictPwaHeaders ? {
        "Content-Security-Policy": pwaCsp,
        "Cache-Control": pathname === "/offline.html" || pathname === "/manifest.webmanifest" || pathname.startsWith("/assets/pwa/")
          ? "public, max-age=0, must-revalidate"
          : /^\/assets\/[^/]+-[A-Za-z0-9_-]+\.(?:js|css)$/.test(pathname)
            ? "public, max-age=31536000, immutable"
            : pathname.startsWith("/assets/") ? "public, max-age=3600" : "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      } : {}),
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...(strictPwaHeaders ? {
      "Content-Security-Policy": pwaCsp,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    } : {}) });
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`SAFR React test server ${server.address().port}\n`);
});

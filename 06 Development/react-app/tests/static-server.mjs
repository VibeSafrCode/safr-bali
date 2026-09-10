import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.SAFR_REACT_TEST_PORT || 4323);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

createServer(async (request, response) => {
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
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`SAFR React test server ${port}\n`);
});

import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "artifacts/build-next-export");
const port = Number(process.argv[3] ?? 4173);
const mimeTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;

  if (pathname === "/api/web/auth/me") {
    response
      .writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
      .end('{"authenticated":false}');
    return;
  }

  const basePath = safePath(pathname);
  if (!basePath) {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (!pathname.endsWith("/") && !extname(pathname)) {
    response.writeHead(301, { Location: `${pathname}/${url.search}` }).end();
    return;
  }

  const requestedFile =
    pathname === "/"
      ? resolve(root, "index.html")
      : pathname.endsWith("/")
        ? resolve(basePath, "index.html")
        : basePath;
  const file =
    (await fileExists(requestedFile))
      ? requestedFile
      : resolve(root, "404.html");
  const status = file === requestedFile ? 200 : 404;

  await access(file);
  response.writeHead(status, {
    "Content-Type":
      mimeTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static smoke server: http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

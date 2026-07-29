import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import catalogRoutes from "../lib/catalog-routes.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientDirectory = resolve(root, "dist", "client");
const serverEntry = resolve(root, "dist", "server", "index.js");
const outputDirectory = resolve(root, "dist", "static");

const workerUrl = pathToFileURL(serverEntry);
workerUrl.searchParams.set("static-export", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const routes = [
  { pathname: "/", output: "index.html", host: "safrway.online" },
  { pathname: "/catalog", output: "catalog/index.html", host: "safrway.online" },
  {
    pathname: "/mini-app",
    output: "mini-app/index.html",
    host: "app.safrway.online",
  },
  { pathname: "/privacy", output: "privacy/index.html", host: "safrway.online" },
  { pathname: "/account", output: "account/index.html", host: "safrway.online" },
];

for (const destination of catalogRoutes) {
  const destinationPath = `/${destination.destinationId}`;
  routes.push({
    pathname: destinationPath,
    output: `${destinationPath.slice(1)}/index.html`,
    host: "safrway.online",
  });
  for (const service of destination.services) {
    const servicePath = `${destinationPath}/${service.serviceId}`;
    routes.push({
      pathname: servicePath,
      output: `${servicePath.slice(1)}/index.html`,
      host: "safrway.online",
    });
    for (const itemId of service.items) {
      const itemPath = `${servicePath}/${itemId}`;
      routes.push({
        pathname: itemPath,
        output: `${itemPath.slice(1)}/index.html`,
        host: "safrway.online",
      });
    }
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await cp(clientDirectory, outputDirectory, { recursive: true });

for (const route of routes) {
  const response = await worker.fetch(
    new Request(`https://${route.host}${route.pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  if (!response.ok) {
    throw new Error(`Static export failed for ${route.pathname}: ${response.status}`);
  }

  const destination = resolve(outputDirectory, route.output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, await response.text(), "utf8");
}

console.log(outputDirectory);

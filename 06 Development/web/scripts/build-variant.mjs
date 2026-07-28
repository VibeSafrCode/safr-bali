import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { delimiter, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAllowedArtifactPath } from "./artifact-filter.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variant = process.argv[2];

if (!["next", "vinext"].includes(variant)) {
  console.error("Usage: node scripts/build-variant.mjs <next|vinext>");
  process.exit(2);
}

const target = resolve(
  root,
  "artifacts",
  variant === "next" ? "build-next-export" : "build-vinext-export",
);
const source =
  variant === "next"
    ? resolve(root, ".next-official")
    : resolve(root, "dist", "client");
const cli =
  variant === "next"
    ? resolve(root, "node_modules", "next", "dist", "bin", "next")
    : resolve(root, "node_modules", "vinext", "dist", "cli.js");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
if (variant === "next") {
  await rm(resolve(root, "out"), { recursive: true, force: true });
  await rm(resolve(root, ".next-official"), { recursive: true, force: true });
} else {
  await rm(resolve(root, "dist"), { recursive: true, force: true });
}

const startedAt = Date.now();
const result = spawnSync(process.execPath, [cli, "build"], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    NODE_ENV: "production",
    SAFR_NEXT_DIST_DIR: ".next-official",
    PATH: [
      dirname(process.execPath),
      process.env.PATH ?? "",
    ].join(delimiter),
  },
  maxBuffer: 50 * 1024 * 1024,
});
const durationMs = Date.now() - startedAt;
const buildLog = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(buildLog);
await writeFile(resolve(target, "build.log"), buildLog, "utf8");

if (result.status !== 0) {
  await writeFile(
    resolve(target, "build-report.json"),
    JSON.stringify(
      {
        variant,
        command:
          variant === "next"
            ? "next build"
            : "vinext build",
        durationMs,
        status: "failed",
        exitCode: result.status,
      },
      null,
      2,
    ),
  );
  process.exit(result.status ?? 1);
}

await cp(source, target, {
  recursive: true,
  filter: isAllowedArtifactPath,
});

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await filesUnder(path)));
    else output.push(path);
  }
  return output;
}

const files = await filesUnder(target);
const contentFiles = files.filter(
  (path) => !path.endsWith("build.log") && !path.endsWith("build-report.json"),
);
const htmlFiles = contentFiles.filter((path) => path.endsWith(".html"));
const rscFiles = contentFiles.filter(
  (path) =>
    path.endsWith(".rsc") ||
    path.endsWith(".txt") ||
    path.includes(".segments/"),
);
const javascriptFiles = contentFiles.filter((path) => path.endsWith(".js"));
const sizes = await Promise.all(contentFiles.map((path) => stat(path)));
const javascriptSizes = await Promise.all(
  javascriptFiles.map((path) => stat(path)),
);
const warnings = buildLog
  .split("\n")
  .filter((line) => /\bwarn(?:ing)?\b/i.test(line))
  .map((line) => line.trim())
  .filter(Boolean);

const report = {
  variant,
  command: variant === "next" ? "next build" : "vinext build",
  configuration: {
    output: "export",
    trailingSlash: true,
    nextDistDir: variant === "next" ? ".next-official" : "not used by Vinext",
  },
  status: "passed",
  durationMs,
  htmlCount: htmlFiles.length,
  rscCount: rscFiles.length,
  has404: htmlFiles.some((path) => path.endsWith("/404.html")),
  outputBytes: sizes.reduce((total, item) => total + item.size, 0),
  clientJavaScriptBytes: javascriptSizes.reduce(
    (total, item) => total + item.size,
    0,
  ),
  generatedHtml: htmlFiles
    .map((path) => relative(target, path))
    .sort(),
  generatedRsc: rscFiles
    .map((path) => relative(target, path))
    .sort(),
  warnings,
  errors: [],
};

await writeFile(
  resolve(target, "build-report.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log(
  `${variant} export: ${report.htmlCount} HTML, ${report.rscCount} RSC, ${report.outputBytes} bytes`,
);

import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { isAllowedArtifactPath } from "./artifact-filter.mjs";

const variant = process.argv[2];
if (!["next", "vinext"].includes(variant)) {
  console.error("Usage: node scripts/prepare-release.mjs <next|vinext>");
  process.exit(2);
}

const source = resolve(
  "artifacts",
  variant === "next" ? "build-next-export" : "build-vinext-export",
);
const target = resolve("artifacts", `release-${variant}`);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, {
  recursive: true,
  filter: (path) => {
    const normalized = path.replaceAll("\\", "/");
    return (
      isAllowedArtifactPath(path) &&
      !normalized.endsWith("/build.log") &&
      !normalized.endsWith("/build-report.json")
    );
  },
});
console.log(target);

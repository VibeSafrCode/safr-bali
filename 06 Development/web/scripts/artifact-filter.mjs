import { basename } from "node:path";

export function isAllowedArtifactPath(path) {
  const name = basename(path);
  const lowerName = name.toLowerCase();

  if (name === ".DS_Store" || name.startsWith("._")) return false;
  if (lowerName === ".env" || lowerName.startsWith(".env.")) return false;
  if (
    lowerName.endsWith(".pem") ||
    lowerName.endsWith(".key") ||
    lowerName.endsWith(".p12") ||
    lowerName.endsWith(".pfx")
  ) {
    return false;
  }
  if (lowerName.endsWith(".map")) return false;
  return true;
}

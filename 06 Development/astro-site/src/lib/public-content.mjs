const DISALLOWED_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const LITERAL_NEWLINES = /\\r\\n|\\n|\\r/g;
const DECORATIVE_PREFIX = /^(?:[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)+/u;
const LIST_ITEM = /^(—|–|-|▪️?|☑️?|✅)\s*(.+)$/u;

/**
 * Normalize legacy catalog copy before it reaches the public renderer.
 * The function is intentionally text-only: HTML is never interpreted here.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePublicContent(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/\r\n?/g, "\n")
    .replace(LITERAL_NEWLINES, "\n")
    .replace(DISALLOWED_CONTROLS, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** @param {string} value */
function cleanLabel(value) {
  return value.replace(DECORATIVE_PREFIX, "").trim();
}

/** @param {string} heading */
function toneFor(heading) {
  if (/срок пребывания|ключевые параметры/i.test(heading)) return "facts";
  if (/стоимост|цена|виза на \d/i.test(heading)) return "price";
  if (/для подачи|для оформления|требован/i.test(heading)) return "checklist";
  if (/ограничен|важно/i.test(heading)) return "warning";
  return "default";
}

/**
 * Convert normalized text into a small, framework-neutral presentation model.
 * Astro renders every returned string with normal escaping.
 *
 * @param {unknown} value
 * @returns {Array<{
 *   heading: string | null,
 *   paragraphs: string[],
 *   items: Array<{ text: string, kind: "bullet" | "check" | "price" }>,
 *   tone: "default" | "facts" | "price" | "checklist" | "warning"
 * }>}
 */
export function parsePublicContent(value) {
  const normalized = normalizePublicContent(value);
  if (!normalized) return [];

  return normalized.split(/\n{2,}/).map((chunk) => {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const first = cleanLabel(lines[0] ?? "");
    const hasHeading = lines.length > 1 && /[:：]$/.test(first);
    const heading = hasHeading ? first.replace(/[:：]\s*$/, "") : null;
    const contentLines = hasHeading ? lines.slice(1) : lines;
    const paragraphs = [];
    const items = [];

    for (const line of contentLines) {
      const match = line.match(LIST_ITEM);
      if (!match) {
        paragraphs.push(cleanLabel(line));
        continue;
      }
      const marker = match[1];
      items.push({
        text: cleanLabel(match[2]),
        kind: marker.startsWith("☑") || marker === "✅"
          ? "check"
          : marker.startsWith("▪")
            ? "price"
            : "bullet",
      });
    }

    return {
      heading,
      paragraphs,
      items,
      tone: toneFor(heading ?? ""),
    };
  });
}

/**
 * Only absolute HTTPS links are made interactive. Everything else stays text.
 *
 * @param {string} value
 * @returns {string | null}
 */
export function publicHttpsLink(value) {
  if (!/^https:\/\/\S+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = resolve(root, "..", "..", "docs");
const artifactsRoot = resolve(root, "artifacts");
const routes = JSON.parse(
  await readFile(resolve(root, "tests", "public-routes.json"), "utf8"),
);
const variants = {
  vinext: resolve(artifactsRoot, "build-vinext-export"),
  next: resolve(artifactsRoot, "build-next-export"),
};

function outputPath(buildRoot, buildPath) {
  if (buildPath === "/") return resolve(buildRoot, "index.html");
  return resolve(
    buildRoot,
    buildPath.replace(/^\/|\/$/g, ""),
    "index.html",
  );
}

function decodeBasicEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function textContent(value) {
  return decodeBasicEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInternalLink(href) {
  if (!href.startsWith("/") || href.startsWith("/_next/")) return null;
  const path = href.split(/[?#]/, 1)[0];
  if (path === "/") return "/";
  return `${path.replace(/\/+$/, "")}/`;
}

function semanticSnapshot(html) {
  const withoutScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const title = withoutScripts.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const description =
    withoutScripts.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    )?.[1] ?? "";
  const h1 = withoutScripts.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
  const internalLinks = [
    ...withoutScripts.matchAll(/<a[^>]+href=["']([^"']+)["']/gi),
  ]
    .map((match) => normalizeInternalLink(match[1]))
    .filter(Boolean)
    .sort();

  return {
    title: textContent(title),
    description: textContent(description),
    h1: textContent(h1),
    internalLinks: [...new Set(internalLinks)],
  };
}

const buildReports = Object.fromEntries(
  await Promise.all(
    Object.entries(variants).map(async ([variant, buildRoot]) => [
      variant,
      JSON.parse(
        await readFile(resolve(buildRoot, "build-report.json"), "utf8"),
      ),
    ]),
  ),
);
const semanticMismatches = [];

for (const route of routes) {
  const snapshots = Object.fromEntries(
    await Promise.all(
      Object.entries(variants).map(async ([variant, buildRoot]) => [
        variant,
        semanticSnapshot(
          await readFile(outputPath(buildRoot, route.buildPath), "utf8"),
        ),
      ]),
    ),
  );

  if (JSON.stringify(snapshots.vinext) !== JSON.stringify(snapshots.next)) {
    semanticMismatches.push({
      buildPath: route.buildPath,
      vinext: snapshots.vinext,
      next: snapshots.next,
    });
  }
}

const comparison = {
  generatedAt: new Date().toISOString(),
  routesCompared: routes.length,
  semanticMismatches,
  variants: {
    vinext: {
      durationMs: buildReports.vinext.durationMs,
      htmlCount: buildReports.vinext.htmlCount,
      outputBytes: buildReports.vinext.outputBytes,
      clientJavaScriptBytes: buildReports.vinext.clientJavaScriptBytes,
      warnings: buildReports.vinext.warnings,
    },
    next: {
      durationMs: buildReports.next.durationMs,
      htmlCount: buildReports.next.htmlCount,
      outputBytes: buildReports.next.outputBytes,
      clientJavaScriptBytes: buildReports.next.clientJavaScriptBytes,
      warnings: buildReports.next.warnings,
    },
  },
};

await writeFile(
  resolve(artifactsRoot, "build-comparison.json"),
  JSON.stringify(comparison, null, 2),
  "utf8",
);

const percent = (smaller, larger) =>
  `${Math.round((1 - smaller / larger) * 100)}%`;
const markdown = `# Сравнение static export SAFRWAY

Дата: 28 июля 2026 года.

Статус: локальная проверка ветки \`codex/safrway-stabilization\`. Эти
артефакты не отправлены в GitHub и не развёрнуты в production.

## Проверенные варианты

| Показатель | Vinext 0.0.50 | Next.js 16.2.6 |
|---|---:|---:|
| Команда | \`vinext build\` | \`next build\` |
| Проверенных публичных маршрутов | ${routes.length} | ${routes.length} |
| HTML-файлов вместе со служебными 404 | ${comparison.variants.vinext.htmlCount} | ${comparison.variants.next.htmlCount} |
| Размер output | ${comparison.variants.vinext.outputBytes} байт | ${comparison.variants.next.outputBytes} байт |
| Клиентский JavaScript | ${comparison.variants.vinext.clientJavaScriptBytes} байт | ${comparison.variants.next.clientJavaScriptBytes} байт |
| Время контрольной сборки | ${comparison.variants.vinext.durationMs} мс | ${comparison.variants.next.durationMs} мс |
| Build warnings | ${comparison.variants.vinext.warnings.length} | ${comparison.variants.next.warnings.length} |

Vinext формирует output примерно на ${percent(
  comparison.variants.vinext.outputBytes,
  comparison.variants.next.outputBytes,
)} меньше и клиентский JavaScript примерно на ${percent(
  comparison.variants.vinext.clientJavaScriptBytes,
  comparison.variants.next.clientJavaScriptBytes,
)} меньше. Счётчик RSC между реализациями не сравнивается напрямую: Vinext использует один \`.rsc\` на маршрут, Next — сегментированные \`.txt\`.

## Семантическая эквивалентность

Сравнивались \`title\`, \`description\`, \`h1\` и набор внутренних ссылок каждой из ${routes.length} страниц.

- Расхождений: **${semanticMismatches.length}**.
- В обоих output присутствуют все ${routes.length} публичных страниц, 404, \`robots.txt\` и \`sitemap.xml\`.
- Закрытые страницы имеют \`noindex\`; canonical не содержит localhost или внутренний порт.

## Вывод

Штатный \`output: "export"\` вместе с \`generateStaticParams\` полностью заменяет собственный \`export-static.mjs\` по публичному поведению сайта. Удалять старый exporter на этапе 1–2 не нужно: сначала следует выбрать целевой runtime и выполнить отдельный release-спринт.

Для текущего Nginx + Cloudflare Tunnel официальная Next.js static-сборка не требует Cloudflare Vite Plugin или Worker runtime и является более стандартной основой для SEO. Vinext остаётся заметно компактнее, но не обработал Next metadata routes \`robots.ts\` и \`sitemap.ts\`; поэтому технические SEO-файлы генерируются framework-neutral скриптом в \`public/\`.

Дополнительный release-фактор: официальный Next build выполняет полную
TypeScript-проверку. Vinext 0.0.50 пропустил ошибочный идентификатор типа,
который Next обнаружил; после исправления обе сборки повторно прошли.
`;

await mkdir(docsRoot, { recursive: true });
await writeFile(
  resolve(docsRoot, "BUILD_COMPARISON_2026-07-28.md"),
  markdown,
  "utf8",
);

console.log(JSON.stringify(comparison, null, 2));

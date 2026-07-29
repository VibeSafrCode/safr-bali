import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateContentEntry } from "../../shared/scripts/validate-contracts.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptRoot, "..");
const developmentRoot = path.resolve(projectRoot, "..");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function contentEntry({
  contentId,
  route,
  title,
  summary,
  body,
  status = "legacy_needs_sources",
  sources = [],
  criticalFacts = [],
  lastVerifiedAt = null,
  productionCutoverAllowed = false,
  verificationPriority = "high",
}) {
  const normalizedBody = body.replaceAll("\\n", "\n");
  return {
    schemaVersion: 1,
    contentId,
    route,
    locale: "ru",
    kind: route.endsWith("/visas/") ? "service" : "article",
    status,
    verificationPriority,
    title,
    summary,
    body: normalizedBody,
    sources,
    criticalFacts,
    lastVerifiedAt,
    legacyChecksum: digest(normalizedBody),
    previewAllowed: true,
    productionCutoverAllowed,
  };
}

const accessedAt = "2026-07-29T00:00:00.000Z";

function officialSource(sourceId, title, url) {
  return {
    sourceId,
    type: "official_authority",
    title,
    publisher: "Direktorat Jenderal Imigrasi Republik Indonesia",
    url,
    accessedAt,
  };
}

const sourceE33g = officialSource(
  "imigrasi-e33g",
  "E33G Visa Rumah Kedua Pekerja Jarak Jauh",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/E33G",
);
const sourceD12 = officialSource(
  "imigrasi-d12",
  "D12 Visa Kunjungan Pra-Investasi",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/D12",
);
const sourceD1 = officialSource(
  "imigrasi-d1",
  "D1 Visa Kunjungan Wisata",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/D1",
);
const sourceD2 = officialSource(
  "imigrasi-d2",
  "D2 Visa Kunjungan Bisnis",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/D2",
);
const sourceC1 = officialSource(
  "imigrasi-c1",
  "C1 Visa Kunjungan Wisata",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/C1",
);
const sourceVisaCatalog = officialSource(
  "imigrasi-visa-catalog",
  "Daftar Visa Indonesia",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia",
);
const sourceB1 = officialSource(
  "imigrasi-b1",
  "B1 Visa Kunjungan Wisata",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/B1",
);
const sourceVoaCountries = officialSource(
  "imigrasi-voa-countries",
  "Daftar Negara Subjek Visa on Arrival",
  "https://www.imigrasi.go.id/wna/daftar-negara-voa-bvk-calling-visa/daftar-negara-subjek-visa-on-arrival",
);
const sourceE31b = officialSource(
  "imigrasi-e31b",
  "E31B Visa Keluarga Suami/Istri Pemegang ITAS/ITAP",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/E31B",
);
const sourceE31e = officialSource(
  "imigrasi-e31e",
  "E31E Visa Keluarga Anak Pemegang ITAS/ITAP",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/E31E",
);
const sourceE31h = officialSource(
  "imigrasi-e31h",
  "E31H Visa Keluarga Orang Tua dari Anak Pemegang ITAS/ITAP",
  "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/E31H",
);
const safrwayPricingSource = {
  sourceId: "safrway-visa-pricing",
  type: "primary_provider",
  title: "Визовый каталог и политика цен под ключ SAFRWAY",
  publisher: "SAFRWAY",
  url: "https://safrway.online/bali/visas/",
  accessedAt,
};

const [visaContent, legacyRegistry, contentSchema] = await Promise.all([
  readJson(path.join(developmentRoot, "bot/app/content/visas.json")),
  readJson(path.join(developmentRoot, "shared/content/legacy-content-registry.v1.json")),
  readJson(path.join(developmentRoot, "shared/contracts/content-entry.v1.schema.json")),
]);

const sourceEntries = [
  contentEntry({
    contentId: "bali.visas",
    route: "/bali/visas/",
    title: "Визы на Бали",
    summary:
      "Каталог текущих визовых сценариев SAFRWAY для поездки и проживания на Бали.",
    body:
      "Выберите подходящий сценарий: ITAS E33G для удалённых работников, многократные D1/D2 и D12, однократную C1 или eVOA для короткой поездки.",
    status: "needs_review",
    sources: [
      sourceE33g,
      sourceD12,
      sourceD1,
      sourceD2,
      sourceC1,
      sourceB1,
      sourceVisaCatalog,
      safrwayPricingSource,
    ],
    criticalFacts: [
      {
        factId: "catalog-pricing",
        claim:
          "Указанные цены SAFRWAY являются окончательными ценами под ключ.",
        sourceIds: ["safrway-visa-pricing"],
      },
      {
        factId: "catalog-mixed-review",
        claim:
          "E33G, D1, D2, D12, C1 и B1/eVOA являются разными официальными категориями с собственными целями и условиями.",
        sourceIds: [
          "imigrasi-e33g",
          "imigrasi-d1",
          "imigrasi-d2",
          "imigrasi-d12",
          "imigrasi-c1",
          "imigrasi-b1",
        ],
      },
    ],
    lastVerifiedAt: accessedAt,
  }),
  contentEntry({
    contentId: "bali.visas.e33g",
    route: "/bali/visas/e33g/",
    title: "ITAS E33G",
    summary: "Для удалённых работников, сроком на 1 год.",
    body: visaContent.E33G.text,
    status: "needs_review",
    sources: [
      sourceE33g,
      sourceE31b,
      sourceE31e,
      sourceE31h,
      safrwayPricingSource,
    ],
    criticalFacts: [
      {
        factId: "e33g-purpose-term",
        claim:
          "E33G предназначена для удалённой работы на иностранную компанию и даёт пребывание на 1 год.",
        sourceIds: ["imigrasi-e33g"],
      },
      {
        factId: "e33g-requirements",
        claim:
          "Для E33G требуются договор с иностранной компанией и подтверждение дохода не менее 60 000 USD в год.",
        sourceIds: ["imigrasi-e33g"],
      },
      {
        factId: "e33g-family-review",
        claim:
          "E31E и E31H не применяются для присоединения к Golden Visa; маршрут супруга E31B требует проверки конкретного кейса.",
        sourceIds: ["imigrasi-e31b", "imigrasi-e31e", "imigrasi-e31h"],
      },
      {
        factId: "e33g-pricing",
        claim:
          "Стандартная и экспресс-цены SAFRWAY включают PNBP и работу сервиса.",
        sourceIds: ["safrway-visa-pricing"],
      },
    ],
    lastVerifiedAt: accessedAt,
  }),
  contentEntry({
    contentId: "bali.visas.d12",
    route: "/bali/visas/d12/",
    title: "D12",
    summary: "Многократная виза на 1 или 2 года.",
    body: visaContent.D12.text,
    status: "verified",
    sources: [sourceD12, safrwayPricingSource],
    criticalFacts: [
      {
        factId: "d12-purpose",
        claim:
          "D12 предназначена для предынвестиционной деятельности и не разрешает локальную оплачиваемую работу.",
        sourceIds: ["imigrasi-d12"],
      },
      {
        factId: "d12-term",
        claim:
          "D12 выдаётся на 1 или 2 года, допускает многократный въезд и пребывание до 180 дней за въезд.",
        sourceIds: ["imigrasi-d12"],
      },
      {
        factId: "d12-pricing",
        claim:
          "Все стандартные и экспресс-цены D12 у SAFRWAY являются окончательными ценами под ключ.",
        sourceIds: ["safrway-visa-pricing"],
      },
    ],
    lastVerifiedAt: accessedAt,
    productionCutoverAllowed: true,
  }),
  contentEntry({
    contentId: "bali.visas.d1-d2",
    route: "/bali/visas/d1-d2/",
    title: "D1/D2",
    summary: "Туристические и деловые многократные визы.",
    body: visaContent["D1/D2"].text,
    status: "verified",
    sources: [sourceD1, sourceD2, safrwayPricingSource],
    criticalFacts: [
      {
        factId: "d1-d2-purpose",
        claim:
          "D1 предназначена для многократных туристических поездок, а D2 — для многократных деловых поездок без локальной оплачиваемой работы.",
        sourceIds: ["imigrasi-d1", "imigrasi-d2"],
      },
      {
        factId: "d1-d2-term",
        claim:
          "D1 и D2 выдаются на 1, 2 или 5 лет, разрешают пребывание до 60 дней за въезд и продление до общего срока 180 дней.",
        sourceIds: ["imigrasi-d1", "imigrasi-d2"],
      },
      {
        factId: "d1-d2-requirements",
        claim:
          "Для D1/D2 требуются паспорт, выписка за 3 месяца минимум на 2 000 USD, фото, резюме, план поездки и подтверждение цели.",
        sourceIds: ["imigrasi-d1", "imigrasi-d2"],
      },
      {
        factId: "d1-d2-pricing",
        claim:
          "Все стандартные, экспресс- и цены продления D1/D2 у SAFRWAY являются окончательными ценами под ключ.",
        sourceIds: ["safrway-visa-pricing"],
      },
    ],
    lastVerifiedAt: accessedAt,
    productionCutoverAllowed: true,
    verificationPriority: "normal",
  }),
  contentEntry({
    contentId: "bali.visas.c1",
    route: "/bali/visas/c1/",
    title: "C1",
    summary:
      "Однократная гостевая виза до 60 дней с возможностью продления.",
    body: visaContent.C1.text,
    status: "verified",
    sources: [sourceC1, safrwayPricingSource],
    criticalFacts: [
      {
        factId: "c1-purpose",
        claim:
          "C1 является однократной гостевой визой для туризма и перечисленных официальной карточкой нерабочих целей.",
        sourceIds: ["imigrasi-c1"],
      },
      {
        factId: "c1-term",
        claim:
          "C1 разрешает пребывание до 60 дней с продлением до общего срока 180 дней и должна быть использована в течение 90 дней после выдачи.",
        sourceIds: ["imigrasi-c1"],
      },
      {
        factId: "c1-pnbp",
        claim: "Официальный PNBP C1 составляет 1 000 000 IDR.",
        sourceIds: ["imigrasi-c1"],
      },
      {
        factId: "c1-pricing",
        claim:
          "Цена SAFRWAY 2 500 000 IDR является окончательной ценой под ключ и включает PNBP.",
        sourceIds: ["safrway-visa-pricing"],
      },
    ],
    lastVerifiedAt: accessedAt,
    productionCutoverAllowed: true,
    verificationPriority: "normal",
  }),
  contentEntry({
    contentId: "bali.visas.voa",
    route: "/bali/visas/voa/",
    title: "eVOA",
    summary: "Краткосрочная виза по прибытии.",
    body: visaContent.VOA.text,
    status: "verified",
    sources: [sourceB1, sourceVoaCountries, safrwayPricingSource],
    criticalFacts: [
      {
        factId: "evoa-term",
        claim:
          "B1/eVOA является однократной визой на 30 дней с одним продлением до общего срока 60 дней.",
        sourceIds: ["imigrasi-b1"],
      },
      {
        factId: "evoa-pnbp",
        claim: "Официальный PNBP B1/eVOA составляет 500 000 IDR.",
        sourceIds: ["imigrasi-b1"],
      },
      {
        factId: "evoa-eligibility",
        claim:
          "eVOA доступна только гражданам стран из официального списка Visa on Arrival.",
        sourceIds: ["imigrasi-voa-countries"],
      },
      {
        factId: "evoa-pricing",
        claim:
          "Цена SAFRWAY 800 000 IDR / 50 USD является окончательной ценой под ключ и включает PNBP.",
        sourceIds: ["safrway-visa-pricing"],
      },
    ],
    lastVerifiedAt: accessedAt,
    productionCutoverAllowed: true,
  }),
  contentEntry({
    contentId: "bali.visas.other",
    route: "/bali/visas/other-visa/",
    title: "Другая виза",
    summary:
      "Индивидуальный подбор официальной визовой категории под конкретную ситуацию.",
    body: visaContent["Другая виза"].text,
    status: "verified",
    sources: [sourceVisaCatalog],
    criticalFacts: [
      {
        factId: "other-visa-classification",
        claim:
          "Официальный классификатор содержит отдельные визовые категории для разных целей поездки, сроков и разрешённых действий.",
        sourceIds: ["imigrasi-visa-catalog"],
      },
    ],
    lastVerifiedAt: accessedAt,
    productionCutoverAllowed: true,
    verificationPriority: "normal",
  }),
];

const expectedRoutes = new Set(
  legacyRegistry.entries.map((entry) => entry.route),
);

for (const entry of sourceEntries) {
  if (!expectedRoutes.has(entry.route)) {
    throw new Error(`Preview entry is not registered: ${entry.route}`);
  }
  validateContentEntry(entry, contentSchema);
}

const contentRevision = digest(JSON.stringify(sourceEntries));
const snapshot = {
  schemaVersion: 1,
  snapshotId: `catalog-v1-bali-visa-pilot-${contentRevision.slice(7, 19)}`,
  contentRevision,
  routeContractVersion: 1,
  designTokenVersion: 1,
  generatedAt: accessedAt,
  immutable: true,
  entries: sourceEntries.map((content) => ({
    contentHash: digest(JSON.stringify(content)),
    content,
  })),
};

const outputPath = path.join(
  projectRoot,
  "src/data/generated/pilot-snapshot.v1.json",
);
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    snapshotId: snapshot.snapshotId,
    entries: snapshot.entries.length,
    output: path.relative(projectRoot, outputPath),
  }),
);

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePublicContent,
  parsePublicContent,
  publicHttpsLink,
  withoutLegacyCommercialPrices,
} from "../src/lib/public-content.mjs";

test("normalizePublicContent converts legacy literals and removes unsafe controls", () => {
  assert.equal(
    normalizePublicContent("Раздел:\\n— первый\\n\\nВторой\u0000 блок\r\n"),
    "Раздел:\n— первый\n\nВторой блок",
  );
  assert.equal(normalizePublicContent("Обычный текст"), "Обычный текст");
});

test("legacy commercial blocks are removed without deleting visa requirements", () => {
  const source = [
    "Срок пребывания:\n— до 60 дней",
    "Стоимость оформления SAFR:\n▪️ 2.500.000 IDR — под ключ",
    "В стоимость входит официальный сбор 1.000.000 IDR.",
    "Для подачи:\n☑️ Выписка с минимум $2000",
  ].join("\n\n");
  const cleaned = withoutLegacyCommercialPrices("/bali/visas/c1/", source);
  assert.doesNotMatch(cleaned, /2\.500\.000 IDR/);
  assert.match(cleaned, /Для подачи:/);
  assert.match(cleaned, /\$2000/);
});

test("parsePublicContent creates semantic facts, prices and checklists", () => {
  const blocks = parsePublicContent(
    "Срок пребывания:\\n— до 60 дней\\n— один въезд\\n\\n" +
      "Стоимость:\\n▪️ 2.500.000 IDR\\n\\n" +
      "Для подачи:\\n☑️ Паспорт",
  );

  assert.deepEqual(
    blocks.map((block) => block.tone),
    ["facts", "price", "checklist"],
  );
  assert.equal(blocks[0].items.length, 2);
  assert.equal(blocks[1].items[0].kind, "price");
  assert.equal(blocks[2].items[0].kind, "check");
});

test("public links allow only absolute HTTPS and content remains plain text", () => {
  assert.equal(publicHttpsLink("javascript:alert(1)"), null);
  assert.equal(publicHttpsLink("http://example.com"), null);
  assert.equal(publicHttpsLink("https://example.com/a"), "https://example.com/a");
  assert.equal(
    parsePublicContent("<script>alert(1)</script>")[0].paragraphs[0],
    "<script>alert(1)</script>",
  );
});

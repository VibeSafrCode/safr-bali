import assert from "node:assert/strict";
import test from "node:test";
import { rentalPaymentRequest } from "../src/components/RentalActions";
import { clientRentalCopy, rentalUtilityCopy } from "../src/i18n/client-rental-copy";
import { CLIENT_RUNTIME_LOCALES } from "../src/i18n/client-runtime";
import { emptyLifeDraft, lifeWriteFields, validateLifeDraft } from "../src/components/lifeServices";
import { lifeProgress } from "../src/components/lifeProgress";

const item = { id: 42, price_currency: "IDR", end_date: "2026-11-30" } as const;
const draft = { amount: "30000000", preferredCurrency: "eur", start: "2026-12-01", end: "2026-12-31" };

test("rental payment sends the agreed total and explicit payment period to support", () => {
  const request = rentalPaymentRequest(item, "Own Villa", draft);
  assert.ok(request);
  assert.deepEqual(request.route_context, { section: "Оплата аренды", service: "rental-42" });
  assert.match(request.body, /карточка #42\nOwn Villa/);
  assert.match(request.body, /Оплачиваемый период: 2026-12-01 — 2026-12-31/);
  assert.match(request.body, /Сумма к оплате арендодателю: 30000000 IDR/);
  assert.match(request.body, /Валюта перевода клиента: EUR/);
  assert.match(request.body, /Окончание аренды по карточке: 2026-11-30/);
});

test("rental payment preserves exact local digits and rejects ambiguous amounts or dates", () => {
  for (const amount of ["٣٠٠٠٠٠٠٠", "۳۰۰۰۰۰۰۰", "३०००००००"]) {
    assert.match(rentalPaymentRequest(item, "Own Villa", { ...draft, amount })!.body, /: 30000000 IDR/);
  }
  for (const amount of ["١٢٫٥٠", "१२,५०", "12.50"]) {
    assert.match(rentalPaymentRequest(item, "Own Villa", { ...draft, amount })!.body, /: 12\.50 IDR/);
  }
  for (const amount of ["0", "12,345", "12,50.1", "3e7", "30 000 000"]) {
    assert.equal(rentalPaymentRequest(item, "Own Villa", { ...draft, amount }), null);
  }
  for (const end of ["", "2026-11-30", "2026-12-32", "2027-02-29"]) {
    assert.equal(rentalPaymentRequest(item, "Own Villa", { ...draft, end }), null);
  }
});

test("rental copy covers the ten client locales with complete labels", () => {
  assert.deepEqual(Object.keys(clientRentalCopy), [...CLIENT_RUNTIME_LOCALES]);
  assert.deepEqual(Object.keys(rentalUtilityCopy), [...CLIENT_RUNTIME_LOCALES]);
  for (const copy of Object.values(clientRentalCopy)) {
    assert.deepEqual(Object.keys(copy), Object.keys(clientRentalCopy.ru));
    assert.ok(Object.values(copy).every((label) => label.trim().length > 0));
  }
});

test("housing account preserves leading zeroes and monthly counter follows its anchor", () => {
  const draft = { ...emptyLifeDraft("housing"), electricity_account_number: "0001234500" };
  assert.deepEqual(validateLifeDraft(draft, "DRAFT", "ru"), {});
  assert.equal(lifeWriteFields(draft, "DRAFT").electricity_account_number, "0001234500");
  assert.equal(lifeWriteFields({ ...draft, kind: "bike" }, "DRAFT").electricity_account_number, null);
  assert.ok(validateLifeDraft({ ...draft, electricity_account_number: "001-22" }, "DRAFT", "ru").electricity_account_number);
  assert.equal(lifeProgress("2026-01-07", null, "2026-01-15", true)?.end, "2026-02-07");
  assert.equal(lifeProgress("2026-01-07", null, "2026-02-07", true)?.end, "2026-03-07");
});

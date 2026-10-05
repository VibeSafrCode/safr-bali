import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const crm = readFileSync(join(root, "src/components/AdminVisaCRM.tsx"), "utf8");
const archive = readFileSync(join(root, "src/components/AdminVisaArchive.tsx"), "utf8");
const admin = readFileSync(join(root, "src/surfaces/AdminApp.tsx"), "utf8");
const businessSettings = readFileSync(join(root, "src/components/AdminBusinessSettings.tsx"), "utf8");
const workspace = readFileSync(join(root, "src/components/AdminBusinessWorkspace.tsx"), "utf8");
const styles = readFileSync(join(root, "src/styles.css"), "utf8");

test("root visa editor moves cases to a separate archive where audited permanent delete lives", () => {
  assert.match(crm, /show_to_client: showToClient/);
  assert.match(crm, /notify_client: notifyClient/);
  assert.match(crm, /Переместить визу в архив\?/);
  assert.match(crm, /не удаляет записи из базы/);
  assert.doesNotMatch(crm, /delete-preview|permanent-delete|Удалить визу навсегда/);
  assert.match(archive, /Удалить архивную визу навсегда\?/);
  assert.match(archive, /delete-preview/);
  assert.match(archive, /permanent-delete/);
  assert.match(archive, /Клиент, заказы, рефералы, Points, диалоги и другие визы останутся/);
  assert.match(archive, /Причина/);
  assert.match(archive, /publication\/hide/);
  assert.match(crm, /<details className="crm-advanced"><summary>\{ui\("Все процессы и номера заявок"/);
  assert.match(crm, /Номер заявки \/ дела/);
  assert.doesNotMatch(crm, /Reference \(зашифруется\)/);
});

test("admin uses human business sections and never renders raw settings JSON", () => {
  for (const label of ["Обращения клиентов", "Настройки бизнеса", "История действий"]) assert.match(admin, new RegExp(label));
  for (const label of ["Каталог и цены", "Обмен", "Уведомления"]) assert.match(workspace, new RegExp(label));
  assert.match(admin, /<AdminBusinessWorkspace locale=\{locale\}/);
  assert.doesNotMatch(admin, /JSON\.stringify\(data\?\.exchange_routes/);
  assert.match(admin, /client_name/);
  assert.match(workspace, /<ExchangeSettingsEditor route=/);
  assert.match(businessSettings, /Предпросмотр/);
  assert.match(businessSettings, /restore_version/);
  assert.match(admin, /admin-audit-filters/);
  assert.match(admin, /date_from/);
  assert.doesNotMatch(businessSettings, /JSON\.stringify\(route\.settings/);
});

test("appearance defaults dark and honors reduced motion", () => {
  const controls = readFileSync(join(root, "src/components/AppearanceControls.tsx"), "utf8");
  assert.match(controls, /saved === "light" \? "light" : "dark"/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /data-theme="dark"/);
});

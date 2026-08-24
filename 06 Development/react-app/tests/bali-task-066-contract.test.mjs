import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const crm = readFileSync(join(root, "src/components/AdminVisaCRM.tsx"), "utf8");
const admin = readFileSync(join(root, "src/surfaces/AdminApp.tsx"), "utf8");
const businessSettings = readFileSync(join(root, "src/components/AdminBusinessSettings.tsx"), "utf8");
const styles = readFileSync(join(root, "src/styles.css"), "utf8");

test("root visa editor uses compact aggregate save and soft-delete wording", () => {
  assert.match(crm, /show_to_client: showToClient/);
  assert.match(crm, /notify_client: notifyClient/);
  assert.match(crm, /Удалить визу из работы\?/);
  assert.match(crm, /не удаляет записи из базы/);
  assert.match(crm, /Дополнительно: процесс и номер заявки/);
  assert.doesNotMatch(crm, /Reference \(зашифруется\)/);
});

test("admin uses human business sections and never renders raw settings JSON", () => {
  for (const label of ["Обращения клиентов", "Настройки бизнеса", "История действий", "Обменник", "Уведомления"]) assert.match(admin, new RegExp(label));
  assert.doesNotMatch(admin, /JSON\.stringify\(data\?\.exchange_routes/);
  assert.match(admin, /client_name/);
  assert.match(admin, /ExchangeSettingsEditor/);
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

import React from "react";
import { createRoot } from "react-dom/client";
import { AdminMessaging } from "../../src/components/AdminMessaging";
import "../../src/styles.css";
import "../../src/admin.css";
import "../../src/admin-design.css";
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
if (document.cookie.split(";").some(value => value.trim() === "safr_session=synthetic-messaging-session")) {
  document.cookie = "safr_session=; Max-Age=0; path=/; SameSite=Strict";
}
document.cookie = "safr_messaging_preview=synthetic-messaging-session; path=/; SameSite=Strict";
const csrf = "d0d1c8ebc53ee9b7b105a7242e917552ad855a6efb63c90f75a36555c70a9b79";
// Fixture is not a production entry point. Its API uses synthetic identities
// and has no Telegram transport, credentials or production database.
createRoot(document.getElementById("root")!).render(<div className="admin-shell" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}><main className="admin-content"><p role="status">ЛОКАЛЬНЫЙ СИНТЕТИЧЕСКИЙ СТЕНД — TELEGRAM-ОТПРАВКИ ОТСУТСТВУЮТ</p><AdminMessaging csrfToken={csrf} locale={new URLSearchParams(location.search).get("lang") === "en" ? "en" : "ru"}/></main></div>);

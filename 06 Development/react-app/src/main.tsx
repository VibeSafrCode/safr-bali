import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AccountApp } from "./surfaces/AccountApp";
import { MiniApp } from "./surfaces/MiniApp";
import { AdminApp } from "./surfaces/AdminApp";
import { PwaLifecycle } from "./components/PwaLifecycle";
import { useDocumentLocale } from "./components/AppearanceControls";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("SAFRWAY application root is missing");
}

const isAccount =
  window.location.pathname === "/account" ||
  /^\/account\/(?:[A-Za-z0-9_-]+\/)*$/.test(window.location.pathname);
const isAdmin =
  window.location.pathname === "/admin" ||
  /^\/admin\/(?:[A-Za-z0-9_-]+\/)*$/.test(window.location.pathname);
function ApplicationLifecycle() {
  const locale = useDocumentLocale();
  return <PwaLifecycle locale={locale} />;
}

createRoot(root).render(
  <StrictMode>
    {isAdmin ? <><AdminApp /><ApplicationLifecycle /></> : isAccount ? <><AccountApp /><ApplicationLifecycle /></> : <MiniApp />}
  </StrictMode>,
);

import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { PwaLifecycle } from "./components/PwaLifecycle";
import { useDocumentLocale } from "./components/AppearanceControls";
import "./styles.css";

const AccountApp = lazy(() => import("./surfaces/AccountApp").then(({ AccountApp }) => ({ default: AccountApp })));
const AdminApp = lazy(() => import("./surfaces/AdminApp").then(({ AdminApp }) => ({ default: AdminApp })));
const MiniApp = lazy(() => import("./surfaces/MiniApp").then(({ MiniApp }) => ({ default: MiniApp })));
const WebCalculatorApp = lazy(() => import("./surfaces/WebCalculatorApp").then(({ WebCalculatorApp }) => ({ default: WebCalculatorApp })));

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
const isCalculator = window.location.pathname === "/calculator/";
function ApplicationLifecycle() {
  const locale = useDocumentLocale();
  return <PwaLifecycle locale={locale} />;
}

function ApplicationLoading() {
  return <main className="application-loading" role="status" aria-live="polite"><span>SAFRWAY</span></main>;
}

createRoot(root).render(
  <StrictMode>
    <Suspense fallback={<ApplicationLoading />}>
      {isAdmin ? <><AdminApp /><ApplicationLifecycle /></> : isAccount ? <><AccountApp /><ApplicationLifecycle /></> : isCalculator ? <><WebCalculatorApp /><ApplicationLifecycle /></> : <MiniApp />}
    </Suspense>
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AccountApp } from "./surfaces/AccountApp";
import { MiniApp } from "./surfaces/MiniApp";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("SAFRWAY application root is missing");
}

const isAccount =
  window.location.pathname === "/account" ||
  /^\/account\/(?:[A-Za-z0-9_-]+\/)*$/.test(window.location.pathname);

createRoot(root).render(
  <StrictMode>
    {isAccount ? <AccountApp /> : <MiniApp />}
  </StrictMode>,
);

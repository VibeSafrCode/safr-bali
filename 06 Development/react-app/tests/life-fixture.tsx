import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BaliLifeCabinet } from "../src/components/BaliLifeCabinet";
import { AdminLifeServices } from "../src/components/AdminLifeServices";
import { AccountApp } from "../src/surfaces/AccountApp";
import { MiniApp } from "../src/surfaces/MiniApp";
import "../src/styles.css";
import "../src/destination-design.css";
import "../src/country-picker.css";

function Fixture() {
  const [userId, setUserId] = useState(5);
  const params = new URLSearchParams(location.search);
  const locale = params.get("locale") === "ru" ? "ru" : "en";
  document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
  return <main style={{ maxWidth: 1100, margin: "auto", padding: 20 }}><button onClick={() => setUserId(6)}>Switch fixture user</button>{params.has("admin") ? <AdminLifeServices userId={userId} csrfToken="fixture-csrf" locale={locale} /> : <BaliLifeCabinet userId={userId} apiPrefix="/api/web" locale={locale} onBack={() => {}} onOpenVisas={() => {}} onManager={() => {}} />}</main>;
}
const surface = new URLSearchParams(location.search).get("surface");
if (surface === "account") history.replaceState({}, "", "/account/profile/");
if (surface === "mini") history.replaceState({}, "", "/#/profile");
createRoot(document.getElementById("root")!).render(surface === "account" ? <AccountApp /> : surface === "mini" ? <MiniApp /> : <Fixture />);

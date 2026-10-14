import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MiniApp } from "./surfaces/MiniApp";
import { PricingProvider } from "./pricing/runtime";
import { DestinationBackdrop } from "./components/DestinationBackdrop";
import "./styles.css";
import "./destination-design.css";
import "./country-picker.css";
import "../../shared/design/client-night-palette.css";
import "./ui/yoga-gangster.css";
import { clientBrand } from "./ui/client-brand";

const root = document.getElementById("root");
if (!root) throw new Error("Mini App root is missing");
document.documentElement.dataset.appDesign = "true";
document.documentElement.dataset.appNight = "true";
document.documentElement.dataset.clientBrand = clientBrand.id;
document.documentElement.dataset.theme = "dark";
document.documentElement.style.colorScheme = "dark";
document.title = "Yoga Gangster · Mini App";
document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#090909");

createRoot(root).render(
  <StrictMode>
    <DestinationBackdrop />
    <PricingProvider><MiniApp /></PricingProvider>
  </StrictMode>,
);

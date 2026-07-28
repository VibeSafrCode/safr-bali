import type { Metadata } from "next";
import { MiniAppDashboard } from "./MiniAppDashboard";

export const metadata: Metadata = {
  title: "Личный кабинет",
  description: "SAFR Points, заявки, реферальная сеть и услуги SAFR.",
  alternates: {
    canonical: "https://app.safrway.online/",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function MiniAppPage() {
  return <MiniAppDashboard />;
}

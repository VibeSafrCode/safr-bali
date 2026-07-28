import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { AccountDashboard } from "./AccountDashboard";

export const metadata: Metadata = {
  title: "Личный кабинет",
  description: "SAFR Points, реферальная сеть, заявки и диалог с менеджером.",
};

export default function AccountPage() {
  return (
    <main className="account-page">
      <SiteHeader />
      <AccountDashboard />
      <SiteFooter />
    </main>
  );
}

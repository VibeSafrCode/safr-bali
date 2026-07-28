import type { Metadata } from "next";
import Link from "next/link";
import { AccountDashboard } from "./AccountDashboard";

export const metadata: Metadata = {
  title: "Личный кабинет",
  description: "SAFR Points, реферальная сеть, заявки и диалог с менеджером.",
};

export default function AccountPage() {
  return (
    <main className="account-page">
      <Link className="brand" href="/">
        <span className="brand-mark">S</span>
        <span>SAFR</span>
      </Link>
      <AccountDashboard />
    </main>
  );
}

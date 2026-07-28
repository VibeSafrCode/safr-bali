import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SAFR — путешествия и жизнь без лишнего хаоса",
    template: "%s — SAFR",
  },
  description:
    "Визы, жильё, трансферы, туры и проверенные люди на месте: Бали, Таиланд, Россия и Непал.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SAFR — путешествия и жизнь без лишнего хаоса",
    description:
      "Один надёжный контакт для виз, жилья, туров и бытовых задач в разных странах.",
    type: "website",
    locale: "ru_RU",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "SAFR — путешествия и жизнь без лишнего хаоса",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SAFR — путешествия и жизнь без лишнего хаоса",
    description: "Бали · Таиланд · Россия · Непал",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
      </body>
    </html>
  );
}

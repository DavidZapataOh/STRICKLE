import type { Metadata } from "next";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
import "../globals.css";
import { hasLocale, htmlLang, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

const bricolage = localFont({ src: "../../fonts/bricolage-grotesque-latin-standard-normal.woff2", variable: "--font-bricolage", weight: "200 800", display: "swap" });
const manrope = localFont({ src: "../../fonts/manrope-latin-wght-normal.woff2", variable: "--font-manrope", weight: "200 800", display: "swap" });
const geistMono = localFont({
  src: [
    { path: "../../fonts/geist-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../../fonts/geist-mono-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return {
    title: t.meta.title,
    description: t.meta.description,
    icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
    alternates: { languages: { en: "/en", es: "/es", "pt-BR": "/pt-br" } },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return (
    <html lang={htmlLang[lang]} className={`${bricolage.variable} ${manrope.variable} ${geistMono.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}

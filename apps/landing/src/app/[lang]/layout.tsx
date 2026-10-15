import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bricolage_Grotesque, Manrope, Geist_Mono } from "next/font/google";
import "../globals.css";
import { hasLocale, htmlLang, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"], axes: ["wdth", "opsz"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"], weight: ["400", "500"] });

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

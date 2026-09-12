import { Hero } from "@/components/hero/Hero";
import { Closing } from "@/components/sections/Closing";
import { Faq } from "@/components/sections/Faq";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Ledger } from "@/components/sections/Ledger";
import { Limits } from "@/components/sections/Limits";
import { Regulation } from "@/components/sections/Regulation";
import { Surfaces } from "@/components/sections/Surfaces";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function Home() {
  return (
    <>
      <main className="flex flex-1 flex-col">
        <Hero />
        <Regulation />
        <HowItWorks />
        <Surfaces />
        <Ledger />
        <Limits />
        <Faq />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}

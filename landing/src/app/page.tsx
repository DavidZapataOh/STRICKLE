import { Hero } from "@/components/hero/Hero";
import { Assay } from "@/components/plate/Assay";
import { Bench } from "@/components/plate/Bench";
import { Certificate } from "@/components/plate/Certificate";
import { Law } from "@/components/plate/Law";
import { Limits } from "@/components/plate/Limits";
import { Marks } from "@/components/plate/Marks";
import { Questions } from "@/components/plate/Questions";
import { Register } from "@/components/plate/Register";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function Home() {
  return (
    <>
      <main className="flex flex-1 flex-col">
        <Hero />
        <Marks />
        <Law />
        <Assay />
        <Bench />
        <Register />
        <Limits />
        <Questions />
        <Certificate />
      </main>
      <SiteFooter />
    </>
  );
}

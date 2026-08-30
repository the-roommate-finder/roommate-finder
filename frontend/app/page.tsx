import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { VerifiedStrip } from "@/components/landing/verified-strip";
import { Features } from "@/components/landing/features";
import { PathPicker } from "@/components/landing/path-picker";
import { ListingsPreview } from "@/components/landing/listings-preview";
import { Goals } from "@/components/landing/goals";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <VerifiedStrip />
      <Features />
      <PathPicker />
      <VerifiedStrip reverse />
      <ListingsPreview />
      <Goals />
      <Pricing />
      <Faq />
      <Footer />
    </>
  );
}

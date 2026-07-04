import React from "react";
import HeroSection from "@/components/marketing/HeroSection";
import StatsBar from "@/components/marketing/StatsBar";
import BuiltForSASection from "@/components/marketing/BuiltForSASection";
import HowItWorks from "@/components/marketing/HowItWorks";
import WhoItsFor from "@/components/marketing/WhoItsFor";
import FeaturesGrid from "@/components/marketing/FeaturesGrid";
import FeatureShowcase from "@/components/marketing/FeatureShowcase";
import TestimonialsSection from "@/components/marketing/TestimonialsSection";
import FAQSection from "@/components/marketing/FAQSection";
import CTABanner from "@/components/marketing/CTABanner";

export default function Home() {
  return (
    <>
      <HeroSection />
      <StatsBar />
      <BuiltForSASection />
      <HowItWorks />
      <WhoItsFor />
      <FeaturesGrid />
      <FeatureShowcase />
      <TestimonialsSection />
      <FAQSection />
      <CTABanner />
    </>
  );
}
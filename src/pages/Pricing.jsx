import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Essential",
    monthly: 59,
    annual: 590,
    credits: 60,
    desc: "Get started with AI property videos",
    features: ["60 credits/month", "AI photo editor", "Virtual staging", "Furniture removal", "Twilight photography", "Property descriptions", "Essential tier videos"],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Premium",
    monthly: 89,
    annual: 890,
    credits: 100,
    desc: "For active estate agents",
    features: ["100 credits/month", "Everything in Essential", "Social & Cinematic tier videos", "Premium tier videos", "Priority support"],
    cta: "Start free trial",
    featured: true,
    badge: "Most popular",
  },
  {
    name: "Pro",
    monthly: 179,
    annual: 1790,
    credits: 200,
    desc: "For high-volume agents",
    features: ["200 credits/month", "Everything in Premium", "Pro tier videos", "Faster render priority", "Dedicated support"],
    cta: "Start free trial",
    featured: false,
  },
  {
    name: "Agency",
    monthly: 1200,
    annual: 12000,
    credits: 1500,
    desc: "For agencies & media companies",
    features: ["1,500 credits/month", "Everything in Pro", "White-label branding", "Multiple team seats", "Dedicated account manager"],
    cta: "Contact sales",
    featured: false,
  },
];

const pricingFaqs = [
  { q: "How do credits work?", a: "Every plan gives you a monthly pool of credits. Photo tools (descriptions, AI photo edits, staging, furniture removal, twilight, social posts) cost 1 credit each, while AI videos cost 5-75 credits depending on the tier you choose." },
  { q: "Is annual billing worth it?", a: "Yes! Annual billing gives you 1 month free compared to paying monthly." },
  { q: "What happens when I run out of credits?", a: "You'll be prompted to upgrade your plan. Unused credits don't roll over month to month." },
  { q: "What's the difference between video tiers?", a: "Essential uses fast zoom/pan motion at 1080p. Social, Cinematic, Premium and Pro use AI-generated motion at increasing quality and render time, costing more credits accordingly." },
  { q: "What's the main difference between plans?", a: "Essential is for agents getting started. Premium and Pro add more monthly credits for higher volume. Agency is built for teams, with white-label branding and multiple seats." },
];

const paymentMethods = ["Visa / Mastercard", "EFT / Instant EFT", "SnapScan", "PayFast", "PayGate", "Ozow"];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="pt-28 pb-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#0F082B] mb-4">
            Start for free, upgrade when you love it.
          </h1>

          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-medium ${!annual ? "text-[#0F082B]" : "text-[#606060]"}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`w-12 h-6 rounded-full relative transition-colors ${annual ? "bg-purple-700" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${annual ? "left-[26px]" : "left-0.5"}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-[#0F082B]" : "text-[#606060]"}`}>Annual</span>
            {annual && (
              <span className="text-xs font-semibold bg-purple-50 text-purple-700 px-2 py-1 rounded-full">1 month free</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 ${
                plan.featured
                  ? "bg-white border-2 border-purple-700 shadow-xl"
                  : "bg-white border border-gray-200"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-700 text-white text-xs font-semibold px-4 py-1 rounded-full">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-bold text-[#0F082B] mb-1">{plan.name}</h3>
              <p className="text-sm text-[#606060] mb-4">{plan.desc}</p>

              <div className="mb-2">
                <span className="text-4xl font-extrabold text-[#0F082B]">
                  R{annual ? Math.round(plan.annual / 12) : plan.monthly}
                </span>
                <span className="text-[#606060] text-sm">/month</span>
                {annual && (
                  <p className="text-xs text-[#606060] mt-1">Billed R{plan.annual}/year</p>
                )}
              </div>
              <p className="text-sm font-semibold text-purple-700 mb-6">{plan.credits} credits/month</p>

              <Link to="/register">
                <Button
                  className={`w-full h-12 rounded-xl font-semibold text-base ${
                    plan.featured
                      ? "bg-purple-700 hover:bg-purple-800 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-[#0F082B]"
                  }`}
                >
                  {plan.cta}
                </Button>
              </Link>

              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-purple-700 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-[#606060]">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center mb-16">
          <div className="flex flex-wrap justify-center gap-3 mb-3">
            {paymentMethods.map((m) => (
              <span key={m} className="text-xs bg-gray-100 text-[#606060] px-3 py-1.5 rounded-lg font-medium">{m}</span>
            ))}
          </div>
          <p className="text-xs text-[#606060]">All prices exclude VAT. VAT-registered entities will have VAT applied at checkout.</p>
        </div>

        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#0F082B] text-center mb-8">Pricing FAQ</h2>
          <div className="space-y-3">
            {pricingFaqs.map((faq, i) => (
              <button
                key={i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-purple-200 transition-all"
              >
                <div className="flex justify-between items-start gap-3">
                  <span className="text-sm font-semibold text-[#0F082B]">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-[#606060] flex-shrink-0 mt-0.5 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </div>
                {openFaq === i && <p className="text-sm text-[#606060] leading-relaxed mt-3">{faq.a}</p>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
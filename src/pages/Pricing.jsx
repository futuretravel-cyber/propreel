import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Gift, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Starter",
    monthly: 129,
    annual: 1320,
    credits: 130,
    desc: "Get started with AI property videos",
    features: ["130 credits/month", "AI photo editor", "Virtual staging", "Furniture removal", "Twilight photography", "Property descriptions", "Essential tier videos"],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Professional",
    monthly: 589,
    annual: 6720,
    credits: 600,
    desc: "For active estate agents",
    features: ["600 credits/month", "Everything in Starter", "Social & Cinematic tier videos", "Social media post generation", "Priority queue"],
    cta: "Get Started",
    featured: true,
    badge: "Most popular",
  },
  {
    name: "Premium",
    monthly: 1270,
    annual: 14400,
    credits: 1300,
    desc: "For high-volume agents",
    features: ["1,300 credits/month", "Everything in Professional", "Premium tier HD videos", "Unlimited brand kits", "Priority support"],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Agency",
    monthly: 5000,
    annual: 60000,
    credits: 5000,
    desc: "For agencies & teams",
    features: ["5,000 credits/month", "Everything in Premium", "Add unlimited agents", "Shared credit pool", "Agency spending dashboard"],
    cta: "Get Started",
    featured: false,
  },
];

const pricingFaqs = [
  { q: "How do credits work?", a: "Every plan gives you a monthly pool of credits. 1 credit = R1. Photo tools (descriptions, AI photo edits, staging, furniture removal, twilight, social posts) cost 2 credits each, while AI videos cost 5-150 credits depending on the tier and length you choose." },
  { q: "Do I get free credits to try?", a: "Yes! Every new subscriber receives 5 free credits upon sign-up. Use them to test any feature before committing to a plan." },
  { q: "What happens when I run out of credits?", a: "You can buy custom credits on demand (R1 per credit) or upgrade to a higher plan. Unused credits don't roll over month to month." },
  { q: "What's the difference between video tiers?", a: "Essential uses fast zoom/pan motion at 1080p (5-10 credits). Social and Cinematic use AI-generated motion at 720p (30-90 credits). Premium uses AI motion at 1080p (60-150 credits). Longer videos cost more credits." },
  { q: "How does the Agency plan work?", a: "The Agency plan gives you a shared credit pool of 5,000 credits/month. You can add unlimited agents to your agency — each gets their own login but all spend from the one shared pool. Track spending per agent from the Agency dashboard." },
];

const paymentMethods = ["Visa / Mastercard", "EFT / Instant EFT", "SnapScan", "PayFast", "PayGate", "Ozow"];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="pt-28 pb-20">
      <div className="max-w-6xl mx-auto px-4">
        {/* Free credits banner */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl px-5 py-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <Gift className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-700">New here? Get 5 free credits on us!</p>
              <p className="text-xs text-emerald-600">Every new subscriber gets 5 complimentary credits.</p>
            </div>
          </div>
        </div>

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
              {plan.name === "Agency" && (
                <div className="absolute -top-3 right-4 w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              )}
              <h3 className="text-xl font-bold text-[#0F082B] mb-1">{plan.name}</h3>
              <p className="text-sm text-[#606060] mb-4">{plan.desc}</p>

              <div className="mb-2">
                <span className="text-4xl font-extrabold text-[#0F082B]">
                  R{annual ? Math.round(plan.annual / 12) : plan.monthly}
                </span>
                <span className="text-[#606060] text-sm">/month</span>
                {annual && (
                  <p className="text-xs text-[#606060] mt-1">Billed R{plan.annual.toLocaleString("en-ZA")}/year</p>
                )}
              </div>
              <p className="text-sm font-semibold text-purple-700 mb-6">{plan.credits.toLocaleString("en-ZA")} credits/month</p>

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
          <p className="text-xs text-[#606060]">All prices include VAT. 1 credit = R1.</p>
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
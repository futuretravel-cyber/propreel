import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    desc: "Get started with AI property videos",
    features: ["2 videos per month", "15 photos per video", "AutoReel watermark", "Standard templates", "Email support"],
    cta: "Get started free",
    featured: false,
  },
  {
    name: "Growth",
    monthly: 549,
    annual: 385,
    desc: "For active estate agents",
    features: ["Unlimited videos", "20 photos per video", "No watermark", "AI voiceovers", "Property24 import", "Priority support", "3-month credit rollover"],
    cta: "Start 7-day free trial",
    featured: true,
    badge: "Most popular",
  },
  {
    name: "Pro",
    monthly: 999,
    annual: 699,
    desc: "For agencies & media companies",
    features: ["Everything in Growth", "AI virtual staging unlimited", "AI photo edits unlimited", "AI avatars", "White-label branding", "25MB uploads", "Dedicated account manager", "1-year credit rollover"],
    cta: "Start 7-day free trial",
    featured: false,
  },
];

const pricingFaqs = [
  { q: "How many videos are included in each plan?", a: "Free plan includes 2 videos/month. Growth and Pro plans include unlimited videos per month." },
  { q: "Is annual billing worth it?", a: "Yes! Annual billing saves you 30% compared to monthly. Growth drops from R549/mo to R385/mo, and Pro drops from R999/mo to R699/mo." },
  { q: "Is there a per-video charge?", a: "No. All plans include videos as part of your subscription. There are no hidden per-video charges." },
  { q: "Can I earn free credits?", a: "Yes! Refer a friend and you both get 2 free video credits when they sign up and create their first video." },
  { q: "How does the 7-day trial work?", a: "Growth and Pro plans include a 7-day free trial. You get full access to all features. Cancel before 7 days and you won't be charged." },
  { q: "Why is there a free plan?", a: "We want every SA estate agent to experience the power of AI video. The free plan lets you try AutoReel SA risk-free with 2 videos per month." },
  { q: "Is virtual staging included free?", a: "Virtual staging is available on the Pro plan with unlimited uses. Growth plan users can access it as a paid add-on." },
  { q: "What's the main difference between plans?", a: "Free is for trying out. Growth removes the watermark and adds unlimited videos. Pro adds advanced AI features like virtual staging, avatars, and white-label branding." },
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
              className={`w-12 h-6 rounded-full relative transition-colors ${annual ? "bg-[#21ABB5]" : "bg-gray-300"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${annual ? "left-[26px]" : "left-0.5"}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-[#0F082B]" : "text-[#606060]"}`}>Annual</span>
            {annual && (
              <span className="text-xs font-semibold bg-[#DEF5F7] text-[#21ABB5] px-2 py-1 rounded-full">Save 30%</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 ${
                plan.featured
                  ? "bg-white border-2 border-[#21ABB5] shadow-xl"
                  : "bg-white border border-gray-200"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#21ABB5] text-white text-xs font-semibold px-4 py-1 rounded-full">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-bold text-[#0F082B] mb-1">{plan.name}</h3>
              <p className="text-sm text-[#606060] mb-4">{plan.desc}</p>

              <div className="mb-6">
                <span className="text-4xl font-extrabold text-[#0F082B]">
                  R{annual ? plan.annual : plan.monthly}
                </span>
                <span className="text-[#606060] text-sm">/month</span>
                {annual && plan.monthly > 0 && (
                  <p className="text-xs text-[#606060] mt-1 line-through">R{plan.monthly}/month</p>
                )}
              </div>

              <Link to="/register">
                <Button
                  className={`w-full h-12 rounded-xl font-semibold text-base ${
                    plan.featured
                      ? "bg-[#21ABB5] hover:bg-[#1a9da6] text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-[#0F082B]"
                  }`}
                >
                  {plan.cta}
                </Button>
              </Link>

              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#21ABB5] mt-0.5 flex-shrink-0" />
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
                className="w-full text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-[#21ABB5]/20 transition-all"
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
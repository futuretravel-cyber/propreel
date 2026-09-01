import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const stats = [
  { value: "150,000+", label: "Videos created" },
  { value: "2,500+", label: "Active agents" },
  { value: "9", label: "SA provinces served" },
];

export default function About() {
  return (
    <div className="pt-28 pb-20 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#0F082B] mb-6">About PropReel SA</h1>
          <p className="text-lg text-[#606060] max-w-2xl mx-auto leading-relaxed">
            We're on a mission to democratise property video marketing for every estate agent in South Africa.
          </p>
        </div>

        <div className="bg-gradient-to-br from-[#DEF5F7] to-white rounded-3xl p-10 sm:p-14 mb-16">
          <h2 className="text-2xl font-bold text-[#0F082B] mb-4">Our Story</h2>
          <div className="space-y-4 text-[#606060] leading-relaxed">
            <p>
              PropReel SA was born from a simple observation: South African estate agents know that video sells properties faster, but creating professional video content has always been too expensive and too time-consuming for most.
            </p>
            <p>
              We built an AI-powered platform that transforms static listing photos into cinematic property video tours — in minutes, not days. From Cape Town's waterfront apartments to Johannesburg's suburban estates, our technology understands the unique character of South African property.
            </p>
            <p>
              Today, over 2,500 property professionals across all nine provinces use PropReel SA to win more mandates, attract more qualified buyers, and close deals faster.
            </p>
          </div>
        </div>

        <div className="text-center mb-16">
          <h2 className="text-2xl font-bold text-[#0F082B] mb-3">Our Mission</h2>
          <p className="text-lg text-[#606060] max-w-2xl mx-auto">
            To make professional property video accessible to every estate agent in South Africa — regardless of budget, team size, or technical skill.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-16">
          {stats.map((s) => (
            <div key={s.label} className="text-center bg-white border border-gray-100 rounded-2xl p-8">
              <div className="text-3xl font-extrabold text-[#21ABB5] mb-1">{s.value}</div>
              <div className="text-sm text-[#606060]">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-[#0F082B] rounded-3xl p-10 sm:p-14 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Ready to transform your property marketing?</h2>
          <p className="text-gray-400 mb-6">Join 2,500+ South African agents already using PropReel SA.</p>
          <Link to="/register">
            <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold px-8 h-12 rounded-xl text-base gap-2">
              Get started free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
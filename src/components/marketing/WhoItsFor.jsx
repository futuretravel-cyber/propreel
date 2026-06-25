import React from "react";
import { Home, Camera, Building2 } from "lucide-react";

const cards = [
  {
    icon: Home,
    emoji: "🏡",
    title: "Estate Agents & Principals",
    desc: "Attract qualified buyers, close faster, and win more mandates — from Sandton to Stellenbosch.",
    color: "from-[#21ABB5]/5 to-[#DEF5F7]/40",
  },
  {
    icon: Camera,
    emoji: "📸",
    title: "Property Photographers",
    desc: "Upsell video reels with every shoot. More revenue, zero extra editing time.",
    color: "from-purple-50 to-purple-100/30",
  },
  {
    icon: Building2,
    emoji: "🏢",
    title: "Property Media Companies",
    desc: "Scale your business with AI property videos — no extra overhead.",
    color: "from-amber-50 to-amber-100/30",
  },
];

export default function WhoItsFor() {
  return (
    <section className="py-20 px-4" id="who">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-4">Who It's For</h2>
          <p className="text-lg text-[#606060]">Built for every property professional in South Africa</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <div
              key={c.title}
              className={`bg-gradient-to-br ${c.color} rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition-all duration-300`}
            >
              <span className="text-4xl mb-4 block">{c.emoji}</span>
              <h3 className="text-lg font-bold text-[#0F082B] mb-3">{c.title}</h3>
              <p className="text-sm text-[#606060] leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
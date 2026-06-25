import React, { useState } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

const testimonials = [
  { stars: 5, highlight: "Game-changer for my business", text: "AutoReel SA has completely transformed how I market properties. I went from spending hours on video editing to creating stunning reels in minutes.", name: "Johan Smit", role: "Principal Agent", company: "Smit Properties", city: "Sandton" },
  { stars: 5, highlight: "My clients absolutely love it", text: "The AI virtual staging feature alone has won me three new mandates. Buyers can visualise empty spaces instantly.", name: "Naledi Mokoena", role: "Estate Agent", company: "Pam Golding", city: "Cape Town" },
  { stars: 5, highlight: "Doubled my revenue", text: "I now upsell video reels with every photoshoot. My clients get more enquiries, and I earn more per shoot. It's a no-brainer.", name: "Craig du Plessis", role: "Property Photographer", company: "Du Plessis Media", city: "Durban" },
  { stars: 5, highlight: "So easy to use", text: "Even my less tech-savvy agents picked it up in one session. The Property24 import feature alone saves us hours every week.", name: "Thandi Nkosi", role: "Branch Manager", company: "RE/MAX Prestige", city: "Pretoria" },
  { stars: 5, highlight: "Worth every cent", text: "The quality of the videos is incredible. My listings get significantly more enquiries since I started using AutoReel SA.", name: "Willem van der Berg", role: "Solo Agent", company: "Seeff", city: "Stellenbosch" },
  { stars: 4, highlight: "Fantastic platform", text: "The voiceover feature with SA accent is brilliant. Makes every video feel personal and professional at the same time.", name: "Priya Govender", role: "Marketing Director", company: "Tyson Properties", city: "Umhlanga" },
];

export default function TestimonialsSection() {
  const [page, setPage] = useState(0);
  const perPage = 3;
  const totalPages = Math.ceil(testimonials.length / perPage);
  const visible = testimonials.slice(page * perPage, page * perPage + perPage);

  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-4">Loved by Property Professionals</h2>
          <p className="text-lg text-[#606060]">See what South African agents are saying</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {visible.map((t, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg transition-all">
              <div className="flex gap-0.5 mb-3">
                {[...Array(t.stars)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="font-bold text-[#0F082B] mb-2">&ldquo;{t.highlight}&rdquo;</p>
              <p className="text-sm text-[#606060] leading-relaxed mb-4">{t.text}</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#DEF5F7] flex items-center justify-center">
                  <span className="text-sm font-bold text-[#21ABB5]">{t.name.split(" ").map(n => n[0]).join("")}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0F082B]">{t.name}</p>
                  <p className="text-xs text-[#606060]">{t.role} · {t.city}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={() => setPage((p) => (p - 1 + totalPages) % totalPages)}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${i === page ? "bg-[#21ABB5] w-6" : "bg-gray-300"}`}
              />
            ))}
          </div>
          <button
            onClick={() => setPage((p) => (p + 1) % totalPages)}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
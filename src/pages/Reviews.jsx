import React from "react";
import { Star } from "lucide-react";

const reviews = [
  { stars: 5, quote: "Completely revolutionised how I present listings. Buyers are blown away by the video quality.", name: "Johan Smit", role: "Principal Agent", company: "Smit Properties", city: "Sandton" },
  { stars: 5, quote: "I went from zero video content to producing 10+ reels a week. My social media engagement has tripled.", name: "Naledi Mokoena", role: "Estate Agent", company: "Pam Golding", city: "Cape Town" },
  { stars: 5, quote: "The Property24 import saves me at least an hour per listing. Total game-changer for busy agents.", name: "Craig du Plessis", role: "Property Photographer", company: "Du Plessis Media", city: "Durban" },
  { stars: 5, quote: "AI virtual staging helped me sell an empty apartment in Sandton within 2 weeks. The before/after is incredible.", name: "Thandi Nkosi", role: "Branch Manager", company: "RE/MAX Prestige", city: "Pretoria" },
  { stars: 5, quote: "My clients now expect video with every listing. AutoReel SA makes it effortless to deliver.", name: "Willem van der Berg", role: "Solo Agent", company: "Seeff", city: "Stellenbosch" },
  { stars: 5, quote: "The SA English voiceover feature is brilliant. Feels authentic and professional, not robotic at all.", name: "Priya Govender", role: "Marketing Director", company: "Tyson Properties", city: "Umhlanga" },
  { stars: 5, quote: "We rolled this out across our entire agency of 40 agents. Production costs dropped by 80%.", name: "Francois Rossouw", role: "CEO", company: "Rossouw Property Group", city: "Johannesburg" },
  { stars: 4, quote: "Fantastic value for money. The free plan let me test it properly before committing.", name: "Ayanda Zulu", role: "New Agent", company: "Rawson Properties", city: "Bloemfontein" },
  { stars: 5, quote: "The studio editor gives me the control I need while the AI does the heavy lifting. Best of both worlds.", name: "Liezel Botha", role: "Senior Agent", company: "Engel & Völkers", city: "Camps Bay" },
];

export default function Reviews() {
  return (
    <div className="pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#0F082B] mb-4">
            What South African property professionals are saying
          </h1>
          <div className="inline-flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-full mt-4">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="text-sm font-semibold text-[#0F082B]">4.9 on Trustpilot</span>
          </div>
        </div>

        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {reviews.map((r, i) => (
            <div key={i} className="break-inside-avoid bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg transition-all">
              <div className="flex gap-0.5 mb-3">
                {[...Array(r.stars)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-[#0F082B] leading-relaxed mb-4">&ldquo;{r.quote}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-purple-700">
                    {r.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0F082B]">{r.name}</p>
                  <p className="text-xs text-[#606060]">{r.role} · {r.company}</p>
                  <p className="text-xs text-[#606060]">{r.city}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
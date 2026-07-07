import React, { useState, useEffect } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function TestimonialsSection() {
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(0);
  const perPage = 3;

  useEffect(() => {
    base44.entities.Review.filter({ status: "approved" }, "-created_date", 12)
      .then(setReviews)
      .catch(() => {});
  }, []);

  if (reviews.length === 0) return null;

  const totalPages = Math.ceil(reviews.length / perPage);
  const visible = reviews.slice(page * perPage, page * perPage + perPage);

  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-4">Loved by Property Professionals</h2>
          <p className="text-lg text-[#606060]">See what verified agents are saying</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {visible.map((r) => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg transition-all">
              <div className="flex gap-0.5 mb-3">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} className={`w-4 h-4 ${j < r.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                ))}
              </div>
              <p className="text-sm text-[#606060] leading-relaxed mb-4">&ldquo;{r.comment}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-purple-700">{r.agent_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
                </div>
                <p className="text-sm font-semibold text-[#0F082B]">{r.agent_name}</p>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
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
                  className={`w-2.5 h-2.5 rounded-full transition-all ${i === page ? "bg-purple-700 w-6" : "bg-gray-300"}`}
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
        )}
      </div>
    </section>
  );
}
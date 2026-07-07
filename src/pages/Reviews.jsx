import React, { useState, useEffect, useCallback } from "react";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ReviewForm from "@/components/reviews/ReviewForm";

export default function Reviews() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReviews = useCallback(() => {
    base44.entities.Review.filter({ status: "approved" }, "-created_date", 100)
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const avgRating = reviews.length
    ? (reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#0F082B] mb-4">
            Agent Reviews
          </h1>
          <p className="text-[#606060]">Real reviews from verified paying agents using PropReel.</p>
          {avgRating && (
            <div className="inline-flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-full mt-4">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < Math.round(avgRating) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                ))}
              </div>
              <span className="text-sm font-semibold text-[#0F082B]">{avgRating} average ({reviews.length} review{reviews.length !== 1 ? "s" : ""})</span>
            </div>
          )}
        </div>

        <div className="max-w-lg mx-auto mb-12">
          <ReviewForm user={user} onSubmitted={loadReviews} />
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-700 rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <p className="text-center text-sm text-[#606060]">No reviews yet. Be the first verified agent to share your experience.</p>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="break-inside-avoid bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg transition-all">
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className={`w-4 h-4 ${j < r.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                  ))}
                </div>
                <p className="text-sm text-[#0F082B] leading-relaxed mb-4">&ldquo;{r.comment}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-purple-700">
                      {r.agent_name?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#0F082B]">{r.agent_name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
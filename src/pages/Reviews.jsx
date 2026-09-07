import React, { useState, useEffect } from "react";
import ReviewForm from "@/components/reviews/ReviewForm";
// Remove or comment out base44 imports if present:
// import { base44 } from "@/api/base44Client";

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch reviews from your new backend endpoint or start with an empty array
    async function fetchReviews() {
      try {
        const res = await fetch("/api/reviews");
        if (res.ok) {
          const data = await res.json();
          setReviews(data);
        }
      } catch (err) {
        console.error("Failed to load reviews", err);
      } finally {
        setLoading(false);
      }
    }
    fetchReviews();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-[#0F082B]">Agent Reviews</h1>
      
      {/* Review submission form */}
      <ReviewForm onSubmitted={() => {
        // Refresh reviews after submission
      }} />

      {/* Reviews list with safe optional mapping */}
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">Loading reviews...</p>
        ) : reviews?.length > 0 ? (
          reviews.map((review, index) => (
            <div key={index} className="p-4 bg-white border border-gray-100 rounded-xl">
              <p className="font-semibold text-sm">{review?.agent_name}</p>
              <p className="text-sm text-gray-600 mt-1">{review?.comment}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500">No reviews yet. Be the first to leave one!</p>
        )}
      </div>
    </div>
  );
}

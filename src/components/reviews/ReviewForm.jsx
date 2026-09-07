import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useUser } from "@clerk/clerk-react";
import StarRatingInput from "@/components/reviews/StarRatingInput";
import { moderateReview } from "@/lib/reviewModeration";

export default function ReviewForm({ onSubmitted }) {
  const { toast } = useToast();
  const { user } = useUser();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // You can derive agent info or credits from Clerk user metadata or public metadata if applicable
  const isPayingAgent = true; // Update based on your user metadata logic if needed

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating || !comment.trim()) return;
    setSubmitting(true);
    
    try {
      const { status, flag_reason } = moderateReview(comment);
      
      // Replace this fetch call with your backend endpoint or database handler (e.g., Supabase / your API)
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_name: user?.fullName || user?.primaryEmailAddress?.emailAddress,
          rating,
          comment: comment.trim(),
          status,
          flag_reason,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit review");

      setSubmitted(true);
      setRating(0);
      setComment("");
      if (onSubmitted) onSubmitted();
    } catch (err) {
      toast({ title: "Failed to submit review", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center text-sm text-[#606060]">
        Log in as an agent to leave a review.
      </div>
    );
  }

  if (!isPayingAgent) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center text-sm text-[#606060]">
        Only verified paying agents can leave a review. Upgrade your plan to unlock reviews.
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold text-emerald-800">Thanks for your review!</p>
        <p className="text-xs text-emerald-700 mt-1">It will appear here once approved by our team.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
      <h3 className="font-bold text-[#0F082B]">Leave a review</h3>
      <StarRatingInput value={rating} onChange={setRating} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience with PropReel..."
        rows={4}
        required
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-purple-700 placeholder:text-gray-400"
      />
      <Button type="submit" disabled={submitting || !rating || !comment.trim()} className="bg-purple-700 hover:bg-purple-800 text-white rounded-xl h-11 px-6">
        {submitting ? "Submitting..." : "Submit Review"}
      </Button>
    </form>
  );
}

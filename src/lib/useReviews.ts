import { useEffect, useState } from 'react';

export interface Review {
  id: string;
  fullName: string;
  agency: string | null;
  rating: number;
  comment: string;
  featured: boolean;
  createdAt: string;
}

/** Approved, public reviews (DynamoDB-backed, moderated). */
export function useApprovedReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/leads?action=reviews')
      .then(r => r.json())
      .then(d => setReviews(d.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, []);
  return { reviews, loading };
}

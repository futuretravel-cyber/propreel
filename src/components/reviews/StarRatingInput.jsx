import React, { useState } from "react";
import { Star } from "lucide-react";

export default function StarRatingInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
        >
          <Star
            className={`w-7 h-7 transition-colors ${
              i <= (hover || value) ? "fill-amber-400 text-amber-400" : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
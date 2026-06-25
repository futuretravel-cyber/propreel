import React from "react";

const stats = [
  { value: "150,000+", label: "Videos created" },
  { value: "10 mins", label: "To create a video" },
  { value: "+403%", label: "More listing enquiries" },
];

export default function StatsBar() {
  return (
    <section className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-1">{s.value}</div>
              <div className="text-sm text-[#606060]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
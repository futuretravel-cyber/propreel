import React from "react";
import { Slider } from "@/components/ui/slider";

export default function StrengthSlider({ value, onChange, label = "Transformation Strength" }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
        <span className="text-xs font-bold text-indigo-400 tabular-nums">{value.toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={0.15}
        max={0.75}
        step={0.05}
      />
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>Subtle · 0.15</span>
        <span>Balanced · 0.40</span>
        <span>Heavy · 0.75</span>
      </div>
    </div>
  );
}
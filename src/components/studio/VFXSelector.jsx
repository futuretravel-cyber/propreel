import React, { useState, useRef, useEffect } from "react";
import { Sparkles, ChevronDown, Check, X } from "lucide-react";

const VFX_OPTIONS = [
  { id: "day_to_dusk", name: "Day to Dusk", desc: "Twilight timelapse" },
  { id: "sunshine", name: "Catch the Sunshine", desc: "Morning to daytime" },
  { id: "virtual_staging", name: "Virtual Staging", desc: "Furnished room animation" },
  { id: "lifestyle", name: "Lifestyle", desc: "Warm, lived-in feel" },
  { id: "pencil_sketch", name: "Pencil Sketch", desc: "Artistic illustrated look" },
];

export default function VFXSelector({ photoIndex, vfxEffects, setVfxEffects, totalVfxCount, maxVfx = 3 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectedId = vfxEffects[photoIndex];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (id) => {
    if (selectedId === id) {
      // deselect
      const next = { ...vfxEffects };
      delete next[photoIndex];
      setVfxEffects(next);
    } else if (totalVfxCount < maxVfx || selectedId) {
      // replace or add if under limit
      setVfxEffects({ ...vfxEffects, [photoIndex]: id });
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all shadow-sm ${
          selectedId
            ? "bg-[#21ABB5] text-white"
            : totalVfxCount >= maxVfx
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-black/60 text-white hover:bg-black/80"
        }`}
        title={selectedId ? VFX_OPTIONS.find(v => v.id === selectedId)?.name : "Add VFX"}
      >
        <Sparkles className="w-3 h-3" />
        VFX
        {selectedId ? <Check className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-52 bg-white rounded-xl border border-gray-100 shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-50">
            <p className="text-[10px] font-bold text-[#0F082B]">VFX Effects</p>
            <p className="text-[9px] text-[#606060]">{totalVfxCount}/{maxVfx} used · {selectedId ? "Click to deselect" : "Max 1 per photo"}</p>
          </div>
          {VFX_OPTIONS.map((vfx) => {
            const isSelected = selectedId === vfx.id;
            const isDisabled = !isSelected && totalVfxCount >= maxVfx;
            return (
              <button
                key={vfx.id}
                onClick={() => !isDisabled && select(vfx.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                  isSelected ? "bg-[#DEF5F7]" : isDisabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-[#21ABB5]" : "text-gray-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${isSelected ? "text-[#21ABB5]" : "text-[#0F082B]"}`}>{vfx.name}</p>
                  <p className="text-[10px] text-[#606060]">{vfx.desc}</p>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#21ABB5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
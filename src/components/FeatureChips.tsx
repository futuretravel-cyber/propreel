import { Check } from 'lucide-react';

/** Selectable Key Features shown as chips in Description + Social tabs */
export const KEY_FEATURES = [
  'Swimming Pool', 'Double Garage', 'Solar Panels', 'Generator', 'Fibre Internet',
  'Air Conditioning', 'Underfloor Heating', 'Security Estate', 'Mountain Views',
  'Sea Views', 'Garden', 'Staff Quarters', 'Study', 'Scullery', 'Braai Area',
  'Entertainment Area', 'Pet Friendly', 'Borehole', 'Water Tanks', 'EV Charging',
];

export default function FeatureChips({ selected, onToggle }: { selected: string[]; onToggle: (f: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {KEY_FEATURES.map(f => {
        const on = selected.includes(f);
        return (
          <button
            key={f}
            type="button"
            onClick={() => onToggle(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
              on
                ? 'bg-purple-700 text-white border-purple-500'
                : 'bg-white/5 text-ink-300 border-white/10 hover:border-purple-500/40'
            }`}
            aria-pressed={on}
          >
            {on && <Check className="w-3 h-3 inline mr-1 -mt-0.5" />}
            {f}
          </button>
        );
      })}
    </div>
  );
}

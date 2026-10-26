import { Zap } from 'lucide-react';

interface CostHeaderProps {
  costCredits: number | null;
  costLabel: string;
  chargedWhen: string;
  randValue?: string;
}

export default function CostHeader({ costCredits, costLabel, chargedWhen, randValue }: CostHeaderProps) {
  const credits = costCredits != null ? costCredits : null;
  const creditsLine = credits != null
    ? <span className="text-white font-semibold tabular-nums"><Zap className="w-4 h-4 text-brand-300 inline mr-1" />{credits} credits</span>
    : <span className="text-ink-400 italic">cost varies</span>;

  return (
    <div className="overflow-hidden rounded-lg border border-brand-900/30 bg-brand-950/20 border-l-2 border-l-brand-500">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="shrink-0 mt-0.5">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-brand-400/90">Paid action</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {creditsLine}
            {randValue != null ? (
              <span className="text-xs text-ink-400 tabular-nums">≈ {randValue}</span>
            ) : null}
          </div>
          <p className="text-xs text-ink-400 mt-0.5">{chargedWhen}</p>
        </div>
      </div>
    </div>
  );
}

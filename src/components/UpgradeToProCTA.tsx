import { Link } from 'react-router-dom';
import { Crown, Sparkles, ArrowRight, Zap, Video, Image } from 'lucide-react';
import { useCredit } from '../context/AuthContext';
import { PLANS } from '../lib/constants';

// Read from PLANS — never hardcode a plan's credits (the old "1,300" went
// stale every time the ladder changed).
const PREMIUM_CREDITS = PLANS.find(pl => pl.id === 'PREMIUM')?.monthlyCredits ?? 0;

export default function UpgradeToProCTA() {
  const { user } = useCredit();

  // Don't show if user is already on Premium or Agency plan
  if (user?.subscription?.planId === 'PREMIUM' || user?.subscription?.planId === 'AGENCY') {
    return null;
  }

  return (
    <div className="card-dark p-6 bg-gradient-to-r from-purple-950/50 to-ink-900 border-purple-500/20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center flex-shrink-0">
            <Crown className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Upgrade to Pro
              <Sparkles className="w-4 h-4 text-yellow-400" />
            </h3>
            <p className="text-ink-400 text-sm mt-1">
              Unlock more videos, AI staging, and more.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="flex items-center gap-1 text-xs text-ink-300">
                <Video className="w-3 h-3 text-purple-400" />
                <span>{PREMIUM_CREDITS.toLocaleString('en-ZA')} credits/month</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-ink-300">
                <Image className="w-3 h-3 text-purple-400" />
                <span>Priority rendering</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-ink-300">
                <Zap className="w-3 h-3 text-purple-400" />
                <span>All AI features</span>
              </div>
            </div>
          </div>
        </div>
        <Link to="/pricing" className="btn btn-primary whitespace-nowrap">
          View plans <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

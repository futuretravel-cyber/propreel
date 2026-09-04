import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Film, Home, Coins, Eye, TrendingUp, Clapperboard, Clock, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const TIER_COLORS = {
  essential: "#6366f1",
  social: "#8b5cf6",
  cinematic: "#a855f7",
  premium: "#d946ef",
};

export default function Analytics() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Project.list("-created_date", 100),
      base44.entities.Listing.list("-created_date", 100),
    ]).then(([projs, lists]) => {
      setProjects(projs);
      setListings(lists);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const reelsByTier = ["essential", "social", "cinematic", "premium"].map(t => ({
    name: t,
    value: projects.filter(p => p.video_tier === t).length,
  })).filter(d => d.value > 0);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const count = projects.filter(p => p.created_date?.slice(0, 10) === key).length;
    return { day: d.toLocaleDateString("en-ZA", { weekday: "short" }), reels: count };
  });

  const listingStatusData = ["active", "draft", "sold", "expired"].map(s => ({
    name: s,
    value: listings.filter(l => l.status === s).length,
  })).filter(d => d.value > 0);

  const STATUS_COLORS = ["#10b981", "#64748b", "#3b82f6", "#ef4444"];

  const totalViews = projects.reduce((s, p) => s + (p.views || 0), 0);
  const totalReels = projects.length;
  const activeListings = listings.filter(l => l.status === "active").length;
  const credits = user?.credits ?? 0;
  const creditsUsed = projects.reduce((s, p) => s + (p.credits_used || 0), 0);

  const summary = [
    { icon: Film, label: "Total Reels", value: totalReels.toLocaleString("en-ZA"), accent: "from-indigo-500 to-violet-500" },
    { icon: Eye, label: "Total Views", value: totalViews.toLocaleString("en-ZA"), accent: "from-emerald-500 to-teal-500" },
    { icon: Home, label: "Active Listings", value: activeListings.toLocaleString("en-ZA"), accent: "from-blue-500 to-cyan-500" },
    { icon: Coins, label: "Credits Used", value: creditsUsed.toLocaleString("en-ZA"), accent: "from-amber-500 to-orange-500" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">Performance insights across your reels and listings.</p>
        </div>
        <Link to="/studio" className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-5 rounded-xl h-10 text-sm shadow-lg shadow-indigo-600/25">
          <Clapperboard className="w-4 h-4" /> Create Reel
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.accent} flex items-center justify-center shadow-lg mb-3`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-2xl font-extrabold text-white">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Reels over last 7 days */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-1">Reels Created</h3>
            <p className="text-xs text-slate-400 mb-6">Last 7 days</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={last7}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#e2e8f0" }} />
                <Bar dataKey="reels" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Reels by tier */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-1">Reels by Tier</h3>
            <p className="text-xs text-slate-400 mb-6">Distribution across production tiers</p>
            {reelsByTier.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-500">No reels yet</div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={reelsByTier} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                      {reelsByTier.map((d) => (
                        <Cell key={d.name} fill={TIER_COLORS[d.name]} stroke="#0f172a" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#e2e8f0" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {reelsByTier.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-300 capitalize">
                        <span className="w-3 h-3 rounded-full" style={{ background: TIER_COLORS[d.name] }} />
                        {d.name}
                      </span>
                      <span className="font-semibold text-white">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Listing status */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-1">Listing Status</h3>
            <p className="text-xs text-slate-400 mb-6">Breakdown by status</p>
            {listingStatusData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-500">No listings yet</div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={listingStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                      {listingStatusData.map((d, i) => (
                        <Cell key={d.name} fill={STATUS_COLORS[i]} stroke="#0f172a" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#e2e8f0" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {listingStatusData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-300 capitalize">
                        <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[i] }} />
                        {d.name}
                      </span>
                      <span className="font-semibold text-white">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Credits usage */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-1">Credits Overview</h3>
            <p className="text-xs text-slate-400 mb-6">Used vs. remaining balance</p>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">Used on reels</span>
                  <span className="text-sm font-semibold text-white">{creditsUsed.toLocaleString("en-ZA")}</span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${creditsUsed + credits > 0 ? (creditsUsed / (creditsUsed + credits)) * 100 : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">Remaining</span>
                  <span className="text-sm font-semibold text-white">{credits.toLocaleString("en-ZA")}</span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" style={{ width: `${creditsUsed + credits > 0 ? (credits / (creditsUsed + credits)) * 100 : 100}%` }} />
                </div>
              </div>
              <Link to="/pricing" className="block text-center text-sm font-semibold text-indigo-400 hover:text-indigo-300 pt-2">
                Top up credits →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
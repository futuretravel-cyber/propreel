import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Video, CreditCard, Zap, MoreVertical, Clock, CheckCircle2, FileEdit, FolderOpen, Home, TrendingUp, Coins, Clapperboard, ArrowRight, Film, BarChart3, Eye, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-700/60 text-slate-300", icon: FileEdit },
  processing: { label: "Rendering", color: "bg-amber-500/15 text-amber-400", icon: Clock },
  ready: { label: "Ready", color: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Project.list("-created_date", 20),
      base44.entities.Listing.list("-created_date", 50),
    ]).then(([projs, lists]) => {
      setProjects(projs);
      setListings(lists);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.full_name?.split(" ")[0] || "there";

  const readyCount = projects.filter((p) => p.status === "ready").length;
  const processingCount = projects.filter((p) => p.status === "processing").length;
  const activeListings = listings.filter(l => l.status === "active").length;
  const reelsGenerated = projects.length;
  const totalViews = projects.reduce((s, p) => s + (p.views || 0), 0);
  const credits = user?.credits ?? 0;
  const monthlyRevenue = listings.filter(l => l.status === "active").reduce((s, l) => s + (l.monthly_revenue || 0), 0);

  const metrics = [
    { icon: Home, label: "Active Listings", value: activeListings.toLocaleString("en-ZA"), accent: "from-indigo-500 to-blue-500", link: "/listings" },
    { icon: Film, label: "Reels Generated", value: reelsGenerated.toLocaleString("en-ZA"), accent: "from-violet-500 to-purple-500", link: "/projects" },
    { icon: Eye, label: "Total Views", value: totalViews.toLocaleString("en-ZA"), accent: "from-emerald-500 to-teal-500", link: "/analytics" },
    { icon: Coins, label: "Credits Balance", value: credits.toLocaleString("en-ZA"), accent: "from-amber-500 to-orange-500", link: "/pricing" },
  ];

  const quickActions = [
    { icon: Clapperboard, label: "Create a Reel", desc: "Studio — turn photos into a cinematic video", link: "/studio", accent: "from-indigo-600 to-violet-600" },
    { icon: Plus, label: "New Listing", desc: "Add a property with AI descriptions", link: "/listings/new", accent: "from-slate-700 to-slate-800" },
    { icon: BarChart3, label: "View Analytics", desc: "Track performance & engagement", link: "/analytics", accent: "from-slate-700 to-slate-800" },
    { icon: CreditCard, label: "Top Up Credits", desc: "Choose a plan or buy credit packs", link: "/pricing", accent: "from-slate-700 to-slate-800" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{greeting}, {firstName}</h1>
          <p className="text-sm text-slate-400 mt-1">Your real estate video command center.</p>
        </div>
        <Link to="/studio">
          <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-6 rounded-xl h-11 gap-2 shadow-lg shadow-indigo-600/25">
            <Clapperboard className="w-4 h-4" /> Create Reel
          </Button>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Link key={m.label} to={m.link} className="group bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.accent} flex items-center justify-center shadow-lg`}>
                <m.icon className="w-5 h-5 text-white" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-2xl font-extrabold text-white">{m.value}</p>
            <p className="text-xs text-slate-400 mt-1">{m.label}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((a) => (
            <Link key={a.label} to={a.link} className="group bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.accent} flex items-center justify-center mb-3 shadow-lg`}>
                <a.icon className="w-5 h-5 text-white" />
              </div>
              <p className="font-semibold text-white text-sm">{a.label}</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Credits banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-800 rounded-2xl px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{credits.toLocaleString("en-ZA")} credits remaining</p>
            <p className="text-xs text-slate-400 mt-0.5">Photo tools cost 1 credit · AI videos cost 5–75 credits depending on tier</p>
          </div>
        </div>
        <Link to="/pricing">
          <Button variant="outline" size="sm" className="rounded-xl text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white">Upgrade plan</Button>
        </Link>
      </div>

      {/* Recent reels */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Recent Reels</h2>
            <p className="text-xs text-slate-400 mt-0.5">{readyCount} ready · {processingCount} rendering</p>
          </div>
          <Link to="/projects" className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">View all →</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-violet-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="font-bold text-white mb-2">No reels yet</h3>
            <p className="text-sm text-slate-400 mb-6">Create your first property video to get started</p>
            <Link to="/studio">
              <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl px-8 h-11 gap-2">
                <Clapperboard className="w-4 h-4" /> Open Studio
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map((p) => {
              const status = statusConfig[p.status] || statusConfig.draft;
              const StatusIcon = status.icon;
              return (
                <div key={p.id} className="group bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 hover:shadow-xl hover:shadow-black/30 transition-all">
                  <Link to={p.status === "draft" ? `/projects/new?resume=${p.id}` : `/projects/${p.id}`} className="block">
                    <div className="aspect-video bg-slate-800 flex items-center justify-center relative overflow-hidden">
                      {p.thumbnail_url ? (
                        <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                          <Film className="w-10 h-10 text-slate-600" />
                        </div>
                      )}
                      <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${status.color}`}>
                        <StatusIcon className="w-3 h-3" /> {status.label}
                      </span>
                      {p.status === "ready" && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Video className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-white text-sm truncate">{p.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date(p.created_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                          <MoreVertical className="w-4 h-4 text-slate-500" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                          <DropdownMenuItem asChild>
                            <Link to={p.status === "draft" ? `/projects/new?resume=${p.id}` : `/projects/${p.id}`}>
                              {p.status === "draft" ? "Continue" : "View"}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/projects/${p.id}/quick-edit`}>Quick Edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/projects/${p.id}/studio`}>Studio</Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
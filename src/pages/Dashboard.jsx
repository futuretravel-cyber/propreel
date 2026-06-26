import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Video, CreditCard, Zap, MoreVertical, Clock, CheckCircle2, FileEdit, FolderOpen, Home, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: FileEdit },
  processing: { label: "Processing", color: "bg-amber-100 text-amber-700", icon: Clock },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
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
  const monthlyRevenue = listings.filter(l => l.status === "active").reduce((s, l) => s + (l.monthly_revenue || 0), 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">{greeting}, {firstName}</h1>
          <p className="text-sm text-[#606060] mt-1">Here's what's happening with your property videos.</p>
        </div>
        <Link to="/projects/new">
          <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold px-6 rounded-xl h-11 gap-2">
            <Plus className="w-4 h-4" /> New project
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Home, label: "Active Listings", value: activeListings.toLocaleString("en-ZA"), color: "text-[#21ABB5]", bg: "bg-[#DEF5F7]", link: "/listings" },
          { icon: TrendingUp, label: "Monthly Revenue", value: `R ${monthlyRevenue.toLocaleString("en-ZA")}`, color: "text-emerald-600", bg: "bg-emerald-50", link: "/listings" },
          { icon: Video, label: "Videos Ready", value: readyCount.toLocaleString("en-ZA"), color: "text-purple-600", bg: "bg-purple-50", link: "/projects" },
          { icon: Zap, label: "Processing", value: processingCount.toLocaleString("en-ZA"), color: "text-amber-600", bg: "bg-amber-50", link: "/projects" },
        ].map((s) => (
          <Link key={s.label} to={s.link} className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md hover:border-[#21ABB5]/20 transition-all block">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <span className="text-xs text-[#606060]">{s.label}</span>
            </div>
            <span className="text-2xl font-extrabold text-[#0F082B]">{s.value}</span>
          </Link>
        ))}
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#0F082B]">Recent Projects</h2>
          <Link to="/projects" className="text-sm text-[#21ABB5] hover:underline font-medium">View all →</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#DEF5F7] flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-[#21ABB5]" />
            </div>
            <h3 className="font-bold text-[#0F082B] mb-2">No projects yet</h3>
            <p className="text-sm text-[#606060] mb-6">Create your first property video to get started</p>
            <Link to="/projects/new">
              <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold rounded-xl px-8 h-11 gap-2">
                <Plus className="w-4 h-4" /> New project
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map((p) => {
              const status = statusConfig[p.status] || statusConfig.draft;
              const StatusIcon = status.icon;
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-[#21ABB5]/20 transition-all group">
                  <Link to={p.status === "draft" ? `/projects/new?resume=${p.id}` : `/projects/${p.id}`} className="block">
                    <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative">
                      {p.thumbnail_url ? (
                        <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <Video className="w-10 h-10 text-gray-300" />
                      )}
                      <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${status.color}`}>
                        <StatusIcon className="w-3 h-3" /> {status.label}
                      </span>
                      {p.status === "draft" && (
                        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#21ABB5] text-white text-xs font-semibold px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          Continue →
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-[#0F082B] text-sm truncate">{p.name}</h3>
                        <p className="text-xs text-[#606060] mt-0.5">
                          {new Date(p.created_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
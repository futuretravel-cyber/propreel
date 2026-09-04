import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Home, MapPin, BedDouble, Bath, Car, TrendingUp, CheckCircle2, Clock, Archive, MoreVertical, Clapperboard, ArrowDownUp, Eye, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function formatRand(val) {
  if (!val) return "—";
  return "R " + Number(val).toLocaleString("en-ZA");
}

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-700/60 text-slate-300", icon: Clock },
  active: { label: "Active", color: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
  sold: { label: "Sold", color: "bg-blue-500/15 text-blue-400", icon: CheckCircle2 },
  expired: { label: "Expired", color: "bg-red-500/15 text-red-400", icon: Archive },
};

const sortOptions = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "price-high", label: "Price: High to Low" },
  { key: "price-low", label: "Price: Low to High" },
];

export default function Listings() {
  const { toast } = useToast();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    base44.entities.Listing.list("-created_date", 50)
      .then(setListings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deleteL = async (id) => {
    await base44.entities.Listing.delete(id);
    setListings(prev => prev.filter(l => l.id !== id));
    toast({ title: "Listing deleted" });
  };

  const triggerVideo = (listing) => {
    const project = base44.entities.Project.create({
      name: listing.full_address || `${listing.street_address}, ${listing.suburb}`,
      status: "draft",
      photos: listing.photos || [],
    }).then((p) => {
      window.location.href = `/projects/${p.id}/studio`;
    }).catch(() => {
      toast({ title: "Could not start project", variant: "destructive" });
    });
  };

  const sorted = [...listings].sort((a, b) => {
    switch (sortBy) {
      case "oldest": return new Date(a.created_date) - new Date(b.created_date);
      case "price-high": return (b.price || 0) - (a.price || 0);
      case "price-low": return (a.price || 0) - (b.price || 0);
      default: return new Date(b.created_date) - new Date(a.created_date);
    }
  });
  const filtered = filter === "all" ? sorted : sorted.filter(l => l.status === filter);

  const activeCount = listings.filter(l => l.status === "active").length;
  const totalRevenue = listings.filter(l => l.status === "active").reduce((sum, l) => sum + (l.monthly_revenue || 0), 0);
  const soldCount = listings.filter(l => l.status === "sold").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Property Listings</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your portfolio and trigger video creation.</p>
        </div>
        <Link to="/listings/new">
          <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-6 rounded-xl h-11 gap-2 shadow-lg shadow-indigo-600/25">
            <Plus className="w-4 h-4" /> New Listing
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Home, label: "Active Listings", value: activeCount.toLocaleString("en-ZA"), accent: "from-indigo-500 to-blue-500" },
          { icon: TrendingUp, label: "Monthly Revenue", value: `R ${totalRevenue.toLocaleString("en-ZA")}`, accent: "from-emerald-500 to-teal-500" },
          { icon: CheckCircle2, label: "Properties Sold", value: soldCount.toLocaleString("en-ZA"), accent: "from-violet-500 to-purple-500" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.accent} flex items-center justify-center shadow-lg`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm text-slate-400">{s.label}</span>
            </div>
            <span className="text-3xl font-extrabold text-white">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
          {["all", "active", "draft", "sold", "expired"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter === f ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-slate-200"}`}>
              {f}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl px-4 h-9 text-sm font-medium transition-colors">
            <ArrowDownUp className="w-4 h-4" /> {sortOptions.find(o => o.key === sortBy)?.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
            {sortOptions.map(o => (
              <DropdownMenuItem key={o.key} onClick={() => setSortBy(o.key)} className="cursor-pointer">
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-violet-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <Home className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="font-bold text-white mb-2">No listings yet</h3>
          <p className="text-sm text-slate-400 mb-6">Create your first property listing with AI-generated descriptions</p>
          <Link to="/listings/new">
            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl px-8 h-11 gap-2">
              <Plus className="w-4 h-4" /> New Listing
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(listing => {
            const sc = statusConfig[listing.status] || statusConfig.draft;
            const StatusIcon = sc.icon;
            return (
              <div key={listing.id} className="group bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 hover:shadow-xl hover:shadow-black/30 transition-all">
                <div className="aspect-video bg-slate-800 relative overflow-hidden">
                  {listing.photos?.[0] ? (
                    <img src={listing.photos[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                      <Home className="w-10 h-10 text-slate-600" />
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${sc.color}`}>
                    <StatusIcon className="w-3 h-3" /> {sc.label}
                  </span>
                  {listing.address_verified && (
                    <span className="absolute top-3 right-3 bg-emerald-500/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">✓ Verified</span>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-indigo-400 text-sm">{formatRand(listing.price)}</p>
                      <p className="text-sm font-medium text-white truncate">{listing.property_type} · {listing.suburb}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <MapPin className="w-3 h-3" /> {listing.suburb}{listing.city ? `, ${listing.city}` : ""}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                        <MoreVertical className="w-4 h-4 text-slate-500" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                        <DropdownMenuItem asChild>
                          <Link to={`/listings/new?edit=${listing.id}`}>Edit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteL(listing.id)} className="text-red-400">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                    {listing.bedrooms ? <span className="flex items-center gap-0.5"><BedDouble className="w-3 h-3" /> {listing.bedrooms}</span> : null}
                    {listing.bathrooms ? <span className="flex items-center gap-0.5"><Bath className="w-3 h-3" /> {listing.bathrooms}</span> : null}
                    {listing.garages ? <span className="flex items-center gap-0.5"><Car className="w-3 h-3" /> {listing.garages}</span> : null}
                    {listing.erf_size ? <span>{Number(listing.erf_size).toLocaleString("en-ZA")}m²</span> : null}
                  </div>
                  <button
                    onClick={() => triggerVideo(listing)}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-violet-600 border border-slate-700 hover:border-transparent text-slate-200 hover:text-white font-semibold py-2.5 rounded-xl text-sm transition-all"
                  >
                    <Film className="w-4 h-4" /> Create Reel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Home, MapPin, BedDouble, Bath, Car, DollarSign, TrendingUp, CheckCircle2, Clock, Archive, MoreVertical, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function formatRand(val) {
  if (!val) return "—";
  return "R " + Number(val).toLocaleString("en-ZA");
}

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: Clock },
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  sold: { label: "Sold", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  expired: { label: "Expired", color: "bg-red-100 text-red-600", icon: Archive },
};

export default function Listings() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    base44.entities.Listing.list("-created_date", 50)
      .then(setListings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deleteL = async (id) => {
    await base44.entities.Listing.delete(id);
    setListings(prev => prev.filter(l => l.id !== id));
  };

  const filtered = filter === "all" ? listings : listings.filter(l => l.status === filter);

  const activeCount = listings.filter(l => l.status === "active").length;
  const totalRevenue = listings.filter(l => l.status === "active").reduce((sum, l) => sum + (l.monthly_revenue || 0), 0);
  const soldCount = listings.filter(l => l.status === "sold").length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">My Listings</h1>
          <p className="text-sm text-[#606060] mt-1">Manage your property listings and track performance.</p>
        </div>
        <Link to="/listings/new">
          <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold px-6 rounded-xl h-11 gap-2">
            <Plus className="w-4 h-4" /> New Listing
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#DEF5F7] flex items-center justify-center">
              <Home className="w-5 h-5 text-[#21ABB5]" />
            </div>
            <span className="text-sm text-[#606060]">Active Listings</span>
          </div>
          <span className="text-3xl font-extrabold text-[#0F082B]">{activeCount.toLocaleString("en-ZA")}</span>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm text-[#606060]">Monthly Subscription Revenue</span>
          </div>
          <span className="text-3xl font-extrabold text-[#0F082B]">R {totalRevenue.toLocaleString("en-ZA")}</span>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-[#606060]">Properties Sold</span>
          </div>
          <span className="text-3xl font-extrabold text-[#0F082B]">{soldCount.toLocaleString("en-ZA")}</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {["all", "active", "draft", "sold", "expired"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter === f ? "bg-white text-[#0F082B] shadow-sm" : "text-[#606060] hover:text-[#0F082B]"}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#DEF5F7] flex items-center justify-center mx-auto mb-4">
            <Home className="w-8 h-8 text-[#21ABB5]" />
          </div>
          <h3 className="font-bold text-[#0F082B] mb-2">No listings yet</h3>
          <p className="text-sm text-[#606060] mb-6">Create your first property listing with AI-generated descriptions</p>
          <Link to="/listings/new">
            <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold rounded-xl px-8 h-11 gap-2">
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
              <div key={listing.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-[#21ABB5]/20 transition-all">
                {/* Photo */}
                <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-50 relative">
                  {listing.photos?.[0] ? (
                    <img src={listing.photos[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${sc.color}`}>
                    <StatusIcon className="w-3 h-3" /> {sc.label}
                  </span>
                  {listing.address_verified && (
                    <span className="absolute top-3 right-3 bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">✓ Verified</span>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#21ABB5] text-sm">{formatRand(listing.price)}</p>
                      <p className="text-sm font-medium text-[#0F082B] truncate">{listing.property_type} · {listing.suburb}</p>
                      <div className="flex items-center gap-1 text-xs text-[#606060] mt-0.5">
                        <MapPin className="w-3 h-3" /> {listing.suburb}{listing.city ? `, ${listing.city}` : ""}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-gray-100">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => deleteL(listing.id)} className="text-red-500">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#606060]">
                    {listing.bedrooms ? <span className="flex items-center gap-0.5"><BedDouble className="w-3 h-3" /> {listing.bedrooms}</span> : null}
                    {listing.bathrooms ? <span className="flex items-center gap-0.5"><Bath className="w-3 h-3" /> {listing.bathrooms}</span> : null}
                    {listing.garages ? <span className="flex items-center gap-0.5"><Car className="w-3 h-3" /> {listing.garages}</span> : null}
                    {listing.erf_size ? <span>{Number(listing.erf_size).toLocaleString("en-ZA")}m²</span> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
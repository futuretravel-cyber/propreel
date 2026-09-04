import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderOpen, CreditCard, Settings, HelpCircle, Gem, LogOut, Menu, X, Plus, Bell, Search, ChevronDown, ShieldCheck, Home, Coins, Building2, Clapperboard, Film, BarChart3 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Film, label: "Video Studio", path: "/studio" },
  { icon: Home, label: "Listings", path: "/listings" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: FolderOpen, label: "My Projects", path: "/projects" },
  { icon: CreditCard, label: "Agent Branding", path: "/brand-kits" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: HelpCircle, label: "Help", path: "/contact" },
];

const adminNavItems = [
  { icon: ShieldCheck, label: "Admin", path: "/admin" },
];

export default function StudioLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const initials = user?.full_name ? user.full_name.split(" ").map(n => n[0]).join("").slice(0, 2) : "U";

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="p-5 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
          <span className="text-white font-bold text-xs">PR</span>
        </div>
        <span className="font-bold text-white tracking-tight">PropReel</span>
        <span className="text-[9px] font-semibold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full border border-indigo-500/30">SA</span>
      </div>

      <nav className="flex-1 px-3 mt-2 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path || (item.path !== "/dashboard" && location.pathname.startsWith(item.path + "/"));
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
          {(!user?.agency_id || user.agency_role === "owner") && (
            <Link
              to="/agency"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                location.pathname === "/agency"
                  ? "bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
              }`}
            >
              <Building2 className="w-5 h-5" />
              Agency
            </Link>
          )}
        </div>

        {user?.role === "admin" && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-1">Admin</p>
            {adminNavItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <Link
          to="/pricing"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center justify-between gap-2 mx-3 mt-4 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-indigo-500/40 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
            <Coins className="w-4 h-4" /> {(user?.credits ?? 0).toLocaleString("en-ZA")} credits
          </span>
          <span className="text-[10px] font-semibold text-indigo-400">Top up →</span>
        </Link>

        <div className="mt-4 mx-3 space-y-2">
          <Link
            to="/studio"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25"
          >
            <Clapperboard className="w-4 h-4" /> Create Reel
          </Link>
          <Link
            to="/listings/new"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New Listing
          </Link>
        </div>

        <div className="mt-6 mx-3 p-4 bg-gradient-to-br from-indigo-600/10 to-violet-600/5 rounded-xl border border-slate-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Gem className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-100">Upgrade to Pro</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-3">Unlock unlimited videos, AI staging, and more.</p>
          <Link to="/pricing" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">
            View plans →
          </Link>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <span className="text-sm font-bold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{user?.full_name || "User"}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 bottom-0 w-[240px] border-r border-slate-800 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] shadow-2xl">
            <div className="absolute top-4 right-4 z-10">
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ml-[240px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
          <div className="flex items-center justify-between px-4 lg:px-8 h-16">
            <div className="flex items-center gap-3">
              <button className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-100" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden sm:flex items-center bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 h-9 w-64">
                <Search className="w-4 h-4 text-slate-500 mr-2" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  className="bg-transparent text-sm outline-none flex-1 text-slate-200 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="relative w-9 h-9 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-700/60 flex items-center justify-center transition-colors">
                <Bell className="w-4 h-4 text-slate-400" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 hover:bg-slate-800/60 rounded-xl px-2 py-1.5 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{initials}</span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-slate-900 border-slate-800">
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/pricing" className="cursor-pointer">Billing</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-400 cursor-pointer"
                    onClick={() => base44.auth.logout("/")}
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Floating FAB */}
      <Link
        to="/studio"
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-all hover:scale-105 z-40 lg:hidden"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
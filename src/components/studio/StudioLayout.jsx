import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderOpen, CreditCard, Settings, HelpCircle, Gem, LogOut, Menu, X, Plus, Bell, Search, ChevronDown, ShieldCheck, Home, Coins, Building2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Home, label: "Listings", path: "/listings" },
  { icon: FolderOpen, label: "My Projects", path: "/projects" },
  { icon: CreditCard, label: "Brand Kits", path: "/brand-kits" },
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
    <div className="flex flex-col h-full">
      <div className="p-5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-purple-700 flex items-center justify-center">
          <span className="text-white font-bold text-xs">PR</span>
        </div>
        <span className="font-bold text-[#0F082B]">PropReel</span>
        <span className="text-[9px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">SA</span>
      </div>

      <nav className="flex-1 px-3 mt-2">
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-purple-100 text-purple-700"
                    : "text-[#606060] hover:bg-gray-50 hover:text-[#0F082B]"
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
                  ? "bg-purple-100 text-purple-700"
                  : "text-[#606060] hover:bg-gray-50 hover:text-[#0F082B]"
              }`}
            >
              <Building2 className="w-5 h-5" />
              Agency
            </Link>
          )}
        </div>

        {user?.role === "admin" && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-1">Admin</p>
            {adminNavItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active ? "bg-purple-50 text-purple-600" : "text-[#606060] hover:bg-gray-50 hover:text-[#0F082B]"
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
          className="flex items-center justify-between gap-2 mx-3 mt-4 px-3 py-2.5 rounded-xl bg-purple-50 border border-purple-100 hover:border-purple-200 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-purple-800">
            <Coins className="w-4 h-4" /> {(user?.credits ?? 0).toLocaleString("en-ZA")} credits
          </span>
          <span className="text-[10px] font-semibold text-purple-600">Top up →</span>
        </Link>

        <div className="mt-4 mx-3 space-y-2">
          <Link
            to="/listings/new"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-800 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New Listing
          </Link>
          <Link
            to="/projects/new"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-[#0F082B] font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New Video
          </Link>
        </div>

        <div className="mt-6 mx-3 p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Gem className="w-4 h-4 text-purple-700" />
            <span className="text-xs font-semibold text-[#0F082B]">Upgrade to Pro</span>
          </div>
          <p className="text-[11px] text-[#606060] leading-relaxed mb-3">Unlock unlimited videos, AI staging, and more.</p>
          <Link to="/pricing" className="text-xs font-semibold text-purple-700 hover:underline">
            View plans →
          </Link>
        </div>
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
            <span className="text-sm font-bold text-purple-700">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#0F082B] truncate">{user?.full_name || "User"}</p>
            <p className="text-xs text-[#606060] truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 bottom-0 w-[240px] bg-white border-r border-gray-100 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-white shadow-xl">
            <div className="absolute top-4 right-4">
              <button onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ml-[240px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-100">
          <div className="flex items-center justify-between px-4 lg:px-8 h-16">
            <div className="flex items-center gap-3">
              <button className="lg:hidden p-2 -ml-2" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden sm:flex items-center bg-gray-100 rounded-xl px-3 h-9 w-64">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  className="bg-transparent text-sm outline-none flex-1 text-[#0F082B]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="relative w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                <Bell className="w-4 h-4 text-[#606060]" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-purple-700 rounded-full" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1.5 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-purple-700">{initials}</span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">Billing</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-500 cursor-pointer"
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
        to="/projects/new"
        className="fixed bottom-6 right-6 w-14 h-14 bg-purple-700 hover:bg-purple-800 text-white rounded-2xl shadow-lg shadow-purple-700/30 flex items-center justify-center transition-all hover:scale-105 z-40 lg:hidden"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
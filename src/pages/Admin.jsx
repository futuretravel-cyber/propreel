import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Navigate } from "react-router-dom";
import {
  Users, Video, Mail, TrendingUp, CheckCircle2, Clock, FileEdit,
  MoreVertical, Eye, Trash2, Reply, RefreshCw, BarChart3,
  CreditCard, Activity, Filter, Music
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import MusicLibrary from "@/components/admin/MusicLibrary";
import AIVideoTest from "@/components/admin/AIVideoTest";

const TABS = ["Overview", "Projects", "Users", "Music Library", "Contact Submissions", "AI Video Test"];

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: FileEdit },
  processing: { label: "Processing", color: "bg-amber-100 text-amber-700", icon: Clock },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
};

const contactStatusConfig = {
  new: { label: "New", color: "bg-blue-100 text-blue-700" },
  read: { label: "Read", color: "bg-gray-100 text-gray-600" },
  replied: { label: "Replied", color: "bg-emerald-100 text-emerald-700" },
};

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("Overview");
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") return;
    setLoading(true);
    Promise.all([
      base44.entities.Project.list("-created_date", 100),
      base44.entities.User.list(),
      base44.entities.ContactSubmission.list("-created_date", 100),
    ])
      .then(([p, u, c]) => { setProjects(p); setUsers(u); setContacts(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;

  const deleteProject = async (id) => {
    await base44.entities.Project.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    toast({ title: "Project deleted" });
  };

  const updateContactStatus = async (id, status) => {
    await base44.entities.ContactSubmission.update(id, { status });
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  };

  const readyProjects = projects.filter((p) => p.status === "ready").length;
  const processingProjects = projects.filter((p) => p.status === "processing").length;
  const newContacts = contacts.filter((c) => c.status === "new").length;

  const stats = [
    { label: "Total Users", value: users.length, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Total Projects", value: projects.length, icon: Video, color: "text-[#21ABB5]", bg: "bg-[#DEF5F7]" },
    { label: "Videos Ready", value: readyProjects, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Processing Now", value: processingProjects, icon: Activity, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "New Inquiries", value: newContacts, icon: Mail, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "Avg Credits Used", value: projects.length ? Math.round(projects.reduce((a, p) => a + (p.credits_used || 0), 0) / projects.length) : 0, icon: CreditCard, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">Admin Dashboard</h1>
          <p className="text-sm text-[#606060] mt-1">Platform overview and management</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()} className="rounded-xl gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-8 w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-[#0F082B] shadow-sm" : "text-[#606060] hover:text-[#0F082B]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {tab === "Overview" && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {stats.map((s) => (
                  <div key={s.label} className="bg-white rounded-2xl p-5 border border-gray-100">
                    <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <p className="text-2xl font-extrabold text-[#0F082B]">{s.value}</p>
                    <p className="text-xs text-[#606060] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Status breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-sm font-bold text-[#0F082B] mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[#21ABB5]" /> Project Status Breakdown</h3>
                  <div className="space-y-3">
                    {["draft", "processing", "ready"].map((s) => {
                      const count = projects.filter((p) => p.status === s).length;
                      const pct = projects.length ? Math.round((count / projects.length) * 100) : 0;
                      const cfg = statusConfig[s];
                      return (
                        <div key={s}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${cfg.color}`}>{cfg.label}</span>
                            <span className="text-xs text-[#606060]">{count} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${s === "ready" ? "bg-emerald-500" : s === "processing" ? "bg-amber-400" : "bg-gray-300"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-sm font-bold text-[#0F082B] mb-4 flex items-center gap-2"><Mail className="w-4 h-4 text-rose-500" /> Recent Inquiries</h3>
                  {contacts.slice(0, 4).length === 0 ? (
                    <p className="text-sm text-[#606060]">No inquiries yet</p>
                  ) : (
                    <div className="space-y-3">
                      {contacts.slice(0, 4).map((c) => (
                        <div key={c.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#DEF5F7] flex items-center justify-center text-xs font-bold text-[#21ABB5] flex-shrink-0">
                            {c.name?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#0F082B] truncate">{c.name}</p>
                            <p className="text-xs text-[#606060] truncate">{c.subject}</p>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${contactStatusConfig[c.status]?.color}`}>
                            {contactStatusConfig[c.status]?.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent users */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="text-sm font-bold text-[#0F082B] mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-purple-500" /> Recent Signups</h3>
                {users.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-[#606060]">No users yet</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {users.slice(0, 5).map((u) => (
                      <div key={u.id} className="flex items-center gap-3 py-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600 flex-shrink-0">
                          {u.full_name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#0F082B] truncate">{u.full_name || "—"}</p>
                          <p className="text-xs text-[#606060] truncate">{u.email}</p>
                        </div>
                        <span className="text-xs text-[#606060]">{new Date(u.created_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>{u.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Projects Tab */}
          {tab === "Projects" && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-[#0F082B]">All Projects ({projects.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {projects.length === 0 && <p className="text-sm text-[#606060] p-6">No projects yet</p>}
                {projects.map((p) => {
                  const cfg = statusConfig[p.status] || statusConfig.draft;
                  const CfgIcon = cfg.icon;
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-[#DEF5F7] flex items-center justify-center flex-shrink-0">
                        <Video className="w-5 h-5 text-[#21ABB5]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0F082B] truncate">{p.name}</p>
                        <p className="text-xs text-[#606060]">{new Date(p.created_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} · {p.photos?.length || 0} photos</p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 flex-shrink-0 ${cfg.color}`}>
                        <CfgIcon className="w-3 h-3" /> {cfg.label}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2 text-red-600" onClick={() => deleteProject(p.id)}>
                            <Trash2 className="w-4 h-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Users Tab */}
          {tab === "Users" && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-[#0F082B]">All Users ({users.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {users.length === 0 && <p className="text-sm text-[#606060] p-6">No users yet</p>}
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                      {u.full_name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0F082B]">{u.full_name || "—"}</p>
                      <p className="text-xs text-[#606060]">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-[#0F082B]">{u.credits || 0} credits</p>
                        <p className="text-xs text-[#606060] mt-0.5">Joined {new Date(u.created_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-xs h-8"
                        onClick={async () => {
                          await base44.entities.User.update(u.id, { credits: (u.credits || 0) + 100 });
                          setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, credits: (x.credits || 0) + 100 } : x));
                          toast({ title: `+100 credits added to ${u.full_name || u.email}` });
                        }}
                      >
                        +100 credits
                      </Button>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>{u.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Music Library Tab */}
          {tab === "Music Library" && <MusicLibrary />}

          {/* AI Video Test Tab */}
          {tab === "AI Video Test" && <AIVideoTest />}

          {/* Contact Submissions Tab */}
          {tab === "Contact Submissions" && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-[#0F082B]">Contact Submissions ({contacts.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {contacts.length === 0 && <p className="text-sm text-[#606060] p-6">No submissions yet</p>}
                {contacts.map((c) => (
                  <div key={c.id} className="px-6 py-5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-[#0F082B]">{c.name}</p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${contactStatusConfig[c.status]?.color}`}>
                            {contactStatusConfig[c.status]?.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#606060]">{c.email} {c.company ? `· ${c.company}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => updateContactStatus(c.id, "read")} className="gap-2">
                              <Eye className="w-4 h-4" /> Mark as read
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateContactStatus(c.id, "replied")} className="gap-2">
                              <Reply className="w-4 h-4" /> Mark as replied
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateContactStatus(c.id, "new")} className="gap-2">
                              <RefreshCw className="w-4 h-4" /> Mark as new
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-[#0F082B]">{c.subject}</p>
                    <p className="text-sm text-[#606060] mt-1 line-clamp-2">{c.message}</p>
                    <p className="text-xs text-gray-400 mt-2">{new Date(c.created_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
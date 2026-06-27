import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Video, MoreVertical, Clock, CheckCircle2, FileEdit, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: FileEdit },
  processing: { label: "Processing", color: "bg-amber-100 text-amber-700", icon: Clock },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
};

const filters = ["all", "processing", "ready", "draft"];
const sortOptions = [
  { value: "-created_date", label: "Newest" },
  { value: "created_date", label: "Oldest" },
  { value: "name", label: "Name" },
];

export default function Projects() {
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("-created_date");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    const query = filter === "all" ? {} : { status: filter };
    base44.entities.Project.filter(query, sort, 50)
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter, sort]);

  const filtered = search
    ? projects.filter((p) => p.name?.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const handleDelete = async (id) => {
    try {
      await base44.entities.Project.delete(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Project deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#0F082B]">My Projects</h1>
        <Link to="/projects/new">
          <Button className="bg-purple-700 hover:bg-purple-800 text-white font-semibold px-6 rounded-xl h-11 gap-2">
            <Plus className="w-4 h-4" /> New project
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f ? "bg-purple-50 text-purple-700" : "text-[#606060] hover:bg-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:ml-auto">
          <div className="flex items-center bg-white border border-gray-100 rounded-xl px-3 h-9 flex-1 max-w-xs">
            <Search className="w-4 h-4 text-gray-400 mr-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by address..."
              className="bg-transparent text-sm outline-none flex-1"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-white border border-gray-100 rounded-xl px-3 h-9 text-sm text-[#606060] outline-none"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-700 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-bold text-[#0F082B] mb-2">No projects yet</h3>
          <p className="text-sm text-[#606060] mb-6">Create your first property video to get started.</p>
          <Link to="/projects/new">
            <Button className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-8 h-11 gap-2">
              <Plus className="w-4 h-4" /> New project
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const status = statusConfig[p.status] || statusConfig.draft;
            const StatusIcon = status.icon;
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-purple-200 transition-all">
                <Link to={`/projects/${p.id}`}>
                  <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <Video className="w-10 h-10 text-gray-300" />
                    )}
                    <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${status.color}`}>
                      <StatusIcon className="w-3 h-3" /> {status.label}
                    </span>
                  </div>
                </Link>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#0F082B] text-sm truncate">{p.name}</h3>
                      <p className="text-xs text-[#606060] mt-0.5">
                        {new Date(p.created_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {p.photos?.length > 0 && (
                        <p className="text-xs text-[#606060] mt-0.5">{p.photos.length} photos</p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/projects/${p.id}`}>Edit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/projects/${p.id}/quick-edit`}>Quick Edit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/projects/${p.id}/studio`}>Studio</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-500" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
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
  );
}
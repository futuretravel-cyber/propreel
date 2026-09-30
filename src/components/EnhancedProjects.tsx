import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatRelative } from '../lib/utils';
import { mockProjects } from '../lib/mockData';
import {
  Search, Grid, List as ListIcon, FolderOpen, FolderPlus, Pencil, Trash2,
  MoreHorizontal, Copy, Archive, Download, Plus, Star, Share2,
  AlertCircle, FileText, X, FolderInput
} from 'lucide-react';

// Extended project data (demo data carries folder/tag/favorite metadata)
interface ProjectRow {
  id: string;
  recordId: string;
  title: string;
  address: string;
  suburb: string;
  city: string;
  province: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  garages: number;
  status: 'READY' | 'PROCESSING' | 'DRAFT' | 'FAILED';
  videoTier: string;
  videoUrl: string | null;
  thumbnailUrl: string;
  createdAt: string;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
}

const allProjects: ProjectRow[] = [
  ...(mockProjects as ProjectRow[]),
  { id: 'prj_006', recordId: 'pr_x1', title: 'Penthouse in V&A Waterfront', address: '1 Quay Lane', suburb: 'V&A Waterfront', city: 'Cape Town', province: 'Western Cape', price: 25000000, bedrooms: 3, bathrooms: 3, garages: 2, status: 'READY' as const, videoTier: 'PREMIUM', videoUrl: null, thumbnailUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400', createdAt: '2025-03-05T10:00:00Z', folder: 'Luxury', tags: ['penthouse', 'waterfront'], favorite: true },
  { id: 'prj_007', recordId: 'pr_x2', title: 'Smallholding in Muldersdrift', address: '45 Krugersdorp Rd', suburb: 'Muldersdrift', city: 'Johannesburg', province: 'Gauteng', price: 4200000, bedrooms: 4, bathrooms: 2, garages: 4, status: 'READY' as const, videoTier: 'CINEMATIC', videoUrl: null, thumbnailUrl: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=400', createdAt: '2025-03-01T14:00:00Z', folder: 'Residential', tags: ['smallholding', 'country'], favorite: false },
  { id: 'prj_008', recordId: 'pr_x3', title: 'Office Park in Sandton', address: '100 West Street', suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng', price: 45000000, bedrooms: 0, bathrooms: 8, garages: 20, status: 'PROCESSING' as const, videoTier: 'CINEMATIC', videoUrl: null, thumbnailUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400', createdAt: '2025-03-13T08:00:00Z', folder: 'Commercial', tags: ['office', 'sandton'], favorite: false },
];

// Project templates
const templates = [
  { id: 1, name: 'Family Home', description: 'Standard template for 3-4 bed family homes', icon: '🏡' },
  { id: 2, name: 'Luxury Villa', description: 'Premium template with cinematic tier', icon: '💎' },
  { id: 3, name: 'Apartment/Flat', description: 'Compact template for urban living', icon: '🏢' },
  { id: 4, name: 'Commercial', description: 'Office/retail property template', icon: '🏪' },
  { id: 5, name: 'Vacant Land', description: 'Land/erf listing template', icon: '🌍' },
  { id: 6, name: 'New Development', description: 'Off-plan/development template', icon: '🏗️' },
];

interface Folder {
  id: string;
  name: string;
  icon: string;
  createdAt?: string;
}

const LS_FOLDERS = 'propreel:projectFolders';
const LS_ASSIGNMENTS = 'propreel:projectFolderAssignments';

const BUILTIN_FOLDERS = [
  { id: 'all', name: 'All Projects', icon: '📁' },
  { id: 'favorites', name: 'Favorites', icon: '⭐' },
];

const DEFAULT_FOLDERS: Folder[] = [
  { id: 'luxury', name: 'Luxury', icon: '💎' },
  { id: 'residential', name: 'Residential', icon: '🏡' },
  { id: 'commercial', name: 'Commercial', icon: '🏢' },
  { id: 'archived', name: 'Archived', icon: '📦' },
];

const FOLDER_ICONS = ['📁', '💎', '🏡', '🏢', '📦', '🌍', '🏗️', '⭐', '🏷️', '🔥', '🌊', '⛰️', '🌴', '🌆'];

export default function EnhancedProjects() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showTemplates, setShowTemplates] = useState(false);
  const [folders, setFolders] = useState<Folder[]>(DEFAULT_FOLDERS);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<string[] | null>(null);

  // ── Load folders + assignments (localStorage first, then backend sync) ──
  useEffect(() => {
    try {
      const rawF = localStorage.getItem(LS_FOLDERS);
      if (rawF) {
        const parsed = JSON.parse(rawF);
        if (Array.isArray(parsed) && parsed.length > 0) setFolders(parsed);
      }
      const rawA = localStorage.getItem(LS_ASSIGNMENTS);
      if (rawA) {
        const parsed = JSON.parse(rawA);
        if (parsed && typeof parsed === 'object') setAssignments(parsed);
      }
    } catch { /* corrupt storage — keep defaults */ }
  }, []);

  // Backend sync (server folders win; merge with local-only folders)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/folders?user_id=${encodeURIComponent(user.id)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.folders) && data.folders.length > 0) {
          setFolders(prev => {
            const serverIds = new Set(data.folders.map((f: Folder) => f.id));
            const localOnly = prev.filter(f => !serverIds.has(f.id));
            return [...data.folders, ...localOnly];
          });
        }
      } catch { /* endpoint not deployed yet or offline — localStorage still works */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const persistFolders = useCallback((nextFolders: Folder[]) => {
    setFolders(nextFolders);
    try { localStorage.setItem(LS_FOLDERS, JSON.stringify(nextFolders)); } catch { /* ignore */ }
    if (user?.id) {
      fetch('/api/projects/folders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, folders: nextFolders }),
      }).catch(() => { /* best-effort backend sync */ });
    }
  }, [user?.id]);

  const persistAssignments = useCallback((next: Record<string, string>) => {
    setAssignments(next);
    try { localStorage.setItem(LS_ASSIGNMENTS, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  // ── Folder actions ──
  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (folders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      toast.error('A folder with that name already exists');
      return;
    }
    const folder: Folder = { id: `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name, icon: newFolderIcon, createdAt: new Date().toISOString() };
    persistFolders([...folders, folder]);
    setNewFolderName('');
    setNewFolderIcon('📁');
    setShowNewFolder(false);
    toast.success(`Folder "${name}" created`);
  };

  const renameFolder = () => {
    if (!renamingFolder || !renameValue.trim()) return;
    const target = folders.find(f => f.id === renamingFolder);
    if (!target) return;
    if (folders.some(f => f.id !== renamingFolder && f.name.toLowerCase() === renameValue.trim().toLowerCase())) {
      toast.error('A folder with that name already exists');
      return;
    }
    persistFolders(folders.map(f => f.id === renamingFolder ? { ...f, name: renameValue.trim() } : f));
    setRenamingFolder(null);
    setRenameValue('');
    toast.success('Folder renamed');
  };

  const deleteFolder = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const affected = Object.values(assignments).filter(fid => fid === folderId).length;
    if (!window.confirm(`Delete folder "${folder.name}"?${affected > 0 ? ` ${affected} project(s) inside will move back to All Projects.` : ''}`)) return;
    persistFolders(folders.filter(f => f.id !== folderId));
    const next = { ...assignments };
    Object.keys(next).forEach(pid => { if (next[pid] === folderId) delete next[pid]; });
    persistAssignments(next);
    if (selectedFolder === folderId) setSelectedFolder('all');
    toast.success(`Folder "${folder.name}" deleted`);
  };

  const moveSelected = (folderId: string | null) => {
    if (!moveTarget) return;
    const next = { ...assignments };
    moveTarget.forEach(pid => { if (folderId) next[pid] = folderId; else delete next[pid]; });
    persistAssignments(next);
    const label = folderId ? folders.find(f => f.id === folderId)?.name || 'folder' : 'All Projects';
    toast.success(`${moveTarget.length} project(s) moved to ${label}`);
    setMoveTarget(null);
    setSelected([]);
  };

  // Resolve a project's display folder name (real assignment wins over demo seed)
  const folderNameFor = (p: { id: string; folder?: string }): string | null => {
    const fid = assignments[p.id];
    if (fid) return folders.find(f => f.id === fid)?.name || null;
    if (p.folder) {
      const match = folders.find(f => f.name.toLowerCase() === String(p.folder).toLowerCase());
      return match?.name || null;
    }
    return null;
  };

  // ── Derived data ──
  const folderCounts = (() => {
    const counts: Record<string, number> = {
      all: allProjects.length,
      favorites: allProjects.filter(p => p.favorite).length,
    };
    allProjects.forEach(p => {
      const name = folderNameFor(p);
      if (!name) return;
      const match = folders.find(f => f.name === name);
      if (match) counts[match.id] = (counts[match.id] || 0) + 1;
    });
    return counts;
  })();

  const filtered = allProjects
    .filter(p => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.suburb.toLowerCase().includes(search.toLowerCase())) return false;
      if (favoritesOnly && !p.favorite) return false;
      if (selectedFolder === 'all') return true;
      if (selectedFolder === 'favorites') return !!p.favorite;
      const fid = assignments[p.id];
      if (fid) return fid === selectedFolder;
      const match = folders.find(f => f.name.toLowerCase() === String(p.folder || '').toLowerCase());
      return match ? match.id === selectedFolder : false;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'price') return (a.price - b.price) * dir;
      if (sortBy === 'name') return a.title.localeCompare(b.title) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleFavorite = (id: string) => {
    const p = allProjects.find(x => x.id === id);
    toast.success(p?.favorite ? 'Removed from favorites' : 'Added to favorites');
  };

  const visibleFolders = [...BUILTIN_FOLDERS, ...folders];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-ink-400 mt-1">{filtered.length} projects {selected.length > 0 && `• ${selected.length} selected`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTemplates(!showTemplates)} className="btn btn-secondary text-sm"><FileText className="w-4 h-4" /> Templates</button>
          <button onClick={() => navigate('/studio')} className="btn btn-primary text-sm"><Plus className="w-4 h-4" /> New Project</button>
        </div>
      </div>

      {/* Templates Modal */}
      {showTemplates && (
        <div className="card-dark p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Project Templates</h3>
            <button onClick={() => setShowTemplates(false)} className="text-ink-400 hover:text-white" aria-label="Close templates"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {templates.map(t => (
              <button key={t.id} onClick={() => { toast.success(`Creating project from "${t.name}" template...`); setShowTemplates(false); navigate('/studio'); }} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-center transition">
                <span className="text-2xl">{t.icon}</span>
                <p className="text-xs text-white font-medium mt-2">{t.name}</p>
                <p className="text-[10px] text-ink-500 mt-1">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Folders Sidebar + Main Content */}
      <div className="flex gap-6">
        {/* Folders */}
        <div className="hidden lg:block w-52 flex-shrink-0">
          <div className="card-dark p-3 sticky top-20">
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Folders</h3>
              <button onClick={() => setShowNewFolder(!showNewFolder)} className="text-ink-400 hover:text-purple-400" aria-label="New folder" title="New folder">
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>

            {/* New folder form */}
            {showNewFolder && (
              <div className="px-1 pb-2">
                <input
                  autoFocus
                  className="input text-xs py-1.5 mb-2"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                  aria-label="New folder name"
                />
                <div className="flex flex-wrap gap-1 mb-2">
                  {FOLDER_ICONS.map(icon => (
                    <button key={icon} onClick={() => setNewFolderIcon(icon)} className={`w-7 h-7 rounded text-sm flex items-center justify-center ${newFolderIcon === icon ? 'bg-purple-700/30' : 'hover:bg-white/5'}`} aria-label={`Choose icon ${icon}`}>
                      {icon}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={createFolder} className="btn btn-primary text-xs py-1 flex-1">Create</button>
                  <button onClick={() => setShowNewFolder(false)} className="btn btn-ghost text-xs py-1">Cancel</button>
                </div>
              </div>
            )}

            {/* Folder list */}
            <div className="space-y-1">
              {visibleFolders.map(f => {
                const isBuiltin = BUILTIN_FOLDERS.some(b => b.id === f.id);
                return (
                  <div key={f.id} className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${selectedFolder === f.id ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white hover:bg-white/5'}`}>
                    {renamingFolder === f.id ? (
                      <input
                        autoFocus
                        className="input text-xs py-1 flex-1 mr-1"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameFolder(); if (e.key === 'Escape') setRenamingFolder(null); }}
                        aria-label="Folder name"
                      />
                    ) : (
                      <button onClick={() => setSelectedFolder(f.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        <span className="flex-shrink-0">{(f as Folder).icon}</span>
                        <span className="truncate">{f.name}</span>
                      </button>
                    )}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-ink-500">{folderCounts[f.id] || 0}</span>
                      {!isBuiltin && (
                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button onClick={() => { setRenamingFolder(f.id); setRenameValue(f.name); }} className="p-0.5 text-ink-500 hover:text-purple-400" aria-label={`Rename folder ${f.name}`} title="Rename">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => deleteFolder(f.id)} className="p-0.5 text-ink-500 hover:text-red-400" aria-label={`Delete folder ${f.name}`} title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          {/* Search & View */}
          <div className="card-dark p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input className="input pl-10" placeholder="Search by name, suburb, or city..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search projects" />
              </div>
              <div className="flex gap-1">
                <button onClick={() => setView('grid')} className={`p-2 rounded-lg ${view === 'grid' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400'}`} aria-label="Grid view"><Grid className="w-4 h-4" /></button>
                <button onClick={() => setView('list')} className={`p-2 rounded-lg ${view === 'list' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400'}`} aria-label="List view"><ListIcon className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Favorites filter + sort */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 flex-wrap">
              <button onClick={() => setFavoritesOnly(!favoritesOnly)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition ${favoritesOnly ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-white/5 text-ink-400 hover:text-white'}`}>
                <Star className={`w-3 h-3 ${favoritesOnly ? 'fill-yellow-400' : ''}`} /> Favorites only
              </button>
              <span className="text-xs text-ink-500 ml-auto">Sort by:</span>
              {(['date', 'price', 'name'] as const).map(s => (
                <button key={s} onClick={() => { if (sortBy === s) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(s); setSortDir('desc'); } }} className={`text-xs px-2 py-1 rounded transition ${sortBy === s ? 'text-purple-300 bg-purple-700/20' : 'text-ink-400 hover:text-white'}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)} {sortBy === s && (sortDir === 'asc' ? '↑' : '↓')}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk actions bar */}
          {selected.length > 0 && (
            <div className="card-dark p-3 bg-purple-950/30 border-purple-500/20 animate-fade-in">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-purple-300">{selected.length} project(s) selected</span>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setMoveTarget(selected)} className="btn btn-ghost text-xs py-1"><FolderInput className="w-3 h-3" /> Move to folder</button>
                  <button onClick={() => { toast.success('Projects archived'); setSelected([]); }} className="btn btn-ghost text-xs py-1"><Archive className="w-3 h-3" /> Archive</button>
                  <button onClick={() => { toast.success('Projects exported'); setSelected([]); }} className="btn btn-ghost text-xs py-1"><Download className="w-3 h-3" /> Export</button>
                  <button onClick={() => { if (confirm('Delete selected projects?')) { toast.success('Projects deleted'); setSelected([]); } }} className="btn btn-ghost text-xs py-1 text-red-400"><Trash2 className="w-3 h-3" /> Delete</button>
                  <button onClick={() => setSelected([])} className="btn btn-ghost text-xs py-1">Clear</button>
                </div>
              </div>
              {/* Move-to-folder panel */}
              {moveTarget && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-xs text-ink-400 mb-2">Move {moveTarget.length} project(s) to:</p>
                  <div className="flex flex-wrap gap-2">
                    {folders.map(f => (
                      <button key={f.id} onClick={() => moveSelected(f.id)} className="px-3 py-1.5 rounded-lg bg-ink-800 text-xs text-white hover:bg-ink-700 transition flex items-center gap-1">
                        <span>{f.icon}</span> {f.name}
                      </button>
                    ))}
                    <button onClick={() => moveSelected(null)} className="px-3 py-1.5 rounded-lg bg-ink-800 text-xs text-ink-300 hover:bg-ink-700 transition">
                      All Projects
                    </button>
                    <button onClick={() => setMoveTarget(null)} className="px-3 py-1.5 rounded-lg text-xs text-ink-400 hover:text-white transition">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Projects Grid/List */}
          {view === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(p => (
                <div key={p.id} className={`card-dark overflow-hidden group transition hover:border-purple-500/30 ${p.favorite ? 'ring-1 ring-yellow-500/20' : ''}`}>
                  <div className="aspect-video bg-ink-800 relative overflow-hidden">
                    <img src={p.thumbnailUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute top-2 left-2 flex gap-1">
                      <span className={`badge ${p.status === 'READY' ? 'badge-success' : p.status === 'PROCESSING' ? 'badge-warning' : p.status === 'FAILED' ? 'badge-danger' : 'badge-muted'}`}>
                        {p.status}
                      </span>
                      <span className="badge badge-brand text-[10px]">{p.videoTier}</span>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }} className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70" aria-label={p.favorite ? 'Remove from favorites' : 'Add to favorites'}>
                        <Star className={`w-3 h-3 ${p.favorite ? 'fill-yellow-400 text-yellow-400' : 'text-white'}`} />
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} className="w-4 h-4 rounded border-ink-600 bg-ink-800 text-purple-600" aria-label={`Select ${p.title}`} />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="cursor-pointer" onClick={() => navigate('/studio')}>
                      <h3 className="font-semibold text-white text-sm truncate">{p.title}</h3>
                      <p className="text-ink-400 text-xs mt-1">{p.suburb}, {p.city}</p>
                      {(() => {
                        const name = folderNameFor(p);
                        return name ? (
                          <p className="text-[10px] text-purple-300/80 mt-1 flex items-center gap-1">
                            <FolderOpen className="w-3 h-3" /> {name}
                          </p>
                        ) : null;
                      })()}
                      {p.tags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.tags.map((t: string) => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-400">#{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-purple-400 font-semibold text-sm">{formatZar(p.price)}</p>
                        <p className="text-ink-500 text-xs">{formatRelative(p.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                      <button onClick={(e) => { e.stopPropagation(); toast.success('Project duplicated'); }} className="flex-1 btn btn-ghost text-xs py-1.5" title="Duplicate this project">
                        <Copy className="w-3 h-3" /> Duplicate
                      </button>
                      {p.status === 'READY' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const shareUrl = `https://propreel.co.za/share/${p.id}`;
                            const shareText = `Check out this property video: ${p.title}`;
                            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
                            window.open(whatsappUrl, '_blank');
                          }}
                          className="flex-1 btn btn-ghost text-xs py-1.5 text-green-400 hover:text-green-300"
                          title="Share on WhatsApp"
                        >
                          <Share2 className="w-3 h-3" /> WhatsApp
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-dark overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-3 w-8"><input type="checkbox" onChange={e => setSelected(e.target.checked ? filtered.map(p => p.id) : [])} className="w-4 h-4 rounded" aria-label="Select all projects" /></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Property</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Price</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Folder</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Created</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded" aria-label={`Select ${p.title}`} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={p.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          <div>
                            <p className="text-sm font-medium text-white flex items-center gap-1">{p.title} {p.favorite && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />}</p>
                            <p className="text-xs text-ink-400">{p.suburb}, {p.city}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">{formatZar(p.price)}</td>
                      <td className="px-4 py-3"><span className={`badge ${p.status === 'READY' ? 'badge-success' : p.status === 'PROCESSING' ? 'badge-warning' : p.status === 'FAILED' ? 'badge-danger' : 'badge-muted'}`}>{p.status}</span></td>
                      <td className="px-4 py-3 text-xs text-ink-300">{folderNameFor(p) || '—'}</td>
                      <td className="px-4 py-3 text-sm text-ink-400">{formatRelative(p.createdAt)}</td>
                      <td className="px-4 py-3"><button className="text-ink-400 hover:text-white" aria-label="More actions for this project"><MoreHorizontal className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="card-dark p-12 text-center">
              <AlertCircle className="w-12 h-12 text-ink-500 mx-auto mb-4" />
              <p className="text-ink-400">No projects match your filters</p>
              <button onClick={() => { setSearch(''); setFavoritesOnly(false); setSelectedFolder('all'); }} className="btn btn-secondary mt-4 text-sm">Clear Filters</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatZar, formatRelative } from '../lib/utils';
import { PropReelAPI, Project } from '../lib/api';
import {
  Search, Grid, List as ListIcon, FolderOpen, FolderPlus, Pencil, Trash2,
  Plus, Star, Share2, FileText, X, FolderInput, RefreshCw, Loader2, Mic, Video, Download, Copy,
} from 'lucide-react';
import { RETENTION_NOTICE } from '../lib/constants';
import ErrorBoundary from './ErrorBoundary';
import { VideoLightbox } from './PropertyListings';
import { queueVideoRender } from '../lib/videoPrefill';

interface Folder {
  id: string;
  name: string;
  icon: string;
  createdAt?: string;
}

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

const templates = [
  { id: 1, name: 'Family Home', description: 'Standard template for 3-4 bed family homes', icon: '🏡', defaults: { bedrooms: 4, bathrooms: 2, propertyType: 'House' } },
  { id: 2, name: 'Luxury Villa', description: 'Premium template with cinematic tier', icon: '💎', defaults: { bedrooms: 5, bathrooms: 5, propertyType: 'Villa', videoTier: 'PREMIUM' } },
  { id: 3, name: 'Apartment/Flat', description: 'Compact template for urban living', icon: '🏢', defaults: { bedrooms: 2, bathrooms: 1, propertyType: 'Apartment' } },
  { id: 4, name: 'Commercial', description: 'Office/retail property template', icon: '🏪', defaults: { bedrooms: 0, bathrooms: 2, propertyType: 'Commercial' } },
  { id: 5, name: 'Vacant Land', description: 'Land/erf listing template', icon: '🌍', defaults: { bedrooms: 0, bathrooms: 0, propertyType: 'Vacant Land' } },
  { id: 6, name: 'New Development', description: 'Off-plan/development template', icon: '🏗️', defaults: { bedrooms: 3, bathrooms: 2, propertyType: 'Development' } },
];

export default function EnhancedProjects() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | 'REEL' | 'FLASHHEAD' | 'IMAGE' | 'SOCIAL'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showTemplates, setShowTemplates] = useState(false);
  const [folders, setFolders] = useState<Folder[]>(DEFAULT_FOLDERS);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<string[] | null>(null);
  // Finished reels open in an inline media player; drafts jump to the Video Generator.
  const [player, setPlayer] = useState<Project | null>(null);
  const openProject = (p: Project) => {
    if (p.videoUrl && p.status === 'READY') setPlayer(p);
    else if (p.kind === 'IMAGE' && p.thumbnailUrl) window.open(p.thumbnailUrl, '_blank', 'noopener');
    else if (p.kind === 'SOCIAL' && p.description) {
      navigator.clipboard.writeText(p.description).then(
        () => toast.success('Caption copied to clipboard'),
        () => toast.error('Could not copy the caption'),
      );
    } else navigate('/dashboard/video');
  };

  // ── Real data: load projects + folders from backend ────────────────────
  const reload = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [projects, foldersRes] = await Promise.all([
        PropReelAPI.listProjects(user.id),
        fetch(`/api/projects?action=folders&user_id=${encodeURIComponent(user.id)}`).then(r => (r.ok ? r.json() : { folders: [] })).catch(() => ({ folders: [] })),
      ]);
      // My Projects stores generated media only — property listings (rows
      // with a marketStatus, created in the Listings tab) live there.
      setProjects(projects.filter(p => p.marketStatus === undefined));
      if (Array.isArray(foldersRes.folders) && foldersRes.folders.length > 0) {
        setFolders(foldersRes.folders);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  const persistFolders = useCallback(async (nextFolders: Folder[]) => {
    setFolders(nextFolders);
    if (user?.id) {
      try {
        await fetch('/api/projects?action=folders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, folders: nextFolders }),
        });
      } catch { /* non-fatal */ }
    }
  }, [user?.id]);

  // ── Project actions (real CRUD) ────────────────────────────────────────
  const createFromTemplate = async (tpl: typeof templates[number]) => {
    if (!user?.id) return;
    try {
      await PropReelAPI.createProject({
        userId: user.id,
        title: `New ${tpl.name}`,
        ...tpl.defaults,
      } as any);
      toast.success(`Project created from "${tpl.name}" template`);
      setShowTemplates(false);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create project');
    }
  };

  const deleteProjects = async (ids: string[]) => {
    if (!user?.id || !ids.length) return;
    if (!window.confirm(`Permanently delete ${ids.length} project(s)? This cannot be undone.`)) return;
    try {
      await Promise.all(ids.map(id => PropReelAPI.deleteProject(user.id, id)));
      toast.success(`${ids.length} project(s) deleted`);
      setSelected([]);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  const toggleFavorite = async (p: Project) => {
    if (!user?.id) return;
    try {
      await PropReelAPI.updateProject(user.id, p.id, { favorite: !p.favorite });
      setProjects(prev => prev.map(x => x.id === p.id ? { ...x, favorite: !p.favorite } : x));
    } catch {
      toast.error('Could not update favorite');
    }
  };

  const moveSelected = async (folderId: string | null) => {
    if (!user?.id || !moveTarget?.length) return;
    const folderName = folderId ? folders.find(f => f.id === folderId)?.name : null;
    try {
      await Promise.all(moveTarget.map(id => PropReelAPI.updateProject(user.id, id, { folder: folderName || '' })));
      toast.success(`${moveTarget.length} project(s) moved to ${folderName || 'All Projects'}`);
      setMoveTarget(null);
      setSelected([]);
      reload();
    } catch {
      toast.error('Move failed');
    }
  };

  // ── Folder actions (real, backend-persisted) ───────────────────────────
  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (folders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      toast.error('A folder with that name already exists');
      return;
    }
    persistFolders([...folders, { id: `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name, icon: newFolderIcon, createdAt: new Date().toISOString() }]);
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
    const affected = projects.filter(p => p.folder === folder.name).length;
    if (!window.confirm(`Delete folder "${folder.name}"?${affected > 0 ? ` ${affected} project(s) inside will move back to All Projects.` : ''}`)) return;
    persistFolders(folders.filter(f => f.id !== folderId));
    // Clear the folder assignment on affected projects (real update)
    projects.filter(p => p.folder === folder.name).forEach(p => {
      if (user?.id) PropReelAPI.updateProject(user.id, p.id, { folder: '' }).catch(() => {});
    });
    if (selectedFolder === folderId) setSelectedFolder('all');
    toast.success(`Folder "${folder.name}" deleted`);
  };

  // ── Derived data ───────────────────────────────────────────────────────
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: projects.length,
      favorites: projects.filter(p => p.favorite).length,
    };
    projects.forEach(p => {
      if (!p.folder) return;
      const match = folders.find(f => f.name.toLowerCase() === String(p.folder).toLowerCase());
      if (match) counts[match.id] = (counts[match.id] || 0) + 1;
    });
    return counts;
  }, [projects, folders]);

  const filtered = useMemo(() => projects
    .filter(p => {
      const q = search.toLowerCase();
      if (q && !p.title.toLowerCase().includes(q) && !(p.suburb || '').toLowerCase().includes(q) && !(p.city || '').toLowerCase().includes(q)) return false;
      if (favoritesOnly && !p.favorite) return false;
      if (kindFilter !== 'all' && (p.kind || 'REEL') !== kindFilter) return false;
      if (selectedFolder === 'all') return true;
      if (selectedFolder === 'favorites') return !!p.favorite;
      const match = folders.find(f => f.id === selectedFolder);
      return match ? (p.folder || '').toLowerCase() === match.name.toLowerCase() : false;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'price') return ((a.price || 0) - (b.price || 0)) * dir;
      if (sortBy === 'name') return a.title.localeCompare(b.title) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    }), [projects, search, favoritesOnly, kindFilter, selectedFolder, folders, sortBy, sortDir]);

  const visibleFolders = [...BUILTIN_FOLDERS, ...folders];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-ink-400 mt-1">
            {loading ? 'Loading…' : `${filtered.length} projects ${selected.length > 0 ? `• ${selected.length} selected` : ''}`}
          </p>
          <p className="text-xs text-ink-500 mt-1">{RETENTION_NOTICE}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} className="btn btn-secondary text-sm" title="Reload projects"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setShowTemplates(!showTemplates)} className="btn btn-secondary text-sm"><FileText className="w-4 h-4" /> Templates</button>
          <button onClick={() => navigate('/dashboard/video')} className="btn btn-primary text-sm"><Plus className="w-4 h-4" /> New Project</button>
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
              <button key={t.id} onClick={() => createFromTemplate(t)} className="p-4 rounded-xl bg-ink-800/50 hover:bg-ink-800 text-center transition">
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
                        <span className="flex-shrink-0">{f.icon}</span>
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

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 flex-wrap">
              <button onClick={() => setFavoritesOnly(!favoritesOnly)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition ${favoritesOnly ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-white/5 text-ink-400 hover:text-white'}`}>
                <Star className={`w-3 h-3 ${favoritesOnly ? 'fill-yellow-400' : ''}`} /> Favorites only
              </button>
              <div className="flex items-center gap-1 px-1" role="group" aria-label="Filter by project type">
                {([['all', 'All'], ['REEL', 'Video'], ['FLASHHEAD', 'AI Avatar Video'], ['IMAGE', 'Images'], ['SOCIAL', 'Social']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setKindFilter(k)} className={`px-3 py-1 rounded-full text-xs font-medium transition ${kindFilter === k ? 'bg-purple-700/20 text-purple-300 border border-purple-500/30' : 'bg-white/5 text-ink-400 hover:text-white border border-transparent'}`}>
                    {label}
                  </button>
                ))}
              </div>
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
                  <button onClick={() => deleteProjects(selected)} className="btn btn-ghost text-xs py-1 text-red-400"><Trash2 className="w-3 h-3" /> Delete</button>
                  <button onClick={() => setSelected([])} className="btn btn-ghost text-xs py-1">Clear</button>
                </div>
              </div>
              {moveTarget && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-xs text-ink-400 mb-2">Move {moveTarget.length} project(s) to:</p>
                  <div className="flex flex-wrap gap-2">
                    {folders.map(f => (
                      <button key={f.id} onClick={() => moveSelected(f.id)} className="px-3 py-1.5 rounded-lg bg-ink-800 text-xs text-white hover:bg-ink-700 transition flex items-center gap-1">
                        <span>{f.icon}</span> {f.name}
                      </button>
                    ))}
                    <button onClick={() => moveSelected(null)} className="px-3 py-1.5 rounded-lg bg-ink-800 text-xs text-ink-300 hover:bg-ink-700 transition">All Projects</button>
                    <button onClick={() => setMoveTarget(null)} className="px-3 py-1.5 rounded-lg text-xs text-ink-400 hover:text-white transition">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty / Loading states */}
          {loading && (
            <div className="card-dark p-12 text-center">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
              <p className="text-ink-400 text-sm">Loading your projects…</p>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="card-dark p-12 text-center">
              <FolderOpen className="w-10 h-10 text-ink-500 mx-auto mb-3" />
              <p className="text-white font-medium">No projects yet</p>
              <p className="text-ink-400 text-sm mt-1 mb-4">Photo edits, virtual staging, furniture removal, twilight renders, social posts, video reels and AI Avatar Video clips all land here.</p>
              <button onClick={() => navigate('/dashboard/video')} className="btn btn-primary text-sm"><Plus className="w-4 h-4" /> Create in Video Generator</button>
            </div>
          )}

          {/* Projects Grid/List */}
          {!loading && view === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(p => (
                <div key={p.id} className={`card-dark overflow-hidden group transition hover:border-purple-500/30 ${p.favorite ? 'ring-1 ring-yellow-500/20' : ''}`}>
                  <div className="aspect-video bg-ink-800 relative overflow-hidden">
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">{p.kind === 'FLASHHEAD' ? '🎙️' : p.kind === 'IMAGE' ? '📷' : p.kind === 'SOCIAL' ? '✍️' : '🏡'}</div>
                    )}
                    {p.videoUrl && p.status === 'READY' && (
                      <video src={p.videoUrl} muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true" />
                    )}
                    <div className="absolute top-2 left-2 flex gap-1">
                      <span className={`badge ${p.status === 'READY' ? 'badge-success' : p.status === 'PROCESSING' ? 'badge-warning' : p.status === 'FAILED' ? 'badge-danger' : 'badge-muted'}`}>
                        {p.status}
                      </span>
                      {p.kind === 'FLASHHEAD' ? (
                        <span className="badge badge-brand text-[10px] flex items-center gap-1"><Mic className="w-3 h-3" /> AI Avatar Video</span>
                      ) : p.kind === 'IMAGE' ? (
                        <span className="badge badge-brand text-[10px]">Image Edit</span>
                      ) : p.kind === 'SOCIAL' ? (
                        <span className="badge badge-brand text-[10px]">Social Post</span>
                      ) : (
                        <span className="badge badge-brand text-[10px]">{p.videoTier}</span>
                      )}
                    </div>
                    <div className="absolute top-2 right-2">
                      <button onClick={() => toggleFavorite(p)} className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70" aria-label={p.favorite ? 'Remove from favorites' : 'Add to favorites'}>
                        <Star className={`w-3 h-3 ${p.favorite ? 'fill-yellow-400 text-yellow-400' : 'text-white'}`} />
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={() => setSelected(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} className="w-4 h-4 rounded border-ink-600 bg-ink-800 text-purple-600" aria-label={`Select ${p.title}`} />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="cursor-pointer" onClick={() => openProject(p)}>
                      <h3 className="font-semibold text-white text-sm truncate">{p.title}</h3>
                      <p className="text-ink-400 text-xs mt-1">{[p.suburb, p.city].filter(Boolean).join(', ') || 'Location not set'}</p>
                      {p.folder && (
                        <p className="text-[10px] text-purple-300/80 mt-1 flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" /> {p.folder}
                        </p>
                      )}
                      {p.tags && p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.tags.map(t => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-400">#{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-purple-400 font-semibold text-sm">{p.price ? formatZar(p.price) : 'Price not set'}</p>
                        <p className="text-ink-500 text-xs">{formatRelative(p.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                      {p.videoUrl && p.status === 'READY' && (
                        <button
                          onClick={() => { window.location.href = `/api/projects?action=social_pack&user_id=${encodeURIComponent(user!.id)}&id=${encodeURIComponent(p.id)}`; }}
                          className="flex-1 btn btn-ghost text-xs py-1.5 text-purple-300 hover:text-purple-200"
                          title="Download a branded social pack: video(s) + ready-to-post captions"
                        >
                          <Download className="w-3 h-3" /> Social pack
                        </button>
                      )}
                      {p.videoUrl && p.status === 'READY' && (
                        <button
                          onClick={() => setPlayer(p)}
                          className="flex-1 btn btn-ghost text-xs py-1.5 text-green-400 hover:text-green-300"
                          title="Watch the rendered video"
                        >
                          <Share2 className="w-3 h-3" /> Video
                        </button>
                      )}
                      {(p.kind === 'REEL' || !p.kind || p.kind === 'FLASHHEAD') && (!p.videoUrl || p.status !== 'READY') && (
                        <button
                          onClick={() => { queueVideoRender({ images: p.photos || [], script: p.description || '', title: p.title }); navigate('/dashboard/video'); }}
                          className="flex-1 btn btn-ghost text-xs py-1.5 text-purple-300 hover:text-purple-200"
                          title="Auto-format this project's photos into a video render, using its description as the voiceover"
                        >
                          <Video className="w-3 h-3" /> Render
                        </button>
                      )}
                      {p.kind === 'IMAGE' && p.thumbnailUrl && (
                        <a
                          href={p.thumbnailUrl}
                          download
                          className="flex-1 btn btn-ghost text-xs py-1.5 text-purple-300 hover:text-purple-200"
                          title="Download the edited image"
                        >
                          <Download className="w-3 h-3" /> Download
                        </a>
                      )}
                      {p.kind === 'SOCIAL' && p.description && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(p.description || '').then(() => toast.success('Caption copied to clipboard'), () => toast.error('Could not copy the caption')); }}
                          className="flex-1 btn btn-ghost text-xs py-1.5 text-purple-300 hover:text-purple-200"
                          title="Copy the generated caption"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      )}
                      <button onClick={() => deleteProjects([p.id])} className="flex-1 btn btn-ghost text-xs py-1.5 text-red-400 hover:text-red-300" title="Delete project">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && view === 'list' && filtered.length > 0 && (
            <div className="card-dark overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Property</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Price</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Folder</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={() => openProject(p)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-ink-800 flex items-center justify-center text-lg overflow-hidden">
                            {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : (p.kind === 'FLASHHEAD' ? '🎙️' : p.kind === 'IMAGE' ? '📷' : p.kind === 'SOCIAL' ? '✍️' : '🏡')}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{p.title}</p>
                            <p className="text-xs text-ink-400">{[p.suburb, p.city].filter(Boolean).join(', ')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">{p.price ? formatZar(p.price) : '—'}</td>
                      <td className="px-4 py-3"><span className={`badge ${p.status === 'READY' ? 'badge-success' : p.status === 'PROCESSING' ? 'badge-warning' : p.status === 'FAILED' ? 'badge-danger' : 'badge-muted'}`}>{p.status}</span></td>
                      <td className="px-4 py-3 text-sm text-ink-400">{p.folder || '—'}</td>
                      <td className="px-4 py-3 text-xs text-ink-500">{formatRelative(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {player && <ErrorBoundary label="Video player"><VideoLightbox project={player} onClose={() => setPlayer(null)} /></ErrorBoundary>}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Play, Loader2, Video } from 'lucide-react';
import { TUTORIALS } from '../../scripts/_tut_content';

interface TutorialVideo {
  id: string;
  title: string;
  category: string;
  description: string;
  s3Key: string;
  url: string;
  durationSeconds: number | null;
  createdAt: string;
}

const ALL = 'All services';

/**
 * Dashboard → Tutorials: where agents watch the how-to videos the admin
 * uploads (Admin → Tutorials). Read-only public catalog from
 * /api/music?action=tutorials (the same source the admin tab writes).
 * Grouped by service with a filter, so the "Show me how" jumps land
 * somewhere complete.
 *
 * Each card links straight to the matching service tool on the dashboard,
 * so a user who watches a tutorial and thinks "okay, show me that" never
 * has to hunt for /dashboard/photo-editor or /dashboard/social.
 */
const TOOL_ROUTES: Record<string, string> = {
  'Photo Editor': '/dashboard/photo-editor',
  'Virtual Staging': '/dashboard/photo-editor?tab=staging',
  'Furniture Removal': '/dashboard/photo-editor?tab=removal',
  'Twilight': '/dashboard/photo-editor?tab=twilight',
  'AI Avatar (FlashHead)': '/dashboard/video',
  'Property Description': '/dashboard/description',
  'Social Media': '/dashboard/social',
  'AI Writer': '/dashboard/video',
  'Billing & Credits': '/dashboard/credits',
};

export default function DashboardTutorials() {
  const [videos, setVideos] = useState<TutorialVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(ALL);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/music?action=tutorials');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setVideos(data.tutorials || []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const seen = new Set(videos.map(v => v.category).filter(Boolean));
    return [ALL, ...[...seen].sort()];
  }, [videos]);

  const filtered = useMemo(
    () => (category === ALL ? videos : videos.filter(v => v.category === category)),
    [videos, category],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Tutorials</h2>
          <span className="text-xs text-ink-500">
            {filtered.length} {filtered.length === 1 ? 'video' : 'videos'}
          </span>
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  c === category
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-ink-300 border border-white/10 hover:bg-white/10'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-ink-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading tutorials…
        </p>
      ) : failed ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-400">Could not load the tutorials right now.</p>
          <button onClick={load} className="btn btn-secondary text-xs">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-400">
          No tutorial videos{category !== ALL ? ` for ${category}` : ''} yet — new ones appear here as soon as they're published.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => {
            const toolHref = TOOL_ROUTES[v.category] ?? '/dashboard';
            const toolLabel = {
              '/dashboard/photo-editor': 'Photo Editor',
              '/dashboard/description': 'Property Description',
              '/dashboard/social': 'Social Media',
              '/dashboard/video': 'Video Generator',
              '/dashboard/credits': 'Credits',
            }[toolHref] ?? 'the tool';
            return (
              <div key={v.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <video
                  src={v.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full aspect-video bg-black"
                  aria-label={`Tutorial: ${v.title}`}
                />
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium text-white line-clamp-2">{v.title}</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
                    <Video className="w-3 h-3" /> {v.category}
                    {v.durationSeconds ? ` · ${Math.round(v.durationSeconds / 60)} min` : ''}
                  </p>
                  {v.description && (
                    <p className="text-xs text-ink-400 line-clamp-2">{v.description}</p>
                  )}
                  {toolHref !== '/dashboard' && (
                    <a
                      href={toolHref}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-400 hover:text-purple-300 mt-1"
                    >
                      Open {toolLabel} →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

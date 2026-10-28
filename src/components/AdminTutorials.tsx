import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Upload, Play, Trash2, Loader2, X, FileVideo } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { toApiError, withRateLimitRetry } from '../lib/api';

interface TutorialVideo {
  id: string;
  title: string;
  category: string;
  description: string;
  language: string;
  s3Key: string;
  url: string;
  durationSeconds: number | null;
  createdAt: string;
}

/** The 10 services tutorial videos cover (tutorial recording guide). */
const CATEGORIES = [
  'AI Video Generator', 'Photo Editor', 'Virtual Staging', 'Furniture Removal',
  'Twilight', 'AI Avatar Video', 'Property Description', 'Social Media',
  'AI Writer', 'Billing & Credits',
];

/**
 * Dashboard tool route each tutorial category points to (so the admin can
 * open the live tool next to the video and spot mismatched copy).
 */
const CATEGORY_TOOL_LINK: Record<string, string> = {
  'Photo Editor': '/dashboard/photo-editor',
  'Virtual Staging': '/dashboard/photo-editor?tab=staging',
  'Furniture Removal': '/dashboard/photo-editor?tab=removal',
  'Twilight': '/dashboard/photo-editor?tab=twilight',
  'AI Avatar Video': '/dashboard/video',
  'Property Description': '/dashboard/description',
  'Social Media': '/dashboard/social',
  'AI Writer': '/dashboard/video',
  'Billing & Credits': '/dashboard/credits',
};

const TOOL_LABEL: Record<string, string> = {
  '/dashboard/photo-editor': 'Photo Editor',
  '/dashboard/description': 'Property Description',
  '/dashboard/social': 'Social Media',
  '/dashboard/video': 'Video Generator',
  '/dashboard/credits': 'Credits',
};

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // ≤100MB — matches the server cap

/**
 * Admin → Tutorials: upload the how-to videos the dashboard plays for
 * users. Same 4-stage pipeline as the Music Library (presigned PUT →\n * browser→S3 direct upload → server-side magic-byte verify → metadata\n * register), riding the same shared media route.
 */
export default function AdminTutorials() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [videos, setVideos] = useState<TutorialVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<'idle' | 'presign' | 's3' | 'verify' | 'register'>('idle');
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0],
    description: '',
    file: null as File | null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/music?action=tutorials');
      const data = await res.json();
      setVideos(data.tutorials || []);
    } catch {
      toast.error('Could not load the tutorial library', 'Error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const pick = (file: File | null) => {
    if (!file) { setForm(f => ({ ...f, file: null })); return; }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error('Videos must be 100MB or smaller', 'File too large');
      return;
    }
    setForm(f => ({ ...f, file }));
  };

  const upload = async () => {
    if (!form.title.trim() || !form.file) {
      toast.error('A title and a video file are required', 'Missing info');
      return;
    }
    const picked = form.file;
    setUploading(true);
    try {
      // 1) Presigned PUT — declared size is pinned into the signature, so
      //    S3 itself refuses anything over the declared size.
      setUploadStage('presign');
      const preData = await withRateLimitRetry(async () => {
        const res = await fetch('/api/music?action=tutorial_upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: form.category, contentType: picked.type, size: picked.size, user_id: user?.id }),
        });
        const data = await res.json();
        if (!res.ok) throw toApiError(res, data);
        return data;
      });

      // 2) Browser → S3 direct upload
      setUploadStage('s3');
      const put = await fetch(preData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': picked.type },
        body: picked,
      });
      if (!put.ok) throw new Error('S3 upload failed — check the bucket CORS configuration');

      // 3) Server-side binary sniff: only real MP4/MOV/WebM survives.
      setUploadStage('verify');
      await withRateLimitRetry(async () => {
        const res = await fetch('/api/music?action=tutorial_verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user?.id, key: preData.s3Key }),
        });
        const data = await res.json();
        if (!res.ok) throw toApiError(res, data);
        return data;
      });

      // 4) Register metadata
      setUploadStage('register');
      const reg = await fetch('/api/music?action=tutorial_register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, category: form.category, description: form.description,
          s3Key: preData.s3Key, user_id: user?.id,
        }),
      });
      const regData = await reg.json();
      if (!reg.ok) throw new Error(regData.error || 'Registration failed');

      toast.success('Tutorial uploaded — it now plays where users stalled', 'Tutorials');
      setShowUpload(false);
      setForm({ title: '', category: CATEGORIES[0], description: '', file: null });
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed', 'Error');
    } finally {
      setUploading(false);
      setUploadStage('idle');
    }
  };

  const remove = async (video: TutorialVideo) => {
    if (!(await confirm(`Delete "${video.title}" permanently?`, { title: 'Delete video?', confirmLabel: 'Delete', destructive: true }))) return;
    try {
      const res = await fetch(`/api/music?id=${encodeURIComponent(video.id)}&action=tutorial&user_id=${encodeURIComponent(user?.id || '')}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Tutorial deleted', 'Tutorials');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Delete failed', 'Error');
    }
  };

  const stageLabel: Record<string, string> = {
    presign: 'Signing the upload…', s3: 'Uploading the video…',
    verify: 'Verifying the bytes…', register: 'Publishing…',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Tutorial Videos</h2>
          <span className="text-xs text-ink-500">{videos.length} uploaded</span>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn btn-primary min-h-[40px]">
          <Upload className="w-4 h-4" /> Upload video
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading tutorials…</p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-ink-400">No tutorial videos yet. Upload your first how-to (MP4/MOV/WebM, ≤100MB).</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(v => {
            const toolHref = CATEGORY_TOOL_LINK[v.category] ?? '/dashboard';
            const toolName = TOOL_LABEL[toolHref] ?? 'the tool';
            return (
              <div key={v.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <video
                  src={v.url} controls playsInline preload="metadata"
                  className="w-full aspect-video bg-black"
                  aria-label={`Tutorial: ${v.title}`}
                />
                <div className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{v.title}</p>
                      <p className="text-[11px] text-ink-500">{v.category} · {v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-ZA') : '—'}</p>
                    </div>
                    <button onClick={() => remove(v)} title="Delete" className="p-1.5 rounded hover:bg-red-500/15 text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {v.description && <p className="text-xs text-ink-400 line-clamp-2">{v.description}</p>}
                  <a
                    href={toolHref}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-400 hover:text-purple-300 mt-1"
                  >
                    Open {toolName} →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="card-dark p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><FileVideo className="w-5 h-5 text-purple-400" /> Upload a tutorial video</h3>
              <button onClick={() => setShowUpload(false)} className="p-1 rounded hover:bg-white/10 text-ink-300" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1">Title</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Stage an empty room in 30 seconds"
                  className="input w-full" maxLength={120} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1">Service</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="input w-full">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1">Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="One sentence on the outcome — shows under the title."
                  className="input w-full h-16" maxLength={300} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1">Video file (MP4 / MOV / WebM, ≤100MB)</label>
                <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  onChange={e => pick(e.target.files?.[0] || null)}
                  className="input w-full file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white" />
                {form.file && <p className="text-xs text-ink-400 mt-1">{form.file.name} · {(form.file.size / 1048576).toFixed(1)} MB</p>}
              </div>
            </div>
            <button onClick={upload} disabled={uploading || !form.title.trim() || !form.file}
              className="btn btn-primary w-full min-h-[44px] disabled:opacity-50">
              {uploading ? (<><Loader2 className="w-4 h-4 animate-spin" /> {stageLabel[uploadStage] || 'Working…'}</>) : (<><Play className="w-4 h-4" /> Upload & publish</>)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

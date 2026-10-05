import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Upload, Play, Pause, Trash2, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface MusicTrack {
  id: string;
  name: string;
  genre: string;
  s3Key: string;
  url: string;
  durationSeconds: number | null;
  createdAt: string;
}

const GENRES = ['Classical', 'Corporate', 'Acoustic', 'Electronic', 'Jazz', 'Ambient', 'Cinematic'];

export default function AdminMusicLibrary() {
  const toast = useToast();
  const { user } = useAuth();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<'idle' | 'presign' | 's3' | 'verify' | 'register'>('idle');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ name: '', genre: 'Cinematic', file: null as File | null });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/music');
      const data = await res.json();
      setTracks(data.tracks || []);
    } catch {
      toast.error('Could not load the music library', 'Error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    if (!form.name.trim() || !form.file) {
      toast.error('Track name and an audio file are required', 'Missing info');
      return;
    }
    if (form.file.size > 15 * 1024 * 1024) {
      toast.error('Audio must be 15MB or smaller', 'File too large');
      return;
    }
    setUploading(true);
    try {
      // 1) Presigned PUT URL — size is declared here and pinned into the
      //    signature, so S3 itself refuses anything over 15MB.
      setUploadStage('presign');
      const pre = await fetch('/api/music?action=upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, genre: form.genre, contentType: form.file.type, size: form.file.size, user_id: user?.id }),
      });
      const preData = await pre.json();
      if (!pre.ok) throw new Error(preData.error || 'Presign failed');

      // 2) Browser → S3 direct upload
      setUploadStage('s3');
      const put = await fetch(preData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': form.file.type },
        body: form.file,
      });
      if (!put.ok) throw new Error('S3 upload failed — check the bucket CORS configuration');

      // 3) Server-side binary check: the API sniffs the stored bytes and
      //    rejects anything that isn't really audio (HTML, images, video
      //    renamed to .mp3) — the object is discarded on failure.
      setUploadStage('verify');
      const ver = await fetch('/api/music?action=verify_upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, key: preData.s3Key }),
      });
      const verData = await ver.json();
      if (!ver.ok) throw new Error(verData.error || 'Upload verification failed');

      // 4) Register metadata
      setUploadStage('register');
      const reg = await fetch('/api/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, genre: form.genre, s3Key: preData.s3Key, user_id: user?.id }),
      });
      const regData = await reg.json();
      if (!reg.ok) throw new Error(regData.error || 'Registration failed');

      toast.success('Track uploaded and available in the Studio', 'Music Library');
      setShowUpload(false);
      setForm({ name: '', genre: 'Cinematic', file: null });
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed', 'Error');
    } finally {
      setUploading(false);
      setUploadStage('idle');
    }
  };

  const remove = async (track: MusicTrack) => {
    if (!confirm(`Delete "${track.name}" permanently?`)) return;
    try {
      const res = await fetch(`/api/music?id=${encodeURIComponent(track.id)}&user_id=${encodeURIComponent(user?.id || '')}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Track deleted', 'Music Library');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Delete failed', 'Error');
    }
  };

  const togglePlay = (track: MusicTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.src = track.url;
      audioRef.current.play().catch(() => toast.error('Browser blocked playback — try again', 'Playback'));
      setPlayingId(track.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Music className="w-5 h-5 text-purple-400" /> Music Library
        </h2>
        <button onClick={() => setShowUpload(true)} className="btn btn-primary min-h-[44px]">
          <Upload className="w-4 h-4" /> Upload track
        </button>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-ink-400">Loading library…</div>
      ) : tracks.length === 0 ? (
        <div className="card-dark p-8 text-center text-ink-400">
          No tracks yet. Upload an MP3 — it appears instantly in the Studio's music picker.
        </div>
      ) : (
        <div className="space-y-3">
          {tracks.map(t => (
            <div key={t.id} className="card-dark p-4 flex items-center gap-4">
              <button
                onClick={() => togglePlay(t)}
                aria-label={playingId === t.id ? `Pause ${t.name}` : `Play ${t.name}`}
                className="w-10 h-10 rounded-full bg-purple-700/30 text-purple-300 flex items-center justify-center hover:bg-purple-700/50 transition min-h-[44px] min-w-[44px]"
              >
                {playingId === t.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{t.name}</p>
                <p className="text-xs text-ink-400">{t.genre} · uploaded {new Date(t.createdAt).toLocaleDateString('en-ZA')}</p>
              </div>
              <button
                onClick={() => remove(t)}
                aria-label={`Delete ${t.name}`}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-ink-400 hover:text-red-400 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

      {showUpload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !uploading && setShowUpload(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-md card-dark p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Upload music track</h3>
              <button onClick={() => !uploading && setShowUpload(false)} aria-label="Close" className="min-h-[44px] min-w-[44px] flex items-center justify-center text-ink-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Track name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Elegant Piano" />
              </div>
              <div>
                <label className="label">Genre</label>
                <select className="input" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Audio file (MP3/WAV, max 15 MB)</label>
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-m4a,audio/aac"
                  className="input"
                  onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
                />
              </div>
              <button onClick={upload} disabled={uploading} className="btn btn-primary w-full min-h-[48px]">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadStage === 'presign' && 'Authorising…'}
                    {uploadStage === 's3' && 'Uploading to S3…'}
                    {uploadStage === 'verify' && 'Verifying file…'}
                    {uploadStage === 'register' && 'Registering…'}
                  </>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload track</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

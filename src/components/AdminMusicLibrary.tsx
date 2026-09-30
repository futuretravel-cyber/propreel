import { useState } from 'react';
import { Music, Upload, Play, Pause, Trash2, Edit2, X, Check } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface MusicTrack {
  id: string;
  name: string;
  genre: string;
  duration: string;
  url: string;
  uploadedAt: string;
}

export default function AdminMusicLibrary() {
  const toast = useToast();
  const [tracks, setTracks] = useState<MusicTrack[]>([
    {
      id: '1',
      name: 'Elegant Piano',
      genre: 'Classical',
      duration: '2:45',
      url: '/music/elegant-piano.mp3',
      uploadedAt: '2025-01-15'
    },
    {
      id: '2',
      name: 'Modern Corporate',
      genre: 'Corporate',
      duration: '3:12',
      url: '/music/modern-corporate.mp3',
      uploadedAt: '2025-01-20'
    },
    {
      id: '3',
      name: 'Upbeat Acoustic',
      genre: 'Acoustic',
      duration: '2:58',
      url: '/music/upbeat-acoustic.mp3',
      uploadedAt: '2025-02-01'
    }
  ]);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingTrack, setEditingTrack] = useState<string | null>(null);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [newTrack, setNewTrack] = useState({
    name: '',
    genre: '',
    file: null as File | null
  });

  const genres = [
    'Classical',
    'Corporate',
    'Acoustic',
    'Electronic',
    'Jazz',
    'Ambient',
    'Cinematic',
    'Pop',
    'Rock',
    'Other'
  ];

  const handleUpload = () => {
    if (!newTrack.name || !newTrack.genre || !newTrack.file) {
      toast.error('Please fill in all fields and select a file');
      return;
    }

    if (!newTrack.file.type.startsWith('audio/')) {
      toast.error('Please upload an audio file (MP3, WAV, etc.)');
      return;
    }

    if (newTrack.file.size > 50 * 1024 * 1024) {
      toast.error('File must be less than 50MB');
      return;
    }

    setUploading(true);

    // Simulate upload
    setTimeout(() => {
      const track: MusicTrack = {
        id: Date.now().toString(),
        name: newTrack.name,
        genre: newTrack.genre,
        duration: '3:00', // Would be calculated from actual file
        url: URL.createObjectURL(newTrack.file!),
        uploadedAt: new Date().toISOString().split('T')[0]
      };

      setTracks([track, ...tracks]);
      setNewTrack({ name: '', genre: '', file: null });
      setShowUploadModal(false);
      setUploading(false);
      toast.success('Music track uploaded successfully');
    }, 1500);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this track?')) {
      setTracks(tracks.filter(t => t.id !== id));
      toast.success('Track deleted');
    }
  };

  const handlePlay = (id: string, url: string) => {
    if (playingTrack === id) {
      setPlayingTrack(null);
    } else {
      setPlayingTrack(id);
      // In production, would use HTML5 Audio API
      toast.info(`Playing: ${tracks.find(t => t.id === id)?.name}`);
    }
  };

  const handleEdit = (id: string, field: 'name' | 'genre', value: string) => {
    setTracks(tracks.map(t => 
      t.id === id ? { ...t, [field]: value } : t
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Music className="w-6 h-6 text-purple-400" />
            Music Library
          </h2>
          <p className="text-ink-400 mt-1">Manage background music tracks for video generation</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn btn-primary"
        >
          <Upload className="w-4 h-4" />
          Upload Track
        </button>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-dark p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Upload Music Track</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-ink-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Track Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., Elegant Piano"
                  value={newTrack.name}
                  onChange={(e) => setNewTrack({ ...newTrack, name: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Genre</label>
                <select
                  className="input"
                  value={newTrack.genre}
                  onChange={(e) => setNewTrack({ ...newTrack, genre: e.target.value })}
                >
                  <option value="">Select genre...</option>
                  {genres.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Audio File</label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setNewTrack({ ...newTrack, file: e.target.files?.[0] || null })}
                  className="input"
                />
                <p className="text-xs text-ink-500 mt-1">
                  MP3, WAV, OGG (max 50MB)
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="btn btn-primary flex-1"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tracks List */}
      <div className="card-dark overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Track</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Genre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Uploaded</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-ink-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map(track => (
                <tr key={track.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    {editingTrack === track.id ? (
                      <input
                        type="text"
                        className="input py-1"
                        defaultValue={track.name}
                        onBlur={(e) => {
                          handleEdit(track.id, 'name', e.target.value);
                          setEditingTrack(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handlePlay(track.id, track.url)}
                          className="w-8 h-8 rounded-lg bg-purple-700/20 hover:bg-purple-700/30 flex items-center justify-center transition"
                        >
                          {playingTrack === track.id ? (
                            <Pause className="w-4 h-4 text-purple-400" />
                          ) : (
                            <Play className="w-4 h-4 text-purple-400" />
                          )}
                        </button>
                        <span className="text-sm text-white">{track.name}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingTrack === track.id ? (
                      <select
                        className="input py-1"
                        defaultValue={track.genre}
                        onBlur={(e) => {
                          handleEdit(track.id, 'genre', e.target.value);
                          setEditingTrack(null);
                        }}
                      >
                        {genres.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge badge-muted">{track.genre}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-300">{track.duration}</td>
                  <td className="px-4 py-3 text-sm text-ink-400">{track.uploadedAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {editingTrack === track.id ? (
                        <button
                          onClick={() => setEditingTrack(null)}
                          className="text-green-400 hover:text-green-300"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingTrack(track.id)}
                          className="text-ink-400 hover:text-white"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(track.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tracks.length === 0 && (
          <div className="p-12 text-center">
            <Music className="w-12 h-12 text-ink-500 mx-auto mb-4" />
            <p className="text-ink-400">No music tracks uploaded yet</p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="btn btn-primary mt-4"
            >
              <Upload className="w-4 h-4" />
              Upload First Track
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-dark p-4">
          <p className="text-sm text-ink-400">Total Tracks</p>
          <p className="text-2xl font-bold text-white mt-1">{tracks.length}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-sm text-ink-400">Genres</p>
          <p className="text-2xl font-bold text-white mt-1">
            {new Set(tracks.map(t => t.genre)).size}
          </p>
        </div>
        <div className="card-dark p-4">
          <p className="text-sm text-ink-400">Total Duration</p>
          <p className="text-2xl font-bold text-white mt-1">
            {tracks.reduce((acc, t) => {
              const [mins, secs] = t.duration.split(':').map(Number);
              return acc + mins * 60 + secs;
            }, 0) > 3600 
              ? `${Math.floor(tracks.reduce((acc, t) => {
                  const [mins, secs] = t.duration.split(':').map(Number);
                  return acc + mins * 60 + secs;
                }, 0) / 3600)}h`
              : `${Math.floor(tracks.reduce((acc, t) => {
                  const [mins, secs] = t.duration.split(':').map(Number);
                  return acc + mins * 60 + secs;
                }, 0) / 60)}m`
            }
          </p>
        </div>
      </div>
    </div>
  );
}

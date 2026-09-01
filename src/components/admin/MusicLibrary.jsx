import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Play, Pause, Trash2, Music, Plus } from "lucide-react";

export default function MusicLibrary() {
  const { toast } = useToast();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [newName, setNewName] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    base44.entities.MusicTrack.list("-created_date", 100)
      .then(setTracks)
      .finally(() => setLoading(false));
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    if (!newName) setNewName(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!pendingFile || !newName.trim()) return;
    setUploading(true);
    try {
      const file_url = await uploadToS3(pendingFile, "music");
      const track = await base44.entities.MusicTrack.create({
        name: newName.trim(),
        genre: newGenre.trim() || "General",
        file_url,
        is_active: true,
      });
      setTracks((prev) => [track, ...prev]);
      setNewName("");
      setNewGenre("");
      setPendingFile(null);
      toast({ title: "Track uploaded successfully" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploading(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.MusicTrack.delete(id);
    setTracks((prev) => prev.filter((t) => t.id !== id));
    toast({ title: "Track deleted" });
  };

  const handlePlay = (track) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = track.file_url;
        audioRef.current.play();
      }
      setPlayingId(track.id);
    }
  };

  return (
    <div className="space-y-6">
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />

      {/* Upload form */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-bold text-[#0F082B] mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#21ABB5]" /> Add Music Track
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <Input
            placeholder="Track name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-xl h-10"
          />
          <Input
            placeholder="Genre / mood (e.g. Cinematic)"
            value={newGenre}
            onChange={(e) => setNewGenre(e.target.value)}
            className="rounded-xl h-10"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 border-2 border-dashed border-[#21ABB5]/30 rounded-xl h-10 text-sm text-[#606060] hover:bg-[#DEF5F7]/20 transition-colors"
          >
            <Upload className="w-4 h-4 text-[#21ABB5]" />
            {pendingFile ? pendingFile.name : "Select audio file"}
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />
        </div>
        <Button
          onClick={handleUpload}
          disabled={!pendingFile || !newName.trim() || uploading}
          className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl gap-2"
        >
          {uploading ? "Uploading..." : <><Upload className="w-4 h-4" /> Upload Track</>}
        </Button>
      </div>

      {/* Track list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-bold text-[#0F082B]">Music Library ({tracks.length} tracks)</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-7 h-7 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-12">
            <Music className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-[#606060]">No tracks uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {tracks.map((track) => (
              <div key={track.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                <button
                  onClick={() => handlePlay(track)}
                  className="w-9 h-9 rounded-full bg-[#DEF5F7] flex items-center justify-center flex-shrink-0 hover:bg-[#21ABB5] group transition-colors"
                >
                  {playingId === track.id
                    ? <Pause className="w-4 h-4 text-[#21ABB5] group-hover:text-white" />
                    : <Play className="w-3.5 h-3.5 text-[#21ABB5] group-hover:text-white fill-current ml-0.5" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0F082B] truncate">{track.name}</p>
                  <p className="text-xs text-[#606060]">{track.genre}{track.duration ? ` · ${track.duration}` : ""}</p>
                </div>
                <button
                  onClick={() => handleDelete(track.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
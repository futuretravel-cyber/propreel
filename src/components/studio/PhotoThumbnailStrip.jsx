import React from "react";
import { Upload, Loader2, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared photo thumbnail strip with select + delete.
 * getApplied(url) returns the applied-edit URL for a photo (if any).
 */
export default function PhotoThumbnailStrip({
  photos,
  selectedIdx,
  onSelect,
  onDelete,
  getApplied,
  uploading,
  onUpload,
  fileInputRef,
  label = "Select Photo",
}) {
  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {label} ({photos.length ? selectedIdx + 1 : 0} of {photos.length})
        </p>
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="rounded-xl gap-1.5 text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((url, i) => {
          const applied = getApplied ? getApplied(url) : null;
          return (
            <div key={url + "_" + i} className="relative flex-shrink-0">
              <button
                onClick={() => onSelect(i)}
                className={`block w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${selectedIdx === i ? "border-indigo-500 shadow-lg shadow-indigo-500/20" : "border-slate-700 opacity-50 hover:opacity-80"}`}
              >
                <img src={applied || url} alt="" className="w-full h-full object-cover" />
              </button>
              {applied && (
                <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center pointer-events-none">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(i); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors z-10"
                title="Delete photo"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        {photos.length === 0 && <p className="text-sm text-slate-500">Upload photos to get started.</p>}
      </div>
    </div>
  );
}
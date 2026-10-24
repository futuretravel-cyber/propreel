import { useState } from 'react';
import { ROOM_TYPES } from '../lib/constants';
import { IMAGE_PRESETS } from '../lib/imagePrompts';
import { ImageWorkbench } from './ui';
import { Sofa, Trash2, Zap, Camera, Moon as MoonIcon } from 'lucide-react';
export function PhotoEditorTab() {
  const photoPresets = IMAGE_PRESETS.filter(p => p.category === 'photo_editor');
  // Pre-select the first preset so the upload zone is visible immediately —
  // previously the dashed "pick a preset" placeholder looked like an upload
  // button and did nothing when clicked.
  const [selectedPreset, setSelectedPreset] = useState<string | null>(photoPresets[0]?.id ?? null);
  const [strength, setStrength] = useState(photoPresets[0]?.strength.default ?? 0.3);
  const [guidance, setGuidance] = useState(photoPresets[0]?.guidanceScale.default ?? 4.5);
  const [customPrompt, setCustomPrompt] = useState('');

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Camera className="w-5 h-5 text-purple-400" /> AI Photo Editor</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Each image render costs 2 credits
        </p>
      </div>
      {/* Upload first — the drop zone sits at the top of the workflow */}
      <ImageWorkbench
        presetId={selectedPreset || photoPresets[0]?.id || ''}
        draftSlot="photo"
        strength={strength}
        guidanceScale={guidance}
        customPrompt={customPrompt.trim() ? customPrompt : undefined}
        ctaLabel={`Enhance (2 credits)`}
        emptyHint="JPEG, PNG, WEBP up to 25MB"
      />
      <div>
        <label className="label">Enhancement Preset</label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photoPresets.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedPreset(p.id); setStrength(p.strength.default); setGuidance(p.guidanceScale.default); }}
              className={`p-4 rounded-xl text-center transition ${selectedPreset === p.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
            >
              <span className="text-2xl">{p.emoji}</span>
              <p className="text-xs mt-2 font-medium">{p.label}</p>
            </button>
          ))}
        </div>
      </div>
      {selectedPreset && (
        <>
          <div>
            <label className="label">Custom prompt (optional — overrides the preset)</label>
            <textarea
              className="input min-h-[80px]"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Describe a custom enhancement…"
            />
          </div>
        </>
      )}
      {!selectedPreset && (
        <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center">
          <Camera className="w-8 h-8 text-ink-400 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">Pick an enhancement preset above to begin</p>
        </div>
      )}
    </div>
  );
}

export function StagingTab() {
  const [room, setRoom] = useState('living_room');
  const [style, setStyle] = useState('luxury_modern');
  const stagingPresets = IMAGE_PRESETS.filter(p => p.category === 'staging');
  const selectedPreset = stagingPresets.find(p => p.id === style);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Sofa className="w-5 h-5 text-purple-400" /> Virtual Staging</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          ⚡2 Virtual Staging — 2 credits per render
        </p>
      </div>
      {/* Upload first — the drop zone sits at the top of the workflow */}
      <ImageWorkbench
        presetId={style}
        draftSlot="staging"
        strength={selectedPreset?.strength.default}
        guidanceScale={selectedPreset?.guidanceScale.default}
        ctaLabel="Stage Room (2 credits)"
        emptyHint="Upload an empty room photo — JPEG/PNG/WEBP up to 25MB"
      />
      <div>
        <label className="label">Room Type</label>
        <div className="flex flex-wrap gap-2">
          {ROOM_TYPES.map(r => (
            <button key={r.id} onClick={() => setRoom(r.id)} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${room === r.id ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Furniture Style</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stagingPresets.map(s => (
            <button key={s.id} onClick={() => setStyle(s.id)} className={`p-4 rounded-xl text-center transition ${style === s.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              <span className="text-2xl">{s.emoji}</span>
              <p className="text-xs mt-2 font-medium">{s.label}</p>
            </button>
          ))}
        </div>
      </div>
      {selectedPreset && (
        <div className="p-3 bg-ink-800/50 rounded-lg">
          <p className="text-xs text-ink-400">
            <strong className="text-ink-300">{selectedPreset.label}:</strong> Strength {selectedPreset.strength.min.toFixed(2)}–{selectedPreset.strength.max.toFixed(2)}, Guidance {selectedPreset.guidanceScale.min.toFixed(1)}–{selectedPreset.guidanceScale.max.toFixed(1)}
          </p>
        </div>
      )}
    </div>
  );
}

export function RemovalTab() {
  const [mode, setMode] = useState('remove_all_furniture');
  const removalPresets = IMAGE_PRESETS.filter(p => p.category === 'removal');
  const selectedPreset = removalPresets.find(p => p.id === mode);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Trash2 className="w-5 h-5 text-purple-400" /> Furniture Removal</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Furniture Removal costs 2 credits per render
        </p>
      </div>
      {/* Upload first — the drop zone sits at the top of the workflow */}
      <ImageWorkbench
        presetId={mode}
        draftSlot="removal"
        strength={selectedPreset?.strength.default}
        guidanceScale={selectedPreset?.guidanceScale.default}
        ctaLabel="Remove (2 credits)"
        emptyHint="Upload a photo with furniture or clutter to remove"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {removalPresets.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} className={`p-6 rounded-xl text-center transition ${mode === m.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
            <span className="text-3xl">{m.emoji}</span>
            <p className="font-medium mt-3 text-sm">{m.label}</p>
          </button>
        ))}
      </div>
      {selectedPreset && (
        <div className="p-3 bg-ink-800/50 rounded-lg">
          <p className="text-xs text-ink-400">
            <strong className="text-ink-300">{selectedPreset.label}:</strong> Strength {selectedPreset.strength.min.toFixed(2)}–{selectedPreset.strength.max.toFixed(2)}, Guidance {selectedPreset.guidanceScale.min.toFixed(1)}–{selectedPreset.guidanceScale.max.toFixed(1)}
          </p>
        </div>
      )}
    </div>
  );
}

export function TwilightTab() {
  const [style, setStyle] = useState('blue_hour');
  const twilightPresets = IMAGE_PRESETS.filter(p => p.category === 'twilight');
  const selectedPreset = twilightPresets.find(p => p.id === style);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><MoonIcon className="w-5 h-5 text-purple-400" /> Twilight Photography</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Each image render costs 2 credits
        </p>
      </div>
      {/* Upload first — the drop zone sits at the top of the workflow */}
      <ImageWorkbench
        presetId={style}
        draftSlot="twilight"
        strength={selectedPreset?.strength.default}
        guidanceScale={selectedPreset?.guidanceScale.default}
        ctaLabel="Convert to Twilight (2 credits)"
        emptyHint="Upload a daytime exterior photo — best results on clear shots of the full property"
      />
      <div>
        <label className="label">Twilight Style</label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {twilightPresets.map(s => (
            <button key={s.id} onClick={() => setStyle(s.id)} className={`p-4 rounded-xl text-center transition ${style === s.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              <span className="text-2xl">{s.emoji}</span>
              <p className="text-xs mt-2 font-medium">{s.label}</p>
            </button>
          ))}
        </div>
      </div>
      {selectedPreset && (
        <div className="p-3 bg-ink-800/50 rounded-lg">
          <p className="text-xs text-ink-400">
            <strong className="text-ink-300">{selectedPreset.label}:</strong> Strength {selectedPreset.strength.min.toFixed(2)}–{selectedPreset.strength.max.toFixed(2)}, Guidance {selectedPreset.guidanceScale.min.toFixed(1)}–{selectedPreset.guidanceScale.max.toFixed(1)}
          </p>
        </div>
      )}
    </div>
  );
}

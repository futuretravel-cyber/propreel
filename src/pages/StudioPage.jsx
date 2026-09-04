import React, { useState } from 'react';

export default function StudioPage() {
  const [recordId, setRecordId] = useState(`prop_${Date.now()}`);
  const [tier, setTier] = useState('social');
  const [orientation, setOrientation] = useState('landscape');
  const [imagesInput, setImagesInput] = useState('');
  const [voiceoverText, setVoiceoverText] = useState('Exclusive luxury property featuring modern architecture and premium finishes.');
  const [voiceId, setVoiceId] = useState('Joanna');
  const [includeBranding, setIncludeBranding] = useState(true);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleRender = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage('🚀 Dispatching render job to Propreel engine...');

    const imagesArray = imagesInput
      .split(/[\n,]+/)
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (imagesArray.length === 0) {
      setStatusMessage('❌ Please provide at least one valid image URL.');
      setLoading(false);
      return;
    }

    const payload = {
      record_id: recordId,
      tier: tier,
      orientation: orientation,
      images: imagesArray,
      voiceover_text: voiceoverText,
      voice_id: voiceId,
      include_agent_branding: includeBranding
    };

    try {
      const response = await fetch('https://vpyz75mmlg.execute-api.af-south-1.amazonaws.com/v1/api/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage(`✅ Success! ${data.message || 'Render job queued successfully.'}`);
      } else {
        setStatusMessage(`⚠️ Error: ${data.message || 'Failed to queue render job.'}`);
      }
    } catch (err) {
      setStatusMessage(`❌ Network Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-8">
        <div className="mb-8 border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-white">Propreel Video Studio</h1>
          <p className="text-slate-400 mt-1">Transform listing photos into cinematic real estate reels instantly.</p>
        </div>

        <form onSubmit={handleRender} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Property Record ID / Reference</label>
            <input
              type="text"
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Production Tier</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['essential', 'social', 'cinematic', 'premium'].map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTier(t)}
                  className={`py-3 px-4 rounded-xl border text-sm font-semibold capitalize transition-all ${
                    tier === t
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Video Format / Orientation</label>
            <div className="flex gap-4">
              {['landscape', 'portrait'].map((o) => (
                <button
                  type="button"
                  key={o}
                  onClick={() => setOrientation(o)}
                  className={`flex-1 py-3 px-4 rounded-xl border text-sm font-semibold capitalize transition-all ${
                    orientation === o
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {o} {o === 'portrait' ? '(Reels / TikTok)' : '(YouTube / Facebook)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Property Image URLs (comma or newline separated)</label>
            <textarea
              rows="4"
              value={imagesInput}
              onChange={(e) => setImagesInput(e.target.value)}
              placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">AI Voiceover Script</label>
            <textarea
              rows="3"
              value={voiceoverText}
              onChange={(e) => setVoiceoverText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="branding"
              checked={includeBranding}
              onChange={(e) => setIncludeBranding(e.target.checked)}
              className="w-5 h-5 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="branding" className="text-sm font-medium text-slate-300 cursor-pointer">
              Include Agent Profile & Propreel Verification Watermark
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? 'Processing & Dispatching...' : 'Generate Cinematic Reel'}
          </button>

          {statusMessage && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-300 mt-4">
              {statusMessage}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
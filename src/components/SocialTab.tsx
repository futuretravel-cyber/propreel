import { useState, useEffect, useRef } from 'react';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SOCIAL_PLATFORMS } from '../lib/constants';
import { PropReelAPI, useUploadWait } from '../lib/api';
import { drainBacklog, enqueueImagesForAI, uploadStatusText, useUploadQueue } from '../lib/uploadQueue';
import { guardAIRender } from '../lib/aiDisclaimer';
import FeatureChips from './FeatureChips';
import CurrencyInput from './CurrencyInput';
import { useStudioDraft, studioDraftKey } from '../lib/studioDrafts';
import { useRepairDraftPhotos } from '../lib/repairDraftPhotos';
import { useReorderable } from '../lib/reorder';
import { formatZar } from '../lib/utils';
import { SOCIAL_POST_CREDITS as SOCIAL_POST_COST, SOCIAL_PACK_CREDITS as SOCIAL_PACK_COST } from '../../lib/renderPricing';
import { Image, Share2, ChevronRight, Check, X, Zap, Sparkles, AlertCircle, Copy, RefreshCw, ChevronLeft } from 'lucide-react';
import { jobHeaders } from '../lib/workerAuth';
import { CopyButton } from './ui';
export function SocialTab() {
  const toast = useToast();
  const uploadWait = useUploadWait();
  const uploadQueue = useUploadQueue('social');
  // Same server-priced mint pattern as DescriptionTab — see its comment.
  const { user, refundCredits, refresh } = useCredit();
  const [platform, setPlatform] = useState('instagram');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  // Full social pack (audit §9): one generation writes every platform's
  // caption at a bundled price. Keyed by SOCIAL_PLATFORMS id.
  const [pack, setPack] = useState<Record<string, string> | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  // Inner sections — each one details a different aspect of the property
  const [section, setSection] = useState<'details' | 'features' | 'photos' | 'platform'>('details');
  // NOTE: beds and baths are SEPARATE plain number fields. The old single
  // "Beds / Baths" input rendered `${bedrooms} bed` as its value, so every
  // keystroke got " bed" appended — the field appeared to auto-fill with Beds.
  const [socialFields, setSocialFields] = useState({
    suburb: '', propertyType: 'House', price: '', bedrooms: '', bathrooms: '', garages: '', features: '',
  });
  const setSf = (k: string) => (e: any) => setSocialFields(f => ({ ...f, [k]: e.target.value }));
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const toggleFeature = (f: string) =>
    setSelectedFeatures(prev => (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]));

  // Photos included in the final post render (and described by Grok) —
  // persisted so a reload doesn't drop the agent's photo selection
  const [images, setImages] = useStudioDraft<string[]>(studioDraftKey(user?.id, 'social:images'), []);
  const imgOrder = useReorderable(setImages);
  // Same presign-decay repair as the video grid (see VideoTab / repairDraftPhotos).
  const socialRepair = useRepairDraftPhotos(studioDraftKey(user?.id, 'social:images'), images, setImages);
  const [uploading, setUploading] = useState(false);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  // Backlog drain — see DescriptionTab; survives a route change mid-batch.
  useEffect(() => {
    const urls = drainBacklog('social');
    if (urls.length) setImages(prev => [...prev, ...urls]);
  }, [uploadQueue, setImages]);

  const handleImages = (list: FileList | null) => {
    if (!list || !list.length) return;
    const room = 6 - images.length - uploadQueue.pending;
    if (room <= 0) { toast.error('Up to 6 photos per post', 'Photo limit'); return; }
    // Background queue — see DescriptionTab.handleImages. Each photo lands in
    // the grid as S3 accepts it instead of after the whole batch.
    setUploading(true);
    enqueueImagesForAI(list, user?.id, room, {
      scope: 'social',
    }).finally(() => {
      setUploading(false);
      if (imagesInputRef.current) imagesInputRef.current.value = '';
    });
  };

  // Grok AI generation — 2 credits per post render, refunded on failure
  const generate = async () => {
    if (!user) { toast.error('Sign in to generate a post'); return; }
    if (!formComplete) { toast.error('Complete all four steps before generating a post'); return; }
    const cost = SOCIAL_POST_COST;
    if ((user.credits ?? 0) < cost) {
      toast.error(`Not enough credits — a post costs ${cost} credits. Top up in Credits.`, 'Insufficient credits');
      return;
    }
    // ZAR with the decimal system: "12500000" → "R 12 500 000,00"
    const rawPrice = socialFields.price.trim();
    const priceZar = !rawPrice ? ''
      : /^\d[\d\s,]*$/.test(rawPrice) && Number(rawPrice.replace(/[^\d]/g, '')) > 0
        ? formatZar(Number(rawPrice.replace(/[^\d]/g, '')))
        : rawPrice;

    setLoading(true);
    let charged = false;
    try {
      const authHeaders = await jobHeaders('social_post', { metadata: { kind: 'SOCIAL_POST' } });
      void refresh(); // the balance display — the charge landed server-side
      charged = true;
      const text = await PropReelAPI.generateText(
        'social_caption',
        {
          platform,
          suburb: socialFields.suburb,
          property_type: socialFields.propertyType,
          price: priceZar,
          bedrooms: socialFields.bedrooms,
          bathrooms: socialFields.bathrooms,
          garages: socialFields.garages,
          key_features: selectedFeatures.join(', '),
          features: socialFields.features,
          attached_photos: images.length ? `${images.length} photo(s) attached — mention what you see in them` : '',
          currency: 'ZAR (South African Rand) — write prices with the decimal system, e.g. R12 500 000,00',
        },
        images,
        authHeaders
      );
      setCaption(text.trim().replace(/^"|"$/g, ''));
      // Store every generated post in My Projects (kind: SOCIAL) — best-effort,
      // the caption itself already succeeded.
      const captionText = text.trim().replace(/^"|"$/g, '');
      let savedToProjects = false;
      try {
        await PropReelAPI.createProject({
          userId: user.id,
          title: `Social post — ${socialFields.suburb || socialFields.propertyType}`.slice(0, 120),
          kind: 'SOCIAL',
          status: 'READY',
          description: captionText,
          tags: [SOCIAL_PLATFORMS.find(p => p.id === platform)?.label || platform],
          thumbnailUrl: images[0] || null,
        } as any);
        savedToProjects = true;
      } catch { /* non-fatal */ }
      toast.success(savedToProjects ? 'Post generated — saved to My Projects' : 'Post generated', 'AI · ⚡' + cost + ' credits');
    } catch (e: any) {
      if (charged) await refundCredits('social_post').catch(() => {});
      toast.error(e.message ? `${e.message} — your credits were refunded` : 'Caption generation failed — your credits were refunded');
    } finally {
      setLoading(false);
    }
  };

  // Full social pack — ONE generation writes all 7 platform captions at a
  // bundled price (SOCIAL_PACK_COST < 7 × SOCIAL_POST_COST). Same charge
  // discipline as generate(): the job_token mint IS the charge, refunded
  // automatically if the generation fails.
  const generatePack = async () => {
    if (!user) { toast.error('Sign in to generate the pack'); return; }
    if (!formComplete) { toast.error('Complete all four steps before generating the pack'); return; }
    if ((user.credits ?? 0) < SOCIAL_PACK_COST) {
      toast.error(`Not enough credits — the full pack costs ${SOCIAL_PACK_COST} credits. Top up in Credits.`, 'Insufficient credits');
      return;
    }
    const rawPrice = socialFields.price.trim();
    const priceZar = !rawPrice ? ''
      : /^\d[\d\s,]*$/.test(rawPrice) && Number(rawPrice.replace(/[^\d]/g, '')) > 0
        ? formatZar(Number(rawPrice.replace(/[^\d]/g, '')))
        : rawPrice;
    const platformBrief = SOCIAL_PLATFORMS
      .map(p => `${p.id} (${p.label}, max ${p.charLimit} chars): ${p.rules}`)
      .join('\n');

    setPackLoading(true);
    let charged = false;
    try {
      const authHeaders = await jobHeaders('social_pack', { metadata: { kind: 'SOCIAL_PACK' } });
      void refresh();
      charged = true;
      const raw = await PropReelAPI.generateText(
        'social_pack',
        {
          platform_brief: platformBrief,
          suburb: socialFields.suburb,
          property_type: socialFields.propertyType,
          price: priceZar,
          bedrooms: socialFields.bedrooms,
          bathrooms: socialFields.bathrooms,
          garages: socialFields.garages,
          key_features: selectedFeatures.join(', '),
          features: socialFields.features,
          attached_photos: images.length ? `${images.length} photo(s) attached — mention what you see in them` : '',
          currency: 'ZAR (South African Rand) — write prices with the decimal system, e.g. R12 500 000,00',
        },
        images,
        authHeaders
      );
      // The worker answers minified JSON {platformId: caption}; tolerate
      // accidental code fences and trim captions to their platform limits.
      const jsonText = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(jsonText); } catch { throw new Error('The AI returned an unexpected format — please try again'); }
      const next: Record<string, string> = {};
      for (const p of SOCIAL_PLATFORMS) {
        const v = parsed[p.id];
        if (typeof v === 'string' && v.trim()) next[p.id] = v.trim().replace(/^"|"$/g, '');
      }
      if (!Object.keys(next).length) throw new Error('The AI returned an empty pack — please try again');
      setPack(next);
      setCaption(next[platform] || '');
      // One SOCIAL project per pack — every caption travels in the
      // description so the agent can re-open and edit from My Projects.
      let savedToProjects = false;
      try {
        await PropReelAPI.createProject({
          userId: user.id,
          title: `Social pack — ${socialFields.suburb || socialFields.propertyType}`.slice(0, 120),
          kind: 'SOCIAL',
          status: 'READY',
          description: Object.entries(next).map(([id, text]) => `## ${SOCIAL_PLATFORMS.find(p => p.id === id)?.label || id}\n${text}`).join('\n\n'),
          tags: ['Social pack', ...SOCIAL_PLATFORMS.map(p => p.label)],
          thumbnailUrl: images[0] || null,
        } as any);
        savedToProjects = true;
      } catch { /* non-fatal */ }
      const missing = SOCIAL_PLATFORMS.length - Object.keys(next).length;
      toast.success(
        savedToProjects ? `Social pack generated (${Object.keys(next).length}/${SOCIAL_PLATFORMS.length} platforms) — saved to My Projects` : `Social pack generated (${Object.keys(next).length}/${SOCIAL_PLATFORMS.length} platforms)`,
        missing ? 'AI · ⚡' + SOCIAL_PACK_COST + ' credits · some platforms skipped' : 'AI · ⚡' + SOCIAL_PACK_COST + ' credits'
      );
    } catch (e: any) {
      if (charged) await refundCredits('social_pack').catch(() => {});
      toast.error(e.message ? `${e.message} — your credits were refunded` : 'Pack generation failed — your credits were refunded');
    } finally {
      setPackLoading(false);
    }
  };

  const currentPlatform = SOCIAL_PLATFORMS.find(p => p.id === platform);
  const isOverLimit = caption.length > (currentPlatform?.charLimit || 0);

  const sectionTabs: Array<{ id: typeof section; label: string }> = [
    { id: 'details', label: 'Property Details' },
    { id: 'features', label: 'Key Features' },
    { id: 'photos', label: 'Photos' },
    { id: 'platform', label: 'Platform' },
  ];
  // New-Listing-style wizard: four numbered steps walked in order. A post can
  // only be generated once the whole form has been completed (step 1 needs a
  // location; features and photos are optional; the platform has a default).
  const stepIndex = sectionTabs.findIndex(s => s.id === section);
  const stepValid = [!!socialFields.suburb.trim(), true, true, !!platform];
  const canNext = stepValid[stepIndex];
  const formComplete = stepValid.every(Boolean);
  const goToStep = (i: number) => { if (i >= 0 && i < sectionTabs.length) setSection(sectionTabs[i].id); };
  const nextStep = () => { if (stepIndex < sectionTabs.length - 1 && canNext) goToStep(stepIndex + 1); };
  const prevStep = () => goToStep(stepIndex - 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Share2 className="w-5 h-5 text-purple-400" /> Social Media Post Generator</h2>
        <span className="badge badge-brand" title="Charged when you generate; refunded automatically if it fails"><Zap className="w-3 h-3" /> ⚡{SOCIAL_POST_COST} per post · ⚡{SOCIAL_PACK_COST} for all 7 · AI</span>
      </div>

      {/* Wizard steps — same layout as the New Listing flow */}
      <div className="flex items-center">
        {sectionTabs.map((s, i) => (
          <div key={s.id} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && <div className={`h-0.5 flex-1 mx-2 ${i <= stepIndex ? 'bg-purple-600' : 'bg-white/10'}`} />}
            <div className="flex flex-col items-center gap-1" aria-current={i === stepIndex ? 'step' : undefined}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i < stepIndex ? 'bg-purple-700 text-white' : i === stepIndex ? 'bg-purple-700/30 border border-purple-500 text-white' : 'bg-white/10 text-ink-400'
              }`}>
                {i < stepIndex ? <Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`text-[11px] hidden sm:block ${i === stepIndex ? 'text-white' : 'text-ink-500'}`}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {section === 'details' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="label">Suburb / City</label><input className="input" value={socialFields.suburb} onChange={setSf('suburb')} placeholder="Constantia, Cape Town" /></div>
          <div><label className="label">Price (ZAR)</label><CurrencyInput className="input" value={socialFields.price} onChange={v => setSocialFields(f => ({ ...f, price: v }))} placeholder="12,500,000" aria-label="Price in rand" /></div>
          <div>
            <label className="label">Property Type</label>
            <select className="input" value={socialFields.propertyType} onChange={setSf('propertyType')}>
              {['House', 'Apartment', 'Townhouse', 'Sectional Title', 'Vacant Land', 'Farm / Smallholding', 'Commercial', 'Industrial'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div><label className="label">Beds</label><input className="input" type="number" min="0" value={socialFields.bedrooms} onChange={setSf('bedrooms')} placeholder="5" /></div>
          <div><label className="label">Baths</label><input className="input" type="number" min="0" value={socialFields.bathrooms} onChange={setSf('bathrooms')} placeholder="4" /></div>
          <div><label className="label">Garages / Parking</label><input className="input" type="number" min="0" value={socialFields.garages} onChange={setSf('garages')} placeholder="2" /></div>
          <div className="md:col-span-3"><label className="label">Extra highlights</label><input className="input" value={socialFields.features} onChange={setSf('features')} placeholder="Pool, panoramic views, gas stove" /></div>
        </div>
      )}

      {section === 'features' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Key Features</label>
            {selectedFeatures.length > 0 && (
              <button onClick={() => setSelectedFeatures([])} className="text-xs text-ink-400 hover:text-red-400">Clear</button>
            )}
          </div>
          <FeatureChips selected={selectedFeatures} onToggle={toggleFeature} />
        </div>
      )}

      {section === 'photos' && (
        <div>
          <label className="label">Post Photos ({images.length} / 6)</label>
          <input
            ref={imagesInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={e => { handleImages(e.target.files); e.target.value = ''; }}
          />
          <div
            className="border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer border-white/10 hover:border-purple-500/30"
            onClick={() => imagesInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && imagesInputRef.current?.click()}
            aria-label="Upload photos for the post"
          >
            <Image className="w-7 h-7 text-ink-400 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">{uploading || uploadQueue.pending > 0 ? uploadStatusText(uploadQueue, uploadWait) : 'Drop photos here or click to upload'}</p>
          <p className="text-ink-500 text-xs mt-1">Photos are shown in the final post and described by AI</p>
          </div>
          {images.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
              {images.map((src, i) => (
                <div key={src} className={imgOrder.dragClass(i, 'relative group')} {...imgOrder.dragProps(i)}>
                  <img src={socialRepair.display[src] || src} alt={`Post ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border border-white/10 pointer-events-none" draggable={false} />
                  <button
                    onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Per-platform previews — agents see how the post will look on
              every channel right here in the Photos step, before generating.
              The caption fills in live as soon as it exists (or after edits). */}
          <div className="mt-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="label mb-0">Post preview — every platform</p>
              <span className="text-xs text-ink-500">{caption ? 'Showing your generated caption' : 'Caption fills in on step 4'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {SOCIAL_PLATFORMS.map(p => {
                // A generated pack carries a tailored caption per platform;
                // fall back to the single-post caption when there is no pack.
                const text = pack?.[p.id] ?? caption;
                const over = text.length > p.charLimit;
                const ratio = p.id === 'instagram' ? 'aspect-square' : 'aspect-[4/3]';
                return (
                  <div key={p.id} className="rounded-xl border border-white/10 overflow-hidden bg-ink-900">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5 text-xs">
                      <span className="text-ink-300">{p.icon} {p.label}</span>
                      <span className={over ? 'text-red-400 font-semibold' : 'text-ink-500'}>{text.length} / {p.charLimit}</span>
                    </div>
                    <div className="relative">
                      {images[0] ? (
                        <img src={images[0]} alt={`${p.label} post preview`} className={`w-full object-cover ${ratio}`} />
                      ) : (
                        <div className={`w-full bg-ink-800/60 border-b border-white/5 flex flex-col items-center justify-center gap-1 text-ink-500 text-xs ${ratio}`}>
                          <Image className="w-6 h-6" />
                          Add a photo to preview the post
                        </div>
                      )}
                      {images.length > 1 && (
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">1 / {images.length}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className={`text-xs whitespace-pre-wrap break-words line-clamp-6 ${text ? 'text-white' : 'text-ink-500'}`}>
                        {text || `Your ${p.label} caption (up to ${p.charLimit} chars) will appear here once you generate on step 4 — ${p.rules}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-ink-500 mt-2">Previews update as you add or remove photos — the generated caption drops into every card at the same time.</p>
          </div>
        </div>
      )}

      {section === 'platform' && (
        <div>
          <label className="label">Select Platform</label>
          <div className="flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setPlatform(p.id);
                  // Switching platforms after a pack generation shows that
                  // platform's tailored caption in the editor below.
                  if (pack?.[p.id]) setCaption(pack[p.id]);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${platform === p.id ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
              >
                {p.icon} {p.label}
                {pack?.[p.id] && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Pack caption generated" />}
              </button>
            ))}
          </div>
          {currentPlatform && (
            <div className="mt-3 p-3 bg-ink-800/50 rounded-lg">
              <p className="text-xs text-ink-400 mb-1">Platform Requirements:</p>
              <p className="text-sm text-white">{currentPlatform.rules}</p>
              <p className="text-xs text-ink-400 mt-2">Character limit: {currentPlatform.charLimit.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Step navigation — the form is completed in order; generation only
          unlocks on the last step */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={prevStep} disabled={stepIndex === 0} className="btn btn-quiet text-sm disabled:opacity-40">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {stepIndex < sectionTabs.length - 1 && (
          <button onClick={nextStep} disabled={!canNext} className="btn btn-primary text-sm">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {stepIndex === sectionTabs.length - 1 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={() => guardAIRender(generate)} disabled={loading || packLoading || !formComplete} className="btn btn-primary">
              {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating with AI…</> : <><Sparkles className="w-4 h-4" /> Generate Post · ⚡{SOCIAL_POST_COST}</>}
            </button>
            {/* Full social pack (audit §9): all 7 platforms in ONE generation
                at a bundled price — how agents actually market a listing. */}
            <button onClick={() => guardAIRender(generatePack)} disabled={loading || packLoading || !formComplete} className="btn btn-secondary">
              {packLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Writing all 7 captions…</> : <><Sparkles className="w-4 h-4" /> Full Social Pack · all 7 · ⚡{SOCIAL_PACK_COST}</>}
            </button>
          </div>
          {!formComplete && (
            <p className="text-xs text-ink-500">Add a suburb / city in Property Details to enable generation.</p>
          )}
          <p className="text-xs text-ink-500">The full pack writes a tailored caption for every platform at once — {SOCIAL_PACK_COST} credits instead of {SOCIAL_PLATFORMS.length * SOCIAL_POST_COST} one at a time.</p>
        </div>
      )}
      {/* Full pack results — every platform's caption, copyable one by one
          (Instagram/TikTok can't be shared via web intents, so a caption
          copy is the real share action there). */}
      {pack && (
        <div className="space-y-3 rounded-xl border border-purple-500/20 bg-purple-950/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-300" /> Full social pack — {Object.keys(pack).length} / {SOCIAL_PLATFORMS.length} platforms</p>
            <button onClick={() => setPack(null)} className="text-xs text-ink-400 hover:text-red-400">Clear pack</button>
          </div>
          <div className="space-y-3">
            {SOCIAL_PLATFORMS.filter(p => pack[p.id]).map(p => (
              <div key={p.id} className="rounded-lg bg-ink-900 border border-white/5 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-ink-300">{p.icon} {p.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${pack[p.id].length > p.charLimit ? 'text-red-400 font-semibold' : 'text-ink-500'}`}>{pack[p.id].length} / {p.charLimit.toLocaleString()}</span>
                    <CopyButton text={pack[p.id]} label="Copy" copiedLabel="Copied!" className="btn btn-ghost text-xs px-2 py-1" />
                  </div>
                </div>
                <p className="text-xs text-white whitespace-pre-wrap break-words">{pack[p.id]}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-500">Saved to My Projects as one Social pack — open it there to re-edit instead of regenerating.</p>
        </div>
      )}
      {caption && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">
              Generated Post 
              <span className={`ml-2 ${isOverLimit ? 'text-red-400' : 'text-ink-400'}`}>
                ({caption.length} / {currentPlatform?.charLimit} chars)
              </span>
            </label>
            {isOverLimit && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Over limit!
              </span>
            )}
          </div>
          <textarea 
            className={`input min-h-[200px] ${isOverLimit ? 'border-red-500/50' : ''}`} 
            value={caption} 
            onChange={e => setCaption(e.target.value)} 
          />
          {/* Final post render: photo + caption as it will look live */}
          <div className="rounded-xl border border-white/10 overflow-hidden bg-ink-900">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 text-xs text-ink-400">
              {currentPlatform?.icon} Post preview — {currentPlatform?.label}
            </div>
            {images[0] ? (
              <img src={images[0]} alt="Post preview" className="w-full max-h-72 object-cover" />
            ) : (
              <div className="h-24 flex items-center justify-center text-ink-500 text-xs">
                Add photos in the Photos tab to include imagery in the post
              </div>
            )}
            <p className="p-4 text-sm text-white whitespace-pre-wrap">{caption}</p>
          </div>
          <div className="flex gap-3">
            <CopyButton text={caption} className="btn btn-secondary" label="Copy to Clipboard" copiedLabel="Copied!" />
            <button onClick={() => setCaption('')} className="btn btn-ghost"><X className="w-4 h-4" /> Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

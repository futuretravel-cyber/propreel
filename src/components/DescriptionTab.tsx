import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { TONES, PROVINCES, PROPERTY_TYPES, SA_LANGUAGES } from '../lib/constants';
import { PropReelAPI, useUploadWait } from '../lib/api';
import { drainBacklog, enqueueImagesForAI, uploadStatusText, useUploadQueue } from '../lib/uploadQueue';
import { guardAIRender } from '../lib/aiDisclaimer';
import FeatureChips from './FeatureChips';
import CurrencyInput from './CurrencyInput';
import { geocodeAddress, findNearbyAmenities } from '../lib/propertyListing';
import { useStudioDraft, studioDraftKey } from '../lib/studioDrafts';
import { useRepairDraftPhotos } from '../lib/repairDraftPhotos';
import { useReorderable } from '../lib/reorder';
import { formatZar, downloadText } from '../lib/utils';
import { DESCRIPTION_CREDITS as DESCRIPTION_RENDER_COST } from '../../lib/renderPricing';
import CostHeader from './CostHeader';
import { creditListZar } from '../lib/utils';
import { queueVideoRender } from '../lib/videoPrefill';
import { Video, Image, Check, X, Zap, Sparkles, Download, RefreshCw, MapPin, FileText } from 'lucide-react';
import { jobHeaders } from '../lib/workerAuth';
import { CopyButton } from './ui';
export function DescriptionTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const uploadWait = useUploadWait();
  const uploadQueue = useUploadQueue('description');
  // deductCredits is gone from here — the charge is the job_token mint now
  // (server-priced; see generate below). Only refunds and the balance refresh.
  const { user, refundCredits, refresh } = useCredit();
  const [tone, setTone] = useState('Professional');
  // Multi-language descriptions (audit §8) — any of SA's 11 official
  // languages, the same set the voiceover already covers.
  const [language, setLanguage] = useState('en-ZA');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState({ address: '', province: 'Western Cape', price: '', bedrooms: '', bathrooms: '', garages: '', propertyType: 'House', erf: '', floor: '', extraFeatures: '' });
  const setField = (k: string) => (e: any) => setFields(f => ({ ...f, [k]: e.target.value }));
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const toggleFeature = (f: string) =>
    setSelectedFeatures(prev => (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]));

  // Address → confirm the pin on Google Maps → pull nearby amenities for the copy
  const [geo, setGeo] = useState<{ lat: number; lon: number; display: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenityBusy, setAmenityBusy] = useState(false);

  // Grok vision: optional photos that get described in the copy (persisted
  // across reloads — they're already uploaded to S3, so only URLs are stored)
  const [images, setImages] = useStudioDraft<string[]>(studioDraftKey(user?.id, 'description:images'), []);
  const imgOrder = useReorderable(setImages);
  // Same presign-decay repair as the video grid (see VideoTab / repairDraftPhotos).
  const descRepair = useRepairDraftPhotos(studioDraftKey(user?.id, 'description:images'), images, setImages);
  const [uploading, setUploading] = useState(false);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const findLocation = async () => {
    if (!fields.address.trim()) { toast.error('Enter the property address first', 'Address required'); return; }
    setLocating(true); setConfirmed(false); setAmenities([]); setGeo(null);
    try {
      const g = await geocodeAddress(fields.address.trim());
      if (!g) { toast.error('Could not find that address — add the suburb or city and try again', 'Address not found'); return; }
      setGeo(g);
      toast.success('Location found — confirm the pin on the map below', 'Google Maps');
    } catch {
      toast.error('Map lookup failed — please try again', 'Google Maps');
    } finally {
      setLocating(false);
    }
  };

  const confirmLocation = async () => {
    if (!geo) return;
    setConfirmed(true);
    setAmenityBusy(true);
    try {
      const found = await findNearbyAmenities(geo.lat, geo.lon);
      setAmenities(found);
      if (found.length) toast.success(`${found.length} nearby amenities found — they'll be woven into the copy`, 'Location confirmed');
    } catch {
      // Amenities only garnish the copy — a mirror hiccup must not alarm the
      // agent; the pin stays confirmed either way.
      toast.info('Nearby amenities are unavailable right now — the description will skip them', 'Amenities');
    } finally {
      setAmenityBusy(false);
    }
  };

  // Photos the queue finished land here on every queue tick — a backlog
  // drain, so navigating away mid-upload can't orphan them in S3.
  useEffect(() => {
    const urls = drainBacklog('description');
    if (urls.length) setImages(prev => [...prev, ...urls]);
  }, [uploadQueue, setImages]);

  const handleImages = (list: FileList | null) => {
    if (!list || !list.length) return;
    const room = 4 - images.length - uploadQueue.pending;
    if (room <= 0) { toast.error('Up to 4 photos per description', 'Photo limit'); return; }
    // Hand the batch to the background queue: it parks itself on a 429 window
    // and streams each photo in, so this returns immediately — the completion
    // toast comes from <UploadQueueNotifier/> wherever this tab is by then.
    setUploading(true);
    enqueueImagesForAI(list, user?.id, room, {
      scope: 'description',
    }).finally(() => {
      setUploading(false);
      if (imagesInputRef.current) imagesInputRef.current.value = '';
    });
  };

  // ── Grok AI generation — priced server-side via the job_token mint ────
  // The mint (POST ?action=job_token, scope 'description') prices the charge
  // from lib/renderPricing and pays into the single-use token the worker
  // call carries — the client neither picks the amount nor can skip it.
  // Refund on failure: same 'description' refund scope as before (the mint
  // writes the ledger kind the matcher needs).
  const generate = async () => {
    if (!user) { toast.error('Sign in to generate a description'); return; }
    // Without an address or photos the model has nothing to describe and
    // invents a property — this used to charge a credit for that.
    if (!fields.address.trim() && images.length === 0) {
      toast.error('Add the property address, or at least one photo, so the AI has something to write about.', 'Details needed');
      return;
    }
    const cost = DESCRIPTION_RENDER_COST;
    if ((user.credits ?? 0) < cost) {
      toast.error(`Not enough credits — a description costs ${cost} credit. Top up in Credits.`, 'Insufficient credits');
      return;
    }
    // ZAR with the decimal system: "12500000" → "R 12 500 000,00"
    const rawPrice = fields.price.trim();
    const priceZar = !rawPrice ? ''
      : /^\d[\d\s,]*$/.test(rawPrice) && Number(rawPrice.replace(/[^\d]/g, '')) > 0
        ? formatZar(Number(rawPrice.replace(/[^\d]/g, '')))
        : rawPrice;

    setLoading(true);
    let charged = false;
    try {
      // The mint IS the charge — server-priced, single-use, one-shot. Its
      // token travels to the worker in X-PropReel-Token (same header the
      // free worker token uses; the paid one replaces it for this call).
      const authHeaders = await jobHeaders('description', { metadata: { kind: 'PROPERTY_DESCRIPTION' } });
      void refresh(); // the balance display — the charge landed server-side
      charged = true;
      const text = await PropReelAPI.generateText(
        'description',
        {
          tone,
          language,
          language_label: SA_LANGUAGES.find(l => l.id === language)?.label || 'English',
          address: fields.address,
          price: priceZar,
          bedrooms: fields.bedrooms,
          bathrooms: fields.bathrooms,
          garages: fields.garages,
          propertyType: fields.propertyType,
          province: fields.province,
          erf_size_m2: fields.erf,
          floor_size_m2: fields.floor,
          key_features: selectedFeatures.join(', '),
          extra_features: fields.extraFeatures,
          location: geo ? `${geo.display} (latitude ${geo.lat.toFixed(5)}, longitude ${geo.lon.toFixed(5)})` : '',
          location_confirmed: confirmed ? 'Yes — the agent confirmed the exact pin on Google Maps' : 'No',
          nearby_amenities: amenities.join('; '),
          currency: 'ZAR (South African Rand) — always write prices with the decimal system, e.g. R12 500 000,00',
        },
        images,
        authHeaders
      );
      setDescription(text.trim());
      toast.success('Description generated', 'AI');
    } catch (e: any) {
      if (charged) await refundCredits('description').catch(() => {});
      toast.error(e.message ? `${e.message} — your credit was refunded` : 'Description generation failed — your credit was refunded');
    } finally {
      setLoading(false);
    }
  };

  // ── Portal-shaped exports ───────────────────────────────────────────────
  // Property24: compact, one heading line + specs + body, no bullets.
  const property24Text = () => {
    const heading = [fields.propertyType, fields.address].filter(Boolean).join(' in ') || 'Property listing';
    const specs = [
      fields.bedrooms && `${fields.bedrooms} bed`,
      fields.bathrooms && `${fields.bathrooms} bath`,
      fields.garages && `${fields.garages} garage`,
      fields.erf && `Erf ${fields.erf} m²`,
      fields.floor && `${fields.floor} m² under roof`,
    ].filter(Boolean).join(' | ');
    const price = fields.price ? `Asking R${fields.price}` : '';
    return [
      heading,
      [price, specs].filter(Boolean).join(' · '),
      '',
      description,
      selectedFeatures.length ? `\nFeatures: ${selectedFeatures.join(', ')}.` : '',
    ].filter(line => line !== undefined && line !== null && line !== '').join('\n').trim();
  };

  // Private Property: labelled sections, bulleted features, clear closing.
  const privatePropertyText = () => {
    const rows = [
      fields.propertyType && `Property type: ${fields.propertyType}`,
      fields.province && `Province: ${fields.province}`,
      fields.price && `Price: R${fields.price}`,
      fields.bedrooms && `Bedrooms: ${fields.bedrooms}`,
      fields.bathrooms && `Bathrooms: ${fields.bathrooms}`,
      fields.garages && `Garages: ${fields.garages}`,
      fields.erf && `Erf size: ${fields.erf} m²`,
      fields.floor && `Floor size: ${fields.floor} m²`,
    ].filter(Boolean).join('\n');
    const features = selectedFeatures.length
      ? `\n\nKEY FEATURES\n${selectedFeatures.map(f => `• ${f}`).join('\n')}`
      : '';
    const extra = fields.extraFeatures.trim() ? `\n\nALSO NOTEWORTHY\n${fields.extraFeatures.trim()}` : '';
    return [
      fields.address ? fields.address.toUpperCase() : 'PROPERTY LISTING',
      '',
      'PROPERTY DETAILS',
      rows,
      '',
      'ABOUT THIS PROPERTY',
      description,
      features,
      extra,
      '',
      'Viewing by appointment. Contact the listing agent to arrange a time.',
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="w-5 h-5 text-purple-400" /> Property Description</h2>
        <span className="badge badge-brand" title="Charged when you generate; refunded automatically if it fails"><Zap className="w-3 h-3" /> {DESCRIPTION_RENDER_COST} credit per render · AI</span>
      </div>

      {/* Address + Google Maps confirmation */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <div><label className="label">Address</label><input className="input" value={fields.address} onChange={setField('address')} placeholder="15 Vineyard Road, Constantia" /></div>
        <button onClick={findLocation} disabled={locating} className="btn btn-secondary h-[42px]">
          {locating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying…</> : <><MapPin className="w-4 h-4" /> Verify Address</>}
        </button>
      </div>

      {geo && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-ink-800/60">
            <p className="text-xs text-ink-300 truncate">{geo.display}</p>
            <a href={`https://www.google.com/maps?q=${geo.lat},${geo.lon}`} target="_blank" rel="noreferrer" className="text-xs text-purple-400 hover:text-purple-300 shrink-0 ml-3">Open in Google Maps ↗</a>
          </div>
          <iframe
            title="Confirm the property location on Google Maps"
            src={`https://maps.google.com/maps?q=${geo.lat},${geo.lon}&z=16&output=embed`}
            className="w-full h-64 border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-ink-800/60">
            {confirmed ? (
              <span className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Location confirmed — {amenities.length} amenities found, auto-filled below</span>
            ) : (
              <span className="text-xs text-ink-400">Check the pin, then confirm so we can use nearby amenities in the copy.</span>
            )}
            <button onClick={confirmLocation} disabled={amenityBusy || confirmed} className="btn btn-primary text-sm px-4 py-2 shrink-0">
              {amenityBusy ? <><RefreshCw className="w-4 h-4 animate-spin" /> Looking up…</> : confirmed ? 'Confirmed' : 'Confirm location'}
            </button>
          </div>
          {amenities.length > 0 && (
            <div className="px-4 py-3 bg-black/20">
              <p className="text-xs text-green-400 flex items-center gap-1 mb-2"><Check className="w-3 h-3 shrink-0" /> Auto-filled from your verified address — {amenities.length} amenities found</p>
              <div className="flex flex-wrap gap-1.5">
                {amenities.map(a => <span key={a} className="text-[11px] bg-white/5 border border-white/10 rounded-full px-2 py-1 text-ink-300">{a}</span>)}
              </div>
              <p className="text-[11px] text-ink-500 mt-2">Each entry carries its type and distance from your pin (e.g. school, 850m away) and is woven into the generated description.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="label">Price (ZAR)</label><CurrencyInput className="input" value={fields.price} onChange={v => setFields(f => ({ ...f, price: v }))} placeholder="12,500,000" aria-label="Price in rand" /></div>
        <div>
          <label className="label">Property Type</label>
          <select className="input" value={fields.propertyType} onChange={setField('propertyType')} aria-label="Property Type">
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Province</label>
          <select className="input" value={fields.province} onChange={setField('province')} aria-label="Province">
            <option value="">Select province…</option>
            {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label className="label">Bedrooms</label><input className="input" type="number" value={fields.bedrooms} onChange={setField('bedrooms')} placeholder="5" /></div>
        <div><label className="label">Bathrooms</label><input className="input" type="number" value={fields.bathrooms} onChange={setField('bathrooms')} placeholder="4" /></div>
        <div><label className="label">Garages</label><input className="input" type="number" value={fields.garages} onChange={setField('garages')} placeholder="3" /></div>
        <div><label className="label">Erf Size (m²)</label><input className="input" type="number" value={fields.erf} onChange={setField('erf')} placeholder="600" /></div>
        <div><label className="label">Floor Size (m²)</label><input className="input" type="number" value={fields.floor} onChange={setField('floor')} placeholder="280" /></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Key Features <span className="text-ink-500 font-normal">({selectedFeatures.length} selected)</span></label>
          {selectedFeatures.length > 0 && (
            <button onClick={() => setSelectedFeatures([])} className="text-xs text-ink-400 hover:text-red-400">Clear</button>
          )}
        </div>
        <FeatureChips selected={selectedFeatures} onToggle={toggleFeature} />
      </div>
      <div>
        <label className="label">Extra features (optional)</label>
        <input className="input" value={fields.extraFeatures} onChange={setField('extraFeatures')} placeholder="gas stove, walk-in pantry, skyline views" />
      </div>

      {/* Photos for AI to describe */}
      <div>
        <label className="label">Photos for AI to describe ({images.length} / 4)</label>
        <input
          ref={imagesInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={e => { handleImages(e.target.files); e.target.value = ''; }}
        />
        <div
          className="border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer border-white/10 hover:border-purple-500/30"
          onClick={() => imagesInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && imagesInputRef.current?.click()}
          aria-label="Upload photos for the description"
        >
          <Image className="w-7 h-7 text-ink-400 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">{uploading || uploadQueue.pending > 0 ? uploadStatusText(uploadQueue, uploadWait) : 'Drop photos here or click to upload'}</p>
          <p className="text-ink-500 text-xs mt-1">AI describes what it sees — up to 4 images</p>
        </div>
        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mt-3">
            {images.map((src, i) => (
              <div key={src} className={imgOrder.dragClass(i, 'relative group')} {...imgOrder.dragProps(i)}>
                <img src={descRepair.display[src] || src} alt={`Property ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border border-white/10 pointer-events-none" draggable={false} />
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
      </div>

      <div>
        <label className="label">Tone</label>
        <div className="flex flex-wrap gap-2">
          {TONES.map(t => (
            <button key={t.id} onClick={() => setTone(t.id)} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tone === t.id ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Language</label>
        <div className="flex flex-wrap gap-2">
          {SA_LANGUAGES.map(l => (
            <button
              key={l.id}
              onClick={() => setLanguage(l.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${language === l.id ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {language !== 'en-ZA' && (
          <p className="text-xs text-ink-500 mt-2">
            The description will be written in {SA_LANGUAGES.find(l => l.id === language)?.label} — property names, suburbs and prices stay exactly as you typed them.
          </p>
        )}
      </div>

      <CostHeader
        costCredits={DESCRIPTION_RENDER_COST}
        costLabel="Description render"
        chargedWhen="Charged when you generate · refunded automatically if it fails"
        randValue={creditListZar(DESCRIPTION_RENDER_COST)}
      />

      <button onClick={() => guardAIRender(generate)} disabled={loading} className="btn btn-primary">
        {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating with AI…</> : <><Sparkles className="w-4 h-4" /> Generate Description · ⚡{DESCRIPTION_RENDER_COST}</>}
      </button>

      {description && (
        <div className="space-y-3">
          <label className="label">Generated Description</label>
          <textarea className="input min-h-[200px]" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { queueVideoRender({ images, script: description }); navigate('/dashboard/video'); }}
              className="btn btn-primary"
              title="Auto-format these photos into a video render with this description as the voiceover"
            >
              <Video className="w-4 h-4" /> Render as video
            </button>
            {/* The two portal buttons used to write the identical string to
                two filenames. These are genuinely different layouts: a
                compact Property24 block and a structured Private Property
                listing with labelled sections and bullets. */}
            <button onClick={() => downloadText('property24-description.txt', property24Text())} className="btn btn-secondary"><Download className="w-4 h-4" /> Property24 format</button>
            <button onClick={() => downloadText('private-property-description.txt', privatePropertyText())} className="btn btn-secondary"><Download className="w-4 h-4" /> Private Property format</button>
            <CopyButton text={description} className="btn btn-ghost" label="Copy" />
          </div>
        </div>
      )}
    </div>
  );
}

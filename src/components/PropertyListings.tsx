/**
 * Property Listings — the agent's portfolio.
 *
 * - Stats row (active listings, monthly revenue, properties sold)
 * - Market-status filters (All / Active / Draft / Sold / Expired) + sort
 * - A Videos tab where every rendered reel plays inline (media player)
 * - Listing cards with price/specs, a media-player overlay when a reel
 *   exists, Create Reel → Studio, and a status menu
 * - A 4-step New Listing wizard: Property Details → Photos → AI Description
 *   → Export (Property24 / Private Property downloads + Save Listing)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home as HomeIcon, Plus, MapPin, BedDouble, Bath, Car, Square, Play, Download,
  Copy, X, Check, Sparkles, Upload, Trash2, MoreVertical, Video, ChevronLeft,
  ChevronRight, Loader2, Wand2, FileText, ArrowRight,
} from 'lucide-react';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PropReelAPI, type Project } from '../lib/api';
import { formatZar, downloadText } from '../lib/utils';
import { TONES } from '../lib/constants';
import FeatureChips from './FeatureChips';
import { uploadImagesForAI, geocodeAddress, findNearbyAmenities } from '../lib/propertyListing';

const DESCRIPTION_RENDER_COST = 1; // ⚡ per description render (Grok AI) — parity with the Studio

const PROVINCES = [
  'Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'Gauteng',
  'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West',
];
const PROPERTY_TYPES = ['House', 'Apartment', 'Townhouse', 'Vacant Land', 'Farm', 'Commercial', 'Industrial'];

const TONE_BLURBS: Record<string, string> = {
  Professional: 'Clear, factual and authoritative. Ideal for corporate buyers.',
  Exciting: 'High energy and urgency. Great for investment properties.',
  Luxury: 'Evocative and aspirational. Perfect for upmarket homes.',
  Friendly: 'Warm and approachable. Best for family-oriented listings.',
};

type MarketStatus = 'ACTIVE' | 'DRAFT' | 'SOLD' | 'EXPIRED';

const marketState = (p: Project): MarketStatus =>
  p.marketStatus || (p.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE');

const STATUS_BADGE: Record<MarketStatus, string> = {
  ACTIVE: 'badge badge-success',
  DRAFT: 'badge badge-muted',
  SOLD: 'badge badge-warning',
  EXPIRED: 'badge badge-danger',
};

// ─── Media player lightbox (shared by listings + videos tab) ────────────────

export function VideoLightbox({ project, onClose }: { project: Project; onClose: () => void }) {
  if (!project.videoUrl) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-white font-semibold truncate">{project.title}</h3>
            <p className="text-xs text-ink-400">{[project.address, project.suburb].filter(Boolean).join(', ')}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={project.videoUrl} download className="btn btn-ghost text-xs">
              <Download className="w-4 h-4" /> Download
            </a>
            <button onClick={onClose} className="btn btn-ghost text-xs" aria-label="Close player">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          controls
          autoPlay
          playsInline
          poster={project.thumbnailUrl || undefined}
          src={project.videoUrl}
          className="w-full max-h-[70vh] rounded-xl bg-black"
        />
      </div>
    </div>
  );
}

// ─── Listing card ───────────────────────────────────────────────────────────

function Spec({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  if (!value && value !== 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-400" title={label}>
      {icon}
      {value}
    </span>
  );
}

function ListingCard({
  project, onPlay, onReel, onStatus, onDelete,
}: {
  project: Project;
  onPlay: () => void;
  onReel: () => void;
  onStatus: (s: MarketStatus) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const status = marketState(project);
  const cover = project.thumbnailUrl || project.photos?.[0];

  return (
    <div className="card-dark overflow-hidden group relative">
      <div className="aspect-[16/10] bg-ink-800 relative overflow-hidden">
        {cover ? (
          <img src={cover} alt={project.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-40">🏡</div>
        )}
        <span className={`absolute top-2 left-2 text-[10px] ${STATUS_BADGE[status]}`}>{status}</span>
        {project.videoUrl && (
          <button
            onClick={onPlay}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition"
            aria-label={`Play ${project.title}`}
          >
            <span className="w-14 h-14 rounded-full bg-purple-600/90 flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-white" />
            </span>
          </button>
        )}
        <div className="absolute top-2 right-2">
          <button
            onClick={() => setMenu(m => !m)}
            className="p-1.5 rounded-lg bg-black/60 text-ink-300 hover:text-white"
            aria-label={`Actions for ${project.title}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menu && (
            <div className="absolute right-0 mt-1 w-44 bg-ink-900 border border-white/10 rounded-xl shadow-xl py-1 z-20 text-sm">
              {status !== 'ACTIVE' && (
                <button className="w-full text-left px-3 py-2 hover:bg-white/5" onClick={() => { setMenu(false); onStatus('ACTIVE'); }}>Mark as Active</button>
              )}
              {status !== 'SOLD' && (
                <button className="w-full text-left px-3 py-2 hover:bg-white/5" onClick={() => { setMenu(false); onStatus('SOLD'); }}>Mark as Sold</button>
              )}
              {status !== 'EXPIRED' && (
                <button className="w-full text-left px-3 py-2 hover:bg-white/5" onClick={() => { setMenu(false); onStatus('EXPIRED'); }}>Mark as Expired</button>
              )}
              {status !== 'DRAFT' && (
                <button className="w-full text-left px-3 py-2 hover:bg-white/5" onClick={() => { setMenu(false); onStatus('DRAFT'); }}>Move to Draft</button>
              )}
              <button className="w-full text-left px-3 py-2 hover:bg-red-950/60 text-red-400" onClick={() => { setMenu(false); onDelete(); }}>
                <Trash2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" /> Delete listing
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-bold text-white">{project.price ? formatZar(project.price) : 'Price on request'}</p>
            <p className="text-sm text-ink-300 truncate">{project.propertyType} · {project.suburb || project.city || '—'}</p>
            <p className="text-xs text-ink-500 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" /> {[project.address, project.suburb, project.city].filter(Boolean).join(', ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Spec icon={<BedDouble className="w-3.5 h-3.5" />} value={project.bedrooms} label="Bedrooms" />
          <Spec icon={<Bath className="w-3.5 h-3.5" />} value={project.bathrooms} label="Bathrooms" />
          <Spec icon={<Car className="w-3.5 h-3.5" />} value={project.garages} label="Garages" />
          <Spec icon={<Square className="w-3.5 h-3.5" />} value={project.erfSize ? `${project.erfSize}m²` : ''} label="Erf size" />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={onReel} className="btn btn-primary text-xs flex-1 justify-center">
            <Video className="w-3.5 h-3.5" /> {project.videoUrl ? 'View reel' : 'Create Reel'}
          </button>
          {project.videoUrl && (
            <button onClick={onPlay} className="btn btn-ghost text-xs" aria-label="Play video">
              <Play className="w-3.5 h-3.5" /> Play
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Listing wizard ─────────────────────────────────────────────────────

interface DraftDetails {
  street: string; suburb: string; city: string; province: string; propertyType: string;
  beds: string; baths: string; garages: string; erf: string; floor: string; price: string;
  features: string[];
}

const emptyDraft: DraftDetails = {
  street: '', suburb: '', city: '', province: 'Western Cape', propertyType: 'House',
  beds: '3', baths: '2', garages: '1', erf: '', floor: '', price: '', features: [],
};

const STEPS = ['Property Details', 'Photos', 'Description', 'Export'];

export function ListingWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user, deductCredits, addCredits } = useCredit();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [d, setD] = useState<DraftDetails>(emptyDraft);
  const set = (k: keyof DraftDetails) => (e: any) => setD(prev => ({ ...prev, [k]: e.target.value }));

  // Step 1 extras — address verification (OSM geocode + amenities)
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<string[]>([]);

  // Step 2 — photos
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const photosInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — AI description
  const [tone, setTone] = useState('Professional');
  const [instructions, setInstructions] = useState('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);

  const [saving, setSaving] = useState(false);

  const fullAddress = [d.street, d.suburb, d.city].filter(Boolean).join(', ');

  const verifyAddress = async () => {
    if (!d.street.trim() || !d.suburb.trim()) {
      toast.error('Enter the street address and suburb first', 'Address required');
      return;
    }
    setVerifying(true);
    try {
      const g = await geocodeAddress(fullAddress);
      if (!g) {
        toast.error('Could not find that address — add the city and try again', 'Address not found');
        return;
      }
      setVerified(g.display);
      toast.success('Location found — address verified', 'Google Maps');
      try {
        const found = await findNearbyAmenities(g.lat, g.lon);
        setAmenities(found);
        if (found.length) toast.success(`${found.length} nearby amenities will enrich your description`, 'Location confirmed');
      } catch {
        // amenities are a nice-to-have — never block the wizard on them
      }
    } catch {
      toast.error('Map lookup failed — please try again', 'Google Maps');
    } finally {
      setVerifying(false);
    }
  };

  const handlePhotos = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setUploading(true);
    try {
      const urls = await uploadImagesForAI(list, user?.id, Math.max(0, 20 - photos.length));
      setPhotos(prev => [...prev, ...urls]);
      toast.success(`${urls.length} photo${urls.length > 1 ? 's' : ''} uploaded`, 'Photos ready');
    } catch (e: any) {
      toast.error(e.message || 'Photo upload failed');
    } finally {
      setUploading(false);
      if (photosInputRef.current) photosInputRef.current.value = '';
    }
  };

  const generateDescription = async () => {
    if (!user) return;
    const cost = DESCRIPTION_RENDER_COST;
    if ((user.credits ?? 0) < cost) {
      toast.error(`Not enough credits — a description costs ${cost} credit. Top up in Billing.`, 'Insufficient credits');
      return;
    }
    setGenerating(true);
    let charged = false;
    try {
      const ok = await deductCredits(cost, 'Property description', { kind: 'PROPERTY_DESCRIPTION' });
      if (!ok) throw new Error('Could not charge your credits');
      charged = true;
      const text = await PropReelAPI.generateText(
        'description',
        {
          tone,
          address: fullAddress || `${d.suburb}, ${d.city}`,
          price: d.price ? `R${Number(d.price).toLocaleString('en-ZA')}` : '',
          bedrooms: d.beds,
          bathrooms: d.baths,
          garages: d.garages,
          property_type: d.propertyType,
          key_features: d.features.join(', '),
          extra_features: instructions,
          nearby_amenities: amenities.join('; '),
          currency: 'ZAR (South African Rand) — always write prices with the decimal system, e.g. R12 500 000,00',
        },
        photos.slice(0, 4)
      );
      setDescription(text.trim());
      toast.success('Description generated', 'Grok AI');
    } catch (e: any) {
      if (charged) await addCredits(cost, 'refund', 'Refund — failed property description').catch(() => {});
      toast.error(e.message ? `${e.message} — your credit was refunded` : 'Description generation failed — your credit was refunded');
    } finally {
      setGenerating(false);
    }
  };

  const next = () => {
    if (step === 0) {
      if (!d.street.trim() || !d.suburb.trim()) {
        toast.error('Street address and suburb are required', 'Missing details');
        return;
      }
      if (!(Number(d.price) > 0)) {
        toast.error('Enter the asking price', 'Missing details');
        return;
      }
    }
    if (step === 2 && !description.trim()) {
      toast.error('Generate (or write) the listing description first', 'Description needed');
      return;
    }
    setStep(s => Math.min(3, s + 1));
  };

  const portalText = (portal: 'property24' | 'privateproperty') => {
    const head =
      portal === 'property24'
        ? `${d.propertyType.toUpperCase()} FOR SALE — ${[d.suburb, d.city].filter(Boolean).join(', ')}`
        : `${d.propertyType} for sale in ${d.suburb || d.city || 'South Africa'}`;
    const specs = [
      d.beds && `${d.beds} bed`,
      d.baths && `${d.baths} bath`,
      d.garages && `${d.garages} garage`,
      d.erf && `Erf ${d.erf} m²`,
      d.floor && `Floor ${d.floor} m²`,
    ].filter(Boolean).join(' | ');
    return [
      head,
      d.price ? `Asking price: R ${Number(d.price).toLocaleString('en-ZA')}` : '',
      specs,
      fullAddress ? `Address: ${fullAddress}` : '',
      '',
      description,
      d.features.length ? `\nKey features: ${d.features.join(', ')}` : '',
      `\nListed by ${user?.fullName || ''} — ${user?.email || ''}`,
    ].filter(l => l !== null).join('\n');
  };

  const saveListing = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await PropReelAPI.createProject({
        userId: user.id,
        title: `${d.propertyType} · ${d.suburb || d.street}`.slice(0, 120),
        address: d.street,
        suburb: d.suburb,
        city: d.city,
        province: d.province,
        price: Number(d.price) || 0,
        bedrooms: Number(d.beds) || 0,
        bathrooms: Number(d.baths) || 0,
        garages: Number(d.garages) || 0,
        propertyType: d.propertyType,
        features: d.features,
        videoTier: 'ESSENTIAL',
        photos,
        description,
        marketStatus: 'ACTIVE',
        erfSize: Number(d.erf) || undefined,
        floorSize: Number(d.floor) || undefined,
      } as any);
      toast.success('Listing saved to your portfolio');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Could not save the listing');
    } finally {
      setSaving(false);
    }
  };

  // Light-card styling — mirrors base44's /listings/new wizard.
  const inputCls = 'input-light w-full';

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex items-center justify-between max-w-2xl mx-auto">
        {STEPS.map((label, i) => (
          <div key={label} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && <div className={`h-0.5 flex-1 mx-2 ${i <= step ? 'bg-purple-600' : 'bg-white/10'}`} />}
            <div className="flex flex-col items-center gap-1">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i < step ? 'bg-purple-700 text-white' : i === step ? 'bg-purple-700/30 border border-purple-500 text-white' : 'bg-white/10 text-ink-400'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`text-[11px] hidden sm:block ${i === step ? 'text-white' : 'text-ink-500'}`}>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* White wizard card */}
      <div className="card-light p-6 sm:p-8 space-y-6 text-ink-900">

      {/* ── Step 1: Property Details ── */}
      {step === 0 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-bold text-ink-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-purple-600" /> Property Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="md:col-span-2 flex gap-2">
                <input className={inputCls} placeholder="Street Address *" value={d.street} onChange={set('street')} />
                <button onClick={verifyAddress} disabled={verifying} className="btn btn-quiet text-sm whitespace-nowrap" title="Confirm the pin on Google Maps">
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Verify
                </button>
              </div>
              <input className={inputCls} placeholder="Suburb *" value={d.suburb} onChange={set('suburb')} />
              <input className={inputCls} placeholder="City" value={d.city} onChange={set('city')} />
              <select className={inputCls} value={d.province} onChange={set('province')} aria-label="Province">
                <option value="">Select province…</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={inputCls} value={d.propertyType} onChange={set('propertyType')} aria-label="Property Type">
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {verified && (
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Verified: {verified}
                {amenities.length > 0 && <span className="text-ink-500">· {amenities.length} amenities found</span>}
              </p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-bold text-ink-900 flex items-center gap-2"><HomeIcon className="w-4 h-4 text-purple-600" /> Property Specs</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <div><label className="label-light">Bedrooms</label><input type="number" min="0" className={inputCls} value={d.beds} onChange={set('beds')} /></div>
              <div><label className="label-light">Bathrooms</label><input type="number" min="0" className={inputCls} value={d.baths} onChange={set('baths')} /></div>
              <div><label className="label-light">Garages</label><input type="number" min="0" className={inputCls} value={d.garages} onChange={set('garages')} /></div>
              <div><label className="label-light">Erf Size (m²)</label><input type="number" min="0" className={inputCls} value={d.erf} onChange={set('erf')} placeholder="600" /></div>
              <div><label className="label-light">Floor Size (m²)</label><input type="number" min="0" className={inputCls} value={d.floor} onChange={set('floor')} placeholder="280" /></div>
              <div><label className="label-light">Asking Price (R) *</label><input type="number" min="0" className={inputCls} value={d.price} onChange={set('price')} placeholder="3500000" /></div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-ink-900 mb-3">Key Features</h3>
            <FeatureChips light selected={d.features} onToggle={f => setD(prev => ({
              ...prev,
              features: prev.features.includes(f) ? prev.features.filter(x => x !== f) : [...prev.features, f],
            }))} />
          </div>
        </div>
      )}

      {/* ── Step 2: Photos ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-ink-900">Listing Photos</h3>
            <p className="text-sm text-ink-600">Upload all photos. You can bulk-edit them with AI before generating your listing.</p>
          </div>
          <label className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-purple-500/40 rounded-xl cursor-pointer hover:border-purple-600 transition bg-purple-50">
            <Upload className="w-7 h-7 text-purple-600" />
            <span className="text-sm text-ink-900 font-medium">Click to upload listing photos</span>
            <span className="text-xs text-ink-500">JPG, PNG up to 25MB each</span>
            <input
              ref={photosInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={e => handlePhotos(e.target.files)}
              disabled={uploading || photos.length >= 20}
            />
          </label>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-ink-900">{photos.length} photo{photos.length === 1 ? '' : 's'} uploaded</p>
            <div className="flex gap-2">
              <button
                onClick={() => { toast.info('Open the Studio photo tab for Bulk AI Edit — your listing photos carry over once saved.', 'AI editing'); navigate('/studio?tab=photo'); }}
                className="btn btn-quiet text-sm"
              >
                <Wand2 className="w-4 h-4" /> Bulk AI Edit
              </button>
              <button
                onClick={() => { toast.info('Virtual Staging lives in the Studio photo tab — stage any uploaded photo there.', 'Virtual staging'); navigate('/studio?tab=photo'); }}
                className="btn text-sm border border-purple-500/50 text-purple-700 hover:bg-purple-50"
              >
                <Sparkles className="w-4 h-4" /> Virtual Staging
              </button>
            </div>
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {photos.map((url, i) => (
                <div key={url + i} className="relative group aspect-square rounded-lg overflow-hidden bg-ink-100">
                  <img src={url} alt={`Listing photo ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 rounded px-1">{i + 1}</span>
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 p-1 rounded bg-black/70 text-red-400 opacity-0 group-hover:opacity-100 transition"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploading && <p className="text-xs text-purple-600 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</p>}
        </div>
      )}

      {/* ── Step 3: Description ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-ink-900">Generate Description</h3>
            <p className="text-sm text-ink-600">Choose a tone, add any extra instructions, then generate your listing description with AI.</p>
          </div>

          <div>
            <label className="label-light">Choose description tone</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TONES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className={`text-left rounded-xl border p-3 transition ${
                    tone === t.id ? 'border-purple-600 bg-purple-50' : 'border-ink-200 bg-white hover:border-purple-500'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <span>{t.icon}</span> {TONE_BLURBS[t.id] ? `${t.label}` : t.label}
                    {tone === t.id && <Check className="w-4 h-4 text-purple-600 ml-auto" />}
                  </span>
                  <span className="block text-xs text-ink-600 mt-1">{TONE_BLURBS[t.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label-light">Additional AI instructions (optional)</label>
            <input
              className="input-light w-full"
              placeholder="e.g. Emphasise the mountain views, mention the excellent school catchment…"
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
            />
          </div>

          <button onClick={generateDescription} disabled={generating} className="btn btn-primary w-full">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating with Grok…</> : <><Sparkles className="w-4 h-4" /> Generate Description · ⚡{DESCRIPTION_RENDER_COST}</>}
          </button>

          {description && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="label-light mb-0">Generated Description</label>
                <button
                  onClick={() => { navigator.clipboard.writeText(description); toast.success('Copied to clipboard'); }}
                  className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>
              <textarea
                className="input-light w-full h-56 leading-relaxed"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
              <p className="text-xs text-ink-500">{description.length} characters · You can edit the description directly above</p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Export ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-bold text-ink-900">Export Listing</h3>
            <p className="text-sm text-ink-600">Export your listing description and photos for South African property portals.</p>
          </div>

          <div className="bg-ink-50 rounded-xl p-4">
            <h4 className="font-semibold text-ink-900 mb-3">Listing Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-sm">
              <p className="text-ink-600">Type: <span className="text-ink-900">{d.propertyType}</span></p>
              <p className="text-ink-600">Price: <span className="text-purple-700 font-semibold">{d.price ? formatZar(Number(d.price)) : '—'}</span></p>
              <p className="text-ink-600">Beds: <span className="text-ink-900">{d.beds || '—'}</span></p>
              <p className="text-ink-600">Baths: <span className="text-ink-900">{d.baths || '—'}</span></p>
              <p className="text-ink-600">Garages: <span className="text-ink-900">{d.garages || '—'}</span></p>
              <p className="text-ink-600">Erf: <span className="text-ink-900">{d.erf ? `${d.erf}m²` : '—'}</span></p>
              <p className="text-ink-600">Suburb: <span className="text-ink-900">{d.suburb || '—'}</span></p>
              <p className="text-ink-600">Photos: <span className="text-ink-900">{photos.length}</span></p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-ink-900 mb-1">Export for Portal</h4>
            <p className="text-xs text-ink-600 mb-3">Download a formatted text file optimised for each portal's listing requirements.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-ink-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-ink-900 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline" /> Property24</p>
                <p className="text-xs text-ink-600">SA's largest property portal. Formatted for their listing submission requirements.</p>
                <button onClick={() => downloadText('property24-listing.txt', portalText('property24'))} className="btn w-full bg-red-600 hover:bg-red-500 text-white text-sm">
                  <Download className="w-4 h-4" /> Download for Property24
                </button>
              </div>
              <div className="bg-ink-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-ink-900 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline" /> Private Property</p>
                <p className="text-xs text-ink-600">Second-largest SA portal. Optimised description length and feature format.</p>
                <button onClick={() => downloadText('privateproperty-listing.txt', portalText('privateproperty'))} className="btn w-full bg-blue-600 hover:bg-blue-500 text-white text-sm">
                  <Download className="w-4 h-4" /> Download for Private Property
                </button>
              </div>
            </div>
          </div>

          <div className="bg-ink-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-ink-900 flex items-center gap-2"><FileText className="w-4 h-4 text-purple-600" /> Listing Description</h4>
              <button
                onClick={() => { navigator.clipboard.writeText(description); toast.success('Copied to clipboard'); }}
                className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" /> Copy all
              </button>
            </div>
            <p className="text-sm text-ink-700 leading-relaxed line-clamp-5">
              {description || 'No description yet — go back a step and generate one.'}
            </p>
          </div>
        </div>
      )}

      {/* Wizard nav */}
      <div className="flex items-center justify-between pt-4 border-t border-ink-200">
        <button onClick={() => (step === 0 ? onClose() : setStep(s => s - 1))} className="btn btn-quiet text-sm">
          <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          <button onClick={next} className="btn btn-primary text-sm">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={saveListing} disabled={saving} className="btn btn-primary text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Listing
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

/**
 * Full-page New Listing flow — /dashboard/listings/new.
 * Mirrors base44's listings/new: stepper on the dark backdrop, white wizard card.
 */
export function NewListingPage() {
  const navigate = useNavigate();
  const goBack = () => navigate('/dashboard/listings');
  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">New Listing</h1>
          <p className="text-sm text-ink-400">Property details → photos → AI description → portal export.</p>
        </div>
        <button onClick={goBack} className="btn btn-ghost text-sm">
          <ChevronLeft className="w-4 h-4" /> All listings
        </button>
      </div>
      <ListingWizard onClose={goBack} onSaved={goBack} />
    </div>
  );
}

export default function PropertyListings() {
  const { user } = useCredit();
  const toast = useToast();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tab, setTab] = useState<'listings' | 'videos'>('listings');
  const [filter, setFilter] = useState<'ALL' | MarketStatus>('ALL');
  const [sort, setSort] = useState<'new' | 'old' | 'price'>('new');
  const [player, setPlayer] = useState<Project | null>(null);

  const load = () => {
    if (!user?.id) return;
    PropReelAPI.listProjects(user.id)
      .then(list => setProjects([...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))))
      .catch(() => { setProjects([]); toast.error('Could not load your listings'); });
  };
  useEffect(load, [user?.id]);

  const stats = useMemo(() => {
    const list = projects || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let active = 0, sold = 0, revenueThisMonth = 0;
    for (const p of list) {
      const s = marketState(p);
      if (s === 'ACTIVE') active++;
      if (s === 'SOLD') {
        sold++;
        const soldTs = Date.parse(p.soldAt || p.updatedAt || '');
        if (!Number.isNaN(soldTs) && soldTs >= monthStart) revenueThisMonth += Number(p.price) || 0;
      }
    }
    return { active, sold, revenueThisMonth };
  }, [projects]);

  const filtered = useMemo(() => {
    let list = projects || [];
    if (tab === 'videos') return list.filter(p => !!p.videoUrl);
    if (filter !== 'ALL') list = list.filter(p => marketState(p) === filter);
    if (sort === 'old') list = [...list].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (sort === 'price') list = [...list].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    return list;
  }, [projects, tab, filter, sort]);

  const setStatus = async (p: Project, status: MarketStatus) => {
    try {
      await PropReelAPI.updateProject(user!.id, p.id, {
        marketStatus: status,
        ...(status === 'SOLD' ? { soldAt: new Date().toISOString() } : {}),
      } as any);
      toast.success(`Marked as ${status.toLowerCase()}`);
      load();
    } catch {
      toast.error('Could not update the listing');
    }
  };

  const remove = async (p: Project) => {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      await PropReelAPI.deleteProject(user!.id, p.id);
      toast.success('Listing deleted');
      load();
    } catch {
      toast.error('Could not delete the listing');
    }
  };

  const FILTERS: Array<'ALL' | MarketStatus> = ['ALL', 'ACTIVE', 'DRAFT', 'SOLD', 'EXPIRED'];

  if (projects === null) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="card-dark p-10 text-center">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Property Listings</h1>
          <p className="text-sm text-ink-400">Manage your portfolio and trigger video creation.</p>
        </div>
        <button onClick={() => navigate('/dashboard/listings/new')} className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" /> New Listing
        </button>
      </div>

      <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-dark p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center"><HomeIcon className="w-5 h-5 text-purple-400" /></span>
              <div><p className="text-xs text-ink-400">Active Listings</p><p className="text-2xl font-bold text-white">{stats.active}</p></div>
            </div>
            <div className="card-dark p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center"><TrendIcon /></span>
              <div><p className="text-xs text-ink-400">Monthly Revenue</p><p className="text-2xl font-bold text-white">{formatZar(stats.revenueThisMonth)}</p></div>
            </div>
            <div className="card-dark p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><Check className="w-5 h-5 text-blue-400" /></span>
              <div><p className="text-xs text-ink-400">Properties Sold</p><p className="text-2xl font-bold text-white">{stats.sold}</p></div>
            </div>
          </div>

          {/* Tabs: listings vs rendered videos (media player) */}
          <div className="flex gap-2">
            {(['listings', 'videos'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`tab-pill ${tab === t ? 'tab-pill-active' : ''}`}>
                {t === 'listings' ? 'Listings' : <span className="inline-flex items-center gap-1"><Video className="w-3.5 h-3.5" /> Rendered Videos</span>}
              </button>
            ))}
          </div>

          {tab === 'listings' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1 bg-ink-800/60 rounded-xl p-1">
                {FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      filter === f ? 'bg-purple-700 text-white' : 'text-ink-400 hover:text-white'
                    }`}
                  >
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <select className="input w-auto text-sm" value={sort} onChange={e => setSort(e.target.value as any)} aria-label="Sort listings">
                <option value="new">Newest first</option>
                <option value="old">Oldest first</option>
                <option value="price">Price: high to low</option>
              </select>
            </div>
          )}

          {/* Empty states */}
          {filtered.length === 0 && (
            <div className="card-dark p-10 text-center">
              <p className="text-white font-medium">
                {tab === 'videos' ? 'No rendered videos yet' : filter === 'ALL' ? 'No listings yet' : `No ${filter.toLowerCase()} listings`}
              </p>
              <p className="text-ink-400 text-sm mt-1 mb-4">
                {tab === 'videos'
                  ? 'Render a reel from any listing and it will play here.'
                  : 'Add your first property — the wizard takes under a minute.'}
              </p>
              {tab === 'listings' && (
                <button onClick={() => navigate('/dashboard/listings/new')} className="btn btn-primary text-sm">
                  <Plus className="w-4 h-4" /> New Listing
                </button>
              )}
            </div>
          )}

          {/* Cards */}
          {tab === 'listings' && filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(p => (
                <ListingCard
                  key={p.id}
                  project={p}
                  onPlay={() => setPlayer(p)}
                  onReel={() => navigate(p.videoUrl ? '/dashboard/projects' : '/studio')}
                  onStatus={s => setStatus(p, s)}
                  onDelete={() => remove(p)}
                />
              ))}
            </div>
          )}

          {/* Videos tab — every rendered reel plays inline */}
          {tab === 'videos' && filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(p => (
                <div key={p.id} className="card-dark overflow-hidden">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    controls
                    preload="metadata"
                    poster={p.thumbnailUrl || undefined}
                    src={p.videoUrl!}
                    className="w-full aspect-video bg-black"
                  />
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{p.title}</p>
                      <p className="text-xs text-ink-500">{p.kind === 'FLASHHEAD' ? 'Talking Head' : 'Reel'}{p.durationSeconds ? ` · ${Math.round(p.durationSeconds)}s` : ''}</p>
                    </div>
                    <button onClick={() => setPlayer(p)} className="btn btn-ghost text-xs flex-shrink-0">
                      <ArrowRight className="w-3.5 h-3.5" /> Expand
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </>

      {player && <VideoLightbox project={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}

/** Small trend glyph for the revenue stat (kept local to avoid an import clash). */
function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

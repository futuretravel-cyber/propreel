import { useState } from 'react';

interface SmartImageProps {
  name: string; // file base in /images, e.g. "hero-cape-town"
  alt: string;
  className?: string;
  sizes?: string;
  eager?: boolean;
  width?: number;
  height?: number;
}

const SRCSET = (name: string) =>
  `/images/${name}-480.webp 480w, /images/${name}-800.webp 800w, /images/${name}-1200.webp 1200w`;

/**
 * Responsive WebP image from /images with srcset + lazy loading.
 * width/height reserve space to prevent layout shift (CLS).
 */
export function SmartImage({ name, alt, className, sizes = '(max-width: 768px) 100vw, 50vw', eager, width = 1200, height = 675 }: SmartImageProps) {
  return (
    <img
      src={`/images/${name}-800.webp`}
      srcSet={SRCSET(name)}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      className={className}
    />
  );
}

/**
 * Before/After draggable comparison slider.
 */
export function BeforeAfterSlider({
  before,
  after,
  afterVideo,
  aspect = 'aspect-video',
  beforeLabel = 'Before',
  afterLabel = 'After',
  className = '',
}: {
  before: string;
  after: string;
  /** Optional looping video for the "after" side (e.g. an AI-rendered reel) */
  afterVideo?: string;
  /** Tailwind aspect class — match it to your media (aspect-video for 16:9, aspect-[9/16] for portrait) */
  aspect?: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);

  const move = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div
      className={`relative select-none cursor-ew-resize overflow-hidden rounded-2xl ${className}`}
      onPointerDown={e => { setDragging(true); move(e.clientX, e.currentTarget); }}
      onPointerMove={e => dragging && move(e.clientX, e.currentTarget)}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuenow={Math.round(pos)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') setPos(p => Math.max(0, p - 5));
        if (e.key === 'ArrowRight') setPos(p => Math.min(100, p + 5));
      }}
    >
      {/* Full-size media stack — both layers always render at container size.
          The clip-path on the before layer (not a resized duplicate) keeps
          both sides pixel-identical and sharp at any width or DPR. */}
      {afterVideo ? (
        <video
          src={afterVideo}
          poster={after}
          className={`w-full ${aspect} object-cover`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          draggable={false}
        />
      ) : (
        <img src={after} alt={afterLabel} className={`w-full ${aspect} object-cover`} draggable={false} />
      )}
      <img
        src={before}
        alt={beforeLabel}
        className={`absolute inset-0 w-full ${aspect} object-cover`}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      {/* Handle */}
      <div className="absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="h-full w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700 text-sm font-bold">
          ⇔
        </div>
      </div>
      <span className="absolute top-3 left-3 bg-black/60 text-white text-xs font-semibold px-2.5 py-1 rounded-full">{beforeLabel}</span>
      <span className="absolute top-3 right-3 bg-purple-700 text-white text-xs font-semibold px-2.5 py-1 rounded-full">{afterLabel}</span>
    </div>
  );
}

/**
 * Showreel video with graceful fallback when no video asset exists yet.
 */
export function ShowreelVideo({ src, poster, className = '' }: { src?: string; poster: string; className?: string }) {
  if (!src) {
    // No showreel asset yet — show the photo clean. A "coming soon" overlay
    // advertises an unfinished product to prospective buyers.
    return <img src={poster} alt="Property" className={`w-full aspect-video object-cover ${className}`} />;
  }
  return (
    <video
      className={className}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-label="PropReel showreel"
    />
  );
}

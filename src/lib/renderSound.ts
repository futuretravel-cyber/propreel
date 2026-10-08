/**
 * Short two-note "render complete" chime (WebAudio, no asset file to ship).
 *
 * Plays for every finished render — video reel, photo edit, AI Avatar Video.
 * Browsers allow this because the AudioContext is created/resumed after the
 * user has already interacted with the page (they clicked Generate), which
 * satisfies the autoplay policy's sticky-activation rule. Everything is
 * wrapped so a blocked/paused context can never break the success path.
 */

let ctx: AudioContext | null = null;

export function playRenderComplete(): void {
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const c = ctx;
    const start = c.currentTime;
    // Rising major-sixth pair — audible but gentle, even over muted tabs
    // (a suspended context simply stays silent; nothing throws).
    [880, 1318.51].forEach((freq, i) => {
      const t = start + i * 0.13;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  } catch {
    /* sound is a nicety — never let it break a completed render */
  }
}

export default playRenderComplete;

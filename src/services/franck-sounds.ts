/**
 * Franck Sounds — subtle WebAudio chimes, no external assets.
 *
 * All sounds gated behind a user-toggleable preference stored in localStorage.
 * Honors prefers-reduced-motion as a default-off signal.
 */

const STORAGE_KEY = 'franck-sounds-enabled';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    // Default on, unless user prefers reduced motion
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
  return stored === '1';
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
}

/** Generic envelope-shaped tone */
function tone(
  freq: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number; attack?: number; release?: number; delay?: number } = {},
) {
  const ac = getCtx();
  if (!ac) return;
  const { type = 'sine', gain = 0.06, attack = 0.005, release = 0.12, delay = 0 } = opts;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.linearRampToValueAtTime(0, t0 + duration + release);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + release + 0.02);
}

/** Soft chime when an assistant message arrives */
export function playMessage(): void {
  if (!isSoundEnabled()) return;
  tone(880, 0.08, { type: 'sine', gain: 0.04 });
  tone(1320, 0.08, { type: 'sine', gain: 0.025, delay: 0.04 });
}

/** Tiny tap when user sends a message */
export function playSend(): void {
  if (!isSoundEnabled()) return;
  tone(660, 0.05, { type: 'triangle', gain: 0.03 });
}

/** Triumphant flourish when a major task completes */
export function playFlourish(): void {
  if (!isSoundEnabled()) return;
  // C-E-G-C arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    tone(f, 0.12, { type: 'triangle', gain: 0.05, delay: i * 0.07 });
  });
}

/** Sad descending bloop on error */
export function playError(): void {
  if (!isSoundEnabled()) return;
  tone(440, 0.08, { type: 'sawtooth', gain: 0.04 });
  tone(330, 0.12, { type: 'sawtooth', gain: 0.04, delay: 0.08 });
}

/** Resume the audio context — call from a user gesture (e.g. opening chat) */
export function primeAudio(): void {
  const ac = getCtx();
  if (ac && ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
}

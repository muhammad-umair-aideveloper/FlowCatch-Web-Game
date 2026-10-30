/**
 * soundEngine.ts
 * Zero-asset procedural Web Audio API synthesizer for the Conveyor Belt Sorter.
 * All sounds are generated purely from oscillators, noise, and gain nodes.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** Smooth gain ramp helper */
function ramp(gain: GainNode, from: number, to: number, duration: number): void {
  const c = getCtx();
  gain.gain.setValueAtTime(from, c.currentTime);
  gain.gain.linearRampToValueAtTime(to, c.currentTime + duration);
}

// ─── Belt Hum (looping ambient) ───────────────────────────────────────────────

let beltOsc: OscillatorNode | null = null;
let beltGain: GainNode | null = null;

export function startBeltHum(): void {
  const c = getCtx();
  if (beltOsc) return; // already running

  beltGain = c.createGain();
  beltGain.gain.setValueAtTime(0.0, c.currentTime);
  beltGain.gain.linearRampToValueAtTime(0.04, c.currentTime + 1.0);

  beltOsc = c.createOscillator();
  beltOsc.type = 'sawtooth';
  beltOsc.frequency.setValueAtTime(55, c.currentTime);        // sub-bass hum
  beltOsc.frequency.linearRampToValueAtTime(58, c.currentTime + 2);

  // Low-pass filter to make it muffled/mechanical
  const lpf = c.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(200, c.currentTime);
  lpf.Q.setValueAtTime(8, c.currentTime);

  beltOsc.connect(lpf);
  lpf.connect(beltGain);
  beltGain.connect(c.destination);
  beltOsc.start();
}

export function stopBeltHum(): void {
  if (!beltGain || !beltOsc) return;
  const c = getCtx();
  beltGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
  const o = beltOsc;
  setTimeout(() => { try { o.stop(); } catch (_) {} }, 600);
  beltOsc = null;
  beltGain = null;
}

// ─── Pickup Pop ───────────────────────────────────────────────────────────────

export function playPickup(): void {
  const c = getCtx();
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, c.currentTime);
  osc.frequency.linearRampToValueAtTime(680, c.currentTime + 0.05);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.13);
}

// ─── Drop / Sort Sound ────────────────────────────────────────────────────────

export function playDrop(): void {
  const c = getCtx();
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.25, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);

  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(340, c.currentTime);
  osc.frequency.linearRampToValueAtTime(180, c.currentTime + 0.18);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.2);
}

// ─── Correct Sort Chime ───────────────────────────────────────────────────────

const CHIME_NOTES = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

export function playCorrect(streakCount: number = 1): void {
  const c = getCtx();
  // Higher streak → play more notes of the chord
  const noteCount = Math.min(streakCount, CHIME_NOTES.length);

  for (let i = 0; i < noteCount; i++) {
    const startT = c.currentTime + i * 0.08;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(0.18, startT + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.4);

    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(CHIME_NOTES[i]!, startT);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startT);
    osc.stop(startT + 0.42);
  }
}

// ─── Wrong Sort Buzzer ────────────────────────────────────────────────────────

export function playError(): void {
  const c = getCtx();
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.setValueAtTime(0.25, c.currentTime + 0.05);
  gain.gain.setValueAtTime(0.3, c.currentTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);

  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(110, c.currentTime);
  osc.frequency.setValueAtTime(100, c.currentTime + 0.05);
  osc.frequency.setValueAtTime(110, c.currentTime + 0.1);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.36);
}

// ─── Incinerator Woosh ────────────────────────────────────────────────────────

export function playIncinerate(): void {
  const c = getCtx();
  // White noise burst
  const bufLen = c.sampleRate * 0.3;
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = c.createBufferSource();
  source.buffer = buf;

  const lpf = c.createBiquadFilter();
  lpf.type = 'bandpass';
  lpf.frequency.setValueAtTime(800, c.currentTime);
  lpf.frequency.linearRampToValueAtTime(200, c.currentTime + 0.3);
  lpf.Q.setValueAtTime(2, c.currentTime);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.4, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);

  source.connect(lpf);
  lpf.connect(gain);
  gain.connect(c.destination);
  source.start();
  source.stop(c.currentTime + 0.31);
}

// ─── Shift Complete Fanfare ───────────────────────────────────────────────────

export function playShiftComplete(): void {
  const c = getCtx();
  const melody = [
    { freq: 523.25, t: 0 },     // C5
    { freq: 659.25, t: 0.12 },  // E5
    { freq: 783.99, t: 0.24 },  // G5
    { freq: 1046.5, t: 0.36 },  // C6
    { freq: 1318.5, t: 0.5 },   // E6
  ];

  melody.forEach(({ freq, t }) => {
    const startT = c.currentTime + t;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(0.2, startT + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.35);

    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startT);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startT);
    osc.stop(startT + 0.36);
  });
}

// ─── Speed Surge Warning ──────────────────────────────────────────────────────

export function playSpeedSurge(): void {
  const c = getCtx();
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.2, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, c.currentTime);
  osc.frequency.linearRampToValueAtTime(440, c.currentTime + 0.5);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.51);
}

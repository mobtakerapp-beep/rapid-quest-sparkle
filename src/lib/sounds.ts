// Tiny synthesized sound effects using Web Audio API (no asset needed)
let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch { return null; }
  }
  return _ctx;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.15) {
  const c = ctx(); if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => undefined);
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export function playLoginSound() {
  // Cheerful ascending arpeggio: C5, E5, G5, C6
  tone(523.25, 0, 0.15, "triangle");
  tone(659.25, 0.12, 0.15, "triangle");
  tone(783.99, 0.24, 0.15, "triangle");
  tone(1046.5, 0.36, 0.3, "triangle", 0.18);
}

export function playLogoutSound() {
  // Soft descending tones
  tone(587.33, 0, 0.18, "sine", 0.12);
  tone(440, 0.15, 0.25, "sine", 0.12);
}

export function playSuccessSound() {
  tone(880, 0, 0.1, "triangle");
  tone(1318.5, 0.1, 0.2, "triangle");
}

export function playNotificationSound() {
  tone(987.77, 0, 0.08, "sine", 0.14);
  tone(1318.5, 0.08, 0.16, "sine", 0.14);
}

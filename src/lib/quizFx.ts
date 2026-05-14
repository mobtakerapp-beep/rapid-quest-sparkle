// Sound + visual celebration utilities for quizzes & competitions.
// Sounds are generated via WebAudio so no audio assets are needed.

import confetti from "canvas-confetti";

let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      _ctx = AC ? new AC() : null;
    } catch { _ctx = null; }
  }
  if (_ctx && _ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

function tone(freq: number, duration = 0.12, type: OscillatorType = "sine", gain = 0.06, when = 0) {
  const ac = ctx(); if (!ac) return;
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0); osc.stop(t0 + duration + 0.02);
}

/** Soft tick for the timer (called every second). Louder for last 5 seconds. */
export function playTick(remaining: number) {
  if (remaining <= 0) return;
  if (remaining <= 5) tone(880, 0.09, "square", 0.08);
  else tone(660, 0.04, "triangle", 0.025);
}

/** Short upbeat chime for a correct answer. */
export function playCorrect() {
  tone(784, 0.1, "triangle", 0.08, 0);     // G5
  tone(988, 0.12, "triangle", 0.08, 0.08); // B5
  tone(1318, 0.18, "triangle", 0.08, 0.18); // E6
}

/** Soft fail tone. */
export function playWrong() {
  tone(294, 0.18, "sawtooth", 0.05, 0);
  tone(196, 0.22, "sawtooth", 0.05, 0.12);
}

/** Victory fanfare. */
export function playFanfare() {
  const notes = [523, 659, 784, 1046];
  notes.forEach((f, i) => tone(f, 0.18, "triangle", 0.08, i * 0.13));
}

/** Small star burst. */
export function burstStars(opts?: { x?: number; y?: number }) {
  const origin = { x: opts?.x ?? 0.5, y: opts?.y ?? 0.5 };
  confetti({
    particleCount: 50,
    spread: 70,
    startVelocity: 35,
    scalar: 1.1,
    shapes: ["star"],
    colors: ["#FFD700", "#FFA500", "#FF6B6B", "#4ECDC4", "#A78BFA"],
    origin,
  });
}

/** Big fireworks finale, scaled by [intensity 0..1]. */
export function fireworks(intensity = 1) {
  const duration = 1500 + intensity * 1500;
  const end = Date.now() + duration;
  const colors = ["#FFD700", "#FF6B6B", "#4ECDC4", "#A78BFA", "#34D399", "#F472B6"];
  (function frame() {
    confetti({
      particleCount: Math.round(4 + intensity * 6),
      angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors,
    });
    confetti({
      particleCount: Math.round(4 + intensity * 6),
      angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  // central star pop
  confetti({
    particleCount: Math.round(80 * intensity),
    spread: 100, startVelocity: 45, shapes: ["star"], colors,
    origin: { x: 0.5, y: 0.5 },
  });
}

/* ============================================================================
   CHESS — sounds built on the shared Web Audio synthesizer: wooden piece
   set-downs that vary by piece, captures, castling, check, promotion, clock,
   game over, a fireplace crackle bed.
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.CHESS, ZEUS = root.ZEUS;
  const A = C.audio = new ZEUS.AudioEngine();
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const PITCH = { K: 150, Q: 175, R: 200, B: 240, N: 265, P: 310 };

  A.clack = function (code, gain) {
    if (!this.ready) return; const t = this.now(), f = (PITCH[code] || 240) * (0.96 + Math.random() * 0.08), g = gain || 1;
    this.noise({ t: t, type: 'lowpass', freq: 1400, freqEnd: 500, sweep: 0.03, gain: 0.45 * g, dur: 0.012, d: 0.025, s: 0.2, r: 0.03 });
    this.tone({ t: t, freq: f, freqEnd: f * 0.8, sweep: 0.05, gain: 0.22 * g, a: 0.001, d: 0.06, s: 0.05, r: 0.05, dur: 0.06 });
    this.tone({ t: t + 0.002, type: 'triangle', freq: f * 3.1, gain: 0.06 * g, a: 0.001, d: 0.03, s: 0.02, r: 0.03, dur: 0.03 });
    this.noise({ t: t + 0.004, type: 'bandpass', freq: 650, Q: 4, gain: 0.12 * g, dur: 0.02, d: 0.04, s: 0.1, r: 0.05, send: 0.3 });
  };
  A.move = function (code) { this.clack(code, 1); };
  A.capture = function (code) { if (!this.ready) return; this.clack(code, 1.1); const t = this.now(); this.thump(t + 0.01, { freq: 95, gain: 0.3, dur: 0.08 }); this.noise({ t: t + 0.06, type: 'lowpass', freq: 900, gain: 0.25, dur: 0.01, d: 0.02, s: 0.1, r: 0.03 }); };
  A.castle = function () { if (!this.ready) return; this.clack('K', 0.9); setTimeout(() => this.clack('R', 0.8), 110); };
  A.check = function () { if (!this.ready) return; const t = this.now(); this.bell(midi(88), t, { gain: 0.09, dur: 1.1 }); this.bell(midi(93), t + 0.06, { gain: 0.05, dur: 0.9 }); };
  A.promote = function () { if (!this.ready) return; const t = this.now(); [76, 80, 83, 88].forEach((n, i) => this.bell(midi(n), t + i * 0.07, { gain: 0.08, dur: 1.0 })); };
  A.illegal = function () { if (!this.ready) return; this.tone({ t: this.now(), type: 'square', freq: 160, gain: 0.05, a: 0.004, d: 0.1, s: 0.4, r: 0.05, dur: 0.12, filter: { type: 'lowpass', freq: 800 } }); };
  A.pickup = function () { if (!this.ready) return; this.noise({ t: this.now(), type: 'highpass', freq: 2500, gain: 0.08, dur: 0.006, d: 0.01, s: 0.1, r: 0.01 }); };
  A.hint = function () { if (!this.ready) return; const t = this.now(); this.bell(midi(84), t, { gain: 0.06, dur: 0.8 }); this.bell(midi(91), t + 0.1, { gain: 0.05, dur: 0.8 }); };
  A.tick = function () { if (!this.ready) return; this.noise({ t: this.now(), type: 'highpass', freq: 3000, gain: 0.12, dur: 0.004, d: 0.006, s: 0.1, r: 0.01 }); this.tone({ t: this.now(), freq: 1900, gain: 0.03, a: 0.001, d: 0.02, s: 0.05, r: 0.01, dur: 0.02 }); };
  A.lowTime = function () { if (!this.ready) return; this.tone({ t: this.now(), freq: 1046, gain: 0.08, a: 0.002, d: 0.08, s: 0.1, r: 0.05, dur: 0.08 }); };
  A.gameOver = function (kind) {
    if (!this.ready) return; const t = this.now();
    if (kind === 'win') { [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]].forEach((ch, k) => ch.forEach(n => this.brass(midi(n), t + k * 0.32, k === 3 ? 1.4 : 0.28, 0.08))); this.bell(midi(84), t + 1.0, { gain: 0.1, dur: 1.5 }); }
    else if (kind === 'loss') { [67, 63, 60, 55].forEach((n, i) => this.tone({ t: t + i * 0.35, type: 'triangle', freq: midi(n), gain: 0.12, a: 0.02, d: 0.3, s: 0.4, r: 0.3, dur: 0.3, send: 0.5 })); }
    else { [60, 64, 67, 72].forEach(n => this.pad([midi(n)], t, 1.6, 0.05, { cut: 1500, a: 0.2, r: 0.8 })); }
  };
  A.click = function () { if (!this.ready) return; this.noise({ t: this.now(), type: 'highpass', freq: 2500, gain: 0.12, dur: 0.01, d: 0.012, s: 0.2, r: 0.02 }); };
  /* fireplace crackle bed */
  A.startAmbience = function () {
    if (!this.ready || this._amb) return; const ctx = this.ctx, t = this.now();
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.music); src.start(t); g.gain.setTargetAtTime(0.02, t, 2);
    this._amb = { src: src, g: g, timer: setInterval(() => { if (Math.random() < 0.6) this.noise({ t: this.now() + Math.random() * 0.4, type: 'bandpass', freq: 1800 + Math.random() * 2500, Q: 3, gain: 0.02 + Math.random() * 0.03, dur: 0.008, d: 0.015, s: 0.1, r: 0.02, dest: this.music }); }, 260) };
  };
  A.stopAmbience = function () { const a = this._amb; if (!a) return; clearInterval(a.timer); a.g.gain.setTargetAtTime(0, this.now(), 0.5); a.src.stop(this.now() + 2); this._amb = null; };
})(window);

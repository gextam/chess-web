/* ============================================================================
   CHESS — board renderer: study backdrop, walnut frame with coordinates,
   wood-textured squares, highlights (last move, selection, legal targets,
   check, hint arrow), pieces with shadows, lifted/dragged pieces and move
   animations (slide, capture knock-away, castling, promotion morph).
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.CHESS, A = C.assets;
  const W = 1920, H = 1080;
  const BOARD = { x: 156, y: 124, sq: 104 }; BOARD.size = BOARD.sq * 8; const FRAME = 46;
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';
  C.LAYOUT = { W: W, H: H, BOARD: BOARD, FRAME: FRAME };
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const ease = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

  function Renderer(canvas, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.game = game;
    this.scale = 1; this.dpr = 1; this.flip = false; this.anims = []; this.drag = null; this.hint = null; this.time = 0;
    this.seed = []; for (let i = 0; i < 64; i++) this.seed.push([Math.random(), Math.random(), Math.random()]);
    this.resize(); root.addEventListener('resize', () => this.resize());
  }
  const P = Renderer.prototype;
  P.resize = function () {
    const vw = root.innerWidth, vh = root.innerHeight, s = Math.min(vw / W, vh / H);
    this.scale = s; this.dpr = Math.min(2, root.devicePixelRatio || 1);
    const stage = document.getElementById('stage'); if (stage) stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    this.canvas.width = Math.round(W * s * this.dpr); this.canvas.height = Math.round(H * s * this.dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
  };
  /* square (0x88) <-> board pixel centre, honouring the flip */
  P.sqRect = function (sq) {
    let f = C.FILE(sq), r = C.RANK(sq);
    const col = this.flip ? 7 - f : f, row = this.flip ? r : 7 - r;
    return { x: BOARD.x + col * BOARD.sq, y: BOARD.y + row * BOARD.sq, w: BOARD.sq, h: BOARD.sq, cx: BOARD.x + (col + 0.5) * BOARD.sq, cy: BOARD.y + (row + 0.5) * BOARD.sq };
  };
  P.sqAt = function (x, y) {
    const col = Math.floor((x - BOARD.x) / BOARD.sq), row = Math.floor((y - BOARD.y) / BOARD.sq);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    const f = this.flip ? 7 - col : col, r = this.flip ? row : 7 - row; return C.SQ(f, r);
  };
  P.animateMove = function (piece, from, to, o) {
    o = o || {}; const a = this.sqRect(from), b = this.sqRect(to);
    this.anims.push({ kind: 'slide', piece: piece, from: from, to: to, x0: a.cx, y0: a.cy, x1: b.cx, y1: b.cy, t: 0, dur: o.dur || 0.28, morph: o.morph || null, hideTo: true });
  };
  P.animateCapture = function (piece, sq, toward) {
    const a = this.sqRect(sq), dir = toward === 'white' ? 1 : -1;
    this.anims.push({ kind: 'knock', piece: piece, sq: sq, x0: a.cx, y0: a.cy, x1: this.flip ? BOARD.x - 60 : BOARD.x + BOARD.size + 60, y1: a.cy + dir * (this.flip ? -1 : 1) * 60, t: -0.05, dur: 0.6, rot: (Math.random() - 0.5) * 1.6 });
  };
  P.animating = function () { return this.anims.some(a => a.kind === 'slide'); };
  P.update = function (dt) { this.anims = this.anims.filter(a => (a.t += dt) < a.dur); };

  P.draw = function (now) {
    const ctx = this.ctx, S = this.scale * this.dpr; this.time = now;
    ctx.setTransform(S, 0, 0, S, 0, 0);
    this.drawBackground(ctx); this.drawFrame(ctx); this.drawSquares(ctx); this.drawHighlights(ctx); this.drawPieces(ctx); this.drawArrow(ctx);
  };
  P.drawBackground = function (ctx) {
    const img = A.image('bg'); ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, W, H);
    if (img) { const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); }
    const v = ctx.createRadialGradient(BOARD.x + BOARD.size / 2, BOARD.y + BOARD.size / 2, 300, W / 2, H / 2, 1300); v.addColorStop(0, 'rgba(0,0,0,0.05)'); v.addColorStop(1, 'rgba(0,0,0,0.7)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  };
  P.drawFrame = function (ctx) {
    const x = BOARD.x - FRAME, y = BOARD.y - FRAME, w = BOARD.size + 2 * FRAME, h = w, walnut = A.image('walnut');
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 26; ctx.fillStyle = '#1a0e06'; roundRect(ctx, x, y, w, h, 14); ctx.fill(); ctx.restore();
    ctx.save(); roundRect(ctx, x, y, w, h, 14); ctx.clip();
    if (walnut) { ctx.drawImage(walnut, x, y, w, h); } else { ctx.fillStyle = '#3b1f0e'; ctx.fillRect(x, y, w, h); }
    let g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,230,190,0.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    /* bevels */
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,220,170,0.35)'; roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 13); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(BOARD.x - 2, BOARD.y - 2, BOARD.size + 4, BOARD.size + 4);
    g = ctx.createLinearGradient(0, BOARD.y - 8, 0, BOARD.y); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = g; ctx.fillRect(BOARD.x - 8, BOARD.y - 8, BOARD.size + 16, 8);
    /* coordinates */
    ctx.save(); ctx.font = '600 20px ' + SERIF; ctx.fillStyle = 'rgba(245,225,190,0.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    for (let i = 0; i < 8; i++) {
      const file = 'abcdefgh'[this.flip ? 7 - i : i], rank = String(this.flip ? i + 1 : 8 - i);
      ctx.fillText(file, BOARD.x + (i + 0.5) * BOARD.sq, BOARD.y + BOARD.size + FRAME / 2 + 2);
      ctx.fillText(file, BOARD.x + (i + 0.5) * BOARD.sq, BOARD.y - FRAME / 2 - 1);
      ctx.fillText(rank, BOARD.x - FRAME / 2 - 1, BOARD.y + (i + 0.5) * BOARD.sq);
      ctx.fillText(rank, BOARD.x + BOARD.size + FRAME / 2 + 1, BOARD.y + (i + 0.5) * BOARD.sq);
    }
    ctx.restore();
  };
  P.drawSquares = function (ctx) {
    const maple = A.image('maple'), walnut = A.image('walnut');
    for (let col = 0; col < 8; col++) for (let row = 0; row < 8; row++) {
      const light = (col + row) % 2 === 0, x = BOARD.x + col * BOARD.sq, y = BOARD.y + row * BOARD.sq, sd = this.seed[col * 8 + row], img = light ? maple : walnut;
      if (img) { const sw = img.width * 0.28, sh = img.height * 0.28, sx = sd[0] * (img.width - sw), sy = sd[1] * (img.height - sh); ctx.drawImage(img, sx, sy, sw, sh, x, y, BOARD.sq, BOARD.sq); }
      else { ctx.fillStyle = light ? '#e7d2a6' : '#7a4a26'; ctx.fillRect(x, y, BOARD.sq, BOARD.sq); }
      ctx.fillStyle = light ? 'rgba(255,240,210,' + (0.04 + sd[2] * 0.08) + ')' : 'rgba(0,0,0,' + (0.05 + sd[2] * 0.12) + ')'; ctx.fillRect(x, y, BOARD.sq, BOARD.sq);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, BOARD.sq - 1, BOARD.sq - 1);
    }
    /* varnish sheen */
    const g = ctx.createLinearGradient(BOARD.x, BOARD.y, BOARD.x + BOARD.size * 0.6, BOARD.y + BOARD.size); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = g; ctx.fillRect(BOARD.x, BOARD.y, BOARD.size, BOARD.size);
  };
  P.drawHighlights = function (ctx) {
    const g = this.game;
    if (g.lastMove) [C.FROM(g.lastMove), C.TO(g.lastMove)].forEach(sq => { const r = this.sqRect(sq); ctx.fillStyle = 'rgba(255,214,90,0.38)'; ctx.fillRect(r.x, r.y, r.w, r.h); });
    if (g.status && g.status.check && !this.animating()) { const k = g.pos.kings[g.pos.turn ? 1 : 0], r = this.sqRect(k), rg = ctx.createRadialGradient(r.cx, r.cy, 6, r.cx, r.cy, r.w * 0.75); rg.addColorStop(0, 'rgba(255,40,40,0.75)'); rg.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = rg; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (g.selected >= 0) {
      const r = this.sqRect(g.selected); ctx.fillStyle = 'rgba(80,200,120,0.45)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      g.targets.forEach(m => { const t = this.sqRect(C.TO(m)); ctx.fillStyle = 'rgba(20,40,30,0.38)'; if (C.FLAGS(m) & C.F_CAP) { ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(20,40,30,0.4)'; ctx.beginPath(); ctx.arc(t.cx, t.cy, t.w * 0.44, 0, Math.PI * 2); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(t.cx, t.cy, t.w * 0.16, 0, Math.PI * 2); ctx.fill(); } });
    }
    if (g.hover >= 0 && g.selected >= 0 && g.targets.some(m => C.TO(m) === g.hover)) { const r = this.sqRect(g.hover); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6); }
  };
  P.drawPieceAt = function (ctx, key, cx, cy, scale, alpha, rot) {
    const pc = A.piece(key); if (!pc) return;
    const w = pc.w * scale, h = pc.h * scale, lift = (scale - 1) * 60;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.32 / scale) + ')'; ctx.beginPath(); ctx.ellipse(cx + 4 + lift * 0.6, cy + BOARD.sq * 0.3 + lift * 0.2, w * 0.36, w * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(cx, cy + BOARD.sq * 0.34 - lift); if (rot) ctx.rotate(rot);
    ctx.drawImage(pc.canvas, -w / 2, -h, w, h); ctx.restore();
  };
  P.drawPieces = function (ctx) {
    const g = this.game, b = g.pos.board, hidden = new Set();
    this.anims.forEach(a => { if (a.kind === 'slide' && a.hideTo) hidden.add(a.to); if (a.kind === 'knock') hidden.add(-1); });
    if (this.drag) hidden.add(this.drag.sq);
    /* draw back rows first so taller pieces overlap naturally */
    const order = [];
    for (let sq = 0; sq < 128; sq++) { if (!C.ON(sq)) { sq += 7; continue; } if (b[sq] && !hidden.has(sq)) order.push(sq); }
    order.sort((p, q) => this.sqRect(p).cy - this.sqRect(q).cy);
    order.forEach(sq => { const r = this.sqRect(sq); this.drawPieceAt(ctx, A.codeOf(b[sq]), r.cx, r.cy, 1, 1, 0); });
    this.anims.forEach(a => {
      if (a.t < 0) return; const u = Math.min(1, a.t / a.dur);
      if (a.kind === 'knock') { const e = 1 - Math.pow(1 - u, 2); this.drawPieceAt(ctx, a.piece, a.x0 + (a.x1 - a.x0) * e, a.y0 + (a.y1 - a.y0) * e - Math.sin(u * Math.PI) * 30, 1, 1 - u * u, a.rot * e); }
      else { const e = ease(u), lift = Math.sin(u * Math.PI) * 0.1; const key = a.morph && u > 0.6 ? a.morph : a.piece; this.drawPieceAt(ctx, key, a.x0 + (a.x1 - a.x0) * e, a.y0 + (a.y1 - a.y0) * e, 1 + lift, 1, 0); }
    });
    if (this.drag) this.drawPieceAt(ctx, this.drag.key, this.drag.x, this.drag.y - 12, 1.12, 1, 0);
  };
  P.drawArrow = function (ctx) {
    const h = this.hint; if (!h) return; const age = this.time - h.t0; if (age > h.dur) { this.hint = null; return; }
    const a = this.sqRect(h.from), b = this.sqRect(h.to), alpha = Math.min(1, age * 4) * Math.min(1, (h.dur - age) * 2);
    const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, head = 30, w = 18;
    ctx.save(); ctx.globalAlpha = alpha * 0.85; ctx.fillStyle = '#4fd56f'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(79,213,111,0.9)'; ctx.shadowBlur = 16;
    const sx = a.cx + ux * 20, sy = a.cy + uy * 20, ex = b.cx - ux * 10, ey = b.cy - uy * 10, bx = ex - ux * head, by = ey - uy * head, px = -uy, py = ux;
    ctx.beginPath(); ctx.moveTo(sx + px * w / 2, sy + py * w / 2); ctx.lineTo(bx + px * w / 2, by + py * w / 2); ctx.lineTo(bx + px * w * 1.1, by + py * w * 1.1); ctx.lineTo(ex, ey); ctx.lineTo(bx - px * w * 1.1, by - py * w * 1.1); ctx.lineTo(bx - px * w / 2, by - py * w / 2); ctx.lineTo(sx - px * w / 2, sy - py * w / 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  };
  C.Renderer = Renderer;
})(window);

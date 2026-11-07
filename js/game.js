/* ============================================================================
   CHESS — game controller: modes (human/AI per colour), engine worker,
   move application with sounds and animations, promotion, undo/redo, hint,
   clocks, PGN/FEN import-export, game-over handling, test hooks.
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.CHESS, A = () => C.audio, ASSETS = C.assets;
  const CLOCKS = { none: null, '1+0': [60, 0], '3+2': [180, 2], '5+0': [300, 0], '10+0': [600, 0], '15+10': [900, 10], '30+0': [1800, 0] };

  function Game() {
    this.pos = new C.Position(); this.startFen = C.START; this.sans = []; this.ucis = []; this.moves = []; this.redoStack = [];
    this.mode = { white: 'human', black: 'ai' }; this.level = 3; this.clockKey = 'none'; this.clock = { enabled: false, w: 0, b: 0, inc: 0 };
    this.status = this.pos.status(); this.lastMove = 0; this.selected = -1; this.targets = []; this.hover = -1; this.pendingPromo = null;
    this.thinking = false; this.searchId = 0; this.over = false; this.result = null; this.reason = null; this.now = 0; this.aiAt = 0; this.lastTickSec = -1;
    this.renderer = null; this.ui = null; this.worker = null; this.info = null; this.started = false;
    try { if (root.Worker && root.location.protocol !== 'file:') { this.worker = new Worker('js/worker.js'); this.worker.onmessage = ev => this.onWorker(ev.data); this.worker.onerror = () => { this.worker = null; }; } } catch (e) { this.worker = null; }
  }
  const P = Game.prototype;
  P.turnColor = function () { return this.pos.turn === C.WHITE ? 'white' : 'black'; };
  P.isHumanTurn = function () { return !this.over && this.mode[this.turnColor()] === 'human'; };
  P.isAiTurn = function () { return !this.over && this.mode[this.turnColor()] === 'ai'; };
  P.humanColor = function () { if (this.mode.white === 'human' && this.mode.black !== 'human') return 'white'; if (this.mode.black === 'human' && this.mode.white !== 'human') return 'black'; return null; };

  P.newGame = function (o) {
    o = o || {};
    if (o.white) this.mode.white = o.white; if (o.black) this.mode.black = o.black; if (o.level) this.level = o.level; if (o.clock) this.clockKey = o.clock;
    this.startFen = o.fen || C.START; this.pos = new C.Position(this.startFen);
    this.sans = []; this.ucis = []; this.moves = []; this.redoStack = []; this.lastMove = 0; this.selected = -1; this.targets = []; this.pendingPromo = null;
    this.thinking = false; this.searchId++; this.over = false; this.result = null; this.reason = null; this.info = null; this.started = true;
    const ck = CLOCKS[this.clockKey]; this.clock = ck ? { enabled: true, w: ck[0], b: ck[0], inc: ck[1] } : { enabled: false, w: 0, b: 0, inc: 0 };
    this.status = this.pos.status();
    if (this.renderer) { this.renderer.anims = []; this.renderer.hint = null; this.renderer.flip = this.humanColor() === 'black'; }
    if (this.ui) { this.ui.hideOverlays(); this.ui.movesDirty = true; }
    C.Engine.clearTT();
    if (this.isAiTurn()) this.aiAt = this.now + 0.8;
    if (this.status.over) this.onGameOver();
  };

  /* ---- human input ---- */
  P.select = function (sq) {
    if (!this.isHumanTurn() || this.renderer.animating()) return false;
    const p = this.pos.board[sq]; if (!p || C.COLOR(p) !== this.pos.turn) return false;
    this.selected = sq; this.targets = this.status.legal.filter(m => C.FROM(m) === sq); A().pickup(); return true;
  };
  P.deselect = function () { this.selected = -1; this.targets = []; };
  P.tryMove = function (from, to) {
    if (!this.isHumanTurn()) return false;
    const cands = this.status.legal.filter(m => C.FROM(m) === from && C.TO(m) === to);
    if (!cands.length) { A().illegal(); return false; }
    if (cands.length > 1 && C.PROMO(cands[0])) { this.pendingPromo = { from: from, to: to, cands: cands }; this.deselect(); if (this.ui) this.ui.showPromotion(this.pos.turn === C.WHITE ? 'w' : 'b'); return true; }
    this.applyMove(cands[0], 'human'); return true;
  };
  P.choosePromotion = function (letter) {
    const pp = this.pendingPromo; if (!pp) return; this.pendingPromo = null;
    const want = { Q: C.QUEEN, R: C.ROOK, B: C.BISHOP, N: C.KNIGHT }[letter] || C.QUEEN;
    const m = pp.cands.find(x => C.PROMO(x) === want) || pp.cands[0]; if (this.ui) this.ui.hidePromotion(); this.applyMove(m, 'human');
  };

  /* ---- applying moves ---- */
  P.applyMove = function (m, source, opts) {
    opts = opts || {};
    const pos = this.pos, b = pos.board, from = C.FROM(m), to = C.TO(m), flags = C.FLAGS(m), piece = b[from], mover = C.COLOR(piece), key = ASSETS.codeOf(piece);
    let captured = b[to], capSq = to; if (flags & C.F_EP) { capSq = to - (mover === C.WHITE ? 16 : -16); captured = b[capSq]; }
    const san = pos.san(m, this.status.legal);
    if (this.renderer && !opts.silent) {
      const promoKey = (flags & C.F_PROMO) ? (mover === C.WHITE ? 'w' : 'b') + C.LETTER[C.PROMO(m)] : null;
      if (captured) this.renderer.animateCapture(ASSETS.codeOf(captured), capSq, mover === C.WHITE ? 'white' : 'black');
      this.renderer.animateMove(key, from, to, { morph: promoKey, dur: source === 'ai' ? 0.32 : 0.24 });
      if (flags & C.F_CASTLE) { const kside = to === 6 || to === 118, rf = kside ? to + 1 : to - 2, rt = kside ? to - 1 : to + 1; this.renderer.animateMove(ASSETS.codeOf(b[rf]), rf, rt, { dur: 0.3 }); }
    }
    if (!opts.silent) { if (flags & C.F_CASTLE) A().castle(); else if (captured) A().capture(C.LETTER[C.TYPE(piece)]); else A().move(C.LETTER[C.TYPE(piece)]); if (flags & C.F_PROMO) setTimeout(() => A().promote(), 200); }
    pos.make(m);
    this.sans.push(san); this.ucis.push(C.toUci(m)); this.moves.push(m); if (!opts.keepRedo) this.redoStack = [];
    this.lastMove = m; this.deselect(); if (this.renderer) this.renderer.hint = null;
    if (this.clock.enabled && this.sans.length > 1) { if (mover === C.WHITE) this.clock.w += this.clock.inc; else this.clock.b += this.clock.inc; }
    this.status = pos.status(); if (this.ui) this.ui.movesDirty = true;
    if (!opts.silent && this.status.check && !this.status.over) setTimeout(() => A().check(), 180);
    if (this.status.over) this.onGameOver();
    else if (this.isAiTurn()) this.aiAt = this.now + (source === 'human' ? 0.45 : 0.6);
  };
  P.playSan = function (san) { const m = this.pos.fromSan(san); if (!m) return false; this.applyMove(m, 'script'); return true; };
  P.playUci = function (uci) { const m = this.pos.fromUci(uci); if (!m) return false; this.applyMove(m, 'script'); return true; };

  /* ---- engine ---- */
  P.requestAi = function () {
    if (this.thinking || this.over) return; this.thinking = true; const id = ++this.searchId;
    if (this.worker) this.worker.postMessage({ type: 'search', id: id, fen: this.startFen, moves: this.ucis.slice(), level: this.level, useBook: true });
    else setTimeout(() => { if (id !== this.searchId) return; const pos = this.pos; let m = this.ucis.length < 4 ? C.Engine.bookMove(pos, this.ucis) : 0; if (!m) { const r = C.Engine.search(pos, this.level); m = r && r.move; } this.onWorker({ type: 'bestmove', id: id, move: m ? C.toUci(m) : null }); }, 30);
  };
  P.onWorker = function (msg) {
    if (msg.type === 'info' && msg.id === this.searchId) { this.info = msg; return; }
    if (msg.type !== 'bestmove') return;
    if (msg.id === 'hint') { if (msg.move && this.renderer) { const m = this.pos.fromUci(msg.move); if (m) { this.renderer.hint = { from: C.FROM(m), to: C.TO(m), t0: this.now, dur: 3.5 }; A().hint(); } } this.hinting = false; return; }
    if (msg.id !== this.searchId) return;
    this.thinking = false; this.info = msg;
    if (!msg.move) return; const m = this.pos.fromUci(msg.move); if (m && this.isAiTurn()) this.applyMove(m, 'ai');
  };
  P.hint = function () {
    if (!this.isHumanTurn() || this.hinting) return; this.hinting = true;
    if (this.worker) this.worker.postMessage({ type: 'search', id: 'hint', fen: this.startFen, moves: this.ucis.slice(), level: 4, timeMs: 900, maxDepth: 6 });
    else setTimeout(() => { const r = C.Engine.search(this.pos, 4, { timeMs: 900, maxDepth: 6 }); this.onWorker({ type: 'bestmove', id: 'hint', move: r && r.move ? C.toUci(r.move) : null }); }, 20);
  };

  /* ---- undo / redo ---- */
  P.undo = function () {
    if (!this.moves.length) return false;
    this.searchId++; this.thinking = false; this.hinting = false; if (this.renderer) { this.renderer.anims = []; this.renderer.hint = null; }
    let count = 1;
    const single = this.humanColor();
    if (single && this.moves.length >= 2 && this.mode[this.turnColor()] === 'human') count = 2;
    for (let i = 0; i < count && this.moves.length; i++) { this.redoStack.push({ san: this.sans.pop(), uci: this.ucis.pop(), m: this.moves.pop() }); this.pos.unmake(); }
    this.lastMove = this.moves.length ? this.moves[this.moves.length - 1] : 0; this.deselect(); this.pendingPromo = null;
    this.over = false; this.result = null; this.reason = null; this.status = this.pos.status(); if (this.ui) { this.ui.hideOverlays(); this.ui.movesDirty = true; }
    if (this.isAiTurn()) this.aiAt = this.now + 0.8;
    A().click(); return true;
  };
  P.redo = function () {
    if (!this.redoStack.length) return false;
    this.searchId++; this.thinking = false;
    const r = this.redoStack.pop(); const m = this.pos.fromUci(r.uci); if (!m) { this.redoStack = []; return false; }
    const keep = this.redoStack.slice(); this.applyMove(m, 'script', { keepRedo: true }); this.redoStack = keep;
    if (this.humanColor() && this.redoStack.length && this.isAiTurn()) { const r2 = this.redoStack.pop(); const m2 = this.pos.fromUci(r2.uci); if (m2) { const keep2 = this.redoStack.slice(); this.applyMove(m2, 'script', { keepRedo: true }); this.redoStack = keep2; } }
    return true;
  };
  P.flip = function () { if (this.renderer) this.renderer.flip = !this.renderer.flip; };
  P.resign = function () { if (this.over || !this.sans.length) return; this.result = this.pos.turn === C.WHITE ? '0-1' : '1-0'; this.reason = 'resignation'; this.over = true; this.searchId++; this.thinking = false; this.finish(); };

  /* ---- clocks & frame ---- */
  P.update = function (now, dt) {
    this.now = now;
    if (this.aiAt && now >= this.aiAt && !this.renderer.animating()) { this.aiAt = 0; this.requestAi(); }
    if (this.clock.enabled && !this.over && this.sans.length > 0) {
      const key = this.pos.turn === C.WHITE ? 'w' : 'b'; this.clock[key] = Math.max(0, this.clock[key] - dt);
      const sec = Math.ceil(this.clock[key]); if (sec <= 10 && sec !== this.lastTickSec && sec > 0) { this.lastTickSec = sec; A().tick(); if (sec <= 3) A().lowTime(); }
      if (this.clock[key] <= 0) { this.result = key === 'w' ? '0-1' : '1-0'; this.reason = 'time'; this.over = true; this.searchId++; this.thinking = false; this.finish(); }
    }
  };
  P.onGameOver = function () { this.over = true; this.result = this.status.result; this.reason = this.status.reason; this.searchId++; this.thinking = false; this.finish(); };
  P.finish = function () {
    const hc = this.humanColor(); let kind = 'draw';
    if (this.result === '1-0' || this.result === '0-1') { const winner = this.result === '1-0' ? 'white' : 'black'; kind = hc ? (winner === hc ? 'win' : 'loss') : 'win'; }
    setTimeout(() => A().gameOver(kind), 350);
    if (this.ui) setTimeout(() => this.ui.showGameOver(this.result, this.reason), 700);
  };

  /* ---- PGN / FEN ---- */
  P.pgn = function () {
    const names = c => (this.mode[c] === 'ai' ? 'Engine (' + C.Engine.LEVELS[this.level - 1].name + ')' : 'Human');
    const h = { White: names('white'), Black: names('black'), Result: this.result || '*' };
    if (this.startFen !== C.START) { h.SetUp = '1'; h.FEN = this.startFen; }
    if (this.reason) h.Termination = this.reason;
    const parts = this.startFen.split(/\s+/);
    return C.pgnExport(h, this.sans, this.result || '*', { moveNo: parseInt(parts[5] || '1', 10) || 1, blackFirst: parts[1] === 'b' });
  };
  P.loadPgn = function (text) {
    const g = C.pgnImport(text); if (!g.sans.length && !g.fen) return 0;
    this.newGame({ fen: g.fen || undefined, white: 'human', black: 'human' });
    let n = 0; for (const s of g.sans) { const m = this.pos.fromSan(s); if (!m) break; this.applyMove(m, 'script', { silent: true }); n++; }
    if (this.renderer) this.renderer.anims = [];
    return n;
  };
  P.loadFen = function (fen) { try { const test = new C.Position(fen); if (!test.kings[0] && !test.kings[1]) return false; } catch (e) { return false; } this.newGame({ fen: fen }); return true; };
  P.state = function () { return { fen: this.pos.fen(), sans: this.sans.slice(), over: this.over, result: this.result, reason: this.reason, check: this.status.check, turn: this.turnColor(), thinking: this.thinking }; };

  C.Game = Game; C.CLOCKS = CLOCKS;
})(window);

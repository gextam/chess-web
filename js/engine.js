/* ============================================================================
   CHESS — AI engine: iterative-deepening alpha-beta with quiescence search,
   transposition table, killer and history move ordering, null-move pruning,
   late-move reductions, check extension, tapered piece-square evaluation
   and a tiny opening book. Runs in a Web Worker (worker.js) or node.
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.CHESS;
  const { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK, TYPE, COLOR, FILE, RANK, SQ, ON, FROM, TO, PROMO, FLAGS, F_CAP, F_PROMO } = C;
  const MATE = 100000, INF = 1000000;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  /* piece-square tables, white's view, rank 8 first (index 0 = a8) */
  const PST_MG = {
    [PAWN]: [0, 0, 0, 0, 0, 0, 0, 0, 98, 134, 61, 95, 68, 126, 34, -11, -6, 7, 26, 31, 65, 56, 25, -20, -14, 13, 6, 21, 23, 12, 17, -23, -27, -2, -5, 12, 17, 6, 10, -25, -26, -4, -4, -10, 3, 3, 33, -12, -35, -1, -20, -23, -15, 24, 38, -22, 0, 0, 0, 0, 0, 0, 0, 0],
    [KNIGHT]: [-167, -89, -34, -49, 61, -97, -15, -107, -73, -41, 72, 36, 23, 62, 7, -17, -47, 60, 37, 65, 84, 129, 73, 44, -9, 17, 19, 53, 37, 69, 18, 22, -13, 4, 16, 13, 28, 19, 21, -8, -23, -9, 12, 10, 19, 17, 25, -16, -29, -53, -12, -3, -1, 18, -14, -19, -105, -21, -58, -33, -17, -28, -19, -23],
    [BISHOP]: [-29, 4, -82, -37, -25, -42, 7, -8, -26, 16, -18, -13, 30, 59, 18, -47, -16, 37, 43, 40, 35, 50, 37, -2, -4, 5, 19, 50, 37, 37, 7, -2, -6, 13, 13, 26, 34, 12, 10, 4, 0, 15, 15, 15, 14, 27, 18, 10, 4, 15, 16, 0, 7, 21, 33, 1, -33, -3, -14, -21, -13, -12, -39, -21],
    [ROOK]: [32, 42, 32, 51, 63, 9, 31, 43, 27, 32, 58, 62, 80, 67, 26, 44, -5, 19, 26, 36, 17, 45, 61, 16, -24, -11, 7, 26, 24, 35, -8, -20, -36, -26, -12, -1, 9, -7, 6, -23, -45, -25, -16, -17, 3, 0, -5, -33, -44, -16, -20, -9, -1, 11, -6, -71, -19, -13, 1, 17, 16, 7, -37, -26],
    [QUEEN]: [-28, 0, 29, 12, 59, 44, 43, 45, -24, -39, -5, 1, -16, 57, 28, 54, -13, -17, 7, 8, 29, 56, 47, 57, -27, -27, -16, -16, -1, 17, -2, 1, -9, -26, -9, -10, -2, -4, 3, -3, -14, 2, -11, -2, -5, 2, 14, 5, -35, -8, 11, 2, 8, 15, -3, 1, -1, -18, -9, 10, -15, -25, -31, -50],
    [KING]: [-65, 23, 16, -15, -56, -34, 2, 13, 29, -1, -20, -7, -8, -4, -38, -29, -9, 24, 2, -16, -20, 6, 22, -22, -17, -20, -12, -27, -30, -25, -14, -36, -49, -1, -27, -39, -46, -44, -33, -51, -14, -14, -22, -46, -44, -30, -15, -27, 1, 7, -8, -64, -43, -16, 9, 8, -15, 36, 12, -54, 8, -28, 24, 14]
  };
  const PST_EG = {
    [PAWN]: [0, 0, 0, 0, 0, 0, 0, 0, 178, 173, 158, 134, 147, 132, 165, 187, 94, 100, 85, 67, 56, 53, 82, 84, 32, 24, 13, 5, -2, 4, 17, 17, 13, 9, -3, -7, -7, -8, 3, -1, 4, 7, -6, 1, 0, -5, -1, -8, 13, 8, 8, 10, 13, 0, 2, -7, 0, 0, 0, 0, 0, 0, 0, 0],
    [KNIGHT]: [-58, -38, -13, -28, -31, -27, -63, -99, -25, -8, -25, -2, -9, -25, -24, -52, -24, -20, 10, 9, -1, -9, -19, -41, -17, 3, 22, 22, 22, 11, 8, -18, -18, -6, 16, 25, 16, 17, 4, -18, -23, -3, -1, 15, 10, -3, -20, -22, -42, -20, -10, -5, -2, -20, -23, -44, -29, -51, -23, -15, -22, -18, -50, -64],
    [BISHOP]: [-14, -21, -11, -8, -7, -9, -17, -24, -8, -4, 7, -12, -3, -13, -4, -14, 2, -8, 0, -1, -2, 6, 0, 4, -3, 9, 12, 9, 14, 10, 3, 2, -6, 3, 13, 19, 7, 10, -3, -9, -12, -3, 8, 10, 13, 3, -7, -15, -14, -18, -7, -1, 4, -9, -15, -27, -23, -9, -23, -5, -9, -16, -5, -17],
    [ROOK]: [13, 10, 18, 15, 12, 12, 8, 5, 11, 13, 13, 11, -3, 3, 8, 3, 7, 7, 7, 5, 4, -3, -5, -3, 4, 3, 13, 1, 2, 1, -1, 2, 3, 5, 8, 4, -5, -6, -8, -11, -4, 0, -5, -1, -7, -12, -8, -16, -6, -6, 0, 2, -9, -9, -11, -3, -9, 2, 3, -1, -5, -13, 4, -20],
    [QUEEN]: [-9, 22, 22, 27, 27, 19, 10, 20, -17, 20, 32, 41, 58, 25, 30, 0, -20, 6, 9, 49, 47, 35, 19, 9, 3, 22, 24, 45, 57, 40, 57, 36, -18, 28, 19, 47, 31, 34, 39, 23, -16, -27, 15, 6, 9, 17, 10, 5, -22, -23, -30, -16, -16, -23, -36, -32, -33, -28, -22, -43, -5, -32, -20, -41],
    [KING]: [-74, -35, -18, -18, -11, 15, 4, -17, -12, 17, 14, 17, 17, 38, 23, 11, 10, 17, 23, 15, 20, 45, 44, 13, -8, 22, 24, 27, 26, 33, 26, 3, -18, -4, 21, 24, 27, 23, 9, -11, -19, -3, 11, 21, 23, 16, 7, -9, -27, -11, 4, 13, 14, 4, -5, -17, -53, -34, -21, -11, -28, -14, -24, -43]
  };
  const idxW = sq => (7 - RANK(sq)) * 8 + FILE(sq), idxB = sq => RANK(sq) * 8 + FILE(sq);
  const PASSED = [0, 10, 17, 25, 40, 65, 100, 0];

  function evaluate(pos) {
    const b = pos.board; let mg = 0, eg = 0, phase = 0, wb = 0, bb = 0;
    const wp = new Uint8Array(8), bp = new Uint8Array(8), wpawns = [], bpawns = [];
    for (let sq = 0; sq < 128; sq++) {
      if (!ON(sq)) { sq += 7; continue; }
      const p = b[sq]; if (!p) continue;
      const t = TYPE(p), white = COLOR(p) === WHITE, i = white ? idxW(sq) : idxB(sq), s = white ? 1 : -1;
      mg += s * (VAL[t] + PST_MG[t][i]); eg += s * (VAL[t] + PST_EG[t][i]); phase += PHASE[t];
      if (t === BISHOP) { if (white) wb++; else bb++; }
      if (t === PAWN) { if (white) { wp[FILE(sq)]++; wpawns.push(sq); } else { bp[FILE(sq)]++; bpawns.push(sq); } }
    }
    if (wb >= 2) { mg += 30; eg += 45; } if (bb >= 2) { mg -= 30; eg -= 45; }
    for (let f = 0; f < 8; f++) {
      if (wp[f] > 1) { mg -= 10 * (wp[f] - 1); eg -= 18 * (wp[f] - 1); } if (bp[f] > 1) { mg += 10 * (bp[f] - 1); eg += 18 * (bp[f] - 1); }
      const wl = f ? wp[f - 1] : 0, wr = f < 7 ? wp[f + 1] : 0, bl = f ? bp[f - 1] : 0, br = f < 7 ? bp[f + 1] : 0;
      if (wp[f] && !wl && !wr) { mg -= 12; eg -= 16; } if (bp[f] && !bl && !br) { mg += 12; eg += 16; }
    }
    for (const sq of wpawns) { const f = FILE(sq), r = RANK(sq); let passed = true; for (const o of bpawns) if (Math.abs(FILE(o) - f) <= 1 && RANK(o) > r) { passed = false; break; } if (passed) { mg += PASSED[r] >> 1; eg += PASSED[r]; } }
    for (const sq of bpawns) { const f = FILE(sq), r = RANK(sq); let passed = true; for (const o of wpawns) if (Math.abs(FILE(o) - f) <= 1 && RANK(o) < r) { passed = false; break; } if (passed) { mg -= PASSED[7 - r] >> 1; eg -= PASSED[7 - r]; } }
    /* rooks on open files, king pawn shield (middlegame) */
    for (let sq = 0; sq < 128; sq++) {
      if (!ON(sq)) { sq += 7; continue; }
      const p = b[sq]; if (!p) continue; const t = TYPE(p), white = COLOR(p) === WHITE, s = white ? 1 : -1, f = FILE(sq);
      if (t === ROOK) { if (!wp[f] && !bp[f]) mg += s * 18; else if ((white && !wp[f]) || (!white && !bp[f])) mg += s * 8; }
      if (t === KING) { const dir = white ? 16 : -16; let shield = 0; for (let d = -1; d <= 1; d++) { const a = sq + dir + d, a2 = sq + 2 * dir + d; if (ON(a) && b[a] === (PAWN | (white ? WHITE : BLACK))) shield++; else if (ON(a2) && b[a2] === (PAWN | (white ? WHITE : BLACK))) shield++; } mg += s * shield * 9; }
    }
    if (phase > 24) phase = 24;
    let score = Math.round((mg * phase + eg * (24 - phase)) / 24) + 8 * (pos.turn === WHITE ? 1 : -1);
    return pos.turn === WHITE ? score : -score;
  }

  /* ---- transposition table ---- */
  const TT_SIZE = 1 << 20, TT_MASK = TT_SIZE - 1;
  const ttK1 = new Uint32Array(TT_SIZE), ttK2 = new Uint32Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE), ttScore = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE);
  const EXACT = 1, LOWER = 2, UPPER = 3;

  function Search(pos) {
    this.pos = pos; this.nodes = 0; this.abort = false; this.deadline = 0;
    this.killers = []; for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
    this.history = new Int32Array(2 * 128 * 128);
  }
  const S = Search.prototype;
  S.checkTime = function () { if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) this.abort = true; };
  S.orderMoves = function (moves, ttm, ply) {
    const pos = this.pos, b = pos.board, k = this.killers[ply], side = pos.turn ? 1 : 0, scores = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]; let s = 0;
      if (m === ttm) s = 10000000;
      else if (FLAGS(m) & F_CAP) { const victim = FLAGS(m) & C.F_EP ? PAWN : TYPE(b[TO(m)]); s = 1000000 + VAL[victim] * 10 - VAL[TYPE(b[FROM(m)])] / 10; }
      else if (FLAGS(m) & F_PROMO) s = 900000 + VAL[PROMO(m)];
      else if (m === k[0]) s = 800000; else if (m === k[1]) s = 700000;
      else s = this.history[side * 16384 + FROM(m) * 128 + TO(m)];
      scores[i] = s;
    }
    /* selection sort by score (lists are short) */
    const idx = moves.map((_, i) => i).sort((a, c) => scores[c] - scores[a]);
    return idx.map(i => moves[i]);
  };
  S.quiesce = function (alpha, beta, ply) {
    this.nodes++; this.checkTime(); if (this.abort) return 0;
    const pos = this.pos; let stand = evaluate(pos);
    if (stand >= beta) return stand; if (stand > alpha) alpha = stand;
    const moves = this.orderMoves(pos.generate(true), 0, ply), ki = pos.turn ? 1 : 0, them = pos.turn ^ 8;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!(FLAGS(m) & F_PROMO)) { const victim = FLAGS(m) & C.F_EP ? PAWN : TYPE(pos.board[TO(m)]); if (stand + VAL[victim] + 150 < alpha) continue; }
      pos.make(m); if (pos.isAttacked(pos.kings[ki], them)) { pos.unmake(); continue; }
      const s = -this.quiesce(-beta, -alpha, ply + 1); pos.unmake(); if (this.abort) return 0;
      if (s >= beta) return s; if (s > alpha) alpha = s;
    }
    return alpha;
  };
  S.negamax = function (depth, alpha, beta, ply, canNull) {
    this.nodes++; this.checkTime(); if (this.abort) return 0;
    const pos = this.pos;
    if (ply > 0 && (pos.halfmove >= 100 || pos.repetitionCount() >= 2)) return 0;
    const inCheck = pos.inCheck(); if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    alpha = Math.max(alpha, -MATE + ply); beta = Math.min(beta, MATE - ply - 1); if (alpha >= beta) return alpha;
    /* transposition table */
    const ix = pos.h1 & TT_MASK; let ttm = 0;
    if (ttK1[ix] === pos.h1 && ttK2[ix] === pos.h2) {
      ttm = ttMove[ix];
      if (ttDepth[ix] >= depth && ply > 0) {
        let sc = ttScore[ix]; if (sc > MATE - 1000) sc -= ply; else if (sc < -MATE + 1000) sc += ply;
        const fl = ttFlag[ix];
        if (fl === EXACT) return sc; if (fl === LOWER && sc >= beta) return sc; if (fl === UPPER && sc <= alpha) return sc;
      }
    }
    /* null move pruning */
    if (canNull && !inCheck && depth >= 3 && ply > 0 && this.hasNonPawn(pos.turn)) {
      pos.makeNull(); const s = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false); pos.unmakeNull();
      if (this.abort) return 0; if (s >= beta) return beta;
    }
    const moves = this.orderMoves(pos.generate(false), ttm, ply), ki = pos.turn ? 1 : 0, them = pos.turn ^ 8, side = ki;
    let best = -INF, bestMove = 0, legal = 0, flag = UPPER;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      pos.make(m); if (pos.isAttacked(pos.kings[ki], them)) { pos.unmake(); continue; }
      legal++;
      let s;
      if (legal === 1) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        const quiet = !(FLAGS(m) & (F_CAP | F_PROMO));
        const red = (depth >= 3 && legal > 4 && quiet && !inCheck) ? 1 : 0;
        s = -this.negamax(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && !this.abort) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake(); if (this.abort) return 0;
      if (s > best) {
        best = s; bestMove = m;
        if (s > alpha) {
          alpha = s; flag = EXACT;
          if (s >= beta) {
            if (!(FLAGS(m) & F_CAP)) { const k = this.killers[ply]; if (k[0] !== m) { k[1] = k[0]; k[0] = m; } this.history[side * 16384 + FROM(m) * 128 + TO(m)] += depth * depth; }
            flag = LOWER; break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;
    let store = best; if (store > MATE - 1000) store += ply; else if (store < -MATE + 1000) store -= ply;
    ttK1[ix] = pos.h1; ttK2[ix] = pos.h2; ttDepth[ix] = depth; ttFlag[ix] = flag; ttScore[ix] = store; ttMove[ix] = bestMove;
    return best;
  };
  S.hasNonPawn = function (side) { const b = this.pos.board; for (let sq = 0; sq < 128; sq++) { if (!ON(sq)) { sq += 7; continue; } const p = b[sq]; if (p && COLOR(p) === side) { const t = TYPE(p); if (t !== PAWN && t !== KING) return true; } } return false; };
  S.pv = function (maxLen) {
    const pos = this.pos, out = []; let n = 0;
    while (n++ < maxLen) { const ix = pos.h1 & TT_MASK; if (ttK1[ix] !== pos.h1 || ttK2[ix] !== pos.h2 || !ttMove[ix]) break; const m = ttMove[ix]; if (!pos.isLegal(m) || pos.generate(false).indexOf(m) < 0) break; out.push(m); pos.make(m); }
    for (let i = 0; i < out.length; i++) pos.unmake();
    return out;
  };
  /* root search with iterative deepening */
  S.think = function (opts) {
    opts = opts || {};
    const pos = this.pos, maxDepth = opts.maxDepth || 6, noise = opts.noise || 0, onIter = opts.onIter;
    this.deadline = Date.now() + (opts.timeMs || 2000); this.nodes = 0; this.abort = false;
    const rootMoves = pos.legalMoves(); if (!rootMoves.length) return null;
    if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0, pv: [rootMoves[0]], nodes: 0 };
    const rootNoise = rootMoves.map(() => (Math.random() - 0.5) * 2 * noise);
    let best = { move: rootMoves[0], score: 0, depth: 0, pv: [rootMoves[0]] };
    const ki = pos.turn ? 1 : 0, them = pos.turn ^ 8, t0 = Date.now();
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -INF, bestMove = 0, bestScore = -INF;
      const order = this.orderMoves(rootMoves, best.move, 0);
      let completed = true;
      for (let i = 0; i < order.length; i++) {
        const m = order[i]; pos.make(m);
        let s;
        if (i === 0) s = -this.negamax(depth - 1, -INF, -alpha, 1, true);
        else { s = -this.negamax(depth - 1, -alpha - 1, -alpha, 1, true); if (s > alpha && !this.abort) s = -this.negamax(depth - 1, -INF, -alpha, 1, true); }
        pos.unmake();
        if (this.abort) { completed = false; break; }
        s += rootNoise[rootMoves.indexOf(m)];
        if (s > bestScore) { bestScore = s; bestMove = m; if (s > alpha) alpha = s; }
      }
      if (!completed) { if (depth > 1 || !best.move) break; else break; }
      best = { move: bestMove, score: bestScore, depth: depth, pv: [bestMove].concat((() => { pos.make(bestMove); const p = this.pv(depth); pos.unmake(); return p; })()), nodes: this.nodes, ms: Date.now() - t0 };
      if (onIter) onIter(best);
      if (Math.abs(bestScore) > MATE - 1000) break;
      if (Date.now() - t0 > (opts.timeMs || 2000) * 0.5) break;
    }
    best.nodes = this.nodes; best.ms = Date.now() - t0;
    return best;
  };

  const LEVELS = [
    { name: 'Beginner', depth: 1, timeMs: 400, noise: 120 },
    { name: 'Casual', depth: 2, timeMs: 600, noise: 45 },
    { name: 'Club', depth: 4, timeMs: 900, noise: 12 },
    { name: 'Strong', depth: 6, timeMs: 1800, noise: 0 },
    { name: 'Master', depth: 14, timeMs: 4000, noise: 0 }
  ];
  const BOOK = { '': ['e2e4', 'e2e4', 'd2d4', 'd2d4', 'c2c4', 'g1f3'], 'e2e4': ['e7e5', 'e7e5', 'c7c5', 'c7c5', 'e7e6', 'c7c6', 'd7d5'], 'd2d4': ['d7d5', 'd7d5', 'g8f6', 'g8f6', 'e7e6', 'c7c5'], 'c2c4': ['e7e5', 'g8f6', 'c7c5'], 'g1f3': ['d7d5', 'g8f6', 'c7c5'],
    'e2e4 e7e5': ['g1f3', 'g1f3', 'b1c3', 'f1c4'], 'e2e4 c7c5': ['g1f3', 'g1f3', 'b1c3'], 'e2e4 e7e6': ['d2d4'], 'e2e4 c7c6': ['d2d4'], 'd2d4 d7d5': ['c2c4', 'c2c4', 'g1f3'], 'd2d4 g8f6': ['c2c4', 'c2c4', 'g1f3'],
    'e2e4 e7e5 g1f3': ['b8c6', 'b8c6', 'g8f6'], 'e2e4 c7c5 g1f3': ['d7d6', 'b8c6', 'e7e6'], 'd2d4 d7d5 c2c4': ['e7e6', 'c7c6', 'd5c4'], 'd2d4 g8f6 c2c4': ['e7e6', 'g7g6'] };
  function bookMove(pos, uciHistory) {
    const key = (uciHistory || []).join(' '), opts = BOOK[key]; if (!opts) return 0;
    const pick = opts[Math.floor(Math.random() * opts.length)]; return pos.fromUci(pick) || 0;
  }
  function search(pos, level, extra) {
    const cfg = LEVELS[Math.max(0, Math.min(4, (level || 3) - 1))], s = new Search(pos);
    return s.think(Object.assign({ maxDepth: cfg.depth, timeMs: cfg.timeMs, noise: cfg.noise }, extra || {}));
  }
  function clearTT() { ttK1.fill(0); ttK2.fill(0); }

  C.Engine = { evaluate, Search, search, LEVELS, bookMove, clearTT, MATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof self !== 'undefined' ? self : globalThis);

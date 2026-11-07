/* ============================================================================
   CHESS — rules engine (0x88 board). Legal move generation with castling,
   en passant and promotion; make/unmake; FEN; SAN; UCI; PGN; game status
   (checkmate, stalemate, fifty-move rule, threefold repetition, insufficient
   material); perft. Shared by the browser (window.CHESS), the Web Worker and
   the node tools (module.exports).
   ========================================================================== */
(function (root) {
  'use strict';
  const CHESS = root.CHESS || (root.CHESS = {});

  const EMPTY = 0, PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6, WHITE = 0, BLACK = 8;
  const TYPE = p => p & 7, COLOR = p => p & 8;
  const FILE = sq => sq & 7, RANK = sq => sq >> 4, SQ = (f, r) => (r << 4) | f, ON = sq => (sq & 0x88) === 0;
  const F_CAP = 1, F_DBL = 2, F_EP = 4, F_CASTLE = 8, F_PROMO = 16;
  const mk = (from, to, promo, flags) => from | (to << 7) | ((promo || 0) << 14) | ((flags || 0) << 17);
  const FROM = m => m & 127, TO = m => (m >> 7) & 127, PROMO = m => (m >> 14) & 7, FLAGS = m => (m >> 17) & 31;
  const KN = [33, 31, 18, 14, -33, -31, -18, -14], KG = [16, -16, 1, -1, 17, 15, -17, -15], BI = [17, 15, -17, -15], RO = [16, -16, 1, -1];
  const A1 = 0, C1 = 2, D1 = 3, E1 = 4, F1 = 5, G1 = 6, H1 = 7, A8 = 112, C8 = 114, D8 = 115, E8 = 116, F8 = 117, G8 = 118, H8 = 119;
  const CASTLE_MASK = new Uint8Array(128).fill(15);
  CASTLE_MASK[E1] = 12; CASTLE_MASK[A1] = 13; CASTLE_MASK[H1] = 14; CASTLE_MASK[E8] = 3; CASTLE_MASK[A8] = 7; CASTLE_MASK[H8] = 11;
  const TYPEMAP = { P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING };
  const LETTER = ['', 'P', 'N', 'B', 'R', 'Q', 'K'];
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /* ---- zobrist (two independent 32-bit keys) ---- */
  let seed = 0x2545F491;
  function rnd32() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; }
  const Z1 = [], Z2 = [];
  for (let p = 0; p < 16; p++) { Z1[p] = new Uint32Array(128); Z2[p] = new Uint32Array(128); for (let s = 0; s < 128; s++) { Z1[p][s] = rnd32(); Z2[p][s] = rnd32(); } }
  const Z1S = rnd32(), Z2S = rnd32(), Z1C = new Uint32Array(16), Z2C = new Uint32Array(16), Z1E = new Uint32Array(8), Z2E = new Uint32Array(8);
  for (let i = 0; i < 16; i++) { Z1C[i] = rnd32(); Z2C[i] = rnd32(); } for (let i = 0; i < 8; i++) { Z1E[i] = rnd32(); Z2E[i] = rnd32(); }

  const sqName = sq => 'abcdefgh'[FILE(sq)] + (RANK(sq) + 1);
  const sqFrom = s => SQ(s.charCodeAt(0) - 97, s.charCodeAt(1) - 49);

  function Position(fen) { this.board = new Int8Array(128); this.hist = []; this.load(fen || START); }
  const P = Position.prototype;

  P.load = function (fen) {
    const parts = fen.trim().split(/\s+/), rows = parts[0].split('/');
    this.board.fill(0);
    for (let r = 0; r < 8; r++) { let f = 0; for (const ch of rows[r]) { if (ch >= '1' && ch <= '8') f += ch.charCodeAt(0) - 48; else { this.board[SQ(f, 7 - r)] = TYPEMAP[ch.toUpperCase()] | (ch === ch.toUpperCase() ? WHITE : BLACK); f++; } } }
    this.turn = parts[1] === 'b' ? BLACK : WHITE;
    this.castling = 0; if (parts[2] && parts[2] !== '-') for (const c of parts[2]) this.castling |= ({ K: 1, Q: 2, k: 4, q: 8 })[c] || 0;
    this.ep = parts[3] && parts[3] !== '-' ? sqFrom(parts[3]) : -1;
    this.halfmove = parseInt(parts[4] || '0', 10) || 0; this.fullmove = parseInt(parts[5] || '1', 10) || 1;
    this.kings = [0, 0];
    for (let s = 0; s < 128; s++) if (ON(s) && TYPE(this.board[s]) === KING) this.kings[COLOR(this.board[s]) ? 1 : 0] = s;
    this.hist = []; this.computeHash(); this.hashHist1 = [this.h1]; this.hashHist2 = [this.h2]; this.irrevIdx = 0;
  };
  P.fen = function () {
    let s = '';
    for (let r = 7; r >= 0; r--) { let e = 0; for (let f = 0; f < 8; f++) { const p = this.board[SQ(f, r)]; if (!p) { e++; continue; } if (e) { s += e; e = 0; } const l = LETTER[TYPE(p)]; s += COLOR(p) ? l.toLowerCase() : l; } if (e) s += e; if (r) s += '/'; }
    s += this.turn === WHITE ? ' w ' : ' b ';
    const c = (this.castling & 1 ? 'K' : '') + (this.castling & 2 ? 'Q' : '') + (this.castling & 4 ? 'k' : '') + (this.castling & 8 ? 'q' : '');
    s += (c || '-') + ' ' + (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.halfmove + ' ' + this.fullmove;
    return s;
  };
  P.computeHash = function () {
    let h1 = 0, h2 = 0;
    for (let s = 0; s < 128; s++) if (ON(s) && this.board[s]) { h1 ^= Z1[this.board[s]][s]; h2 ^= Z2[this.board[s]][s]; }
    if (this.turn === BLACK) { h1 ^= Z1S; h2 ^= Z2S; }
    h1 ^= Z1C[this.castling]; h2 ^= Z2C[this.castling];
    if (this.ep >= 0) { h1 ^= Z1E[FILE(this.ep)]; h2 ^= Z2E[FILE(this.ep)]; }
    this.h1 = h1 >>> 0; this.h2 = h2 >>> 0;
  };
  P.copy = function () { const p = new Position(this.fen()); return p; };

  P.isAttacked = function (sq, by) {
    const b = this.board;
    if (by === WHITE) { if (ON(sq - 15) && b[sq - 15] === (PAWN | WHITE)) return true; if (ON(sq - 17) && b[sq - 17] === (PAWN | WHITE)) return true; }
    else { if (ON(sq + 15) && b[sq + 15] === (PAWN | BLACK)) return true; if (ON(sq + 17) && b[sq + 17] === (PAWN | BLACK)) return true; }
    for (let i = 0; i < 8; i++) { const t = sq + KN[i]; if (ON(t) && b[t] === (KNIGHT | by)) return true; }
    for (let i = 0; i < 8; i++) { const t = sq + KG[i]; if (ON(t) && b[t] === (KING | by)) return true; }
    for (let i = 0; i < 4; i++) { let t = sq + BI[i]; while (ON(t)) { const p = b[t]; if (p) { if (COLOR(p) === by && (TYPE(p) === BISHOP || TYPE(p) === QUEEN)) return true; break; } t += BI[i]; } }
    for (let i = 0; i < 4; i++) { let t = sq + RO[i]; while (ON(t)) { const p = b[t]; if (p) { if (COLOR(p) === by && (TYPE(p) === ROOK || TYPE(p) === QUEEN)) return true; break; } t += RO[i]; } }
    return false;
  };
  P.inCheck = function () { return this.isAttacked(this.kings[this.turn ? 1 : 0], this.turn ^ 8); };

  /* pseudo-legal moves for the side to move */
  P.generate = function (capturesOnly) {
    const b = this.board, us = this.turn, them = us ^ 8, list = [];
    const dir = us === WHITE ? 16 : -16, startR = us === WHITE ? 1 : 6, promoR = us === WHITE ? 6 : 1;
    for (let sq = 0; sq < 128; sq++) {
      if (!ON(sq)) { sq += 7; continue; }
      const p = b[sq]; if (!p || COLOR(p) !== us) continue;
      const t = TYPE(p);
      if (t === PAWN) {
        const r = RANK(sq), one = sq + dir;
        if (ON(one) && !b[one]) {
          if (r === promoR) { for (let pr = QUEEN; pr >= KNIGHT; pr--) list.push(mk(sq, one, pr, F_PROMO)); }
          else if (!capturesOnly) { list.push(mk(sq, one, 0, 0)); if (r === startR && !b[one + dir]) list.push(mk(sq, one + dir, 0, F_DBL)); }
        }
        for (let d = -1; d <= 1; d += 2) {
          const to = one + d; if (!ON(to)) continue;
          const q = b[to];
          if (q && COLOR(q) === them) { if (r === promoR) { for (let pr = QUEEN; pr >= KNIGHT; pr--) list.push(mk(sq, to, pr, F_PROMO | F_CAP)); } else list.push(mk(sq, to, 0, F_CAP)); }
          else if (to === this.ep && !q) list.push(mk(sq, to, 0, F_EP | F_CAP));
        }
      } else if (t === KNIGHT || t === KING) {
        const D = t === KNIGHT ? KN : KG;
        for (let i = 0; i < 8; i++) { const to = sq + D[i]; if (!ON(to)) continue; const q = b[to]; if (!q) { if (!capturesOnly) list.push(mk(sq, to, 0, 0)); } else if (COLOR(q) === them) list.push(mk(sq, to, 0, F_CAP)); }
      } else {
        const D = t === BISHOP ? BI : t === ROOK ? RO : KG;
        for (let i = 0; i < D.length; i++) { let to = sq + D[i]; while (ON(to)) { const q = b[to]; if (!q) { if (!capturesOnly) list.push(mk(sq, to, 0, 0)); } else { if (COLOR(q) === them) list.push(mk(sq, to, 0, F_CAP)); break; } to += D[i]; } }
      }
    }
    if (!capturesOnly) {
      if (us === WHITE) {
        if ((this.castling & 1) && !b[F1] && !b[G1] && b[E1] === KING && b[H1] === ROOK && !this.isAttacked(E1, BLACK) && !this.isAttacked(F1, BLACK) && !this.isAttacked(G1, BLACK)) list.push(mk(E1, G1, 0, F_CASTLE));
        if ((this.castling & 2) && !b[D1] && !b[C1] && !b[1] && b[E1] === KING && b[A1] === ROOK && !this.isAttacked(E1, BLACK) && !this.isAttacked(D1, BLACK) && !this.isAttacked(C1, BLACK)) list.push(mk(E1, C1, 0, F_CASTLE));
      } else {
        if ((this.castling & 4) && !b[F8] && !b[G8] && b[E8] === (KING | BLACK) && b[H8] === (ROOK | BLACK) && !this.isAttacked(E8, WHITE) && !this.isAttacked(F8, WHITE) && !this.isAttacked(G8, WHITE)) list.push(mk(E8, G8, 0, F_CASTLE));
        if ((this.castling & 8) && !b[D8] && !b[C8] && !b[113] && b[E8] === (KING | BLACK) && b[A8] === (ROOK | BLACK) && !this.isAttacked(E8, WHITE) && !this.isAttacked(D8, WHITE) && !this.isAttacked(C8, WHITE)) list.push(mk(E8, C8, 0, F_CASTLE));
      }
    }
    return list;
  };

  P.make = function (m) {
    const b = this.board, from = FROM(m), to = TO(m), flags = FLAGS(m), us = this.turn, piece = b[from];
    let captured = b[to], capSq = to;
    if (flags & F_EP) { capSq = to - (us === WHITE ? 16 : -16); captured = b[capSq]; }
    this.hist.push({ m: m, captured: captured, capSq: capSq, castling: this.castling, ep: this.ep, halfmove: this.halfmove, h1: this.h1, h2: this.h2, irrevIdx: this.irrevIdx });
    let h1 = this.h1, h2 = this.h2;
    h1 ^= Z1C[this.castling]; h2 ^= Z2C[this.castling];
    if (this.ep >= 0) { h1 ^= Z1E[FILE(this.ep)]; h2 ^= Z2E[FILE(this.ep)]; }
    if (captured) { b[capSq] = 0; h1 ^= Z1[captured][capSq]; h2 ^= Z2[captured][capSq]; }
    const placed = (flags & F_PROMO) ? (PROMO(m) | us) : piece;
    b[from] = 0; b[to] = placed;
    h1 ^= Z1[piece][from] ^ Z1[placed][to]; h2 ^= Z2[piece][from] ^ Z2[placed][to];
    if (TYPE(piece) === KING) {
      this.kings[us ? 1 : 0] = to;
      if (flags & F_CASTLE) {
        let rf, rt;
        if (to === G1) { rf = H1; rt = F1; } else if (to === C1) { rf = A1; rt = D1; } else if (to === G8) { rf = H8; rt = F8; } else { rf = A8; rt = D8; }
        const rook = b[rf]; b[rf] = 0; b[rt] = rook; h1 ^= Z1[rook][rf] ^ Z1[rook][rt]; h2 ^= Z2[rook][rf] ^ Z2[rook][rt];
      }
    }
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = (flags & F_DBL) ? from + (us === WHITE ? 16 : -16) : -1;
    h1 ^= Z1C[this.castling]; h2 ^= Z2C[this.castling];
    if (this.ep >= 0) { h1 ^= Z1E[FILE(this.ep)]; h2 ^= Z2E[FILE(this.ep)]; }
    const irreversible = TYPE(piece) === PAWN || captured !== 0 || (flags & F_CASTLE);
    this.halfmove = irreversible ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = us ^ 8; h1 ^= Z1S; h2 ^= Z2S;
    this.h1 = h1 >>> 0; this.h2 = h2 >>> 0;
    this.hashHist1.push(this.h1); this.hashHist2.push(this.h2);
    if (irreversible) this.irrevIdx = this.hashHist1.length - 1;
  };
  P.unmake = function () {
    const h = this.hist.pop(); if (!h) return;
    const b = this.board, m = h.m, from = FROM(m), to = TO(m), flags = FLAGS(m);
    this.turn ^= 8; const us = this.turn;
    if (us === BLACK) this.fullmove--;
    const placed = b[to]; const piece = (flags & F_PROMO) ? (PAWN | us) : placed;
    b[from] = piece; b[to] = 0;
    if (h.captured) b[h.capSq] = h.captured;
    if (TYPE(piece) === KING) {
      this.kings[us ? 1 : 0] = from;
      if (flags & F_CASTLE) { let rf, rt; if (to === G1) { rf = H1; rt = F1; } else if (to === C1) { rf = A1; rt = D1; } else if (to === G8) { rf = H8; rt = F8; } else { rf = A8; rt = D8; } b[rf] = b[rt]; b[rt] = 0; }
    }
    this.castling = h.castling; this.ep = h.ep; this.halfmove = h.halfmove; this.h1 = h.h1; this.h2 = h.h2; this.irrevIdx = h.irrevIdx;
    this.hashHist1.pop(); this.hashHist2.pop();
  };
  /* null move (search only) */
  P.makeNull = function () {
    this.hist.push({ m: 0, nul: true, ep: this.ep, h1: this.h1, h2: this.h2, halfmove: this.halfmove, castling: this.castling, irrevIdx: this.irrevIdx });
    let h1 = this.h1, h2 = this.h2; if (this.ep >= 0) { h1 ^= Z1E[FILE(this.ep)]; h2 ^= Z2E[FILE(this.ep)]; }
    this.ep = -1; this.turn ^= 8; h1 ^= Z1S; h2 ^= Z2S; this.h1 = h1 >>> 0; this.h2 = h2 >>> 0;
    this.hashHist1.push(this.h1); this.hashHist2.push(this.h2); this.irrevIdx = this.hashHist1.length - 1;
  };
  P.unmakeNull = function () { const h = this.hist.pop(); this.turn ^= 8; this.ep = h.ep; this.h1 = h.h1; this.h2 = h.h2; this.irrevIdx = h.irrevIdx; this.hashHist1.pop(); this.hashHist2.pop(); };

  P.legalMoves = function () {
    const pseudo = this.generate(false), out = [], us = this.turn, them = us ^ 8, ki = us ? 1 : 0;
    for (let i = 0; i < pseudo.length; i++) { this.make(pseudo[i]); if (!this.isAttacked(this.kings[ki], them)) out.push(pseudo[i]); this.unmake(); }
    return out;
  };
  P.isLegal = function (m) { const ki = this.turn ? 1 : 0, them = this.turn ^ 8; this.make(m); const ok = !this.isAttacked(this.kings[ki], them); this.unmake(); return ok; };
  P.repetitionCount = function () { let n = 0; for (let i = this.hashHist1.length - 1; i >= this.irrevIdx; i--) if (this.hashHist1[i] === this.h1 && this.hashHist2[i] === this.h2) n++; return n; };
  P.insufficientMaterial = function () {
    let minors = 0, bishopsSq = []; const b = this.board;
    for (let s = 0; s < 128; s++) { if (!ON(s)) { s += 7; continue; } const p = b[s]; if (!p) continue; const t = TYPE(p); if (t === PAWN || t === ROOK || t === QUEEN) return false; if (t === KNIGHT) minors++; if (t === BISHOP) { minors++; bishopsSq.push(s); } }
    if (minors <= 1) return true;
    if (bishopsSq.length === minors) { const col = ((FILE(bishopsSq[0]) + RANK(bishopsSq[0])) & 1); return bishopsSq.every(s => ((FILE(s) + RANK(s)) & 1) === col); }
    return false;
  };
  P.status = function () {
    const legal = this.legalMoves(), check = this.inCheck();
    if (!legal.length) return check ? { over: true, result: this.turn === WHITE ? '0-1' : '1-0', reason: 'checkmate', check: true, legal: legal } : { over: true, result: '1/2-1/2', reason: 'stalemate', check: false, legal: legal };
    if (this.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', check: check, legal: legal };
    if (this.repetitionCount() >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition', check: check, legal: legal };
    if (this.insufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient material', check: check, legal: legal };
    return { over: false, result: null, reason: null, check: check, legal: legal };
  };

  /* ---- notation ---- */
  P.san = function (m, legal) {
    legal = legal || this.legalMoves();
    const from = FROM(m), to = TO(m), flags = FLAGS(m), piece = this.board[from], t = TYPE(piece);
    let s;
    if (flags & F_CASTLE) s = (to === G1 || to === G8) ? 'O-O' : 'O-O-O';
    else if (t === PAWN) { s = (flags & F_CAP) ? 'abcdefgh'[FILE(from)] + 'x' + sqName(to) : sqName(to); if (flags & F_PROMO) s += '=' + LETTER[PROMO(m)]; }
    else {
      s = LETTER[t];
      const others = legal.filter(x => x !== m && TO(x) === to && TYPE(this.board[FROM(x)]) === t);
      if (others.length) {
        const sameFile = others.some(x => FILE(FROM(x)) === FILE(from)), sameRank = others.some(x => RANK(FROM(x)) === RANK(from));
        if (!sameFile) s += 'abcdefgh'[FILE(from)]; else if (!sameRank) s += (RANK(from) + 1); else s += sqName(from);
      }
      if (flags & F_CAP) s += 'x'; s += sqName(to);
    }
    this.make(m); const st = this.inCheck(); if (st) s += this.legalMoves().length ? '+' : '#'; this.unmake();
    return s;
  };
  P.fromSan = function (san) {
    const clean = san.replace(/[+#?!]/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').trim();
    const legal = this.legalMoves();
    for (const m of legal) { const s = this.san(m, legal).replace(/[+#]/g, ''); if (s === clean) return m; }
    const alt = clean.replace('=', '');
    for (const m of legal) { const s = this.san(m, legal).replace(/[+#]/g, '').replace('=', ''); if (s === alt) return m; }
    return 0;
  };
  const toUci = m => sqName(FROM(m)) + sqName(TO(m)) + (PROMO(m) ? LETTER[PROMO(m)].toLowerCase() : '');
  P.fromUci = function (u) { const from = sqFrom(u.slice(0, 2)), to = sqFrom(u.slice(2, 4)), pr = u[4] ? TYPEMAP[u[4].toUpperCase()] : 0; const legal = this.legalMoves(); for (const m of legal) if (FROM(m) === from && TO(m) === to && (PROMO(m) || 0) === (pr || 0)) return m; return 0; };

  /* ---- perft ---- */
  function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = pos.generate(false), ki = pos.turn ? 1 : 0, them = pos.turn ^ 8; let n = 0;
    for (let i = 0; i < moves.length; i++) { pos.make(moves[i]); if (!pos.isAttacked(pos.kings[ki], them)) n += depth === 1 ? 1 : perft(pos, depth - 1); pos.unmake(); }
    return n;
  }

  /* ---- PGN ---- */
  function pgnExport(headers, sans, result, opts) {
    opts = opts || {};
    const h = Object.assign({ Event: 'Casual game', Site: 'Grand Chess', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), Round: '-', White: 'White', Black: 'Black', Result: result || '*' }, headers || {});
    let out = Object.keys(h).map(k => '[' + k + ' "' + h[k] + '"]').join('\n') + '\n\n', line = '';
    const startNo = opts.moveNo || 1, blackFirst = !!opts.blackFirst;
    sans.forEach((s, i) => {
      const ply = i + (blackFirst ? 1 : 0), no = startNo + Math.floor(ply / 2);
      const tok = (ply % 2 === 0 ? no + '. ' : (i === 0 && blackFirst ? no + '... ' : '')) + s + ' ';
      if (line.length + tok.length > 78) { out += line.trim() + '\n'; line = ''; } line += tok;
    });
    out += line + (result || '*') + '\n';
    return out;
  }
  function pgnImport(text) {
    const headers = {}; let body = text;
    body = body.replace(/\[(\w+)\s+"([^"]*)"\]\s*/g, (all, k, v) => { headers[k] = v; return ''; });
    body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ').replace(/\$\d+/g, ' ');
    let depth = 0, stripped = ''; for (const ch of body) { if (ch === '(') depth++; else if (ch === ')') depth--; else if (!depth) stripped += ch; }
    const tokens = stripped.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
    const result = tokens.find(t => /^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) || null;
    const sans = tokens.filter(t => !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) && !/^\.+$/.test(t));
    return { headers: headers, sans: sans, result: result, fen: headers.FEN || null };
  }

  Object.assign(CHESS, {
    EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK, TYPE, COLOR, FILE, RANK, SQ, ON,
    F_CAP, F_DBL, F_EP, F_CASTLE, F_PROMO, mk, FROM, TO, PROMO, FLAGS, LETTER, START,
    Position, perft, sqName, sqFrom, toUci, pgnExport, pgnImport
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = CHESS;
})(typeof self !== 'undefined' ? self : globalThis);

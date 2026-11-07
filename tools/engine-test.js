/* Engine sanity: forced mates must be found with the right first move, plus a timing/strength probe.
   usage: node tools/engine-test.js */
'use strict';
const CHESS = require('../js/chess.js'); require('../js/engine.js');
const E = CHESS.Engine;
const TESTS = [
  { name: "Fool's mate (mate in 1)", fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', best: 'd8h4', mateIn: 1 },
  { name: "Scholar's mate (mate in 1)", fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', best: 'h5f7', mateIn: 1 },
  { name: 'King and rook (mate in 2)', fen: '7k/1p6/5K2/8/8/8/8/R7 w - - 0 1', best: ['f6g6', 'f6f7'], mateIn: 2 },
  { name: 'Boxed king, queen mate (mate in 1)', fen: '7k/4N1pp/8/7Q/8/8/6K1/4R3 w - - 0 1', best: ['h5e8', 'h5h7'], mateIn: 2 },
  { name: 'Back-rank mate (mate in 1)', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', best: 'a1a8', mateIn: 1 }
];
let failed = 0;
for (const t of TESTS) {
  const pos = new CHESS.Position(t.fen);
  const r = E.search(pos, 5, { timeMs: 6000, maxDepth: 8 });
  const uci = CHESS.toUci(r.move), mateScore = r.score > E.MATE - 1000 ? Math.ceil((E.MATE - r.score) / 2) : null;
  const ok = (Array.isArray(t.best) ? t.best.indexOf(uci) >= 0 : uci === t.best) && mateScore !== null && mateScore <= t.mateIn;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + t.name.padEnd(32) + ' best ' + uci + (mateScore ? '  mate in ' + mateScore : '  score ' + r.score) + '  depth ' + r.depth + '  ' + r.nodes + ' nodes  ' + r.ms + ' ms');
}
/* strength probe: nodes per second from the start position */
const pos = new CHESS.Position();
const r = E.search(pos, 5, { timeMs: 3000, maxDepth: 7 });
console.log('start position: best ' + CHESS.toUci(r.move) + '  score ' + r.score + '  depth ' + r.depth + '  ' + r.nodes + ' nodes in ' + r.ms + ' ms  (' + Math.round(r.nodes / Math.max(1, r.ms)) + ' kN/s)');
/* notation round trip */
const p2 = new CHESS.Position(); const sans = [];
['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O'].forEach(s => { const m = p2.fromSan(s); if (!m) { failed++; console.log('FAIL  SAN parse ' + s); return; } sans.push(p2.san(m)); p2.make(m); });
console.log('SAN round trip: ' + sans.join(' ') + '  fen ' + p2.fen());
const pgn = CHESS.pgnExport({ White: 'Test', Black: 'Test' }, sans, '*'); const imp = CHESS.pgnImport(pgn);
if (imp.sans.join(' ') !== sans.join(' ')) { failed++; console.log('FAIL  PGN round trip'); } else console.log('PGN round trip ok (' + imp.sans.length + ' moves)');
console.log(failed ? '\n' + failed + ' FAILURE(S)' : '\nall engine tests passed');
process.exitCode = failed ? 1 : 0;

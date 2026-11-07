/* Perft verification of the move generator against the standard reference counts.
   usage: node tools/perft.js [--quick] */
'use strict';
const CHESS = require('../js/chess.js');
const CASES = [
  { name: 'start position', fen: CHESS.START, counts: [20, 400, 8902, 197281] },
  { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', counts: [48, 2039, 97862] },
  { name: 'position 3', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238] },
  { name: 'position 4', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', counts: [6, 264, 9467] },
  { name: 'position 5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', counts: [44, 1486, 62379] }
];
let failed = 0;
for (const c of CASES) {
  const pos = new CHESS.Position(c.fen);
  for (let d = 1; d <= c.counts.length; d++) {
    const t0 = Date.now(), n = CHESS.perft(pos, d), ms = Date.now() - t0, ok = n === c.counts[d - 1];
    if (!ok) failed++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + c.name.padEnd(16) + ' depth ' + d + '  ' + String(n).padStart(8) + (ok ? '' : '  expected ' + c.counts[d - 1]) + '  (' + ms + ' ms)');
  }
  if (pos.fen() !== new CHESS.Position(c.fen).fen()) { failed++; console.log('FAIL  position not restored after perft: ' + pos.fen()); }
}
console.log(failed ? '\n' + failed + ' FAILURE(S)' : '\nall perft counts match');
process.exitCode = failed ? 1 : 0;

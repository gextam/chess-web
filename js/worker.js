/* CHESS — engine worker: receives a position + move history, replies with the best move. */
importScripts('chess.js', 'engine.js');
self.onmessage = function (ev) {
  const msg = ev.data;
  if (msg.type !== 'search') return;
  const pos = new CHESS.Position(msg.fen || CHESS.START);
  (msg.moves || []).forEach(u => { const m = pos.fromUci(u); if (m) pos.make(m); });
  let move = 0;
  if (msg.useBook && (msg.moves || []).length < 4) move = CHESS.Engine.bookMove(pos, msg.moves || []);
  if (move) { self.postMessage({ type: 'bestmove', id: msg.id, move: CHESS.toUci(move), score: 0, depth: 0, book: true, pv: [CHESS.toUci(move)] }); return; }
  const res = CHESS.Engine.search(pos, msg.level, { timeMs: msg.timeMs, maxDepth: msg.maxDepth, onIter: r => self.postMessage({ type: 'info', id: msg.id, depth: r.depth, score: r.score, nodes: r.nodes, pv: r.pv.map(CHESS.toUci) }) });
  if (!res) { self.postMessage({ type: 'bestmove', id: msg.id, move: null }); return; }
  self.postMessage({ type: 'bestmove', id: msg.id, move: CHESS.toUci(res.move), score: res.score, depth: res.depth, nodes: res.nodes, ms: res.ms, pv: res.pv.map(CHESS.toUci) });
};

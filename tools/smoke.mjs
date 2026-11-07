#!/usr/bin/env node
/* Headless smoke test: rules through the UI layer, promotion dialog, undo/redo, PGN, engine reply, mate detection, hint, real mouse input.
   usage: node tools/smoke.mjs [--chrome=<path>] */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, wait } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
let failed = 0;
function check(name, ok, info) { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }

const { page, errors, close, W, H } = await launch(ROOT, { chrome: args.chrome });
try {
  const ev = expr => page.eval(expr);
  await ev(`CHESS_APP.ui.start(); CHESS_APP.step(0.3); true`);
  const hvh = fen => ev(`CHESS_APP.game.newGame({ white: 'human', black: 'human'${fen ? ", fen: '" + fen + "'" : ''} }); CHESS_APP.step(0.2); CHESS_APP.game.state().fen`);
  const play = sans => ev(`(${JSON.stringify(sans)}).every(s => CHESS_APP.game.playSan(s)) && (CHESS_APP.step(0.6), true)`);
  const state = () => ev(`JSON.stringify(CHESS_APP.game.state())`).then(JSON.parse);

  /* 1. castling both sides */
  await hvh(); check('scripted moves incl. both castlings accepted', await play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'd3', 'd6', 'Bg5', 'O-O']));
  let st = await state(); check('castling rights consumed, SAN list right', st.fen.split(' ')[2] === '-' && st.sans.filter(s => s === 'O-O').length === 2, st.fen);
  /* 2. en passant */
  await hvh(); await play(['e4', 'a6', 'e5', 'd5', 'exd6']); st = await state();
  check('en passant capture', st.sans[4] === 'exd6' && /^rnbqkbnr\/1pp1pppp\/p2P4\/8\/8\/8\/PPPP1PPP\/RNBQKBNR b/.test(st.fen), st.fen);
  /* 3. promotion through the dialog */
  await hvh('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const promo = await ev(`const g = CHESS_APP.game; g.tryMove(CHESS.sqFrom('a7'), CHESS.sqFrom('a8')); JSON.stringify({ pending: !!g.pendingPromo, visible: !document.getElementById('promo').classList.contains('hidden') })`).then(JSON.parse);
  check('promotion dialog opens', promo.pending && promo.visible, promo);
  await ev(`CHESS_APP.game.choosePromotion('N'); CHESS_APP.step(0.6); true`); st = await state();
  check('underpromotion to knight applied', st.sans[0] === 'a8=N' && st.fen.startsWith('N7/7k'), st.sans[0] + ' ' + st.fen);
  /* 4. undo / redo */
  await hvh(); await play(['d4', 'd5', 'c4', 'e6']); const before = (await state()).fen;
  await ev(`CHESS_APP.game.undo(); CHESS_APP.step(0.2); true`); const afterUndo = (await state()).fen;
  await ev(`CHESS_APP.game.redo(); CHESS_APP.step(0.6); true`); const afterRedo = (await state()).fen;
  check('undo steps back one ply and redo restores', afterUndo.startsWith('rnbqkbnr/ppp2ppp/4p3/3p4/2PP4') === false && afterUndo !== before && afterRedo === before, { afterUndo, afterRedo });
  /* 5. PGN round trip */
  const pgn = await ev(`CHESS_APP.game.pgn()`); const fenBefore = (await state()).fen;
  const n = await ev(`CHESS_APP.game.loadPgn(${JSON.stringify(pgn)})`); const fenAfter = (await state()).fen;
  check('PGN export/import round trip', /1\. d4 d5 2\. c4 e6/.test(pgn) && n === 4 && fenAfter === fenBefore, { n });
  /* 6. engine replies from the worker */
  await ev(`CHESS_APP.game.newGame({ white: 'human', black: 'ai', level: 2 }); CHESS_APP.game.playSan('e4'); true`);
  let replied = false; for (let i = 0; i < 60 && !replied; i++) { await wait(200); await ev(`CHESS_APP.step(0.2); true`); replied = (await state()).sans.length >= 2; }
  st = await state(); check('engine (level 2) answered 1.e4', replied, st.sans.join(' '));
  /* 7. checkmate detection + overlay */
  await hvh('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2'); await play(['Qh4#']); st = await state();
  await wait(900); const overlay = await ev(`!document.getElementById('gameover').classList.contains('hidden')`);
  check("fool's mate detected", st.over && st.reason === 'checkmate' && st.result === '0-1' && overlay, { over: st.over, reason: st.reason, result: st.result, overlay });
  /* 8. draws: stalemate & insufficient material & repetition */
  await hvh('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); st = await state(); check('stalemate detected on load', st.over && st.reason === 'stalemate', st.reason);
  await hvh('8/8/8/4k3/8/8/8/4K1B1 w - - 0 1'); st = await state(); check('insufficient material detected', st.over && st.reason === 'insufficient material', st.reason);
  await hvh(); await play(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']); st = await state(); check('threefold repetition detected', st.over && st.reason === 'threefold repetition', st.reason);
  /* 9. hint arrow */
  await hvh(); await ev(`CHESS_APP.game.hint(); true`);
  let hint = false; for (let i = 0; i < 30 && !hint; i++) { await wait(200); hint = await ev(`!!CHESS_APP.renderer.hint`); }
  check('hint arrow appears', hint);
  /* 10. real mouse input: click e2 then e4 */
  await hvh();
  const scale = Math.min(W / 1920, H / 1080), toWin = (x, y) => ({ x: (x - 960) * scale + W / 2, y: (y - 540) * scale + H / 2 });
  const e2 = await ev(`JSON.stringify(CHESS_APP.renderer.sqRect(CHESS.sqFrom('e2')))`).then(JSON.parse), e4 = await ev(`JSON.stringify(CHESS_APP.renderer.sqRect(CHESS.sqFrom('e4')))`).then(JSON.parse);
  for (const r of [e2, e4]) { const p = toWin(r.cx, r.cy); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, pointerType: 'mouse' }); await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, pointerType: 'mouse' }); await wait(80); }
  await ev(`CHESS_APP.step(0.5); true`); st = await state(); check('mouse click-click plays e2-e4', st.sans[0] === 'e4', st.sans.join(' '));
  /* 11. drag input: d2 -> d4 */
  const d2 = await ev(`JSON.stringify(CHESS_APP.renderer.sqRect(CHESS.sqFrom('d7')))`).then(JSON.parse), d4 = await ev(`JSON.stringify(CHESS_APP.renderer.sqRect(CHESS.sqFrom('d5')))`).then(JSON.parse);
  const a = toWin(d2.cx, d2.cy), b = toWin(d4.cx, d4.cy);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 6, y: a.y + (b.y - a.y) * i / 6, button: 'left' });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await ev(`CHESS_APP.step(0.5); true`); st = await state(); check('mouse drag plays d7-d5', st.sans[1] === 'd5', st.sans.join(' '));
  /* 12. clocks run and flag */
  await ev(`CHESS_APP.game.newGame({ white: 'human', black: 'human', clock: '1+0' }); CHESS_APP.game.playSan('e4'); CHESS_APP.step(61); true`); st = await state();
  check('clock flag ends the game', st.over && st.reason === 'time' && st.result === '1-0', { reason: st.reason, result: st.result });
  check('no page errors', errors.length === 0, errors);
} finally { await close(); }
console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
process.exitCode = failed ? 1 : 0;

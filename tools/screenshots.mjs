#!/usr/bin/env node
/* Documentation screenshots via headless Chrome. usage: node tools/screenshots.mjs [--chrome=<path>] */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, wait } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'docs', 'screenshots');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
await fs.mkdir(OUT, { recursive: true });
const { page, errors, close } = await launch(ROOT, { chrome: args.chrome });
const shot = async name => { await page.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await page.shot(path.join(OUT, name + '.jpg')); console.log('  saved docs/screenshots/' + name + '.jpg'); };
try {
  await shot('splash');
  await page.eval(`CHESS_APP.ui.start(); CHESS_APP.game.newGame({ white: 'human', black: 'human' }); CHESS_APP.step(0.4); true`);
  await shot('start');
  await page.eval(`['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6','Be3','e5','Nb3','Be6','f3','Be7','Qd2','O-O','O-O-O','Nbd7'].forEach(s => CHESS_APP.game.playSan(s)); CHESS_APP.step(0.8); CHESS_APP.game.select(CHESS.sqFrom('g2')); true`);
  await shot('midgame');
  await page.eval(`CHESS_APP.game.deselect(); CHESS_APP.game.newGame({ white: 'human', black: 'human', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4' }); CHESS_APP.game.playSan('Bxf7+'); CHESS_APP.step(0.8); true`);
  await shot('check');
  await page.eval(`CHESS_APP.game.newGame({ white: 'human', black: 'human', fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' }); CHESS_APP.game.tryMove(CHESS.sqFrom('a7'), CHESS.sqFrom('a8')); CHESS_APP.step(0.2); true`);
  await shot('promotion');
  await page.eval(`CHESS_APP.game.choosePromotion('Q'); CHESS_APP.game.newGame({ white: 'human', black: 'human', fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2' }); CHESS_APP.game.playSan('Qh4#'); CHESS_APP.step(0.8); true`);
  await wait(900); await shot('checkmate');
  await page.eval(`CHESS_APP.ui.hideOverlays(); CHESS_APP.game.newGame({ white: 'ai', black: 'human', level: 3, clock: '5+0' }); CHESS_APP.step(0.3); document.getElementById('settings').classList.remove('hidden'); true`);
  await wait(1500); await page.eval(`CHESS_APP.step(0.4); true`); await shot('settings');
  await page.eval(`document.getElementById('settings').classList.add('hidden'); document.getElementById('pgnbox').classList.remove('hidden'); document.getElementById('pgn-text').value = CHESS_APP.game.pgn(); true`);
  await shot('pgn');
  await fs.copyFile(path.join(OUT, 'midgame.jpg'), path.join(OUT, 'hero.jpg'));
} finally { await close(); }
if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(e => console.log(' -', e)); process.exitCode = 2; } else console.log('no page errors');

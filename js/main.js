/* ============================================================================
   CHESS — bootstrap, frame loop, test hooks.
   ?mute=1 · ?fen=<fen> · ?white=human|ai · ?black=human|ai · ?level=1-5 · ?clock=5+0
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.CHESS;
  root.addEventListener('load', () => {
    const q = new URLSearchParams(root.location.search);
    const canvas = document.getElementById('game');
    const game = new C.Game(), renderer = new C.Renderer(canvas, game); game.renderer = renderer;
    const ui = new C.UI(game, renderer); game.ui = ui;
    const APP = root.CHESS_APP = { game: game, renderer: renderer, ui: ui };
    if (q.get('white')) ui.el.white.value = q.get('white'); if (q.get('black')) ui.el.black.value = q.get('black');
    if (q.get('level')) { ui.el.level.value = q.get('level'); ui.el.levelName.textContent = C.Engine.LEVELS[parseInt(q.get('level'), 10) - 1].name; }
    if (q.get('clock')) ui.el.clock.value = q.get('clock');
    APP.startFen = q.get('fen') || null;
    C.assets.load(() => {}).then(() => { C.assets.prepare(C.LAYOUT.BOARD.sq); ui.assetsLoaded(); if (APP.startFen) { game.mode.white = ui.el.white.value; game.mode.black = ui.el.black.value; game.level = parseInt(ui.el.level.value, 10); game.newGame({ fen: APP.startFen, clock: ui.el.clock.value }); } });

    APP.timeOffset = 0;
    const clock = () => performance.now() / 1000 + APP.timeOffset;
    let last = clock();
    function tick(now, dt, draw) { game.update(now, dt); renderer.update(dt); if (draw) { renderer.draw(now); ui.refresh(); } }
    function frame() { const now = clock(), dt = Math.min(0.05, Math.max(0, now - last)); last = now; tick(now, dt, true); requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
    APP.step = function (seconds) { const h = 1 / 60, n = Math.max(1, Math.round(seconds / h)); for (let i = 0; i < n; i++) { APP.timeOffset += h; const now = clock(); last = now; tick(now, h, i === n - 1); } };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.audio.ctx) C.audio.ctx.resume(); });
  });
})(window);

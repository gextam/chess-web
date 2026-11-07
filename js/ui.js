/* ============================================================================
   CHESS — DOM: side panel (players, clocks, captured material, move list,
   controls, settings, PGN/FEN), promotion dialog, game-over overlay, splash,
   board pointer handling (click-click and drag), keyboard.
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.CHESS, A = () => C.audio, ASSETS = C.assets;
  const $ = id => document.getElementById(id);
  const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9 };

  function UI(game, renderer) {
    this.game = game; this.renderer = renderer; this.movesDirty = true; this.splashVisible = true; this.ready = false; this.drag = null; this.lastClock = '';
    this.el = { canvas: $('game'), moves: $('moves'), status: $('status'), engine: $('engine-info'), fen: $('fen'), topName: $('top-name'), topClock: $('top-clock'), topCap: $('top-cap'), botName: $('bot-name'), botClock: $('bot-clock'), botCap: $('bot-cap'),
      newBtn: $('btn-new'), undo: $('btn-undo'), redo: $('btn-redo'), hint: $('btn-hint'), flip: $('btn-flip'), resign: $('btn-resign'), pgnBtn: $('btn-pgn'), settingsBtn: $('btn-settings'), sound: $('btn-sound'), vol: $('vol'),
      settings: $('settings'), white: $('sel-white'), black: $('sel-black'), level: $('sel-level'), levelName: $('level-name'), clock: $('sel-clock'), apply: $('btn-apply'), pgnBox: $('pgnbox'), pgnText: $('pgn-text'), pgnCopy: $('btn-pgn-copy'), pgnLoad: $('btn-pgn-load'), fenLoad: $('btn-fen-load'), pgnClose: $('btn-pgn-close'),
      promo: $('promo'), promoBtns: Array.from(document.querySelectorAll('#promo button')), over: $('gameover'), overTitle: $('over-title'), overReason: $('over-reason'), overNew: $('btn-over-new'), overRematch: $('btn-over-rematch'), overClose: $('btn-over-close'),
      splash: $('splash'), splashText: $('splash-text') };
    this.bind();
  }
  const P = UI.prototype;
  P.bind = function () {
    const g = this.game, e = this.el, R = this.renderer;
    const press = (el, fn) => el.addEventListener('click', ev => { ev.preventDefault(); A().init(); fn(); });
    press(e.newBtn, () => { A().click(); this.applySettings(true); });
    press(e.undo, () => g.undo()); press(e.redo, () => { A().click(); g.redo(); }); press(e.hint, () => { A().click(); g.hint(); }); press(e.flip, () => { A().click(); g.flip(); }); press(e.resign, () => { A().click(); g.resign(); });
    press(e.settingsBtn, () => { A().click(); e.settings.classList.toggle('hidden'); e.pgnBox.classList.add('hidden'); });
    press(e.apply, () => { A().click(); this.applySettings(true); e.settings.classList.add('hidden'); });
    press(e.pgnBtn, () => { A().click(); e.pgnBox.classList.toggle('hidden'); e.settings.classList.add('hidden'); e.pgnText.value = g.pgn(); });
    press(e.pgnClose, () => e.pgnBox.classList.add('hidden'));
    press(e.pgnCopy, () => { e.pgnText.select(); try { document.execCommand('copy'); } catch (x) { /* ignore */ } if (navigator.clipboard) navigator.clipboard.writeText(e.pgnText.value).catch(() => {}); this.flash('PGN copied'); });
    press(e.pgnLoad, () => { const n = g.loadPgn(e.pgnText.value); this.flash(n ? 'Loaded ' + n + ' moves' : 'No moves found in that PGN'); if (n) e.pgnBox.classList.add('hidden'); });
    press(e.fenLoad, () => { const t = e.pgnText.value.trim(); if (g.loadFen(t)) { this.flash('Position loaded'); e.pgnBox.classList.add('hidden'); } else this.flash('That is not a valid FEN'); });
    press(e.sound, () => { const m = A().toggleMute(); this.updateSound(); if (!m) A().click(); });
    e.vol.addEventListener('input', () => { A().init(); A().setVolume(parseFloat(e.vol.value)); if (A().muted) { A().setMuted(false); this.updateSound(); } });
    e.level.addEventListener('input', () => { e.levelName.textContent = C.Engine.LEVELS[parseInt(e.level.value, 10) - 1].name; });
    e.promoBtns.forEach(b => press(b, () => g.choosePromotion(b.dataset.p)));
    press(e.overNew, () => { this.hideOverlays(); this.applySettings(true); });
    press(e.overRematch, () => { this.hideOverlays(); const w = e.white.value, b = e.black.value; e.white.value = b; e.black.value = w; this.applySettings(true); });
    press(e.overClose, () => this.hideOverlays());
    e.splash.addEventListener('pointerdown', () => { if (this.ready) this.start(); });
    /* board pointer */
    const sceneXY = ev => ({ x: ev.offsetX, y: ev.offsetY });
    e.canvas.addEventListener('pointerdown', ev => {
      if (this.splashVisible) return; A().init(); const p = sceneXY(ev), sq = R.sqAt(p.x, p.y); if (sq < 0) { g.deselect(); return; }
      if (g.selected >= 0 && g.targets.some(m => C.TO(m) === sq)) { g.tryMove(g.selected, sq); return; }
      if (g.select(sq)) { const pc = g.pos.board[sq]; R.drag = { sq: sq, key: ASSETS.codeOf(pc), x: p.x, y: p.y, moved: false }; e.canvas.setPointerCapture(ev.pointerId); }
      else g.deselect();
    });
    e.canvas.addEventListener('pointermove', ev => {
      const p = sceneXY(ev); g.hover = R.sqAt(p.x, p.y);
      if (R.drag) { R.drag.x = p.x; R.drag.y = p.y; if (Math.hypot(p.x - R.sqRect(R.drag.sq).cx, p.y - R.sqRect(R.drag.sq).cy) > 8) R.drag.moved = true; }
      e.canvas.style.cursor = (g.isHumanTurn() && (R.drag || (g.hover >= 0 && (g.pos.board[g.hover] && C.COLOR(g.pos.board[g.hover]) === g.pos.turn || (g.selected >= 0 && g.targets.some(m => C.TO(m) === g.hover)))))) ? 'pointer' : 'default';
    });
    const release = ev => {
      if (!R.drag) return; const p = sceneXY(ev), sq = R.sqAt(p.x, p.y), d = R.drag; R.drag = null;
      if (d.moved && sq >= 0 && sq !== d.sq) { if (!g.tryMove(d.sq, sq)) g.deselect(); }
      else if (d.moved) g.deselect();
    };
    e.canvas.addEventListener('pointerup', release); e.canvas.addEventListener('pointercancel', release);
    root.addEventListener('keydown', ev => {
      if (ev.repeat || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT') return;
      if (this.splashVisible) { if (ev.code === 'Space' || ev.code === 'Enter') { A().init(); if (this.ready) this.start(); } return; }
      A().init();
      switch (ev.code) {
        case 'KeyN': this.applySettings(true); break; case 'KeyU': case 'ArrowLeft': g.undo(); break; case 'KeyR': case 'ArrowRight': g.redo(); break; case 'KeyH': g.hint(); break; case 'KeyF': g.flip(); break;
        case 'KeyM': A().toggleMute(); this.updateSound(); break; case 'Escape': g.deselect(); this.hideOverlays(); e.settings.classList.add('hidden'); e.pgnBox.classList.add('hidden'); break; default: break;
      }
    });
    e.vol.value = A().volume; this.updateSound(); e.levelName.textContent = C.Engine.LEVELS[parseInt(e.level.value, 10) - 1].name;
  };
  P.applySettings = function (start) {
    const e = this.el; this.game.level = parseInt(e.level.value, 10);
    this.game.newGame({ white: e.white.value, black: e.black.value, level: this.game.level, clock: e.clock.value });
    if (start) this.flash('New game');
  };
  P.start = function () { A().init(); A().startAmbience(); this.splashVisible = false; this.el.splash.classList.add('hidden'); if (!this.game.started) this.applySettings(false); };
  P.assetsLoaded = function () { this.ready = true; this.el.splashText.textContent = 'PRESS TO PLAY'; this.el.splash.classList.add('ready'); };
  P.flash = function (text) { this.flashText = text; this.flashUntil = performance.now() + 2200; };
  P.showPromotion = function (color) { this.el.promoBtns.forEach(b => { const img = b.querySelector('img'); if (img) img.src = 'assets/pieces/' + color + b.dataset.p + '.png'; }); this.el.promo.classList.remove('hidden'); };
  P.hidePromotion = function () { this.el.promo.classList.add('hidden'); };
  P.showGameOver = function (result, reason) {
    const g = this.game, hc = g.humanColor(); let title;
    if (result === '1/2-1/2') title = 'Draw'; else { const winner = result === '1-0' ? 'White' : 'Black'; title = hc ? ((result === '1-0') === (hc === 'white') ? 'You win!' : 'You lose') : winner + ' wins'; }
    this.el.overTitle.textContent = title; this.el.overReason.textContent = (reason === 'checkmate' ? 'Checkmate' : reason === 'time' ? 'Won on time' : reason === 'resignation' ? 'By resignation' : 'Draw by ' + reason) + '  ·  ' + result;
    this.el.over.classList.remove('hidden');
  };
  P.hideOverlays = function () { this.el.over.classList.add('hidden'); this.el.promo.classList.add('hidden'); };
  P.updateSound = function () { this.el.sound.textContent = A().muted ? '🔇' : '🔊'; this.el.sound.classList.toggle('muted', A().muted); };
  function set(el, text) { if (el && el._t !== text) { el._t = text; el.textContent = text; } }
  function clockText(sec) { if (sec >= 3600) return Math.floor(sec / 3600) + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') + ':' + String(Math.floor(sec % 60)).padStart(2, '0'); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (sec < 20 ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0')); }
  P.captured = function (color) {
    /* material taken from `color`, relative to the starting position of this game */
    const start = new C.Position(this.game.startFen), cnt = {}, cur = {};
    const tally = (pos, store) => { for (let s = 0; s < 128; s++) { if (!C.ON(s)) { s += 7; continue; } const p = pos.board[s]; if (p && C.COLOR(p) === color) { const l = C.LETTER[C.TYPE(p)]; store[l] = (store[l] || 0) + 1; } } };
    tally(start, cnt); tally(this.game.pos, cur);
    const out = []; let value = 0; ['Q', 'R', 'B', 'N', 'P'].forEach(l => { const n = (cnt[l] || 0) - (cur[l] || 0); for (let i = 0; i < n; i++) { out.push(l); value += VAL[l]; } });
    return { list: out, value: value };
  };
  P.refresh = function () {
    const g = this.game, e = this.el, R = this.renderer, flip = R.flip;
    const topColor = flip ? 'white' : 'black', botColor = flip ? 'black' : 'white';
    const name = c => (g.mode[c] === 'ai' ? 'Engine · ' + C.Engine.LEVELS[g.level - 1].name : (g.humanColor() === c ? 'You' : c.charAt(0).toUpperCase() + c.slice(1)));
    set(e.topName, name(topColor)); set(e.botName, name(botColor));
    const ct = c => g.clock.enabled ? clockText(g.clock[c === 'white' ? 'w' : 'b']) : (g.mode[c] === 'ai' && g.thinking && g.turnColor() === c ? 'thinking…' : (g.turnColor() === c && !g.over ? 'to move' : ''));
    set(e.topClock, ct(topColor)); set(e.botClock, ct(botColor));
    e.topClock.classList.toggle('active', g.turnColor() === topColor && !g.over); e.botClock.classList.toggle('active', g.turnColor() === botColor && !g.over);
    e.topClock.classList.toggle('low', g.clock.enabled && g.clock[topColor === 'white' ? 'w' : 'b'] < 20); e.botClock.classList.toggle('low', g.clock.enabled && g.clock[botColor === 'white' ? 'w' : 'b'] < 20);
    if (this.movesDirty) {
      this.movesDirty = false;
      const capTop = this.captured(botColor === 'white' ? C.WHITE : C.BLACK), capBot = this.captured(topColor === 'white' ? C.WHITE : C.BLACK);
      const render = (cap, diff, color) => cap.list.map(l => '<img src="assets/pieces/' + color + l + '.png" alt="' + l + '">').join('') + (diff > 0 ? '<b>+' + diff + '</b>' : '');
      e.topCap.innerHTML = render(capTop, capTop.value - capBot.value, botColor === 'white' ? 'w' : 'b'); e.botCap.innerHTML = render(capBot, capBot.value - capTop.value, topColor === 'white' ? 'w' : 'b');
      let html = '';
      const parts = g.startFen.split(/\s+/), startNo = parseInt(parts[5] || '1', 10) || 1, blackFirst = parts[1] === 'b';
      const cells = blackFirst ? ['…'].concat(g.sans) : g.sans.slice(), last = cells.length - 1;
      for (let i = 0; i < cells.length; i += 2) html += '<div class="row"><span class="n">' + (startNo + i / 2) + '.</span><span class="m' + (i === last ? ' cur' : '') + '">' + cells[i] + '</span><span class="m' + (i + 1 === last ? ' cur' : '') + '">' + (cells[i + 1] || '') + '</span></div>';
      e.moves.innerHTML = html || '<div class="empty">Moves will appear here</div>'; e.moves.scrollTop = e.moves.scrollHeight;
      set(e.fen, g.pos.fen());
    }
    let status;
    if (this.flashText && performance.now() < this.flashUntil) status = this.flashText;
    else if (g.over) status = g.result === '1/2-1/2' ? 'Draw · ' + g.reason : (g.result === '1-0' ? 'White' : 'Black') + ' wins · ' + g.reason;
    else if (g.pendingPromo) status = 'Choose a piece to promote to';
    else if (g.thinking) status = 'Engine is thinking…';
    else status = (g.turnColor() === 'white' ? 'White' : 'Black') + ' to move' + (g.status.check ? '  ·  CHECK' : '');
    set(e.status, status);
    if (g.info && g.info.depth) { const sc = g.info.score, mate = Math.abs(sc) > C.Engine.MATE - 1000, txt = mate ? 'M' + Math.ceil((C.Engine.MATE - Math.abs(sc)) / 2) : ((sc > 0 ? '+' : '') + (sc / 100).toFixed(2)); set(e.engine, 'depth ' + g.info.depth + '  ·  eval ' + txt + (g.info.nodes ? '  ·  ' + Math.round(g.info.nodes / 1000) + 'k nodes' : '') + (g.info.book ? '  ·  book' : '')); } else set(e.engine, '');
    e.undo.disabled = !g.moves.length; e.redo.disabled = !g.redoStack.length; e.hint.disabled = !g.isHumanTurn(); e.resign.disabled = g.over || !g.sans.length;
  };
  C.UI = UI;
})(window);

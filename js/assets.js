/* ============================================================================
   CHESS — assets: piece renders (transparent PNGs) with vector fallbacks,
   wood textures and the room backdrop. Pre-scales every piece once per board
   size so drawing is a single drawImage.
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.CHESS;
  const A = C.assets = { images: {}, missing: {}, pieces: {}, ready: false, progress: 0 };
  const CODES = ['K', 'Q', 'R', 'B', 'N', 'P'];
  const FILES = { maple: 'assets/board/maple.jpg', walnut: 'assets/board/walnut.jpg', bg: 'assets/bg/study.jpg' };
  CODES.forEach(c => { FILES['w' + c] = 'assets/pieces/w' + c + '.png'; FILES['b' + c] = 'assets/pieces/b' + c + '.png'; });
  /* relative heights of the Staunton set (king = 1) and where the base sits */
  A.HEIGHT = { K: 1.0, Q: 0.95, R: 0.78, B: 0.88, N: 0.84, P: 0.68 };

  function load(key, src) { return new Promise(res => { const img = new Image(); img.onload = () => { A.images[key] = img; res(); }; img.onerror = () => { A.missing[key] = true; res(); }; img.src = src; }); }
  A.load = function (onProgress) {
    const keys = Object.keys(FILES); let done = 0;
    return Promise.all(keys.map(k => load(k, FILES[k]).then(() => { done++; A.progress = done / keys.length; if (onProgress) onProgress(A.progress); }))).then(() => { A.ready = true; });
  };
  A.image = k => A.images[k] || null;

  /* draw a fallback silhouette when a render is missing */
  function vectorPiece(ctx, code, white, w, h) {
    const fill = white ? '#f1e4c8' : '#2a2320', edge = white ? '#8a7555' : '#000';
    ctx.save(); ctx.translate(w / 2, h); ctx.scale(h / 100, h / 100); ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    const base = () => { ctx.beginPath(); ctx.ellipse(0, -4, 26, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.rect(-22, -16, 44, 10); ctx.fill(); ctx.stroke(); };
    base();
    ctx.beginPath();
    if (code === 'P') { ctx.moveTo(-14, -16); ctx.lineTo(-8, -50); ctx.arc(0, -62, 12, Math.PI * 0.9, Math.PI * 2.1); ctx.lineTo(14, -16); }
    else if (code === 'R') { ctx.moveTo(-18, -16); ctx.lineTo(-14, -70); ctx.lineTo(-18, -70); ctx.lineTo(-18, -86); ctx.lineTo(-8, -86); ctx.lineTo(-8, -78); ctx.lineTo(8, -78); ctx.lineTo(8, -86); ctx.lineTo(18, -86); ctx.lineTo(18, -70); ctx.lineTo(14, -70); ctx.lineTo(18, -16); }
    else if (code === 'B') { ctx.moveTo(-16, -16); ctx.lineTo(-10, -50); ctx.quadraticCurveTo(-22, -70, 0, -92); ctx.quadraticCurveTo(22, -70, 10, -50); ctx.lineTo(16, -16); }
    else if (code === 'N') { ctx.moveTo(-18, -16); ctx.lineTo(-12, -40); ctx.quadraticCurveTo(-20, -60, -6, -78); ctx.lineTo(0, -92); ctx.lineTo(10, -84); ctx.quadraticCurveTo(26, -70, 20, -52); ctx.lineTo(6, -56); ctx.lineTo(12, -40); ctx.lineTo(18, -16); }
    else if (code === 'Q') { ctx.moveTo(-18, -16); ctx.lineTo(-12, -60); ctx.lineTo(-22, -86); ctx.lineTo(-10, -74); ctx.lineTo(0, -96); ctx.lineTo(10, -74); ctx.lineTo(22, -86); ctx.lineTo(12, -60); ctx.lineTo(18, -16); }
    else { ctx.moveTo(-18, -16); ctx.lineTo(-12, -62); ctx.lineTo(-4, -70); ctx.lineTo(-4, -82); ctx.lineTo(-12, -82); ctx.lineTo(-12, -88); ctx.lineTo(-4, -88); ctx.lineTo(-4, -96); ctx.lineTo(4, -96); ctx.lineTo(4, -88); ctx.lineTo(12, -88); ctx.lineTo(12, -82); ctx.lineTo(4, -82); ctx.lineTo(4, -70); ctx.lineTo(12, -62); ctx.lineTo(18, -16); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  /* pre-render each piece into a canvas sized for the square */
  A.prepare = function (square) {
    A.square = square; A.pieces = {};
    ['w', 'b'].forEach(col => CODES.forEach(code => {
      const key = col + code, img = A.image(key), ph = Math.round(square * 1.22 * A.HEIGHT[code]), pw = Math.round(square * 0.98);
      const c = document.createElement('canvas'); c.width = pw * 2; c.height = ph * 2; const ctx = c.getContext('2d');
      if (img) { const sc = Math.min((pw * 2) / img.width, (ph * 2) / img.height), dw = img.width * sc, dh = img.height * sc; ctx.drawImage(img, (pw * 2 - dw) / 2, ph * 2 - dh, dw, dh); }
      else vectorPiece(ctx, code, col === 'w', pw * 2, ph * 2);
      A.pieces[key] = { canvas: c, w: pw, h: ph };
    }));
  };
  A.piece = key => A.pieces[key] || null;
  A.codeOf = p => (C.COLOR(p) === C.WHITE ? 'w' : 'b') + C.LETTER[C.TYPE(p)];
})(window);

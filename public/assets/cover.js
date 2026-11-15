// Slide de couverture style « scrapbook » : papier kraft, polaroids de travers,
// scotch washi, gribouillis au feutre, stickers emoji et gros titre au marqueur.
// Aucune dépendance : réutilisable tel quel dans une page de démo.

export const COVER_FONTS = ['400 80px "Permanent Marker"', '700 40px "Caveat"'];

const ROWS = { 1: [1], 2: [2], 3: [2, 1], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [2, 3, 2], 8: [3, 2, 3] };
const TAPES = ['rgba(255,143,184,.78)', 'rgba(255,216,77,.8)', 'rgba(143,211,255,.8)', 'rgba(163,230,140,.78)', 'rgba(200,170,255,.8)'];
const SCRAPS = ['#ff8fb8', '#ffd84d', '#8fd3ff', '#b8f28f'];
const STICKERS = ['😂', '🔥', '✨', '👀', '💅', '😎', '🤪', '💯'];

function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function photo(g, img, x, y, w, h, crop) {
  const c = crop || { fx: 0.5, fy: 0.3, zoom: 1 };
  const s = Math.max(w / img.width, h / img.height) * (c.zoom || 1);
  const sw = w / s, sh = h / s;
  g.drawImage(img, (img.width - sw) * c.fx, (img.height - sh) * c.fy, sw, sh, x, y, w, h);
}

function tornRect(g, w, h, r) {
  const pts = [];
  const step = 26;
  for (let x = 0; x <= w; x += step) pts.push([x, (r() - 0.5) * 12]);
  for (let y = step; y <= h; y += step) pts.push([w + (r() - 0.5) * 12, y]);
  for (let x = w; x >= 0; x -= step) pts.push([x, h + (r() - 0.5) * 12]);
  for (let y = h - step; y > 0; y -= step) pts.push([(r() - 0.5) * 12, y]);
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.closePath();
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.stroke();
}

function heart(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
  g.stroke();
}

function squiggle(g, x, y, len, r) {
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 1; i <= 6; i++) g.quadraticCurveTo(x + (len / 6) * (i - 0.5), y + (i % 2 ? -1 : 1) * 18, x + (len / 6) * i, y + (r() - 0.5) * 6);
  g.stroke();
}

function wrapLines(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Dessine la couverture.
 * people : [{ id, name, img (image/canvas ou null), crop ({ fx, fy, zoom } ou null),
 *            adj ({ dx, dy } en fraction de W/H, scale, da en radians, z) ou null }]
 * Remplit canvas.coverCards avec la géométrie de chaque polaroid (pour l'édition dans l'aperçu).
 */
export function drawTitleSlide(canvas, { W, H, title, seed = 1, people }) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];

  // Papier kraft + grain
  g.fillStyle = '#eadcc0';
  g.fillRect(0, 0, W, H);
  const grad = g.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, H * 0.75);
  grad.addColorStop(0, 'rgba(255,255,255,.18)');
  grad.addColorStop(1, 'rgba(120,80,30,.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(90,60,20,.07)' : 'rgba(255,255,255,.1)';
    g.fillRect(r() * W, r() * H, 1.5 + r() * 2, 1.5 + r() * 2);
  }

  // Bouts de papier coloré déchirés
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(r() * W, r() * H * 0.9);
    g.rotate((r() - 0.5) * 0.9);
    g.fillStyle = SCRAPS[i % SCRAPS.length];
    g.shadowColor = 'rgba(0,0,0,.15)'; g.shadowBlur = 8;
    tornRect(g, W * (0.28 + r() * 0.2), W * (0.16 + r() * 0.12), r);
    g.fill();
    g.restore();
  }

  // Gribouillis au feutre (sous les photos, visibles dans les trous)
  g.save();
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 7; i++) {
    const x = r() * W, y = r() * H * 0.85, k = r();
    if (k < 0.4) star(g, x, y, 26 + r() * 22);
    else if (k < 0.7) heart(g, x, y, 30 + r() * 20);
    else squiggle(g, x - 80, y, 160, r);
  }
  g.restore();

  // Polaroids
  const list = people.slice(0, 8);
  const n = Math.max(1, list.length);
  const rows = ROWS[n] || ROWS[8];
  const maxPer = Math.max(...rows);
  const top = H * 0.03, bottom = H * 0.8;
  const rowH = (bottom - top) / rows.length;
  const cw = Math.min((W / maxPer) * 1.08, (rowH * 1.18) / 1.17);
  const pad = cw * 0.06, ph = cw - pad * 2, chH = cw * 0.17 + pad + ph;
  const cards = [];
  let idx = 0;
  rows.forEach((count, i) => {
    for (let j = 0; j < count && idx < list.length; j++, idx++) {
      cards.push({
        p: list[idx],
        x: (W * (j + 0.5)) / count + (r() - 0.5) * W * 0.06,
        y: top + rowH * (i + 0.5) + (r() - 0.5) * rowH * 0.12,
        a: (r() - 0.5) * 0.32,
      });
    }
  });
  cards.sort(() => r() - 0.5);
  // Réglages faits à la main : déplacement, taille, inclinaison, ordre d'empilement.
  for (const c of cards) {
    const adj = c.p.adj || {};
    c.x += (adj.dx || 0) * W;
    c.y += (adj.dy || 0) * H;
    c.a += adj.da || 0;
    c.k = adj.scale || 1;
    c.z = adj.z || 0;
  }
  cards.sort((a, b) => a.z - b.z);
  canvas.coverCards = cards.map((c) => ({
    id: c.p.id, x: c.x, y: c.y, a: c.a, w: cw * c.k, h: chH * c.k,
    photo: ph * c.k, photoY: (-chH / 2 + pad + ph / 2) * c.k, // centre de la photo, par rapport au centre du polaroid
  }));

  for (const c of cards) {
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.a);
    g.scale(c.k, c.k);
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 22; g.shadowOffsetY = 8;
    g.fillStyle = '#fbfaf6';
    g.fillRect(-cw / 2, -chH / 2, cw, chH);
    g.shadowColor = 'transparent';
    const px = -cw / 2 + pad, py = -chH / 2 + pad;
    g.fillStyle = '#cfc8bb';
    g.fillRect(px, py, ph, ph);
    if (c.p.img) {
      g.save(); g.beginPath(); g.rect(px, py, ph, ph); g.clip();
      photo(g, c.p.img, px, py, ph, ph, c.p.crop);
      g.restore();
    }
    if (c.p.name) {
      g.fillStyle = '#23201c';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = cw * 0.12;
      g.font = `700 ${fs}px "Caveat", cursive`;
      while (g.measureText(c.p.name).width > ph && fs > 14) { fs -= 2; g.font = `700 ${fs}px "Caveat", cursive`; }
      g.fillText(c.p.name, 0, py + ph + (chH / 2 - (py + ph)) / 2 + 2);
    }
    // Scotch washi
    g.save();
    g.translate((r() - 0.5) * cw * 0.2, -chH / 2);
    g.rotate((r() - 0.5) * 0.5);
    g.fillStyle = pick(TAPES);
    g.fillRect(-cw * 0.2, -cw * 0.05, cw * 0.4, cw * 0.1);
    g.restore();
    g.restore();
  }

  // Stickers emoji sur quelques coins de polaroids
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${Math.round(cw * 0.26)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  const used = new Set();
  cards.slice(0, Math.min(4, cards.length)).forEach((c, i) => {
    let s = pick(STICKERS);
    while (used.has(s) && used.size < STICKERS.length) s = pick(STICKERS);
    used.add(s);
    const side = i % 2 ? 1 : -1;
    g.save();
    g.translate(c.x + side * cw * 0.42 * c.k, c.y + chH * 0.36 * c.k);
    g.rotate((r() - 0.5) * 0.7);
    g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    g.fillText(s, 0, 0);
    g.restore();
  });
  g.restore();

  // Titre au marqueur : blanc, gros contour noir, légèrement penché
  const text = String(title || '').trim();
  if (text) {
    g.save();
    g.translate(W / 2, H * 0.875);
    g.rotate(-0.035);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = Math.round(W * 0.105), lines;
    do { g.font = `400 ${fs}px "Permanent Marker", cursive`; lines = wrapLines(g, text, W * 0.9); fs -= 4; }
    while ((lines.length > 2 || lines.some((l) => g.measureText(l).width > W * 0.94)) && fs > 36);
    fs += 4;
    const lh = fs * 1.05;
    lines.forEach((l, i) => {
      const y = (i - (lines.length - 1) / 2) * lh;
      g.lineJoin = 'round';
      g.strokeStyle = '#111'; g.lineWidth = fs * 0.2;
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 16; g.shadowOffsetY = 6;
      g.strokeText(l, 0, y);
      g.shadowColor = 'transparent';
      g.fillStyle = '#fff';
      g.fillText(l, 0, y);
    });
    g.restore();
  }
  return canvas;
}

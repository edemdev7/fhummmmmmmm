// Éditeur de carrousel (admin) : une slide par catégorie, une ligne par ami
// (sa photo à gauche, sa réponse à droite), le titre au centre. Export JPG / ZIP.
import { CATS, el, toast, slug, imgUrl, refOf, nameOf } from './shared.js';

const MAX_ROWS = 8;
const FORMATS = {
  portrait: { label: 'Portrait 4:5 (Instagram)', w: 1080, h: 1350 },
  square: { label: 'Carré 1:1', w: 1080, h: 1080 },
  story: { label: 'Story 9:16', w: 1080, h: 1920 },
};

// Titres par défaut des slides (en anglais, comme les carrousels d'origine). Modifiables dans l'éditeur.
const EN_TITLES = {
  repas: 'Favorite food',
  couleur: 'Favorite color',
  crush: 'Celebrity crush',
  serie: 'Favorite series',
  boisson: 'Favorite drink',
  voiture: 'Favorite car',
  hobby: 'Hobby',
  artiste_homme: 'Favorite male artist',
  artiste_femme: 'Favorite female artist',
};

// Réglages gardés tant que la page est ouverte (survivent aux actualisations du récap).
const state = {
  selected: null, // ids des amis, dans l'ordre d'affichage
  cats: new Set(CATS.map((c) => c.key)),
  titles: Object.fromEntries(CATS.map((c) => [c.key, EN_TITLES[c.key] || c.label])),
  format: 'portrait',
  captions: false,
  colorFill: true,
  current: 0,
  edit: null, // URL de l'image en cours de recadrage
};

// Recadrages par image : { fx, fy } = position (0 à 1), zoom ≥ 1, rot en quarts de tour. Gardés dans le navigateur.
const CROP_KEY = 'fhummmmmmmm.crops';
let crops = {};
try { crops = JSON.parse(localStorage.getItem(CROP_KEY)) || {}; } catch { /* ignoré */ }
let cropSaveTimer = null;
function saveCrops() {
  clearTimeout(cropSaveTimer);
  cropSaveTimer = setTimeout(() => { try { localStorage.setItem(CROP_KEY, JSON.stringify(crops)); } catch { /* ignoré */ } }, 400);
}
const cropOf = (url, defFy = 0.5) => crops[url] || { fx: 0.5, fy: defFy, zoom: 1, rot: 0 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

let ctx = null; // { root, people, imageBlob, saveFile, withBusy, onBack }
let slides = []; // [{ key, title, canvas }]
let renderToken = 0;
let renderTimer = null;
const bitmaps = new Map(); // url -> Promise<ImageBitmap|null>

/* ---------- couleurs nommées (slide « Couleur préférée ») ---------- */
const COLOR_WORDS = {
  'bleu nuit': '#0b1a3a', 'bleu marine': '#0a1f5c', 'bleu ciel': '#7cc4f2', 'bleu roi': '#1d3fd8', 'bleu electrique': '#0047ff',
  'bleu turquoise': '#1fc7c1', 'bleu canard': '#0f5e6b', 'vert olive': '#6b7a2e', 'vert sauge': '#93a383', 'vert emeraude': '#119b62',
  'vert pomme': '#7cd23b', 'vert bouteille': '#0e4d2c', 'vert kaki': '#7d7a4f', 'rose pale': '#f7c6d5', 'rose bonbon': '#ff6fb5',
  'rose poudre': '#e8b4b8', 'rouge bordeaux': '#6d0f24', 'jaune moutarde': '#d7a72a', 'gris anthracite': '#2f3236',
  bleu: '#1131ff', rouge: '#e0151b', vert: '#1f9d3a', jaune: '#ffd60a', noir: '#000000', blanc: '#ffffff', rose: '#ff4fa3',
  violet: '#7b2fbe', orange: '#ff7a00', gris: '#8a8d93', marron: '#6b3e1f', beige: '#e8d8b8', bordeaux: '#6d0f24',
  turquoise: '#1fc7c1', kaki: '#7d7a4f', or: '#d4af37', dore: '#d4af37', argent: '#c0c0c8', fuchsia: '#e0168a', lilas: '#c8a2e0',
  mauve: '#b27fc0', corail: '#ff6f61', saumon: '#fa8f72', creme: '#f6efdc', cyan: '#00c4e6', magenta: '#e0189a', ocre: '#c8862a',
  lavande: '#b7a5e6', emeraude: '#119b62', indigo: '#3b2a8f', pourpre: '#7d1a5c', sauge: '#93a383', menthe: '#9fe2bf',
  black: '#000000', white: '#ffffff', red: '#e0151b', blue: '#1131ff', green: '#1f9d3a', yellow: '#ffd60a', pink: '#ff4fa3', purple: '#7b2fbe',
};
const COLOR_KEYS = Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length);
const plain = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function colorOf(name) {
  const raw = (name || '').trim();
  if (!raw) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  const n = plain(raw);
  const hit = COLOR_KEYS.find((k) => new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(n));
  if (hit) return COLOR_WORDS[hit];
  return window.CSS && CSS.supports('color', raw) ? raw : null;
}

/* ---------- images ---------- */
function bitmap(ref) {
  const url = imgUrl(ref);
  if (!url) return Promise.resolve(null);
  if (!bitmaps.has(url)) {
    bitmaps.set(url, ctx.imageBlob(ref)
      .then((b) => (b ? createImageBitmap(b, { imageOrientation: 'from-image' }) : null))
      .catch(() => null));
  }
  return bitmaps.get(url);
}

const rotatedCache = new Map(); // `${url}|${rot}` -> canvas
function rotated(url, img, rot) {
  const r = ((rot % 4) + 4) % 4;
  if (!r) return img;
  const k = `${url}|${r}`;
  if (!rotatedCache.has(k)) {
    const c = document.createElement('canvas');
    c.width = r % 2 ? img.height : img.width;
    c.height = r % 2 ? img.width : img.height;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2);
    g.rotate((r * Math.PI) / 2);
    g.drawImage(img, -img.width / 2, -img.height / 2);
    rotatedCache.set(k, c);
  }
  return rotatedCache.get(k);
}

/** Échelle et marge de déplacement d'une image dans une case, selon son recadrage. */
function fit(img, w, h, crop) {
  const s = Math.max(w / img.width, h / img.height) * crop.zoom;
  return { s, sw: w / s, sh: h / s };
}

function drawCover(g, img, x, y, w, h, crop) {
  const { sw, sh } = fit(img, w, h, crop);
  g.drawImage(img, (img.width - sw) * crop.fx, (img.height - sh) * crop.fy, sw, sh, x, y, w, h);
}

function wrap(g, text, maxW) {
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

function fillText(g, text, x, y, w, h, size) {
  g.save();
  g.fillStyle = '#f5f2fa';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let fs = size, lines;
  do { g.font = `700 ${fs}px "DM Sans", sans-serif`; lines = wrap(g, text, w * 0.84); fs -= 4; }
  while ((lines.length * fs * 1.2 > h * 0.8 || lines.some((l) => g.measureText(l).width > w * 0.9)) && fs > 18);
  const lh = (fs + 4) * 1.2;
  lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh));
  g.restore();
}

function caption(g, text, x, y, w, h) {
  if (!text) return;
  g.save();
  const fs = Math.max(20, Math.min(30, h * 0.11));
  g.font = `700 ${fs}px "DM Sans", sans-serif`;
  let t = text;
  while (g.measureText(t).width > w - 48 && t.length > 2) t = t.slice(0, -2);
  if (t !== text) t = t.trimEnd() + '…';
  const tw = g.measureText(t).width;
  const ph = fs * 1.6, px = x + 14, py = y + h - ph - 14;
  g.fillStyle = 'rgba(0,0,0,.6)';
  g.beginPath();
  g.roundRect(px, py, tw + 28, ph, ph / 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(t, px + 14, py + ph / 2 + 1);
  g.restore();
}

function title(g, text, W, H) {
  if (!text.trim()) return;
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Taille proche des carrousels d'exemple : environ 1/3 de la largeur, retour à la ligne au-delà.
  let fs = Math.round(W * 0.046), lines;
  do { g.font = `700 ${fs}px "DM Sans", sans-serif`; lines = wrap(g, text, W * 0.4); fs -= 2; }
  while ((lines.length > 2 || lines.some((l) => g.measureText(l).width > W * 0.7)) && fs > 30);
  fs += 2;
  const lh = fs * 1.1;
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(0,0,0,.8)';
  for (const [blur, oy] of [[14, 2], [4, 1]]) {
    g.shadowBlur = blur; g.shadowOffsetY = oy;
    lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh));
  }
  g.restore();
}

async function drawSlide(cat, list, canvas = document.createElement('canvas')) {
  const { w: W, h: H } = FORMATS[state.format];
  canvas.width = W; canvas.height = H;
  canvas.cells = []; // cases recadrables, pour l'aperçu
  const g = canvas.getContext('2d');
  const place = (ref, raw, x, y, w, h, defFy, label) => {
    const url = imgUrl(ref);
    const crop = cropOf(url, defFy);
    const img = rotated(url, raw, crop.rot);
    drawCover(g, img, x, y, w, h, crop);
    canvas.cells.push({ url, defFy, img, x, y, w, h, label });
  };
  g.fillStyle = '#0b0d12';
  g.fillRect(0, 0, W, H);

  const n = list.length;
  const gap = 4;
  const rowH = (H - gap * (n - 1)) / n;
  const colW = (W - gap) / 2;
  const imgs = await Promise.all(list.map((p) => Promise.all([bitmap(p.photo), bitmap(refOf(p, cat.key))])));

  list.forEach((p, i) => {
    const y = i * (rowH + gap);
    const [face, answer] = imgs[i];
    const nom = nameOf(p, cat.key);

    g.fillStyle = '#1a1722';
    g.fillRect(0, y, colW, rowH);
    if (face) place(p.photo, face, 0, y, colW, rowH, 0.3, `Photo de ${p.prenom || 'cet ami'} (toutes les slides)`);
    else fillText(g, p.prenom || '?', 0, y, colW, rowH, 44);

    const x = colW + gap;
    const color = cat.key === 'couleur' && state.colorFill ? colorOf(nom) : null;
    g.fillStyle = '#1a1722';
    g.fillRect(x, y, colW, rowH);
    if (color) { g.fillStyle = color; g.fillRect(x, y, colW, rowH); }
    else if (answer) place(refOf(p, cat.key), answer, x, y, colW, rowH, 0.5, `${cat.label} de ${p.prenom || 'cet ami'}`);
    else if (cat.key === 'couleur' && colorOf(nom)) { g.fillStyle = colorOf(nom); g.fillRect(x, y, colW, rowH); }
    else fillText(g, nom || '—', x, y, colW, rowH, 44);

    if (state.captions) {
      caption(g, p.prenom, 0, y, colW, rowH);
      if (answer || color) caption(g, nom, x, y, colW, rowH);
    }
  });

  title(g, state.titles[cat.key] || '', W, H);
  return canvas;
}

/* ---------- données ---------- */
const byId = () => new Map(ctx.people.map((p) => [p.id, p]));
const chosen = () => { const m = byId(); return state.selected.map((id) => m.get(id)).filter(Boolean); };
const activeCats = () => CATS.filter((c) => state.cats.has(c.key));

function syncSelection() {
  const ids = new Set(ctx.people.map((p) => p.id));
  if (!state.selected) {
    const done = ctx.people.filter((p) => p.done);
    state.selected = (done.length ? done : ctx.people).slice(0, 5).map((p) => p.id);
  }
  state.selected = state.selected.filter((id) => ids.has(id));
}

/* ---------- aperçu ---------- */
function scheduleRender(delay = 0) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderSlides, delay);
}

async function renderSlides() {
  const token = ++renderToken;
  const stage = document.getElementById('cr-stage');
  if (!stage) return;
  const list = chosen();
  const cats = activeCats();
  if (!list.length || !cats.length) {
    slides = [];
    stage.replaceChildren(el('div', { class: 'cr-empty', text: !list.length ? 'Choisis au moins un ami.' : 'Choisis au moins une slide.' }));
    updateButtons();
    return;
  }
  if (!slides.length) stage.replaceChildren(el('div', { class: 'center' }, el('div', { class: 'spinner', 'aria-label': 'Création des slides' })));
  await document.fonts.load('700 80px "DM Sans"').catch(() => {});
  const out = [];
  for (const c of cats) {
    const canvas = await drawSlide(c, list);
    if (token !== renderToken) return; // un réglage a changé entre-temps
    out.push({ key: c.key, cat: c, title: state.titles[c.key] || c.label, canvas });
  }
  slides = out;
  state.current = Math.min(state.current, slides.length - 1);
  showStage();
}

function paintThumb(sl) {
  if (!sl.thumb) return;
  const t = sl.thumb;
  t.width = 108; t.height = Math.round(108 * sl.canvas.height / sl.canvas.width);
  t.getContext('2d').drawImage(sl.canvas, 0, 0, t.width, t.height);
}

/* ---------- recadrage dans l'aperçu ---------- */
const editCell = () => slides[state.current]?.canvas.cells.find((c) => c.url === state.edit) || null;

function placeOverlay() {
  const box = document.getElementById('cr-sel');
  const s = slides[state.current];
  const c = editCell();
  if (!box || !s) return;
  box.hidden = !c;
  if (!c) return;
  const W = s.canvas.width, H = s.canvas.height;
  Object.assign(box.style, { left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%`, width: `${(c.w / W) * 100}%`, height: `${(c.h / H) * 100}%` });
}

// Redessine tout de suite la slide affichée, puis les autres un peu après (la photo d'un ami est sur toutes).
let redrawBusy = false, redrawAgain = false, redrawAllTimer = null;
async function redrawCurrent() {
  if (redrawBusy) { redrawAgain = true; return; }
  redrawBusy = true;
  const s = slides[state.current];
  if (s) { await drawSlide(s.cat, chosen(), s.canvas); paintThumb(s); placeOverlay(); }
  redrawBusy = false;
  if (redrawAgain) { redrawAgain = false; requestAnimationFrame(redrawCurrent); }
  clearTimeout(redrawAllTimer);
  redrawAllTimer = setTimeout(async () => {
    for (const sl of slides) if (sl !== slides[state.current]) { await drawSlide(sl.cat, chosen(), sl.canvas); paintThumb(sl); }
  }, 350);
}

function updateCrop(change) {
  const c = editCell();
  if (!c) return;
  const cur = cropOf(c.url, c.defFy);
  crops[c.url] = { ...cur, ...change(cur, c) };
  saveCrops();
  redrawCurrent();
  syncToolbar();
}

function syncToolbar() {
  const z = document.getElementById('cr-zoom');
  const c = editCell();
  if (z && c) z.value = cropOf(c.url, c.defFy).zoom;
}

function selectCell(url) {
  state.edit = url;
  showStage();
}

function toCanvas(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
}

function bindCanvas(canvas) {
  if (canvas.bound) return;
  canvas.bound = true;
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const pt = toCanvas(canvas, e);
    const hit = canvas.cells.find((c) => pt.x >= c.x && pt.x < c.x + c.w && pt.y >= c.y && pt.y < c.y + c.h);
    if (!hit) { if (state.edit) selectCell(null); return; }
    if (hit.url !== state.edit) selectCell(hit.url);
    drag = { ...pt, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const pt = toCanvas(canvas, e);
    const dx = pt.x - drag.x, dy = pt.y - drag.y;
    drag.x = pt.x; drag.y = pt.y;
    updateCrop((cur, c) => {
      const { s, sw, sh } = fit(c.img, c.w, c.h, cur);
      const rx = c.img.width - sw, ry = c.img.height - sh;
      return {
        fx: rx > 0.5 ? clamp01(cur.fx - dx / s / rx) : cur.fx,
        fy: ry > 0.5 ? clamp01(cur.fy - dy / s / ry) : cur.fy,
      };
    });
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    if (!editCell()) return;
    e.preventDefault();
    updateCrop((cur) => ({ zoom: Math.max(1, Math.min(4, cur.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) }));
  }, { passive: false });
}

function toolbar() {
  const c = editCell();
  if (!c) return el('p', { class: 'cr-hint cr-tip', text: 'Astuce : clique sur une image de l’aperçu pour la recadrer.' });
  const crop = cropOf(c.url, c.defFy);
  return el('div', { class: 'cr-tools' },
    el('p', { class: 'cr-tools-title' }, el('strong', { text: 'Recadrer : ' }), c.label),
    el('p', { class: 'cr-hint', text: 'Fais glisser l’image pour la déplacer. Zoome avec le curseur ou la molette.' }),
    el('div', { class: 'row' },
      el('label', { for: 'cr-zoom', class: 'cr-hint', text: 'Zoom' }),
      el('input', { type: 'range', id: 'cr-zoom', min: 1, max: 4, step: 0.01, value: crop.zoom,
        oninput: (e) => { const z = Number(e.target.value); updateCrop(() => ({ zoom: z })); } })),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn sm', onclick: () => updateCrop((cur) => ({ rot: (cur.rot + 3) % 4 })) }, '↺ Pivoter'),
      el('button', { type: 'button', class: 'btn sm', onclick: () => updateCrop((cur) => ({ rot: (cur.rot + 1) % 4 })) }, '↻ Pivoter'),
      el('button', { type: 'button', class: 'btn sm', onclick: () => { delete crops[c.url]; saveCrops(); redrawCurrent(); syncToolbar(); } }, 'Réinitialiser'),
      el('button', { type: 'button', class: 'btn sm primary', onclick: () => selectCell(null) }, 'Terminé')));
}

function showStage() {
  const stage = document.getElementById('cr-stage');
  if (!stage || !slides.length) return;
  const s = slides[state.current];
  s.canvas.className = 'cr-canvas' + (state.edit ? ' editing' : '');
  s.canvas.setAttribute('role', 'img');
  s.canvas.setAttribute('aria-label', `Slide ${state.current + 1} : ${s.title}`);
  bindCanvas(s.canvas);
  const go = (d) => { state.current = (state.current + d + slides.length) % slides.length; showStage(); };
  const thumbs = slides.map((sl, i) => {
    sl.thumb = document.createElement('canvas');
    paintThumb(sl);
    return el('button', { type: 'button', class: 'cr-thumb', 'aria-current': i === state.current ? 'true' : null, title: sl.title,
      onclick: () => { state.current = i; showStage(); } }, sl.thumb);
  });
  stage.replaceChildren(
    el('div', { class: 'cr-frame' },
      s.canvas,
      el('div', { class: 'cr-sel', id: 'cr-sel', hidden: true }),
      slides.length > 1 ? el('button', { type: 'button', class: 'cr-arrow prev', 'aria-label': 'Slide précédente', onclick: () => go(-1) }, '‹') : null,
      slides.length > 1 ? el('button', { type: 'button', class: 'cr-arrow next', 'aria-label': 'Slide suivante', onclick: () => go(1) }, '›') : null),
    el('p', { class: 'cr-count', text: `${state.current + 1} / ${slides.length} · ${s.title}` }),
    toolbar(),
    el('div', { class: 'cr-thumbs' }, thumbs));
  placeOverlay();
  updateButtons();
}

function updateButtons() {
  for (const id of ['cr-dl-one', 'cr-dl-all']) {
    const b = document.getElementById(id);
    if (b && b.textContent !== 'Préparation…') b.disabled = !slides.length;
  }
}

/* ---------- export ---------- */
const toJpeg = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Export impossible.'))), 'image/jpeg', 0.92));
const slideName = (i) => `${String(i + 1).padStart(2, '0')}-${slug(slides[i].title)}.jpg`;

function downloadCurrent(btn) {
  return ctx.withBusy(btn, async () => { ctx.saveFile(slideName(state.current), await toJpeg(slides[state.current].canvas)); });
}
function downloadAll(btn) {
  if (!window.JSZip) { toast('Le module ZIP n’a pas chargé. Recharge la page.'); return; }
  return ctx.withBusy(btn, async () => {
    const zip = new JSZip();
    for (let i = 0; i < slides.length; i++) zip.file(slideName(i), await toJpeg(slides[i].canvas));
    ctx.saveFile('carrousel.zip', await zip.generateAsync({ type: 'blob' }));
  });
}

/* ---------- réglages ---------- */
function peoplePanel() {
  const box = el('div', { class: 'cr-list', id: 'cr-people' });
  const draw = () => {
    const sel = state.selected;
    const order = [...sel.map((id) => byId().get(id)).filter(Boolean), ...ctx.people.filter((p) => !sel.includes(p.id))];
    box.replaceChildren(...order.map((p) => {
      const pos = sel.indexOf(p.id);
      const on = pos >= 0;
      const move = (d) => { const j = pos + d; [sel[pos], sel[j]] = [sel[j], sel[pos]]; draw(); scheduleRender(); };
      const face = imgUrl(p.photo);
      return el('div', { class: 'cr-row' + (on ? ' on' : '') },
        el('label', { class: 'cr-check' },
          el('input', { type: 'checkbox', checked: on || null, disabled: (!on && sel.length >= MAX_ROWS) || null,
            onchange: (e) => {
              if (e.target.checked) sel.push(p.id); else sel.splice(sel.indexOf(p.id), 1);
              draw(); scheduleRender();
            } }),
          face ? el('img', { src: face, alt: '', class: 'cr-face' }) : el('span', { class: 'cr-face' }),
          el('span', { text: p.prenom || 'Sans prénom' })),
        on ? el('span', { class: 'cr-move' },
          el('button', { type: 'button', class: 'btn sm', 'aria-label': `Monter ${p.prenom}`, disabled: pos === 0 || null, onclick: () => move(-1) }, '↑'),
          el('button', { type: 'button', class: 'btn sm', 'aria-label': `Descendre ${p.prenom}`, disabled: pos === sel.length - 1 || null, onclick: () => move(1) }, '↓')) : null);
    }));
  };
  draw();
  return el('section', { class: 'cr-panel' },
    el('h2', { text: 'Amis' }),
    el('p', { class: 'cr-hint', text: `Une ligne par ami, de haut en bas. ${MAX_ROWS} au maximum, 5 rendent le mieux.` }),
    box);
}

function slidesPanel() {
  const rows = CATS.map((c) => el('div', { class: 'cr-row cr-cat' },
    el('input', { type: 'checkbox', 'aria-label': `Inclure ${c.label}`, checked: state.cats.has(c.key) || null,
      onchange: (e) => { if (e.target.checked) state.cats.add(c.key); else state.cats.delete(c.key); scheduleRender(); } }),
    el('input', { class: 'text cr-title', value: state.titles[c.key], 'aria-label': `Titre de la slide ${c.label}`, maxlength: 60,
      oninput: (e) => { state.titles[c.key] = e.target.value; scheduleRender(300); } })));
  return el('section', { class: 'cr-panel' },
    el('h2', { text: 'Slides' }),
    el('p', { class: 'cr-hint', text: 'Coche les slides à garder et modifie le titre affiché au centre.' }),
    el('div', { class: 'cr-list' }, rows));
}

function optionsPanel() {
  const select = el('select', { class: 'text', id: 'cr-format', onchange: (e) => { state.format = e.target.value; scheduleRender(); } },
    Object.entries(FORMATS).map(([k, f]) => el('option', { value: k, selected: k === state.format || null }, f.label)));
  const toggle = (key, label) => el('label', { class: 'cr-check' },
    el('input', { type: 'checkbox', checked: state[key] || null, onchange: (e) => { state[key] = e.target.checked; scheduleRender(); } }),
    el('span', { text: label }));
  return el('section', { class: 'cr-panel' },
    el('h2', { text: 'Options' }),
    el('div', { class: 'field' }, el('label', { for: 'cr-format', text: 'Format' }), select),
    toggle('captions', 'Afficher les prénoms et les réponses'),
    toggle('colorFill', 'Couleur préférée : aplat de couleur plutôt que l’image'));
}

/* ---------- point d'entrée ---------- */
export function renderCarousel(context) {
  ctx = context;
  syncSelection();
  slides = [];
  ctx.root.replaceChildren(el('div', { class: 'admin' },
    el('div', { class: 'admin-head' },
      el('div', null,
        el('h1', { text: 'Créer le carrousel' }),
        el('p', { text: 'Chaque slide compare les amis sur une catégorie. Télécharge les images puis publie-les dans l’ordre.' })),
      el('div', { class: 'tools' },
        el('button', { type: 'button', class: 'btn sm', onclick: ctx.onBack }, '← Retour au récap'),
        el('button', { type: 'button', class: 'btn sm', id: 'cr-dl-one', disabled: true, onclick: (e) => downloadCurrent(e.currentTarget) }, 'Télécharger cette slide'),
        el('button', { type: 'button', class: 'btn sm primary', id: 'cr-dl-all', disabled: true, onclick: (e) => downloadAll(e.currentTarget) }, 'Tout télécharger (ZIP)'))),
    ctx.people.length
      ? el('div', { class: 'cr-layout' },
        el('div', { class: 'cr-side' }, peoplePanel(), slidesPanel(), optionsPanel()),
        el('div', { class: 'cr-stage', id: 'cr-stage', 'aria-live': 'polite' }))
      : el('div', { class: 'empty-state' }, el('h2', { text: 'Pas encore de réponses' }), el('p', { text: 'Le carrousel se construit avec les carnets de tes amis.' }))));
  scheduleRender();
}

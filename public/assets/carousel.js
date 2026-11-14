// Éditeur de carrousel (admin) : une slide par catégorie, une ligne par ami
// (sa photo à gauche, sa réponse à droite), le titre au centre. Export JPG / ZIP.
import { CATS, el, toast, slug, imgUrl, refOf, nameOf } from './shared.js';

const MAX_ROWS = 8;
const FORMATS = {
  portrait: { label: 'Portrait 4:5 (Instagram)', w: 1080, h: 1350 },
  square: { label: 'Carré 1:1', w: 1080, h: 1080 },
  story: { label: 'Story 9:16', w: 1080, h: 1920 },
};

// Réglages gardés tant que la page est ouverte (survivent aux actualisations du récap).
const state = {
  selected: null, // ids des amis, dans l'ordre d'affichage
  cats: new Set(CATS.map((c) => c.key)),
  titles: Object.fromEntries(CATS.map((c) => [c.key, c.label])),
  format: 'portrait',
  captions: false,
  colorFill: true,
  current: 0,
};

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

function drawCover(g, img, x, y, w, h, focusY = 0.5) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) * focusY;
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
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
  let fs = 84, lines;
  do { g.font = `700 ${fs}px "DM Sans", sans-serif`; lines = wrap(g, text, W * 0.62); fs -= 4; }
  while ((lines.length > 2 || lines.some((l) => g.measureText(l).width > W * 0.86)) && fs > 40);
  fs += 4;
  const lh = fs * 1.08;
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(0,0,0,.85)';
  for (const [blur, oy] of [[22, 3], [6, 2]]) {
    g.shadowBlur = blur; g.shadowOffsetY = oy;
    lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh));
  }
  g.restore();
}

async function drawSlide(cat, list) {
  const { w: W, h: H } = FORMATS[state.format];
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
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
    if (face) drawCover(g, face, 0, y, colW, rowH, 0.3);
    else fillText(g, p.prenom || '?', 0, y, colW, rowH, 44);

    const x = colW + gap;
    const color = cat.key === 'couleur' && state.colorFill ? colorOf(nom) : null;
    g.fillStyle = '#1a1722';
    g.fillRect(x, y, colW, rowH);
    if (color) { g.fillStyle = color; g.fillRect(x, y, colW, rowH); }
    else if (answer) drawCover(g, answer, x, y, colW, rowH, 0.5);
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
    out.push({ key: c.key, title: state.titles[c.key] || c.label, canvas });
  }
  slides = out;
  state.current = Math.min(state.current, slides.length - 1);
  showStage();
}

function showStage() {
  const stage = document.getElementById('cr-stage');
  if (!stage || !slides.length) return;
  const s = slides[state.current];
  s.canvas.className = 'cr-canvas';
  s.canvas.setAttribute('role', 'img');
  s.canvas.setAttribute('aria-label', `Slide ${state.current + 1} : ${s.title}`);
  const go = (d) => { state.current = (state.current + d + slides.length) % slides.length; showStage(); };
  const thumbs = slides.map((sl, i) => {
    const t = document.createElement('canvas');
    t.width = 108; t.height = Math.round(108 * sl.canvas.height / sl.canvas.width);
    t.getContext('2d').drawImage(sl.canvas, 0, 0, t.width, t.height);
    return el('button', { type: 'button', class: 'cr-thumb', 'aria-current': i === state.current ? 'true' : null, title: sl.title,
      onclick: () => { state.current = i; showStage(); } }, t);
  });
  stage.replaceChildren(
    el('div', { class: 'cr-frame' },
      s.canvas,
      slides.length > 1 ? el('button', { type: 'button', class: 'cr-arrow prev', 'aria-label': 'Slide précédente', onclick: () => go(-1) }, '‹') : null,
      slides.length > 1 ? el('button', { type: 'button', class: 'cr-arrow next', 'aria-label': 'Slide suivante', onclick: () => go(1) }, '›') : null),
    el('p', { class: 'cr-count', text: `${state.current + 1} / ${slides.length} · ${s.title}` }),
    el('div', { class: 'cr-thumbs' }, thumbs));
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

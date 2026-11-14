// Page des amis : questionnaire en 10 étapes, enregistré étape par étape.
import { CATS, STEPS, TOTAL, el, toast, copyText, imgUrl, refOf, nameOf } from './shared.js';

const LS_KEY = 'fhummmmmmmm.carnet';
const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SEND = 3.5 * 1024 * 1024;

let creds = null; // { id, token } : identifie ce carnet sans compte
let me = blank();
let uploading = false;
let saving = false;
let formError = '';
let editingFromThanks = false;

function blank() { return { prenom: '', photo: null, items: {}, step: 0, done: false }; }

/* ---------- identifiants du carnet ---------- */
function readCreds() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (c && ID_RE.test(c.id) && TOKEN_RE.test(c.token)) return c;
  } catch { /* stockage indisponible */ }
  return null;
}
function writeCreds(c) {
  creds = c;
  try { c ? localStorage.setItem(LS_KEY, JSON.stringify(c)) : localStorage.removeItem(LS_KEY); } catch { /* ignoré */ }
}
// Lien perso « /#r=<id>.<token> » pour reprendre son carnet sur un autre appareil.
function credsFromHash() {
  const m = location.hash.match(/^#r=([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return;
  writeCreds({ id: m[1], token: m[2] });
  history.replaceState(null, '', location.pathname + location.search);
}
const personalLink = () => (creds ? `${location.origin}/#r=${creds.id}.${creds.token}` : '');

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (creds) { headers['x-friend-id'] = creds.id; headers['x-friend-token'] = creds.token; }
  let res;
  try { res = await fetch(path, { ...opts, headers }); }
  catch { throw Object.assign(new Error('Pas de connexion. Vérifie ton réseau et réessaie.'), { status: 0 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}. Réessaie.`), { status: res.status });
  return data;
}
async function ensureCreds() {
  if (creds) return;
  const c = await api('/api/register', { method: 'POST' });
  writeCreds({ id: c.id, token: c.token });
}
async function saveMe() {
  await ensureCreds();
  await api('/api/me', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prenom: me.prenom, photo: me.photo, items: me.items, step: me.step, done: me.done }),
  });
}

/* ---------- images ---------- */
async function decode(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file); } catch { /* repli */ } }
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('decode'));
    im.src = u;
  });
}
async function toJpeg(file, maxSide, quality) {
  const src = await decode(file);
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
}
async function prepare(file) {
  if (OK_TYPES.includes(file.type) && file.size <= MAX_SEND) return file;
  let b = await toJpeg(file, 1600, 0.85);
  if (b.size > MAX_SEND) b = await toJpeg(file, 1200, 0.75);
  return b;
}
async function onFile(file, step) {
  if (!file) return;
  formError = '';
  if (file.type && !file.type.startsWith('image/')) { formError = 'Choisis une image (JPG, PNG ou WEBP).'; render(); return; }
  uploading = true; render();
  try {
    await ensureCreds();
    const blob = await prepare(file);
    const r = await api(`/api/upload?key=${encodeURIComponent(step.key)}`, { method: 'POST', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
    const ref = { url: r.url };
    if (step.key === 'moi') me.photo = ref;
    else me.items[step.key] = { nom: '', ...me.items[step.key], img: ref };
  } catch (e) {
    formError = /decode|encode/.test(e.message) ? 'Ce format ne passe pas. Envoie plutôt un JPG ou un PNG.' : e.message;
  } finally { uploading = false; render(); }
}

/* ---------- affichage ---------- */
const root = () => document.getElementById('app');

function render() {
  const r = root();
  r.replaceChildren();
  if (me.step >= TOTAL) renderThanks(r); else renderStep(r);
}

function renderStep(r) {
  const i = me.step;
  const s = STEPS[i];
  const url = imgUrl(refOf(me, s.key));
  const last = i === TOTAL - 1;

  const input = el('input', {
    class: 'text', id: 'f-nom', type: 'text', maxlength: '80', placeholder: s.ph, value: nameOf(me, s.key),
    autocomplete: s.key === 'moi' ? 'given-name' : 'off',
    oninput: (e) => {
      const v = e.target.value;
      if (s.key === 'moi') me.prenom = v;
      else me.items[s.key] = { img: null, ...me.items[s.key], nom: v };
    },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } },
  });

  const fileInput = el('input', { type: 'file', id: 'f-img', accept: 'image/*', 'aria-label': s.img, onchange: (e) => onFile(e.target.files[0], s) });
  const drop = el('label', { class: 'drop' + (url ? ' has' : ''), for: 'f-img' });
  if (uploading) drop.append(el('div', { class: 'hint' }, el('div', { class: 'spinner' }), 'Envoi de l’image…'));
  else if (url) drop.append(el('img', { src: url, alt: '' }));
  else drop.append(el('div', { class: 'hint' }, el('b', { text: 'Clique ou glisse une image ici' }), 'JPG, PNG, WEBP'));
  drop.append(fileInput);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0], s); });

  const busy = uploading || saving;
  const nextBtn = el('button', { type: 'button', class: 'btn primary', id: 'f-next', disabled: busy || null, onclick: next },
    saving ? 'Enregistrement…' : editingFromThanks ? 'Enregistrer' : last ? 'Terminer' : 'Suivant');
  const backBtn = el('button', {
    type: 'button', class: 'btn', id: 'f-back', disabled: (i === 0 && !editingFromThanks) || busy || null,
    onclick: () => {
      formError = '';
      if (editingFromThanks) { editingFromThanks = false; me.step = TOTAL; } else me.step = i - 1;
      render();
    },
  }, editingFromThanks ? 'Annuler' : 'Précédent');

  const prenom = me.prenom.trim();
  const question = i > 0 && prenom ? s.q.replace(/^T/, `${prenom}, t`) : s.q;

  r.append(el('div', { class: 'step' },
    el('div', { class: 'progress' },
      el('span', { text: `${String(i + 1).padStart(2, '0')} / ${TOTAL}` }),
      el('div', { class: 'bar' }, el('i', { style: `width:${((i + 1) / TOTAL) * 100}%` }))),
    el('div', null, el('div', { class: 'cat', text: s.label }), el('h2', { text: question })),
    el('div', { class: 'field' }, el('label', { for: 'f-nom', text: s.field }), input),
    el('div', { class: 'field' }, el('span', { text: s.img, style: 'font-weight:500' }), drop,
      url && !uploading ? el('div', { class: 'swap', text: 'Clique sur l’image pour la changer' }) : null),
    el('p', { class: 'err', id: 'f-err', role: 'alert', text: formError }),
    el('div', { class: 'actions' }, backBtn, nextBtn),
  ));
  if (!busy) setTimeout(() => { const f = document.getElementById('f-nom'); if (f && !f.value) f.focus(); }, 0);

  async function next() {
    if (uploading || saving) return;
    if (!nameOf(me, s.key).trim()) { formError = s.key === 'moi' ? 'Écris ton prénom pour commencer.' : 'Donne un nom avant de continuer.'; render(); return; }
    if (!refOf(me, s.key)) { formError = 'Ajoute une image avant de continuer.'; render(); return; }
    formError = '';
    const before = { step: me.step, done: me.done };
    if (editingFromThanks) me.step = TOTAL;
    else { me.step = i + 1; if (me.step >= TOTAL) me.done = true; }
    saving = true; render();
    try { await saveMe(); editingFromThanks = false; }
    catch (e) {
      Object.assign(me, before);
      formError = e.message;
      if (e.status === 401) { writeCreds(null); formError = 'Ce carnet n’existe plus. Recommence depuis le début.'; me = blank(); }
    } finally { saving = false; }
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderThanks(r) {
  const grid = el('div', { class: 'grid' });
  CATS.forEach((c, idx) => {
    const url = imgUrl(refOf(me, c.key));
    const nom = nameOf(me, c.key);
    grid.append(el('div', { class: 'item' },
      el('div', { class: 'thumb' }, url ? el('img', { src: url, alt: '', loading: 'lazy' }) : 'Pas d’image'),
      el('div', { class: 'meta' },
        el('span', { class: 'lbl', text: c.label }),
        el('span', { class: 'val' + (nom ? '' : ' empty'), text: nom || 'Pas répondu' }),
        el('div', { class: 'row', style: 'margin-top:8px' },
          el('button', { type: 'button', class: 'btn sm', onclick: () => { editingFromThanks = true; me.step = idx + 1; formError = ''; render(); } }, 'Modifier')))));
  });
  const photo = imgUrl(me.photo);
  const link = personalLink();
  r.append(el('div', { class: 'thanks' },
    el('div', { class: 'thanks-head' },
      photo ? el('img', { class: 'avatar', src: photo, alt: '' }) : el('div', { class: 'avatar' }),
      el('div', null,
        el('h2', { text: `Merci ${me.prenom.trim()}, ton carnet est enregistré.` }),
        el('p', { text: 'Sur ce téléphone ou cet ordinateur, rouvre simplement le site pour changer une réponse.' }),
        el('div', { class: 'row', style: 'margin-top:8px' },
          el('button', { type: 'button', class: 'btn sm', onclick: () => { editingFromThanks = true; me.step = 0; formError = ''; render(); } }, 'Changer mon prénom ou ma photo')))),
    link ? el('div', { class: 'resume' },
      el('strong', { text: 'Ton lien perso' }),
      el('p', { text: 'Pour modifier ton carnet depuis un autre appareil. Garde-le pour toi : il donne accès à tes réponses.' }),
      el('code', { text: link }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn sm', onclick: () => copyText(link) }, 'Copier mon lien'))) : null,
    grid,
  ));
}

/* ---------- démarrage ---------- */
(async function init() {
  credsFromHash();
  if (!creds) creds = readCreds();
  if (creds) {
    try {
      const d = await api('/api/me');
      me = { prenom: d.prenom || '', photo: d.photo || null, items: d.items || {}, step: Number.isInteger(d.step) ? d.step : 0, done: !!d.done };
    } catch (e) {
      if (e.status === 401) writeCreds(null);
      else toast(e.message);
    }
  }
  render();
})();

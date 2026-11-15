// Récap admin : protégé par le mot de passe ADMIN_PASSWORD défini sur Vercel.
import { CATS, STEPS, TOTAL, EXT, el, toast, copyText, slug, fmtDate, imgUrl, refOf, nameOf, filled } from './shared.js';
import { renderCarousel } from './carousel.js';
import { renderEditor } from './editor.js';

const PW_KEY = 'fhummmmmmmm.admin';
let password = null;
let people = [];
let lastPayload = '';
let note = '';
let view = 'recap'; // 'recap', 'carousel' ou 'edit'
let editing = null; // carnet ouvert dans l'éditeur (vue 'edit')

try { password = sessionStorage.getItem(PW_KEY); } catch { /* ignoré */ }

const root = () => document.getElementById('app');

async function api(path, opts = {}) {
  let res;
  try { res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), 'x-admin-password': password || '' } }); }
  catch { throw Object.assign(new Error('Pas de connexion. Vérifie ton réseau.'), { status: 0 }); }
  if (opts.raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status });
  return data;
}

/* ---------- connexion ---------- */
function renderLogin(error) {
  const input = el('input', { class: 'text', id: 'admin-pw', type: 'password', autocomplete: 'current-password', required: true });
  const btn = el('button', { type: 'submit', class: 'btn primary', id: 'admin-login' }, 'Ouvrir le récap');
  const form = el('form', { class: 'login' },
    el('h1', { text: 'Récap' }),
    el('p', { text: 'Entre le mot de passe admin pour voir les carnets de tes amis.' }),
    el('div', { class: 'field' }, el('label', { for: 'admin-pw', text: 'Mot de passe' }), input),
    el('p', { class: 'err', role: 'alert', text: error || '' }),
    btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    password = input.value;
    btn.disabled = true; btn.textContent = 'Vérification…';
    const ok = await load();
    if (ok) { try { sessionStorage.setItem(PW_KEY, password); } catch { /* ignoré */ } }
  });
  root().replaceChildren(form);
  input.focus();
}

function logout() {
  password = null; people = []; lastPayload = ''; view = 'recap'; editing = null;
  try { sessionStorage.removeItem(PW_KEY); } catch { /* ignoré */ }
  renderLogin();
}

/* ---------- données ---------- */
async function load() {
  try {
    const data = await api('/api/admin/responses');
    const payload = JSON.stringify(data.people);
    const changed = payload !== lastPayload || note !== '' || document.getElementById('admin-pw');
    note = '';
    lastPayload = payload;
    people = data.people;
    // évite de tout redessiner quand rien n'a bougé ; l'éditeur de carrousel n'est jamais redessiné en arrière-plan
    if (changed && (view === 'recap' || document.getElementById('admin-pw'))) render();
    return true;
  } catch (e) {
    if (e.status === 401 || e.status === 429) { password = null; try { sessionStorage.removeItem(PW_KEY); } catch { /* ignoré */ } renderLogin(e.message); return false; }
    note = e.message;
    if (!document.getElementById('admin-pw')) render(); else renderLogin(e.message);
    return false;
  }
}

function personText(p) {
  return [`Prénom : ${p.prenom || '—'}`, ...CATS.map((c) => `${c.label} : ${nameOf(p, c.key) || '—'}`)].join('\n');
}
function csv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Prénom', ...CATS.map((c) => c.label), 'Complet', 'Mis à jour'];
  const rows = people.map((p) => [p.prenom, ...CATS.map((c) => nameOf(p, c.key)), p.done ? 'oui' : 'non', p.updatedAt ? fmtDate(p.updatedAt) : '']);
  return '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
}
function saveFile(name, blob) {
  const u = URL.createObjectURL(blob);
  const a = el('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
async function imageBlob(ref) {
  const url = imgUrl(ref);
  if (!url) return null;
  const res = await api(`/api/admin/image?url=${encodeURIComponent(url)}`, { raw: true });
  return res.blob();
}
const fileName = (p, k) => `${String(k).padStart(2, '0')}-${slug(k === 0 ? 'photo' : STEPS[k].label)}-${slug(nameOf(p, STEPS[k].key))}`;

async function addPerson(zip, p) {
  zip.file('reponses.txt', personText(p));
  let missing = 0;
  for (let k = 0; k < STEPS.length; k++) {
    const ref = refOf(p, STEPS[k].key);
    if (!ref) continue;
    const b = await imageBlob(ref).catch(() => null);
    if (!b) { missing++; continue; }
    zip.file(`${fileName(p, k)}.${EXT[b.type] || 'jpg'}`, b);
  }
  return missing;
}
async function withBusy(btn, fn) {
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Préparation…';
  try { await fn(); } catch (e) { toast(e.message || 'Le téléchargement a échoué.'); }
  finally { btn.disabled = false; btn.textContent = old; }
}
function zipPerson(p, btn) {
  if (!window.JSZip) { toast('Le module ZIP n’a pas chargé. Recharge la page.'); return; }
  return withBusy(btn, async () => {
    const zip = new JSZip();
    const missing = await addPerson(zip, p);
    saveFile(`${slug(p.prenom)}.zip`, await zip.generateAsync({ type: 'blob' }));
    if (missing) toast(`${missing} image(s) introuvable(s), le reste est dans le ZIP.`);
  });
}
function zipAll(btn) {
  if (!window.JSZip) { toast('Le module ZIP n’a pas chargé. Recharge la page.'); return; }
  return withBusy(btn, async () => {
    const zip = new JSZip();
    zip.file('reponses.csv', csv());
    const used = {};
    let missing = 0;
    for (const p of people) {
      let folder = slug(p.prenom);
      used[folder] = (used[folder] || 0) + 1;
      if (used[folder] > 1) folder += `-${used[folder]}`;
      missing += await addPerson(zip.folder(folder), p);
    }
    saveFile('fhummmmmmmm.zip', await zip.generateAsync({ type: 'blob' }));
    if (missing) toast(`${missing} image(s) introuvable(s), le reste est dans le ZIP.`);
  });
}
async function downloadOne(p, k, btn) {
  return withBusy(btn, async () => {
    const b = await imageBlob(refOf(p, STEPS[k].key));
    if (!b) { toast('Image introuvable.'); return; }
    saveFile(`${slug(p.prenom)}-${fileName(p, k)}.${EXT[b.type] || 'jpg'}`, b);
  });
}

function confirmBox(title, text) {
  return new Promise((resolve) => {
    const m = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    m.hidden = false;
    const ok = document.getElementById('modal-ok');
    const cancel = document.getElementById('modal-cancel');
    const done = (v) => { m.hidden = true; ok.onclick = null; cancel.onclick = null; resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    ok.focus();
  });
}
async function removePerson(p) {
  const ok = await confirmBox(`Supprimer le carnet de ${p.prenom || 'cette personne'} ?`, 'Ses réponses et ses images sont effacées pour de bon. Cette action ne peut pas être annulée.');
  if (!ok) return;
  try {
    await api(`/api/admin/responses?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    toast('Carnet supprimé');
    await load();
  } catch (e) { toast(e.message); }
}

/* ---------- affichage ---------- */
function thumb(ref, alt, cls) {
  const url = imgUrl(ref);
  const box = el('div', { class: cls });
  if (!url) { box.textContent = 'Pas d’image'; return box; }
  const im = el('img', { src: url, alt: alt || '', loading: 'lazy' });
  im.onerror = () => { box.textContent = 'Image indisponible'; };
  box.append(im);
  return box;
}

/* ---------- modifier / ajouter un carnet ---------- */
function openEditor(p, isNew = false) {
  editing = { person: p, isNew };
  view = 'edit';
  render();
  window.scrollTo(0, 0);
}
async function closeEditor(changed) {
  const { person, isNew } = editing || {};
  view = 'recap';
  editing = null;
  // Un carnet ajouté puis abandonné sans enregistrer est retiré.
  if (isNew && !changed) await api(`/api/admin/responses?id=${encodeURIComponent(person.id)}`, { method: 'DELETE' }).catch(() => {});
  lastPayload = ''; // force le rafraîchissement
  await load();
}
async function createPerson(btn) {
  btn.disabled = true;
  try {
    const p = await api('/api/admin/responses', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prenom: 'Nouvel ami' }),
    });
    openEditor(p, true);
  } catch (e) { toast(e.message); btn.disabled = false; }
}

function render() {
  if (view === 'edit' && editing) {
    renderEditor({ root: root(), person: editing.person, api, confirmBox, onClose: closeEditor });
    return;
  }
  if (view === 'carousel') {
    renderCarousel({ root: root(), people, imageBlob, saveFile, withBusy, onBack: () => { view = 'recap'; render(); } });
    return;
  }
  const complete = people.filter((p) => p.done).length;
  const summary = people.length === 0 ? 'Personne n’a encore répondu.'
    : `${people.length} ${people.length > 1 ? 'amis ont commencé' : 'ami a commencé'}, ${complete} complet${complete > 1 ? 's' : ''}.`;
  const has = people.length > 0;
  root().replaceChildren(el('div', { class: 'admin' },
    el('div', { class: 'admin-head' },
      el('div', null, el('h1', { text: 'Les carnets de tes amis' }), el('p', { text: summary })),
      el('div', { class: 'tools' },
        el('button', { type: 'button', class: 'btn sm', onclick: () => load().then(() => toast('À jour')) }, 'Actualiser'),
        el('button', { type: 'button', class: 'btn sm', disabled: !has || null, onclick: () => copyText(people.map(personText).join('\n\n')) }, 'Copier tous les textes'),
        el('button', { type: 'button', class: 'btn sm', disabled: !has || null, onclick: () => saveFile('fhummmmmmmm.csv', new Blob([csv()], { type: 'text/csv;charset=utf-8' })) }, 'Exporter en CSV'),
        el('button', { type: 'button', class: 'btn sm primary', disabled: !has || null, onclick: (e) => zipAll(e.currentTarget) }, 'Tout télécharger (ZIP)'),
        el('button', { type: 'button', class: 'btn sm', onclick: (e) => createPerson(e.currentTarget) }, 'Ajouter un ami'),
        el('button', { type: 'button', class: 'btn sm primary', disabled: !has || null, onclick: () => { view = 'carousel'; render(); } }, 'Créer le carrousel'),
        el('button', { type: 'button', class: 'link-btn', onclick: logout }, 'Se déconnecter'))),
    note ? el('div', { class: 'notice', text: note }) : null,
    has ? people.map(personCard) : el('div', { class: 'empty-state' },
      el('h2', { text: 'En attente des premières réponses' }),
      el('p', { text: `Envoie le lien ${location.origin} à tes amis. Leurs carnets apparaîtront ici.` })),
  ));
}

function personCard(p) {
  const grid = el('div', { class: 'grid' });
  CATS.forEach((c, idx) => {
    const ref = refOf(p, c.key);
    const nom = nameOf(p, c.key);
    grid.append(el('div', { class: 'item' },
      thumb(ref, nom, 'thumb'),
      el('div', { class: 'meta' },
        el('span', { class: 'lbl', text: c.label }),
        el('span', { class: 'val' + (nom ? '' : ' empty'), text: nom || 'Pas encore répondu' }),
        el('div', { class: 'row', style: 'margin-top:8px' },
          nom ? el('button', { type: 'button', class: 'btn sm', onclick: () => copyText(nom) }, 'Copier') : null,
          ref ? el('button', { type: 'button', class: 'btn sm', onclick: (e) => downloadOne(p, idx + 1, e.currentTarget) }, 'Image') : null))));
  });
  const avatar = thumb(p.photo, p.prenom, 'avatar');
  avatar.style.cssText = 'overflow:hidden;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.7rem';
  if (avatar.firstChild && avatar.firstChild.tagName === 'IMG') avatar.firstChild.style.cssText = 'width:100%;height:100%;object-fit:cover';
  return el('article', { class: 'person' },
    el('div', { class: 'person-head' }, avatar,
      el('div', { class: 'who' },
        el('h3', { text: p.prenom || 'Sans prénom' }),
        el('span', { class: `chip ${p.done ? 'done' : 'wip'}`, text: p.done ? 'Complet' : `En cours · ${filled(p)}/${TOTAL}` }),
        p.updatedAt ? el('span', { class: 'when', text: `mis à jour le ${fmtDate(p.updatedAt)}` }) : null),
      el('div', { class: 'tools' },
        el('button', { type: 'button', class: 'btn sm', onclick: () => copyText(personText(p)) }, 'Copier ses réponses'),
        p.photo ? el('button', { type: 'button', class: 'btn sm', onclick: (e) => downloadOne(p, 0, e.currentTarget) }, 'Sa photo') : null,
        el('button', { type: 'button', class: 'btn sm', onclick: (e) => zipPerson(p, e.currentTarget) }, 'Ses images (ZIP)'),
        el('button', { type: 'button', class: 'btn sm', onclick: () => openEditor(p) }, 'Modifier'),
        el('button', { type: 'button', class: 'btn sm danger', onclick: () => removePerson(p) }, 'Supprimer'))),
    grid);
}

/* ---------- démarrage ---------- */
if (password) load(); else renderLogin();
// Rafraîchit toutes les 30 s quand l'onglet est visible.
setInterval(() => { if (password && document.visibilityState === 'visible' && !document.getElementById('admin-pw')) load(); }, 30000);

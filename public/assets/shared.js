// Code commun à la page des amis et au récap admin.

export const CATS = [
  { key: 'repas',         label: 'Repas préféré',          q: 'Ton repas préféré ?',          ph: 'Ex. Amiwo au poulet' },
  { key: 'couleur',       label: 'Couleur préférée',       q: 'Ta couleur préférée ?',        ph: 'Ex. Bleu nuit' },
  { key: 'crush',         label: 'Crush célébrité',        q: 'Ta crush célébrité ?',         ph: 'Ex. Zendaya' },
  { key: 'serie',         label: 'Série préférée',         q: 'Ta série préférée ?',          ph: 'Ex. Squid Game' },
  { key: 'boisson',       label: 'Boisson préférée',       q: 'Ta boisson préférée ?',        ph: 'Ex. Bissap bien frais' },
  { key: 'voiture',       label: 'Voiture préférée',       q: 'Ta voiture préférée ?',        ph: 'Ex. Toyota Land Cruiser' },
  { key: 'hobby',         label: 'Hobby',                  q: 'Ton hobby ?',                  ph: 'Ex. Le foot du dimanche' },
  { key: 'artiste_homme', label: 'Artiste homme préféré',  q: 'Ton artiste homme préféré ?',  ph: 'Ex. Fally Ipupa' },
  { key: 'artiste_femme', label: 'Artiste femme préférée', q: 'Ton artiste femme préférée ?', ph: 'Ex. Angélique Kidjo' },
];

export const STEPS = [
  { key: 'moi', label: 'Toi', q: 'D’abord, toi : c’est quoi ton prénom ?', ph: 'Ton prénom', field: 'Ton prénom', img: 'Une photo de toi' },
  ...CATS.map((c) => ({ ...c, field: 'Le nom', img: 'Une image pour l’illustrer' })),
];
export const TOTAL = STEPS.length;
export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié'); }
  catch { toast('Copie impossible ici. Sélectionne le texte à la main.'); }
}

export function slug(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'sans-nom';
}

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

/** URL d'image affichable, seulement si elle vient du stockage Vercel Blob. */
export function imgUrl(ref) {
  if (!ref || typeof ref.url !== 'string') return null;
  try {
    const u = new URL(ref.url);
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com') ? ref.url : null;
  } catch { return null; }
}

export const refOf = (p, key) => (key === 'moi' ? p.photo : p.items?.[key]?.img) || null;
export const nameOf = (p, key) => (key === 'moi' ? p.prenom : p.items?.[key]?.nom) || '';
export const filled = (p) => STEPS.filter((s) => nameOf(p, s.key).trim()).length;

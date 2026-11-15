// Code partagé par les fonctions /api (non exposé comme route).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { put } from '@vercel/blob';

export const CAT_KEYS = ['repas', 'couleur', 'crush', 'serie', 'boisson', 'voiture', 'hobby', 'artiste_homme', 'artiste_femme'];
export const STEP_KEYS = ['moi', ...CAT_KEYS];
export const MAX_IMAGE_BYTES = 4.3 * 1024 * 1024; // les fonctions Vercel acceptent 4,5 Mo max par requête
export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/* ---------- Réponses HTTP ---------- */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Enveloppe un objet { GET, POST, ... } en handler Vercel (format `export default { fetch }`). */
export function route(handlers) {
  return {
    async fetch(request) {
      const handler = handlers[request.method];
      if (!handler) return json({ error: 'Méthode non autorisée.' }, 405);
      try {
        return await handler(request);
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error(e);
        return json({ error: 'Erreur serveur. Réessaie dans un instant.' }, 500);
      }
    },
  };
}

export async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Données trop volumineuses.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Données invalides.'); }
}

export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnu';
}

/* ---------- Redis (Upstash, API REST) ---------- */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export async function redis(...command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new HttpError(500, 'Base Redis non configurée : connecte Upstash Redis au projet sur Vercel.');
  }
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis ${command[0]} : ${data.error || res.status}`);
  return data.result;
}

export async function rateLimit(key, limit, windowSeconds, message) {
  const n = await redis('INCR', `rl:${key}`);
  if (n === 1) await redis('EXPIRE', `rl:${key}`, windowSeconds);
  if (n > limit) throw new HttpError(429, message);
}

/* ---------- Identité des amis (sans compte) ---------- */
export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
export const newId = () => randomBytes(12).toString('base64url'); // 16 caractères
export const newToken = () => randomBytes(32).toString('base64url'); // 43 caractères

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

export async function getRecord(id) {
  const raw = await redis('GET', `resp:${id}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function authFriend(request) {
  const id = request.headers.get('x-friend-id') || '';
  const token = request.headers.get('x-friend-token') || '';
  if (!ID_RE.test(id) || !TOKEN_RE.test(token)) throw new HttpError(401, 'Carnet introuvable.');
  const rec = await getRecord(id);
  if (!rec || !safeEqual(rec.tokenHash, sha256(token))) throw new HttpError(401, 'Carnet introuvable.');
  return { id, rec };
}

/* ---------- Admin ---------- */
export async function authAdmin(request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new HttpError(500, 'ADMIN_PASSWORD n’est pas défini dans les variables d’environnement Vercel.');
  const given = request.headers.get('x-admin-password') || '';
  if (!safeEqual(sha256(given), sha256(password))) {
    await rateLimit(`admin-fail:${clientIp(request)}`, 20, 900, 'Trop d’essais. Réessaie dans 15 minutes.');
    throw new HttpError(401, 'Mot de passe incorrect.');
  }
}

/* ---------- Données ---------- */
export function validBlobUrl(url, ownerId) {
  if (typeof url !== 'string' || url.length > 500) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.public.blob.vercel-storage.com')) return false;
    return ownerId ? u.pathname.startsWith(`/uploads/${ownerId}/`) : u.pathname.startsWith('/uploads/');
  } catch { return false; }
}

const clip = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function imageUrls(rec) {
  return [rec.photo?.url, ...CAT_KEYS.map((k) => rec.items?.[k]?.img?.url)].filter(Boolean);
}

/** Fusionne ce que l'ami envoie avec son carnet, en ne gardant que des champs valides. */
export function mergeAnswers(id, rec, body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Données invalides.');
  const img = (v) => (v && validBlobUrl(v.url, id) ? { url: v.url } : null);
  const step = Number.isInteger(body.step) ? Math.max(0, Math.min(STEP_KEYS.length, body.step)) : 0;
  const next = {
    ...rec,
    prenom: clip(body.prenom, 60),
    photo: img(body.photo),
    items: {},
    step,
    done: body.done === true,
    updatedAt: new Date().toISOString(),
  };
  const items = body.items && typeof body.items === 'object' ? body.items : {};
  for (const k of CAT_KEYS) {
    const x = items[k];
    if (!x || typeof x !== 'object') continue;
    const nom = clip(x.nom, 80);
    const im = img(x.img);
    if (nom || im) next.items[k] = { nom, img: im };
  }
  const keep = new Set(imageUrls(next));
  const removed = imageUrls(rec).filter((u) => !keep.has(u));
  return { next, removed };
}

export function publicView(rec) {
  const { tokenHash, ...rest } = rec;
  return rest;
}

export function hasContent(p) {
  return Boolean(p.prenom || p.photo || Object.keys(p.items || {}).length);
}

/** Lit l'image envoyée (corps brut), vérifie son format et la range dans uploads/<id>/. Renvoie son URL. */
export async function storeImage(request, id, key) {
  if (!STEP_KEYS.includes(key)) throw new HttpError(400, 'Catégorie inconnue.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image trop lourde (4 Mo max).');
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) throw new HttpError(400, 'Image vide.');
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image trop lourde (4 Mo max).');
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, 'Format non supporté. Envoie un JPG, PNG, WEBP ou GIF.');
  const blob = await put(`uploads/${id}/${key}.${EXT[type]}`, buf, {
    access: 'public',
    addRandomSuffix: true, // URL impossible à deviner
    contentType: type,
  });
  return blob.url;
}

/** Reconnaît le format d'image à ses premiers octets (on ne fait pas confiance au content-type). */
export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const head6 = buf.subarray(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

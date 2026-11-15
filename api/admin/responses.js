// GET /api/admin/responses : tous les carnets.  POST : crée un carnet (ajouté par l'admin).
// PUT /api/admin/responses?id=... : modifie un carnet.  DELETE /api/admin/responses?id=... : supprime un carnet.
// Protégé par l'en-tête x-admin-password (variable ADMIN_PASSWORD).
import { del } from '@vercel/blob';
import { route, json, redis, authAdmin, getRecord, publicView, hasContent, imageUrls, readJson, mergeAnswers, newId, newToken, sha256, HttpError, ID_RE } from '../../lib/server.js';

export default route({
  async GET(request) {
    await authAdmin(request);
    const ids = (await redis('SMEMBERS', 'resp:index')) || [];
    if (!ids.length) return json({ people: [] });
    const raws = await redis('MGET', ...ids.map((id) => `resp:${id}`));
    const people = [];
    raws.forEach((raw, i) => {
      if (!raw) return;
      try {
        const p = { id: ids[i], ...publicView(JSON.parse(raw)) };
        if (hasContent(p)) people.push(p);
      } catch { /* carnet illisible ignoré */ }
    });
    people.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return json({ people });
  },

  async POST(request) {
    await authAdmin(request);
    const body = await readJson(request, 2000);
    const prenom = typeof body?.prenom === 'string' ? body.prenom.trim().slice(0, 60) : '';
    if (!prenom) throw new HttpError(400, 'Indique un prénom.');
    const id = newId();
    const now = new Date().toISOString();
    // Jeton aléatoire jamais transmis : seul l'admin peut modifier ce carnet.
    const rec = { tokenHash: sha256(newToken()), prenom, photo: null, items: {}, step: 0, done: false, createdAt: now, updatedAt: now };
    const ok = await redis('SET', `resp:${id}`, JSON.stringify(rec), 'NX');
    if (ok !== 'OK') throw new HttpError(500, 'Création impossible, réessaie.');
    await redis('SADD', 'resp:index', id);
    return json({ id, ...publicView(rec) }, 201);
  },

  async PUT(request) {
    await authAdmin(request);
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!ID_RE.test(id)) throw new HttpError(400, 'Identifiant invalide.');
    const rec = await getRecord(id);
    if (!rec) throw new HttpError(404, 'Carnet introuvable.');
    const body = await readJson(request, 20000);
    // L'admin ne touche pas à l'étape où en est l'ami.
    const { next, removed } = mergeAnswers(id, rec, { ...body, step: rec.step });
    await redis('SET', `resp:${id}`, JSON.stringify(next));
    if (removed.length) await del(removed).catch((e) => console.error('del', e));
    return json({ id, ...publicView(next) });
  },

  async DELETE(request) {
    await authAdmin(request);
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!ID_RE.test(id)) throw new HttpError(400, 'Identifiant invalide.');
    const rec = await getRecord(id);
    if (rec) {
      const urls = imageUrls(rec);
      if (urls.length) await del(urls).catch((e) => console.error('del', e));
    }
    await redis('DEL', `resp:${id}`);
    await redis('SREM', 'resp:index', id);
    return json({ ok: true });
  },
});

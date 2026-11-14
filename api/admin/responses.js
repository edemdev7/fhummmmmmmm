// GET /api/admin/responses : tous les carnets.  DELETE /api/admin/responses?id=... : supprime un carnet.
// Protégé par l'en-tête x-admin-password (variable ADMIN_PASSWORD).
import { del } from '@vercel/blob';
import { route, json, redis, authAdmin, getRecord, publicView, hasContent, imageUrls, HttpError, ID_RE } from '../../lib/server.js';

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

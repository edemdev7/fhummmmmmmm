// POST /api/register : crée un carnet vide et renvoie l'identifiant + le jeton secret de l'ami.
import { route, json, redis, rateLimit, clientIp, newId, newToken, sha256, HttpError } from '../lib/server.js';

export default route({
  async POST(request) {
    await rateLimit(`register:${clientIp(request)}`, 30, 3600, 'Trop de carnets créés depuis ce réseau. Réessaie dans une heure.');
    const id = newId();
    const token = newToken();
    const now = new Date().toISOString();
    const rec = { tokenHash: sha256(token), prenom: '', photo: null, items: {}, step: 0, done: false, createdAt: now, updatedAt: now };
    const ok = await redis('SET', `resp:${id}`, JSON.stringify(rec), 'NX');
    if (ok !== 'OK') throw new HttpError(500, 'Création impossible, réessaie.');
    await redis('SADD', 'resp:index', id);
    return json({ id, token }, 201);
  },
});

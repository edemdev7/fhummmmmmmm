// GET /api/me : lit son carnet.  PUT /api/me : enregistre ses réponses.
import { del } from '@vercel/blob';
import { route, json, redis, authFriend, readJson, mergeAnswers, publicView } from '../lib/server.js';

export default route({
  async GET(request) {
    const { rec } = await authFriend(request);
    return json(publicView(rec));
  },

  async PUT(request) {
    const { id, rec } = await authFriend(request);
    const body = await readJson(request, 20000);
    const { next, removed } = mergeAnswers(id, rec, body);
    await redis('SET', `resp:${id}`, JSON.stringify(next));
    // Les images remplacées ne servent plus : on les supprime du stockage.
    if (removed.length) await del(removed).catch((e) => console.error('del', e));
    return json(publicView(next));
  },
});

// POST /api/upload?key=repas : envoie une image (corps brut) et renvoie son URL.
import { route, json, authFriend, rateLimit, storeImage } from '../lib/server.js';

export default route({
  async POST(request) {
    const { id } = await authFriend(request);
    const key = new URL(request.url).searchParams.get('key');
    await rateLimit(`upload:${id}`, 80, 86400, 'Trop d’images envoyées aujourd’hui. Réessaie demain.');
    return json({ url: await storeImage(request, id, key) }, 201);
  },
});

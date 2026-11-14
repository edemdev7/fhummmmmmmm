// GET /api/admin/image?url=... : relaie une image du stockage pour les téléchargements ZIP de l'admin.
import { route, authAdmin, validBlobUrl, HttpError } from '../../lib/server.js';

export default route({
  async GET(request) {
    await authAdmin(request);
    const url = new URL(request.url).searchParams.get('url');
    if (!validBlobUrl(url)) throw new HttpError(400, 'URL d’image invalide.');
    const res = await fetch(url);
    if (!res.ok) throw new HttpError(404, 'Image introuvable.');
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') || 'application/octet-stream',
        'cache-control': 'private, no-store',
      },
    });
  },
});

// POST /api/admin/upload?id=...&key=repas : l'admin envoie une image pour le carnet d'un ami.
import { route, json, authAdmin, getRecord, storeImage, HttpError, ID_RE } from '../../lib/server.js';

export default route({
  async POST(request) {
    await authAdmin(request);
    const params = new URL(request.url).searchParams;
    const id = params.get('id') || '';
    if (!ID_RE.test(id)) throw new HttpError(400, 'Identifiant invalide.');
    if (!(await getRecord(id))) throw new HttpError(404, 'Carnet introuvable.');
    return json({ url: await storeImage(request, id, params.get('key')) }, 201);
  },
});

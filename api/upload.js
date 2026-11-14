// POST /api/upload?key=repas : envoie une image (corps brut) et renvoie son URL.
import { put } from '@vercel/blob';
import { route, json, authFriend, rateLimit, sniffImage, HttpError, STEP_KEYS, MAX_IMAGE_BYTES, EXT } from '../lib/server.js';

export default route({
  async POST(request) {
    const { id } = await authFriend(request);
    const key = new URL(request.url).searchParams.get('key');
    if (!STEP_KEYS.includes(key)) throw new HttpError(400, 'Catégorie inconnue.');

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image trop lourde (4 Mo max).');
    await rateLimit(`upload:${id}`, 80, 86400, 'Trop d’images envoyées aujourd’hui. Réessaie demain.');

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
    return json({ url: blob.url }, 201);
  },
});

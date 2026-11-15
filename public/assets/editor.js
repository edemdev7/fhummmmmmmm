// Admin : modifier le carnet d'un ami (prénom, photo, réponses, images).
import { CATS, el, toast, imgUrl, prepareImage } from './shared.js';

/**
 * ctx : { root, person, api, confirmBox, onClose(changed) }
 * api(path, opts) ajoute le mot de passe admin et renvoie le JSON.
 */
export function renderEditor(ctx) {
  const p = ctx.person;
  const draft = {
    prenom: p.prenom || '',
    photo: p.photo || null,
    done: Boolean(p.done),
    items: Object.fromEntries(CATS.map((c) => [c.key, { nom: p.items?.[c.key]?.nom || '', img: p.items?.[c.key]?.img || null }])),
  };
  const initial = JSON.stringify(draft);
  const dirty = () => JSON.stringify(draft) !== initial;
  let uploads = 0;
  let saving = false;

  function imageField(key, get, set, alt) {
    const box = el('div', { class: 'ed-img' });
    const draw = (busy) => {
      const ref = get();
      const url = imgUrl(ref);
      const input = el('input', { type: 'file', accept: 'image/*', class: 'ed-file', 'aria-label': `${url ? 'Remplacer' : 'Ajouter'} l’image : ${alt}`,
        onchange: (e) => upload(e.target.files[0]) });
      box.replaceChildren(
        el('div', { class: 'ed-thumb' },
          busy ? el('div', { class: 'spinner', 'aria-label': 'Envoi de l’image' })
            : url ? el('img', { src: url, alt }) : el('span', { text: 'Pas d’image' })),
        el('div', { class: 'row' },
          el('label', { class: 'btn sm ed-pick' + (busy ? ' disabled' : '') }, url ? 'Remplacer' : 'Ajouter une image', input),
          url && !busy ? el('button', { type: 'button', class: 'btn sm danger', onclick: () => { set(null); draw(); } }, 'Retirer') : null));
    };
    async function upload(file) {
      if (!file) return;
      if (file.type && !file.type.startsWith('image/')) { toast('Choisis une image (JPG, PNG ou WEBP).'); return; }
      uploads++; draw(true); syncSave();
      try {
        const blob = await prepareImage(file);
        const r = await ctx.api(`/api/admin/upload?id=${encodeURIComponent(p.id)}&key=${encodeURIComponent(key)}`,
          { method: 'POST', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
        set({ url: r.url });
      } catch (e) {
        toast(/decode|encode/.test(e.message) ? 'Ce format ne passe pas. Envoie plutôt un JPG ou un PNG.' : e.message);
      } finally { uploads--; draw(); syncSave(); }
    }
    draw();
    return box;
  }

  const saveBtn = el('button', { type: 'submit', class: 'btn primary', id: 'ed-save' }, 'Enregistrer');
  function syncSave() {
    saveBtn.disabled = saving || uploads > 0;
    saveBtn.textContent = saving ? 'Enregistrement…' : uploads > 0 ? 'Envoi de l’image…' : 'Enregistrer';
  }

  async function close() {
    if (dirty() && !(await ctx.confirmBox('Quitter sans enregistrer ?', 'Tes modifications sur ce carnet seront perdues.'))) return;
    ctx.onClose(false);
  }

  async function save(e) {
    e.preventDefault();
    if (uploads > 0 || saving) return;
    saving = true; syncSave();
    try {
      const items = {};
      for (const c of CATS) {
        const it = draft.items[c.key];
        const nom = it.nom.trim();
        if (nom || it.img) items[c.key] = { nom, img: it.img };
      }
      await ctx.api(`/api/admin/responses?id=${encodeURIComponent(p.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prenom: draft.prenom.trim(), photo: draft.photo, items, done: draft.done }),
      });
      toast('Carnet enregistré');
      ctx.onClose(true);
    } catch (err) {
      toast(err.message);
      saving = false; syncSave();
    }
  }

  const who = el('section', { class: 'person ed-card' },
    el('h2', { text: 'Prénom et photo' }),
    el('div', { class: 'ed-row' },
      imageField('moi', () => draft.photo, (v) => { draft.photo = v; }, 'Photo'),
      el('div', { class: 'field ed-fields' },
        el('label', { for: 'ed-prenom', text: 'Prénom' }),
        el('input', { class: 'text', id: 'ed-prenom', value: draft.prenom, maxlength: 60, oninput: (e) => { draft.prenom = e.target.value; } }),
        el('label', { class: 'cr-check cr-opt ed-done' },
          el('input', { type: 'checkbox', checked: draft.done || null, onchange: (e) => { draft.done = e.target.checked; } }),
          el('span', { text: 'Carnet complet' })))));

  const cats = CATS.map((c) => {
    const it = draft.items[c.key];
    const id = `ed-${c.key}`;
    return el('section', { class: 'item ed-item' },
      imageField(c.key, () => it.img, (v) => { it.img = v; }, c.label),
      el('div', { class: 'field ed-fields' },
        el('label', { for: id, class: 'lbl', text: c.label }),
        el('input', { class: 'text', id, value: it.nom, maxlength: 80, placeholder: c.ph, oninput: (e) => { it.nom = e.target.value; } })));
  });

  ctx.root.replaceChildren(el('form', { class: 'admin', onsubmit: save },
    el('div', { class: 'admin-head' },
      el('div', null,
        el('h1', { text: `Modifier le carnet de ${p.prenom || 'cet ami'}` }),
        el('p', { text: 'Les changements ne sont enregistrés qu’au clic sur « Enregistrer ». Une image remplacée est supprimée du stockage.' })),
      el('div', { class: 'tools' },
        el('button', { type: 'button', class: 'btn', onclick: close }, 'Annuler'),
        saveBtn)),
    who,
    el('div', { class: 'grid ed-grid' }, cats),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn', onclick: close }, 'Annuler'),
      el('button', { type: 'submit', class: 'btn primary' }, 'Enregistrer'))));
  document.getElementById('ed-prenom').focus();
}

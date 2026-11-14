# Fhummmmmmmm

Petit site pour recueillir les goûts de tes amis. Chacun remplit son carnet en 10 étapes : prénom et photo, puis repas, couleur, crush célébrité, série, boisson, voiture, hobby, artiste homme et artiste femme préférés, chaque fois avec un nom et une image. Toi, tu retrouves tout sur une page récap protégée par mot de passe.

- **`/`** : le carnet, pour les amis. Aucun compte n'est nécessaire.
- **`/admin`** : le récap, pour toi seul. On peut y copier les textes, exporter en CSV, télécharger les images une par une ou en ZIP, et supprimer un carnet.

## Comment ça marche

| Élément | Rôle |
| --- | --- |
| `public/` | Le site statique (HTML, CSS, JS) |
| `api/` | Fonctions Vercel : création du carnet, enregistrement, envoi d'images, récap admin |
| `lib/server.js` | Code partagé par les fonctions (n'est pas une route) |
| **Vercel Blob** | Stocke les images |
| **Upstash Redis** | Stocke les réponses (gratuit, via le Marketplace Vercel) |

Chaque ami reçoit un identifiant secret, gardé dans son navigateur. Il peut donc revenir modifier ses réponses sur le même appareil. Après la dernière étape, il obtient aussi un **lien perso** pour reprendre son carnet sur un autre appareil.

## Déployer sur Vercel

1. **Pousse le dossier sur GitHub**
   ```bash
   git init
   git add .
   git commit -m "Fhummmmmmmm"
   git branch -M main
   git remote add origin https://github.com/<toi>/fhummmmmmmm.git
   git push -u origin main
   ```

2. **Importe le projet sur Vercel** : *Add New → Project*, choisis le dépôt. Garde le preset **Other** et ne mets ni Build Command ni Output Directory : `vercel.json` s'en charge. Tu peux cliquer sur *Deploy* : le site s'affichera, mais il faut encore les étapes 3 à 5 pour qu'il fonctionne.

3. **Crée le stockage des images** : dans le projet, onglet *Storage → Create Database → Blob*. Choisis l'accès **Public**, puis connecte le store au projet. La variable `BLOB_READ_WRITE_TOKEN` est ajoutée automatiquement.

4. **Crée la base des réponses** : toujours dans *Storage*, choisis **Upstash → Redis** (offre gratuite), puis connecte-la au projet. Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont ajoutées automatiquement.

5. **Choisis ton mot de passe admin** : *Settings → Environment Variables*, ajoute `ADMIN_PASSWORD` avec un mot de passe long, pour Production, Preview et Development.

6. **Redéploie** : *Deployments → … → Redeploy*. Les variables ne s'appliquent qu'aux nouveaux déploiements.

7. Ouvre `https://<ton-projet>.vercel.app/admin`, entre le mot de passe, puis envoie `https://<ton-projet>.vercel.app` à tes amis.

## Tester en local (facultatif)

```bash
npm install
npm i -g vercel
vercel link              # relie le dossier au projet Vercel
vercel env pull .env.local
vercel dev               # http://localhost:3000
```

## Bon à savoir

- **Confidentialité** : les images sont publiques mais leur adresse est aléatoire et impossible à deviner. Seule la page `/admin` (avec le mot de passe) liste tout le monde. Le site est marqué `noindex` pour ne pas apparaître dans les moteurs de recherche.
- **Limites** : 4 Mo par image (les photos plus lourdes sont compressées automatiquement dans le navigateur), 30 nouveaux carnets par heure et par réseau, 80 images par jour et par ami. Après 20 mauvais mots de passe en 15 minutes, l'admin est bloqué temporairement.
- **Changer les catégories** : modifie la liste `CATS` dans `public/assets/shared.js` et `CAT_KEYS` dans `lib/server.js`. Les deux doivent avoir les mêmes clés.
- **Changer le nom affiché** : il apparaît dans `public/index.html` et `public/admin.html`.

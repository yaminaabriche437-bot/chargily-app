# Landing page Ebook — Intégration API Chargily Pay (backend sécurisé)

## ⚠️ Important — à faire immédiatement
Tu as partagé ta clé secrète Chargily dans une conversation. **Révoque-la et génère-en une nouvelle**
depuis ton tableau de bord Chargily (Paramètres → Clés API) avant de mettre ce projet en ligne.
N'utilise **que la nouvelle clé** ci-dessous.

## Comment ça marche
- `public/index.html` : ta landing page. Le formulaire n'envoie **aucune clé** — il appelle simplement `/api/create-checkout`.
- `server.js` : le backend. Lui seul connaît la clé secrète (`CHARGILY_SECRET_KEY`), stockée dans `.env` (jamais dans le code, jamais publiée).
- Flux :
  1. Le client remplit le formulaire → le backend crée un "checkout" Chargily et renvoie une URL de paiement.
  2. Le client est redirigé vers cette page de paiement Chargily (Edahabia/CIB).
  3. Une fois le paiement confirmé, Chargily appelle notre **webhook** (`/api/webhook`) — le serveur vérifie la signature, puis envoie automatiquement l'email avec l'ebook.
  4. Le client est redirigé vers `merci.html` (succès) ou `echec.html` (échec).

Contrairement à l'ancienne version, **l'ebook n'est plus envoyé avant confirmation du paiement**.

## Installation locale
```bash
npm install
cp .env.example .env
# remplis .env avec tes vraies valeurs (nouvelle clé secrète, SMTP, etc.)
npm start
```
Le site tourne sur http://localhost:3000

## Variables à configurer dans `.env`
| Variable | Description |
|---|---|
| `CHARGILY_SECRET_KEY` | Ta **nouvelle** clé secrète Chargily (jamais dans le HTML) |
| `CHARGILY_LIVE_MODE` | `false` pour tester, `true` pour les vrais paiements |
| `SITE_URL` | URL publique de ton site une fois déployé |
| `EBOOK_VIEW_LINK` / `EBOOK_DOWNLOAD_LINK` | Liens Google Drive de l'ebook |
| `OWNER_EMAIL` | Ton email pour recevoir les notifications de vente |
| `SMTP_*` | Identifiants pour l'envoi d'emails (Gmail avec mot de passe d'application, Brevo, SendGrid...) |

## Déploiement (exemples gratuits/faciles)
- **Render.com** ou **Railway.app** : connecte ton repo GitHub, ajoute les variables d'environnement dans leur interface, déploie. Ils te donnent une URL type `https://tonapp.onrender.com` — utilise-la comme `SITE_URL`.
- Ensuite, dans ton tableau de bord Chargily, configure l'URL de webhook : `https://tonapp.onrender.com/api/webhook`.

## Sécurité — à retenir
- La clé secrète ne doit **jamais** apparaître dans un fichier HTML/JS servi au navigateur.
- Le fichier `.env` ne doit **jamais** être commité sur GitHub (ajoute-le à `.gitignore`).
- Le webhook vérifie la signature Chargily (HMAC-SHA256) avant de faire confiance à un événement de paiement — ne saute pas cette étape.

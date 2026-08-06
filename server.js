// server.js
// Backend qui gère le paiement Chargily Pay (V2) pour la landing page de l'ebook.
// La clé secrète Chargily n'est JAMAIS envoyée au navigateur : elle reste ici,
// côté serveur, chargée depuis une variable d'environnement.

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();

const PORT = process.env.PORT || 3000;

// ⚠️ Clé secrète Chargily — définie uniquement via variable d'environnement (.env),
// jamais écrite en dur dans le code, jamais envoyée au frontend.
const CHARGILY_SECRET_KEY = process.env.CHARGILY_SECRET_KEY;
const CHARGILY_PUBLIC_KEY = process.env.CHARGILY_PUBLIC_KEY; // non sensible, peut être exposée si besoin

// Base URL de l'API Chargily Pay V2 (mode live = production)
// Mode test : https://pay.chargily.net/test/api/v2
// Mode live : https://pay.chargily.net/api/v2
const CHARGILY_API_BASE = process.env.CHARGILY_LIVE_MODE === 'true'
  ? 'https://pay.chargily.net/api/v2'
  : 'https://pay.chargily.net/test/api/v2';

const PRICE_DA = 3900; // Prix en DZD
const EBOOK_VIEW_LINK = process.env.EBOOK_VIEW_LINK;
const EBOOK_DRIVE_LINK = process.env.EBOOK_DOWNLOAD_LINK;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

// --- Config email (SMTP) pour l'envoi automatique après paiement confirmé ---
// Renseigne ces variables dans ton .env (ex: Gmail avec un mot de passe d'application,
// ou un service comme Brevo / SendGrid / Mailgun).
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// On garde le body brut pour le webhook (nécessaire pour vérifier la signature)
app.use('/api/webhook', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// On stocke temporairement les infos client par checkout id, le temps de recevoir
// la confirmation du webhook. En production, utilise une vraie base de données.
const pendingOrders = new Map();

// ---------------------------------------------------------------------------
// 1) Créer un checkout de paiement
// ---------------------------------------------------------------------------
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Nom, email et rôle sont obligatoires.' });
    }

    if (!CHARGILY_SECRET_KEY) {
      console.error('CHARGILY_SECRET_KEY manquante dans .env');
      return res.status(500).json({ error: 'Configuration serveur incomplète.' });
    }

    const response = await fetch(`${CHARGILY_API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CHARGILY_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: PRICE_DA,
        currency: 'dzd',
        description: 'Ebook - Pharmacovigilance en Algérie',
        success_url: `${SITE_URL}/merci.html`,
        failure_url: `${SITE_URL}/echec.html`,
        webhook_endpoint_url: `${SITE_URL}/api/webhook`,
        customer_email: email,
        metadata: { name, email, role },
      }),
    });

    const checkout = await response.json();

    if (!response.ok) {
      console.error('Erreur Chargily:', checkout);
      return res.status(500).json({ error: "Impossible de créer le paiement. Réessayez." });
    }

    // On mémorise la commande en attente, associée à l'id du checkout
    pendingOrders.set(checkout.id, { name, email, role, createdAt: Date.now() });

    return res.json({ checkout_url: checkout.checkout_url });
  } catch (err) {
    console.error('Erreur /api/create-checkout:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ---------------------------------------------------------------------------
// 2) Webhook Chargily — notifie le serveur quand le paiement est confirmé
// ---------------------------------------------------------------------------
app.post('/api/webhook', async (req, res) => {
  try {
    const signature = req.get('signature') || '';
    const rawBody = req.body; // Buffer brut

    if (!signature) {
      return res.sendStatus(400);
    }

    const computedSignature = crypto
      .createHmac('sha256', CHARGILY_SECRET_KEY)
      .update(rawBody)
      .digest('hex');

    const isValid =
      signature.length === computedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature));

    if (!isValid) {
      console.warn('Signature webhook invalide');
      return res.sendStatus(403);
    }

    const event = JSON.parse(rawBody.toString('utf8'));

    if (event.type === 'checkout.paid') {
      const checkout = event.data;
      const order = pendingOrders.get(checkout.id) || checkout.metadata || {};
      const { name, email, role } = order;

      if (email) {
        await sendEbookEmail({ name, email });
        await notifyOwner({ name, email, role });
        pendingOrders.delete(checkout.id);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Erreur /api/webhook:', err);
    return res.sendStatus(400);
  }
});

// ---------------------------------------------------------------------------
// Emails envoyés UNIQUEMENT après confirmation réelle du paiement
// ---------------------------------------------------------------------------
async function sendEbookEmail({ name, email }) {
  await transporter.sendMail({
    from: `"Pharmacovigilance DZ" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "✓ Votre ebook Pharmacovigilance en Algérie est prêt",
    text: `Bonjour ${name},\n\nMerci pour votre achat ! Voici le lien pour accéder à votre ebook :\n\n📥 Télécharger : ${EBOOK_DRIVE_LINK}\n\n📖 Visualiser : ${EBOOK_VIEW_LINK}\n\nBon apprentissage !`,
  });
}

async function notifyOwner({ name, email, role }) {
  if (!OWNER_EMAIL) return;
  await transporter.sendMail({
    from: `"Pharmacovigilance DZ" <${process.env.SMTP_USER}>`,
    to: OWNER_EMAIL,
    subject: '💰 Nouvelle vente confirmée - Pharmacovigilance DZ',
    text: `Nouvelle vente payée !\n\n👤 Nom: ${name}\n📧 Email: ${email}\n🎯 Rôle: ${role}\n💰 Montant: ${PRICE_DA} DA`,
  });
}

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`Mode: ${process.env.CHARGILY_LIVE_MODE === 'true' ? 'LIVE' : 'TEST'}`);
});

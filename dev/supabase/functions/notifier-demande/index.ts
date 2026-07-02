// supabase/functions/notifier-demande/index.ts
//
// Envoie un email de confirmation (acceptation ou refus) à un demandeur
// suite au traitement de sa demande d'attribution — Stock Métallerie LBF.
//
// Réutilise le même SMTP Gmail que celui configuré pour les emails
// d'authentification (invitation / réinitialisation de mot de passe),
// via les secrets GMAIL_USER et GMAIL_APP_PASSWORD.
//
// Réservé aux comptes administration (seuls habilités à valider/refuser
// une demande) : vérifie le JWT de l'appelant avant tout envoi.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GMAIL_USER         = Deno.env.get('GMAIL_USER') ?? '';
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function erreurLisible(e: unknown): string {
  let detail = '';
  try { detail = Deno.inspect(e, { depth: 4, colors: false }); } catch { detail = String(e); }
  if (!e) return 'Erreur inconnue.';
  if (typeof e === 'string') return e;
  try {
    const obj = e as Record<string, unknown>;
    const msg = obj.message || obj.msg || obj.error_description || obj.error;
    if (msg && typeof msg === 'string') return msg;
  } catch { /* ignore */ }
  return detail || 'Erreur inconnue.';
}

function gabaritEmail(statut: 'accepte' | 'refuse', nom: string, demandeId: string, chantier: string, motif: string) {
  const accepte = statut === 'accepte';
  const sujet = accepte
    ? `Votre demande d'attribution a été acceptée — ${demandeId}`
    : `Votre demande d'attribution a été refusée — ${demandeId}`;

  const corpsCentre = accepte
    ? `<p>Votre demande d'attribution <strong>${demandeId}</strong> a été <strong style="color:#198754">acceptée</strong>.</p>
       <p>Chantier de destination : <strong>${chantier}</strong></p>`
    : `<p>Votre demande d'attribution <strong>${demandeId}</strong> a été <strong style="color:#dc3545">refusée</strong>.</p>
       ${motif ? `<p>Motif : ${motif}</p>` : ''}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
      <h2 style="color: #b91c1c; margin-bottom: 8px; text-align: center;">Stock Métallerie LBF</h2>
      <p>Bonjour ${nom || ''},</p>
      ${corpsCentre}
      <p style="font-size: 13px; color: #666; margin-top: 24px;">Ceci est un message automatique, merci de ne pas y répondre.</p>
    </div>`;

  return { sujet, html };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Vérifier l'appelant : JWT valide + profil administration
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return reponse({ error: 'Non authentifié.' }, 401);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user: appelant }, error: errAuth } = await anonClient.auth.getUser(jwt);
    if (errAuth || !appelant) return reponse({ error: 'Session invalide.' }, 401);
    if (appelant.user_metadata?.profil !== 'administration') {
      return reponse({ error: 'Réservé aux administrateurs.' }, 403);
    }

    const { email, nom, statut, demandeId, chantier, motif } = await req.json();
    if (!email || !statut || !demandeId) {
      return reponse({ error: 'Paramètres manquants (email, statut, demandeId).' }, 400);
    }
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return reponse({ error: "SMTP non configuré (secrets GMAIL_USER / GMAIL_APP_PASSWORD manquants)." }, 500);
    }

    const { sujet, html } = gabaritEmail(statut, nom || '', demandeId, chantier || '', motif || '');

    const transporteur = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transporteur.sendMail({
      from: `"Stock Métallerie LBF" <${GMAIL_USER}>`,
      to: email,
      subject: sujet,
      html,
    });

    return reponse({ ok: true });
  } catch (err) {
    return reponse({ error: erreurLisible(err) }, 500);
  }
});

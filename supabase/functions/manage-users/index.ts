// supabase/functions/manage-users/index.ts
//
// Gestion des comptes utilisateurs — Stock Métallerie LBF
//
// Cette fonction détient la clé service_role (jamais exposée côté client).
// Elle vérifie que l'appelant est authentifié et a le profil "administration"
// avant d'exécuter la moindre action.
//
// Actions supportées :
//   - list    : liste tous les comptes (email, nom, profil, statut)
//   - create  : crée un compte et envoie une invitation par email
//               (l'utilisateur choisit son mot de passe via le lien reçu)
//   - update  : modifie le profil / statut / nom complet d'un compte
//   - delete  : supprime définitivement un compte
//
// Le déclenchement d'un email de réinitialisation de mot de passe ne nécessite
// pas cette fonction : il est géré côté client via supabase.auth.resetPasswordForEmail(),
// qui fonctionne avec la seule clé anon.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Vérifier l'appelant : JWT valide + profil administration ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return reponse({ error: 'Non authentifié.' }, 401);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user: appelant }, error: errAuth } = await anonClient.auth.getUser(jwt);
    if (errAuth || !appelant) return reponse({ error: 'Session invalide.' }, 401);

    if (appelant.user_metadata?.profil !== 'administration') {
      return reponse({ error: 'Réservé aux administrateurs.' }, 403);
    }

    // ── 2. Client avec privilèges élevés pour les opérations admin ──
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action, ...params } = await req.json();

    switch (action) {

      case 'list': {
        const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        if (error) return reponse({ error: error.message }, 400);
        const users = data.users.map(u => ({
          id:         u.id,
          email:      u.email,
          nomComplet: u.user_metadata?.nom_complet || u.email,
          profil:     u.user_metadata?.profil || 'consultation',
          actif:      u.user_metadata?.actif !== false,
          created_at: u.created_at,
        }));
        return reponse({ users });
      }

      case 'create': {
        const { email, nomComplet, profil } = params;
        if (!email || !nomComplet || !profil) {
          return reponse({ error: 'Email, nom complet et profil sont obligatoires.' }, 400);
        }
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { nom_complet: nomComplet, profil, actif: true },
        });
        if (error) return reponse({ error: error.message }, 400);
        return reponse({ id: data.user.id });
      }

      case 'update': {
        const { id, profil, actif, nomComplet } = params;
        if (!id) return reponse({ error: 'Identifiant du compte manquant.' }, 400);

        // On ne modifie que les métadonnées fournies, sans écraser le reste
        const { data: existant, error: errGet } = await adminClient.auth.admin.getUserById(id);
        if (errGet || !existant.user) return reponse({ error: 'Compte introuvable.' }, 404);

        const meta = { ...existant.user.user_metadata };
        if (profil !== undefined)     meta.profil = profil;
        if (actif !== undefined)      meta.actif = actif;
        if (nomComplet !== undefined) meta.nom_complet = nomComplet;

        const { error } = await adminClient.auth.admin.updateUserById(id, { user_metadata: meta });
        if (error) return reponse({ error: error.message }, 400);
        return reponse({ ok: true });
      }

      case 'delete': {
        const { id } = params;
        if (!id) return reponse({ error: 'Identifiant du compte manquant.' }, 400);
        if (id === appelant.id) return reponse({ error: 'Impossible de supprimer son propre compte.' }, 400);
        const { error } = await adminClient.auth.admin.deleteUser(id);
        if (error) return reponse({ error: error.message }, 400);
        return reponse({ ok: true });
      }

      default:
        return reponse({ error: `Action inconnue : ${action}` }, 400);
    }
  } catch (err) {
    return reponse({ error: err instanceof Error ? err.message : 'Erreur inattendue.' }, 500);
  }
});

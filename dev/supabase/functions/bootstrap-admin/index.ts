// supabase/functions/bootstrap-admin/index.ts
//
// Amorçage — Stock Métallerie LBF
//
// Crée le tout premier compte administrateur, sans authentification
// préalable (impossible autrement : personne ne peut encore se connecter
// pour utiliser l'écran Comptes classique). Se désactive automatiquement
// dès qu'un compte existe déjà — inoffensif à laisser déployé en
// permanence, il ne peut servir qu'une seule fois.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
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
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Refuse si un compte existe déjà (amorçage à usage unique)
    const { data: existants, error: errList } = await adminClient.auth.admin.listUsers({ perPage: 1 });
    if (errList) return reponse({ error: errList.message }, 500);
    if (existants.users.length > 0) {
      return reponse({ error: 'Un compte existe déjà — amorçage désactivé.' }, 403);
    }

    const { email, motDePasse, nomComplet } = await req.json();
    if (!email || !motDePasse || !nomComplet) {
      return reponse({ error: 'Email, mot de passe et nom complet sont obligatoires.' }, 400);
    }
    if (motDePasse.length < 8) {
      return reponse({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400);
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true,
      user_metadata: { nom_complet: nomComplet, profil: 'administration', actif: true },
    });
    if (error) return reponse({ error: error.message }, 400);

    return reponse({ id: data.user.id });
  } catch (err) {
    return reponse({ error: err instanceof Error ? err.message : 'Erreur inattendue.' }, 500);
  }
});

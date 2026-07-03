-- ════════════════════════════════════════════════════════════════
--  LBF Stock — Row Level Security (RLS) — v3, Supabase Auth réel
--  À exécuter dans l'éditeur SQL Supabase (une seule fois)
--
--  PRINCIPE : l'authentification passe désormais par Supabase Auth.
--  Le rôle applicatif ("profil") est stocké dans le user_metadata du
--  compte et exposé dans le JWT sous auth.jwt() -> 'user_metadata' ->> 'profil'.
--  Ces politiques vérifient ce rôle directement en base — plus question
--  de faire confiance au JavaScript côté client.
--
--  Le lien « Consulter sans connexion » reste possible : la clé anon
--  garde un accès en LECTURE SEULE sur les tables nécessaires.
-- ════════════════════════════════════════════════════════════════

-- Fonction utilitaire : lit le profil de l'utilisateur connecté depuis le JWT
CREATE OR REPLACE FUNCTION public.jwt_profil()
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT auth.jwt() -> 'user_metadata' ->> 'profil';
$$;


-- ═══════════════════════════════════════════════════════════════
--  TABLE : users  (ANCIENNE table — plus utilisée par l'application)
--  Les comptes réels vivent désormais dans auth.users (Supabase Auth).
--  On retire tout accès anon : plus aucune raison d'exposer ces
--  anciens hashs de mots de passe via l'API publique.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_anon"  ON users;
DROP POLICY IF EXISTS "users_insert_anon"  ON users;
DROP POLICY IF EXISTS "users_update_anon"  ON users;
DROP POLICY IF EXISTS "users_delete_anon"  ON users;
DROP POLICY IF EXISTS "anon_all_users"     ON users;
-- Aucune policy recréée : table verrouillée (accessible seulement via service_role / dashboard).


-- ═══════════════════════════════════════════════════════════════
--  TABLE : stock
--  Lecture pour tous (y compris visiteur anonyme).
--  Écriture réservée aux comptes gestion/administration.
--  Suppression réservée à l'administration.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_select_anon" ON stock;
DROP POLICY IF EXISTS "stock_insert_anon" ON stock;
DROP POLICY IF EXISTS "stock_update_anon" ON stock;
DROP POLICY IF EXISTS "stock_delete_anon" ON stock;
DROP POLICY IF EXISTS "stock_select" ON stock;
DROP POLICY IF EXISTS "stock_insert" ON stock;
DROP POLICY IF EXISTS "stock_update" ON stock;
DROP POLICY IF EXISTS "stock_delete" ON stock;

CREATE POLICY "stock_select" ON stock
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "stock_insert" ON stock
  FOR INSERT TO authenticated
  WITH CHECK (jwt_profil() IN ('gestion','administration'));

CREATE POLICY "stock_update" ON stock
  FOR UPDATE TO authenticated
  USING (jwt_profil() IN ('gestion','administration'));

CREATE POLICY "stock_delete" ON stock
  FOR DELETE TO authenticated
  USING (jwt_profil() = 'administration');


-- ═══════════════════════════════════════════════════════════════
--  TABLE : demandes
--  Création : comptes authentifiés uniquement — le visiteur anonyme
--  n'a plus accès à la demande d'attribution (identité toujours liée
--  au compte connecté, plus de référentiel "demandeurs" libre).
--  Validation/refus (UPDATE) : administration uniquement (seul profil
--  avec can_validate=true côté application).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE demandes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demandes_select_anon" ON demandes;
DROP POLICY IF EXISTS "demandes_insert_anon" ON demandes;
DROP POLICY IF EXISTS "demandes_update_anon" ON demandes;
DROP POLICY IF EXISTS "demandes_select" ON demandes;
DROP POLICY IF EXISTS "demandes_insert" ON demandes;
DROP POLICY IF EXISTS "demandes_update" ON demandes;

CREATE POLICY "demandes_select" ON demandes
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "demandes_insert" ON demandes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "demandes_update" ON demandes
  FOR UPDATE TO authenticated
  USING (jwt_profil() = 'administration');

-- Pas de DELETE : les demandes refusées/acceptées sont conservées
-- avec leur statut (pas supprimées physiquement)


-- ═══════════════════════════════════════════════════════════════
--  TABLE : sections
--  LECTURE SEULE — catalogue de référence, jamais modifiable via l'API
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sections_select_anon" ON sections;
DROP POLICY IF EXISTS "anon_read_sections" ON sections;
DROP POLICY IF EXISTS "sections_select" ON sections;

CREATE POLICY "sections_select" ON sections
  FOR SELECT TO anon, authenticated USING (true);


-- ═══════════════════════════════════════════════════════════════
--  TABLE : sections_custom  (catalogue proposé par les utilisateurs)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sections_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sections_custom_select" ON sections_custom;
DROP POLICY IF EXISTS "sections_custom_insert" ON sections_custom;

CREATE POLICY "sections_custom_select" ON sections_custom
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "sections_custom_insert" ON sections_custom
  FOR INSERT TO authenticated
  WITH CHECK (jwt_profil() IN ('gestion','administration'));


-- ═══════════════════════════════════════════════════════════════
--  TABLE : lbf_barres_historique
--  Journal d'audit IMMUABLE : lecture pour tous, ajout pour
--  gestion/administration uniquement. Jamais de UPDATE ni DELETE.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE lbf_barres_historique ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historique_select_anon" ON lbf_barres_historique;
DROP POLICY IF EXISTS "historique_insert_anon" ON lbf_barres_historique;
DROP POLICY IF EXISTS "historique_select" ON lbf_barres_historique;
DROP POLICY IF EXISTS "historique_insert" ON lbf_barres_historique;

CREATE POLICY "historique_select" ON lbf_barres_historique
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "historique_insert" ON lbf_barres_historique
  FOR INSERT TO authenticated
  WITH CHECK (jwt_profil() IN ('gestion','administration'));


-- ═══════════════════════════════════════════════════════════════
--  RÉFÉRENTIELS ADMINISTRABLES
--  fournisseurs, racks, config
--  Lecture pour tous (pickers accessibles au visiteur), écriture
--  réservée à l'administration (seul profil accédant à l'onglet
--  Administration où ces référentiels sont gérés).
--
--  chantiers est un cas à part : sa création est aussi accessible
--  depuis le modal « Demande d'attribution » (bouton « + Nouveau »
--  du sélecteur de chantier), désormais réservé aux comptes
--  authentifiés (le visiteur n'a plus accès aux demandes). Seules
--  UPDATE/DELETE restent réservées à l'administration.
--
--  demandeurs : table conservée pour l'historique mais verrouillée
--  (RLS activée, aucune policy) — le référentiel libre de demandeurs
--  a été supprimé, l'identité du demandeur vient toujours du compte.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "chantiers_select_anon" ON chantiers;
DROP POLICY IF EXISTS "chantiers_insert_anon" ON chantiers;
DROP POLICY IF EXISTS "chantiers_update_anon" ON chantiers;
DROP POLICY IF EXISTS "chantiers_delete_anon" ON chantiers;
DROP POLICY IF EXISTS "acces_anon_chantiers" ON chantiers;
DROP POLICY IF EXISTS "chantiers_select" ON chantiers;
DROP POLICY IF EXISTS "chantiers_insert" ON chantiers;
DROP POLICY IF EXISTS "chantiers_update" ON chantiers;
DROP POLICY IF EXISTS "chantiers_delete" ON chantiers;
ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chantiers_select" ON chantiers
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "chantiers_insert" ON chantiers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "chantiers_update" ON chantiers
  FOR UPDATE TO authenticated USING (jwt_profil() = 'administration');
CREATE POLICY "chantiers_delete" ON chantiers
  FOR DELETE TO authenticated USING (jwt_profil() = 'administration');

DROP POLICY IF EXISTS "demandeurs_select_anon" ON demandeurs;
DROP POLICY IF EXISTS "demandeurs_insert_anon" ON demandeurs;
DROP POLICY IF EXISTS "demandeurs_update_anon" ON demandeurs;
DROP POLICY IF EXISTS "demandeurs_delete_anon" ON demandeurs;
DROP POLICY IF EXISTS "demandeurs_select" ON demandeurs;
DROP POLICY IF EXISTS "demandeurs_insert" ON demandeurs;
DROP POLICY IF EXISTS "demandeurs_update" ON demandeurs;
DROP POLICY IF EXISTS "demandeurs_delete" ON demandeurs;
ALTER TABLE demandeurs ENABLE ROW LEVEL SECURITY;
-- Aucune policy créée : table verrouillée, accès refusé à tous
-- hormis service_role (utilisé uniquement pour la sauvegarde/export).


DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fournisseurs','racks','config']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_select_anon" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert_anon" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update_anon" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete_anon" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "acces_anon_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', t, t);

    EXECUTE format(
      'CREATE POLICY "%s_select" ON %I FOR SELECT TO anon, authenticated USING (true)', t, t
    );
    EXECUTE format(
      'CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated WITH CHECK (jwt_profil() = ''administration'')', t, t
    );
    EXECUTE format(
      'CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated USING (jwt_profil() = ''administration'')', t, t
    );
    EXECUTE format(
      'CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated USING (jwt_profil() = ''administration'')', t, t
    );
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════
--  VÉRIFICATION — lancer après exécution
-- ════════════════════════════════════════════════════════════════

SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS operation,
  roles
FROM pg_policies
WHERE tablename IN ('users','stock','demandes','sections','sections_custom',
                    'lbf_barres_historique','racks','chantiers',
                    'fournisseurs','demandeurs','config')
ORDER BY tablename, cmd;

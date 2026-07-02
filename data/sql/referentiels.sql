-- ════════════════════════════════════════════════════════════════
--  LBF Stock — Référentiels administrables
--  À exécuter dans l'éditeur SQL Supabase
-- ════════════════════════════════════════════════════════════════

-- ── Racks (remplace lieux_stockage) ─────────────────────────────
-- Chaque rack génère des emplacements : Rack 1 - A1, Rack 1 - B4, etc.
CREATE TABLE IF NOT EXISTS racks (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nom        text        NOT NULL,
  nb_allees  integer     NOT NULL DEFAULT 1,   -- nombre de colonnes (A, B, C…)
  nb_etages  integer     NOT NULL DEFAULT 1,   -- nombre de niveaux  (1, 2, 3…)
  actif      boolean     NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acces_anon_racks" ON racks;
CREATE POLICY "acces_anon_racks" ON racks
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Supprimer l'ancienne table si elle existe
DROP TABLE IF EXISTS lieux_stockage;

-- ── Chantiers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chantiers (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nom            text        NOT NULL,
  numero_affaire text,
  ville          text,
  actif          boolean     NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

-- Si la table existe déjà, ajouter les nouvelles colonnes :
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS numero_affaire text;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS ville text;

ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acces_anon_chantiers" ON chantiers;
CREATE POLICY "acces_anon_chantiers" ON chantiers
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Fournisseurs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fournisseurs (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nom        text        NOT NULL,
  actif      boolean     NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fournisseurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acces_anon_fournisseurs" ON fournisseurs;
CREATE POLICY "acces_anon_fournisseurs" ON fournisseurs
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Demandeurs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demandeurs (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nom        text        NOT NULL,
  prenom     text,
  email      text,
  actif      boolean     NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE demandeurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acces_anon_demandeurs" ON demandeurs;
CREATE POLICY "acces_anon_demandeurs" ON demandeurs
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Nouvelles colonnes sur la table demandes :
ALTER TABLE demandes ADD COLUMN IF NOT EXISTS demandeur_email  text;
ALTER TABLE demandes ADD COLUMN IF NOT EXISTS demandeur_id     uuid;
ALTER TABLE demandes ADD COLUMN IF NOT EXISTS demandeur_nom    text;
ALTER TABLE demandes ADD COLUMN IF NOT EXISTS demandeur_prenom text;

-- ── Historique barres — colonne lieu ─────────────────────────────
-- Ajouter la colonne lieu à la table d'historique existante :
ALTER TABLE lbf_barres_historique ADD COLUMN IF NOT EXISTS lieu text;

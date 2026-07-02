-- ════════════════════════════════════════════════════════════════
--  LBF Stock — Persistance Supabase du plan de stockage
--  À exécuter dans l'éditeur SQL Supabase
--
--  Avant ce script, les positions et l'image du plan étaient
--  stockées dans le localStorage du navigateur (par appareil).
--  Ces modifications les déplacent dans Supabase pour que
--  tous les utilisateurs voient le même plan.
-- ════════════════════════════════════════════════════════════════

-- ── Positions des racks sur le plan (colonnes sur la table existante)
ALTER TABLE racks ADD COLUMN IF NOT EXISTS pos_x NUMERIC;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS pos_y NUMERIC;

-- ── Table de configuration de l'application (image du plan + futurs réglages)
CREATE TABLE IF NOT EXISTS config (
  key        TEXT        PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_select_anon" ON config;
DROP POLICY IF EXISTS "config_insert_anon" ON config;
DROP POLICY IF EXISTS "config_update_anon" ON config;

CREATE POLICY "config_select_anon" ON config
  FOR SELECT TO anon USING (true);

CREATE POLICY "config_insert_anon" ON config
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "config_update_anon" ON config
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

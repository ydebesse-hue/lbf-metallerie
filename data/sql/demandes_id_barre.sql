-- ════════════════════════════════════════════════════════════════
--  LBF Stock — Vérification colonne id_barre dans demandes
--  À exécuter dans l'éditeur SQL Supabase
--
--  La table demandes possède déjà id_barre.
--  Ce script vérifie l'état actuel et ajoute la colonne si absente.
-- ════════════════════════════════════════════════════════════════

-- Ajouter la colonne si elle n'existe pas encore (idempotent)
ALTER TABLE demandes ADD COLUMN IF NOT EXISTS id_barre TEXT;

-- Vérification — liste les demandes existantes
SELECT id, id_barre, statut, date_demande
FROM demandes
ORDER BY id;

-- ════════════════════════════════════════════════════════════════
--  LBF Stock — Seuil d'alerte minimum pour les tôles
--  À exécuter dans l'éditeur SQL Supabase
-- ════════════════════════════════════════════════════════════════

-- Ajouter la colonne seuil_min sur la table stock (tôles)
ALTER TABLE stock ADD COLUMN IF NOT EXISTS seuil_min INTEGER DEFAULT NULL;

-- Vérification
SELECT id, categorie, epaisseur_mm, quantite, seuil_min
FROM stock
WHERE categorie = 'tole'
ORDER BY epaisseur_mm;

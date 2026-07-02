-- ════════════════════════════════════════════════════════════════
--  LBF Stock — Migration tôles v2
--  Nouvelles colonnes pour le workflow sortie/chute
--  À exécuter dans l'éditeur SQL Supabase
-- ════════════════════════════════════════════════════════════════

-- Type de tôle : 'noir' | 'inox' | 'larmee'
ALTER TABLE stock ADD COLUMN IF NOT EXISTS type_tole TEXT;

-- Indique si cette entrée est une chute (reste de découpe)
ALTER TABLE stock ADD COLUMN IF NOT EXISTS is_chute BOOLEAN DEFAULT FALSE;

-- Référence de commande fournisseur (traçabilité)
ALTER TABLE stock ADD COLUMN IF NOT EXISTS ref_commande TEXT;

-- Seuil d'alerte surface restante (m²) par épaisseur
-- L'alerte se déclenche quand la surface totale de toutes les tôles
-- de même épaisseur passe en dessous de ce seuil.
ALTER TABLE stock ADD COLUMN IF NOT EXISTS seuil_surface_m2 NUMERIC DEFAULT NULL;

-- Nettoyage : colonne seuil_min remplacée par seuil_surface_m2
-- (conserver la colonne pour l'instant, la mettre à NULL)
UPDATE stock SET seuil_min = NULL WHERE categorie = 'tole';

-- Vérification
SELECT id, categorie, type_tole, epaisseur_mm,
       largeur_mm, longueur_mm, quantite,
       is_chute, ref_commande, seuil_surface_m2, statut
FROM stock
WHERE categorie = 'tole'
ORDER BY epaisseur_mm, type_tole;

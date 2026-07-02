-- ════════════════════════════════════════════════════════════════
--  LBF Stock — Autoriser le format BAR-XXXX-N pour les portions
--  À exécuter dans Supabase > SQL Editor
--
--  Lors d'une utilisation partielle d'une barre, la portion
--  consommée reçoit désormais un ID suffixé (ex: BAR-0042-1,
--  BAR-0042-2, ...) pour conserver la traçabilité avec la barre
--  d'origine. Ce script supprime toute contrainte CHECK qui
--  bloquerait ce format.
-- ════════════════════════════════════════════════════════════════

-- 1. Supprimer tout CHECK CONSTRAINT portant sur la colonne id de stock
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    INNER JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'stock'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND att.attname = 'id'
  LOOP
    RAISE NOTICE 'Suppression contrainte : %', r.conname;
    EXECUTE format('ALTER TABLE public.stock DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 2. Supprimer tout FOREIGN KEY de lbf_barres_historique.barre_id → stock.id
--    (empêcherait l'insertion d'historique pour BAR-XXXX-N non encore en base)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'lbf_barres_historique'
      AND nsp.nspname = 'public'
      AND con.contype = 'f'
  LOOP
    RAISE NOTICE 'Suppression FK historique : %', r.conname;
    EXECUTE format('ALTER TABLE public.lbf_barres_historique DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Vérification : lister les contraintes restantes sur ces deux tables
SELECT con.conname, con.contype, rel.relname
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE rel.relname IN ('stock', 'lbf_barres_historique')
  AND nsp.nspname = 'public'
ORDER BY rel.relname, con.contype;

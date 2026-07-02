/**
 * supabase.js — Client Supabase centralisé (SDK officiel)
 * Stock Métallerie — Le Bras Frères
 *
 * Toutes les fonctions d'accès à la base de données passent par ce fichier.
 * Le SDK gère automatiquement l'ajout du token de l'utilisateur connecté
 * (Supabase Auth) sur chaque requête — plus de gestion manuelle des headers.
 */

// ═══════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://znewlnioznrwqhigfcla.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZXdsbmlvem5yd3FoaWdmY2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5Nzc3MjcsImV4cCI6MjA5ODU1MzcyN30.vrRDJG3BqSNp0i7nxbdUqHl0WHfQeaz4vv-15MM2MFQ';

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ═══════════════════════════════════════════════════════
//  FONCTIONS GÉNÉRIQUES
// ═══════════════════════════════════════════════════════

/**
 * Lit tous les enregistrements d'une table.
 * @param {string} table
 * @param {{order?: string, limit?: number}} opts — order au format "colonne.asc"|"colonne.desc"
 * @returns {Promise<Array>}
 */
async function sbLire(table, opts = {}) {
  let q = _sb.from(table).select('*');
  if (opts.order) {
    const [col, dir] = opts.order.split('.');
    q = q.order(col, { ascending: dir !== 'desc' });
  }
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(`Erreur lecture ${table} : ${error.message}`);
  return data;
}

/**
 * Insère un enregistrement dans une table.
 * @param {string} table
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function sbInserer(table, data) {
  const { data: result, error } = await _sb.from(table).insert(data).select();
  if (error) throw new Error(`Erreur insertion ${table} : ${error.message}`);
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Met à jour un enregistrement identifié par son id.
 * @param {string} table
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function sbMettreAJour(table, id, data) {
  const { data: result, error } = await _sb.from(table).update(data).eq('id', id).select();
  if (error) throw new Error(`Erreur mise à jour ${table} : ${error.message}`);
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Met à jour toutes les lignes où colonne = valeur.
 * Utile pour propager un renommage (chantier, fournisseur, lieu).
 * @param {string} table
 * @param {string} colonne
 * @param {string} valeur   — valeur actuelle à cibler
 * @param {Object} data     — champs à écraser
 * @returns {Promise<void>}
 */
async function sbMettreAJourFiltre(table, colonne, valeur, data) {
  const { error } = await _sb.from(table).update(data).eq(colonne, valeur);
  if (error) throw new Error(`Erreur mise à jour filtrée ${table}.${colonne} : ${error.message}`);
}

/**
 * Supprime un enregistrement identifié par son id.
 * @param {string} table
 * @param {string} id
 * @returns {Promise<void>}
 */
async function sbSupprimer(table, id) {
  const { error } = await _sb.from(table).delete().eq('id', id);
  if (error) throw new Error(`Erreur suppression ${table} : ${error.message}`);
}

/**
 * Supprime toutes les lignes d'une table.
 * @param {string} table
 * @param {string} [pkColonne='id']
 * @returns {Promise<void>}
 */
async function sbViderTable(table, pkColonne = 'id') {
  const { error } = await _sb.from(table).delete().not(pkColonne, 'is', null);
  if (error) throw new Error(`Erreur vidage ${table} : ${error.message}`);
}

/**
 * Upsert — insère ou met à jour selon l'id.
 * @param {string} table
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function sbUpsert(table, data) {
  const { data: result, error } = await _sb.from(table).upsert(data).select();
  if (error) throw new Error(`Erreur upsert ${table} : ${error.message}`);
  return Array.isArray(result) ? result[0] : result;
}

// ═══════════════════════════════════════════════════════
//  HISTORIQUE DES BARRES
// ═══════════════════════════════════════════════════════

/**
 * Lit l'historique d'une barre identifiée par son id (ex. "BAR-0001"),
 * trié par date d'opération croissante.
 * @param {string} barreId
 * @returns {Promise<Array>}
 */
async function sbLireHistoriqueParBarre(barreId) {
  const { data, error } = await _sb
    .from('lbf_barres_historique')
    .select('*')
    .eq('barre_id', barreId)
    .order('date_operation', { ascending: true });
  if (error) throw new Error(`Erreur lecture historique ${barreId} : ${error.message}`);
  return data;
}

/**
 * Insère une entrée dans la table lbf_barres_historique.
 * @param {Object} data — { barre_id, type_operation, longueur_avant_m, longueur_apres_m,
 *                          chantier, operateur, valide_par, commentaire }
 * @returns {Promise<Object>}
 */
async function sbInsererHistorique(data) {
  const { data: result, error } = await _sb.from('lbf_barres_historique').insert(data).select();
  if (error) throw new Error(`Erreur insertion historique : ${error.message}`);
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Retourne la dernière entrée d'historique pour chaque ID fourni.
 * @param {string[]} ids
 * @returns {Promise<Object>} map barre_id → dernière ligne historique
 */
async function sbDerniereOpParBarres(ids) {
  if (!ids.length) return {};
  const { data, error } = await _sb
    .from('lbf_barres_historique')
    .select('*')
    .in('barre_id', ids)
    .order('date_operation', { ascending: false });
  if (error) throw new Error(`Erreur historique multiple : ${error.message}`);
  const map = {};
  data.forEach(l => { if (!map[l.barre_id]) map[l.barre_id] = l; });
  return map;
}

// ═══════════════════════════════════════════════════════
//  CONFIGURATION APPLICATIVE
// ═══════════════════════════════════════════════════════

/**
 * Lit une valeur dans la table config.
 * @param {string} cle
 * @returns {Promise<string|null>}
 */
async function sbLireConfig(cle) {
  const { data, error } = await _sb.from('config').select('value').eq('key', cle);
  if (error) throw new Error(`Erreur lecture config "${cle}" : ${error.message}`);
  return data.length ? data[0].value : null;
}

/**
 * Insère ou met à jour une valeur dans la table config.
 * @param {string} cle
 * @param {string|null} valeur
 * @returns {Promise<void>}
 */
async function sbSauvegarderConfig(cle, valeur) {
  const { error } = await _sb
    .from('config')
    .upsert({ key: cle, value: valeur, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Erreur sauvegarde config "${cle}" : ${error.message}`);
}

// ═══════════════════════════════════════════════════════
//  APPEL D'UNE EDGE FUNCTION (gestion des comptes)
// ═══════════════════════════════════════════════════════

/**
 * Appelle une Edge Function Supabase avec le jeton de l'utilisateur connecté.
 * @param {string} nom — nom de la fonction (ex. "manage-users")
 * @param {Object} body
 * @returns {Promise<Object>}
 */
async function sbAppelerFonction(nom, body) {
  const { data, error } = await _sb.functions.invoke(nom, { body });
  if (error) {
    const detail = error.context?.body ? await error.context.text?.().catch(() => '') : '';
    throw new Error(`Erreur fonction ${nom} : ${error.message}${detail ? ' — ' + detail : ''}`);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ═══════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════

window.SB = {
  client:                 _sb,
  lire:                   sbLire,
  inserer:                sbInserer,
  mettreAJour:            sbMettreAJour,
  mettreAJourFiltre:      sbMettreAJourFiltre,
  supprimer:              sbSupprimer,
  upsert:                 sbUpsert,
  viderTable:             sbViderTable,
  lireHistoriqueParBarre: sbLireHistoriqueParBarre,
  insererHistorique:      sbInsererHistorique,
  lireConfig:             sbLireConfig,
  sauvegarderConfig:      sbSauvegarderConfig,
  derniereOpParBarres:    sbDerniereOpParBarres,
  appelerFonction:        sbAppelerFonction,
};

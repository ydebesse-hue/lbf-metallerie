/**
 * supabase.js — Client Supabase centralisé
 * Stock Métallerie — Le Bras Frères
 *
 * Toutes les fonctions d'accès à la base de données passent par ce fichier.
 * Pour migrer vers SharePoint, remplacer uniquement ce fichier.
 */

// ═══════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════

const SUPABASE_URL    = 'https://guhktnlmilhcmgeecdxn.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1aGt0bmxtaWxoY21nZWVjZHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDc0MTIsImV4cCI6MjA5ODQyMzQxMn0.Gvu5Hv4BlvddYbvlSHEmP8Z5dxQmoSQ9GxvsitrQUdc';

// En-têtes communs à toutes les requêtes
const _headers = {
  'apikey':        SUPABASE_ANON,
  'Authorization': 'Bearer ' + SUPABASE_ANON,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

// ═══════════════════════════════════════════════════════
//  FONCTIONS GÉNÉRIQUES
// ═══════════════════════════════════════════════════════

/**
 * Lit tous les enregistrements d'une table.
 * @param {string} table
 * @returns {Promise<Array>}
 */
async function sbLire(table, opts = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  if (opts.order) url += `&order=${encodeURIComponent(opts.order)}`;
  if (opts.limit) url += `&limit=${opts.limit}`;
  const rep = await fetch(url, { headers: _headers });
  if (!rep.ok) throw new Error(`Erreur lecture ${table} : ${rep.status}`);
  return rep.json();
}

/**
 * Insère un enregistrement dans une table.
 * @param {string} table
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function sbInserer(table, data) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: _headers,
    body:    JSON.stringify(data),
  });
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur insertion ${table} : ${err}`);
  }
  const result = await rep.json();
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
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: _headers,
    body:    JSON.stringify(data),
  });
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur mise à jour ${table} : ${err}`);
  }
  const result = await rep.json();
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
  const rep = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${encodeURIComponent(colonne)}=eq.${encodeURIComponent(valeur)}`,
    { method: 'PATCH', headers: { ..._headers, Prefer: 'return=minimal' }, body: JSON.stringify(data) }
  );
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur mise à jour filtrée ${table}.${colonne} : ${err}`);
  }
}

/**
 * Supprime un enregistrement identifié par son id.
 * @param {string} table
 * @param {string} id
 * @returns {Promise<void>}
 */
async function sbSupprimer(table, id) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method:  'DELETE',
    headers: { ...(_headers), Prefer: 'return=minimal' },
  });
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur suppression ${table} : ${err}`);
  }
}

/**
 * Supprime toutes les lignes d'une table.
 * Utilise le filtre PostgREST "id=not.is.null" (PK texte ou uuid).
 * Pour lbf_barres_historique qui peut avoir une PK différente, passer pkColonne.
 * @param {string} table
 * @param {string} [pkColonne='id']
 * @returns {Promise<void>}
 */
async function sbViderTable(table, pkColonne = 'id') {
  const rep = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${encodeURIComponent(pkColonne)}=not.is.null`,
    { method: 'DELETE', headers: { ..._headers, Prefer: 'return=minimal' } }
  );
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur vidage ${table} : ${err}`);
  }
}

/**
 * Upsert — insère ou met à jour selon l'id.
 * @param {string} table
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function sbUpsert(table, data) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: { ..._headers, Prefer: 'resolution=merge-duplicates,return=representation' },
    body:    JSON.stringify(data),
  });
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur upsert ${table} : ${err}`);
  }
  const result = await rep.json();
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
  const rep = await fetch(
    `${SUPABASE_URL}/rest/v1/lbf_barres_historique?barre_id=eq.${encodeURIComponent(barreId)}&order=date_operation.asc`,
    { headers: _headers }
  );
  if (!rep.ok) throw new Error(`Erreur lecture historique ${barreId} : ${rep.status}`);
  return rep.json();
}

/**
 * Insère une entrée dans la table lbf_barres_historique.
 * @param {Object} data — { barre_id, type_operation, longueur_avant_m, longueur_apres_m,
 *                          chantier, operateur, valide_par, commentaire }
 * @returns {Promise<Object>}
 */
async function sbInsererHistorique(data) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/lbf_barres_historique`, {
    method:  'POST',
    headers: _headers,
    body:    JSON.stringify(data),
  });
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur insertion historique : ${err}`);
  }
  const result = await rep.json();
  return Array.isArray(result) ? result[0] : result;
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
  const rep = await fetch(
    `${SUPABASE_URL}/rest/v1/config?key=eq.${encodeURIComponent(cle)}&select=value`,
    { headers: _headers }
  );
  if (!rep.ok) throw new Error(`Erreur lecture config "${cle}" : ${rep.status}`);
  const rows = await rep.json();
  return rows.length ? rows[0].value : null;
}

/**
 * Insère ou met à jour une valeur dans la table config.
 * @param {string} cle
 * @param {string|null} valeur
 * @returns {Promise<void>}
 */
async function sbSauvegarderConfig(cle, valeur) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/config`, {
    method:  'POST',
    headers: { ..._headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body:    JSON.stringify({ key: cle, value: valeur, updated_at: new Date().toISOString() }),
  });
  if (!rep.ok) {
    const err = await rep.text();
    throw new Error(`Erreur sauvegarde config "${cle}" : ${err}`);
  }
}

// ═══════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════

/**
 * Retourne la dernière entrée d'historique pour chaque ID fourni.
 * @param {string[]} ids
 * @returns {Promise<Object>} map barre_id → dernière ligne historique
 */
async function sbDerniereOpParBarres(ids) {
  if (!ids.length) return {};
  const param = ids.map(id => encodeURIComponent(id)).join(',');
  const rep = await fetch(
    `${SUPABASE_URL}/rest/v1/lbf_barres_historique?barre_id=in.(${param})&order=date_operation.desc`,
    { headers: _headers }
  );
  if (!rep.ok) throw new Error(`Erreur historique multiple : ${rep.status}`);
  const lignes = await rep.json();
  const map = {};
  lignes.forEach(l => { if (!map[l.barre_id]) map[l.barre_id] = l; });
  return map;
}

window.SB = {
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
};

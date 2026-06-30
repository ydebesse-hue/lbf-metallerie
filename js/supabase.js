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

const SUPABASE_URL    = 'https://ihpwdcndytxdnqjdcrsn.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocHdkY25keXR4ZG5xamRjcnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjExMDksImV4cCI6MjA5MDEzNzEwOX0.19WoAzpF59KeKfEXD8kYrzQtVOET594ajSTD9NwtEcs';

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
async function sbLire(table) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: _headers,
  });
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
//  EXPORT
// ═══════════════════════════════════════════════════════

window.SB = {
  lire:        sbLire,
  inserer:     sbInserer,
  mettreAJour: sbMettreAJour,
  supprimer:   sbSupprimer,
  upsert:      sbUpsert,
};

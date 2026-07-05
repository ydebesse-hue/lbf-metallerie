/**
 * calcul-toles.js
 * Sous-onglet "Calcul tôles" — Outils / Stock Métallerie LBF
 *
 * Outil de calcul à la volée (aucune sauvegarde en base) :
 *   1. Convertisseur rapide (dimensions ↔ poids ↔ prix)
 *   2. Répartition des besoins par chantier
 *   3. Commande multi-lignes
 *
 * Densité acier : 7.85 kg par m² et par mm d'épaisseur (7850 kg/m³).
 */

'use strict';

const DENSITE_ACIER = 7.85;

const CalcToles = {
  initialized: false,
  chantiers: [],              // chantiers actifs chargés depuis Supabase
  chantiersRepartition: [],   // chantiers ajoutés au tableau de répartition
  epaisseurs: [2, 4, 6, 8, 10, 12, 15, 20, 25, 30],
  dimsParEpaisseur: {},       // { [epaisseur]: { largeur, longueur } }
  lignesCommande: [],         // { id, epaisseur, largeur, longueur, nombre, prixKg }
};

let _cmdSeq = 0;

function _calcEsc(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function calcSurface(largeur_mm, longueur_mm, nombre) {
  return ((largeur_mm || 0) * (longueur_mm || 0) / 1e6) * (nombre || 0);
}

function calcPoids(surface_m2, epaisseur_mm) {
  return surface_m2 * (epaisseur_mm || 0) * DENSITE_ACIER;
}

/* ══════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════ */

async function calcInit() {
  if (CalcToles.initialized) return;
  CalcToles.initialized = true;

  try {
    const rows = await window.SB.lire('chantiers', { order: 'nom' });
    CalcToles.chantiers = rows.filter(c => c.actif);
  } catch (e) {
    console.warn('[CalcToles] Impossible de charger les chantiers :', e);
    CalcToles.chantiers = [];
  }

  calcRendreSelectChantier();
  calcRendreTableRepartition();
  calcAjouterLigneCommande();
}

/* ══════════════════════════════════════════════
   BLOC 1 — CONVERTISSEUR RAPIDE
══════════════════════════════════════════════ */

function calcConvertisseur(mode) {
  const epEl      = document.getElementById('cv-epaisseur');
  const largeurEl = document.getElementById('cv-largeur');
  const longueurEl = document.getElementById('cv-longueur');
  const nombreEl  = document.getElementById('cv-nombre');
  const poidsEl   = document.getElementById('cv-poids');
  const surfaceEl = document.getElementById('cv-surface');
  const prixKgEl  = document.getElementById('cv-prix-kg');
  const prixEl    = document.getElementById('cv-prix');

  const ep     = parseFloat(epEl.value) || 0;
  const prixKg = parseFloat(prixKgEl.value) || 0;

  let surface = 0, poids = 0;

  if (mode === 'poids') {
    // Saisie du poids : on en déduit la surface équivalente
    poids   = parseFloat(poidsEl.value) || 0;
    surface = ep > 0 ? poids / (ep * DENSITE_ACIER) : 0;
    largeurEl.value = '';
    longueurEl.value = '';
  } else {
    const largeur  = parseFloat(largeurEl.value) || 0;
    const longueur = parseFloat(longueurEl.value) || 0;
    const nombre   = parseFloat(nombreEl.value) || 0;
    surface = calcSurface(largeur, longueur, nombre);
    poids   = calcPoids(surface, ep);
    poidsEl.value = poids ? poids.toFixed(1) : '';
  }

  surfaceEl.value = surface ? surface.toFixed(2) : '';
  const prix = poids * prixKg;
  prixEl.value = prix ? prix.toFixed(2) + ' €' : '';
}

function calcReinitialiserConvertisseur() {
  ['cv-epaisseur', 'cv-largeur', 'cv-longueur', 'cv-poids', 'cv-surface', 'cv-prix-kg', 'cv-prix']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('cv-nombre').value = 1;
}

/* ══════════════════════════════════════════════
   BLOC 2 — RÉPARTITION DES BESOINS PAR CHANTIER
══════════════════════════════════════════════ */

function calcRendreSelectChantier() {
  const sel = document.getElementById('rep-sel-chantier');
  if (!sel) return;
  const dejaAjoutes = new Set(CalcToles.chantiersRepartition.map(c => c.id));
  const dispo = CalcToles.chantiers.filter(c => !dejaAjoutes.has(c.id));
  sel.innerHTML = dispo.length
    ? dispo.map(c => `<option value="${_calcEsc(c.id)}">${_calcEsc(c.nom)}</option>`).join('')
    : '<option value="">— Aucun chantier disponible —</option>';
}

function calcAjouterChantierRepartition() {
  const sel = document.getElementById('rep-sel-chantier');
  const id = sel.value;
  if (!id) return;
  if (CalcToles.chantiersRepartition.some(c => c.id === id)) return;
  const chantier = CalcToles.chantiers.find(c => c.id === id);
  if (!chantier) return;
  CalcToles.chantiersRepartition.push(chantier);
  calcRendreSelectChantier();
  calcRendreTableRepartition();
}

function calcRetirerChantierRepartition(id) {
  CalcToles.chantiersRepartition = CalcToles.chantiersRepartition.filter(c => c.id !== id);
  calcRendreSelectChantier();
  calcRendreTableRepartition();
}

function calcRendreTableRepartition() {
  const table = document.getElementById('rep-table');
  if (!table) return;
  const chantiers = CalcToles.chantiersRepartition;

  let thead = `<thead><tr>
    <th rowspan="2" style="text-align:left">Épaisseur</th>
    <th rowspan="2">Largeur (mm)</th>
    <th rowspan="2">Longueur (mm)</th>`;
  chantiers.forEach(c => {
    thead += `<th colspan="2">${_calcEsc(c.nom)}
      <button type="button" class="calc-btn-suppr" onclick="calcRetirerChantierRepartition('${_calcEsc(c.id)}')" title="Retirer">✕</button>
    </th>`;
  });
  thead += `<th colspan="2">Total</th></tr><tr>`;
  chantiers.forEach(() => { thead += `<th>Nombre</th><th>Poids</th>`; });
  thead += `<th>Poids</th><th>Surface</th></tr></thead>`;

  const tbody = CalcToles.epaisseurs.map(ep => {
    const dims = CalcToles.dimsParEpaisseur[ep] || { largeur: 1500, longueur: 3000 };
    let row = `<tr data-ep="${ep}">
      <td>${ep} mm</td>
      <td><input type="number" value="${dims.largeur}" onchange="calcMajRepartition(${ep})" data-rep-field="largeur"></td>
      <td><input type="number" value="${dims.longueur}" onchange="calcMajRepartition(${ep})" data-rep-field="longueur"></td>`;
    chantiers.forEach(c => {
      row += `<td><input type="number" min="0" value="0" onchange="calcMajRepartition(${ep})" data-rep-chantier="${_calcEsc(c.id)}"></td>
        <td class="calc-chantier-poids" data-rep-poids="${_calcEsc(c.id)}">0 kg</td>`;
    });
    row += `<td data-rep-total-poids>0 kg</td><td data-rep-total-surface>0.00 m²</td></tr>`;
    return row;
  }).join('');

  table.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  CalcToles.epaisseurs.forEach(ep => calcMajRepartition(ep));
}

function calcMajRepartition(ep) {
  const tr = document.querySelector(`#rep-table tr[data-ep="${ep}"]`);
  if (!tr) return;

  const largeur  = parseFloat(tr.querySelector('[data-rep-field="largeur"]').value) || 0;
  const longueur = parseFloat(tr.querySelector('[data-rep-field="longueur"]').value) || 0;
  CalcToles.dimsParEpaisseur[ep] = { largeur, longueur };

  let totalPoids = 0, totalSurface = 0;
  CalcToles.chantiersRepartition.forEach(c => {
    const inp = tr.querySelector(`[data-rep-chantier="${c.id}"]`);
    const nombre  = parseFloat(inp?.value) || 0;
    const surface = calcSurface(largeur, longueur, nombre);
    const poids   = calcPoids(surface, ep);
    const cellPoids = tr.querySelector(`[data-rep-poids="${c.id}"]`);
    if (cellPoids) cellPoids.textContent = poids ? poids.toFixed(0) + ' kg' : '0 kg';
    totalPoids += poids;
    totalSurface += surface;
  });

  tr.querySelector('[data-rep-total-poids]').textContent   = totalPoids.toFixed(0) + ' kg';
  tr.querySelector('[data-rep-total-surface]').textContent = totalSurface.toFixed(2) + ' m²';
}

/* ══════════════════════════════════════════════
   BLOC 3 — COMMANDE MULTI-LIGNES
══════════════════════════════════════════════ */

function calcAjouterLigneCommande() {
  CalcToles.lignesCommande.push({ id: ++_cmdSeq, epaisseur: '', largeur: '', longueur: '', nombre: 1, prixKg: '' });
  calcRendreCommande();
}

function calcSupprimerLigneCommande(id) {
  CalcToles.lignesCommande = CalcToles.lignesCommande.filter(l => l.id !== id);
  calcRendreCommande();
}

function calcMajLigneCommande(id, champ, valeur) {
  const ligne = CalcToles.lignesCommande.find(l => l.id === id);
  if (!ligne) return;
  ligne[champ] = valeur;
  calcRendreCommande();
}

function calcRendreCommande() {
  const tbody = document.getElementById('cmd-tbody');
  if (!tbody) return;

  if (!CalcToles.lignesCommande.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#aaa;padding:14px">Aucune ligne — clique sur « + Ajouter une ligne »</td></tr>';
  } else {
    tbody.innerHTML = CalcToles.lignesCommande.map(l => {
      const surface = calcSurface(l.largeur, l.longueur, l.nombre);
      const poids   = calcPoids(surface, l.epaisseur);
      const prix    = poids * (parseFloat(l.prixKg) || 0);
      return `<tr>
        <td><input type="number" step="0.1" value="${_calcEsc(l.epaisseur)}" onchange="calcMajLigneCommande(${l.id},'epaisseur',this.value)"></td>
        <td><input type="number" value="${_calcEsc(l.largeur)}" onchange="calcMajLigneCommande(${l.id},'largeur',this.value)"></td>
        <td><input type="number" value="${_calcEsc(l.longueur)}" onchange="calcMajLigneCommande(${l.id},'longueur',this.value)"></td>
        <td><input type="number" min="1" value="${_calcEsc(l.nombre)}" onchange="calcMajLigneCommande(${l.id},'nombre',this.value)"></td>
        <td class="calc-cell-calc">${surface ? surface.toFixed(2) : '0.00'} m²</td>
        <td class="calc-cell-calc">${poids ? poids.toFixed(0) : 0} kg</td>
        <td><input type="number" step="0.01" value="${_calcEsc(l.prixKg)}" onchange="calcMajLigneCommande(${l.id},'prixKg',this.value)"></td>
        <td class="calc-cell-calc">${prix ? prix.toFixed(2) : '0.00'} €</td>
        <td><button type="button" class="calc-btn-suppr" onclick="calcSupprimerLigneCommande(${l.id})" title="Supprimer">✕</button></td>
      </tr>`;
    }).join('');
  }

  let totS = 0, totP = 0, totPrix = 0;
  CalcToles.lignesCommande.forEach(l => {
    const surface = calcSurface(l.largeur, l.longueur, l.nombre);
    const poids   = calcPoids(surface, l.epaisseur);
    totS += surface;
    totP += poids;
    totPrix += poids * (parseFloat(l.prixKg) || 0);
  });
  document.getElementById('cmd-total-surface').textContent = totS.toFixed(2) + ' m²';
  document.getElementById('cmd-total-poids').textContent   = totP.toFixed(0) + ' kg';
  document.getElementById('cmd-total-prix').textContent    = totPrix.toFixed(2) + ' €';
}

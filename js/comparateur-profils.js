/**
 * comparateur-profils.js
 * Sous-onglet "Comparateur profilés" — Outils / Stock Métallerie LBF
 *
 * Permet d'ajouter plusieurs sections de la bibliothèque et de comparer
 * leurs dimensions et leur poids côte à côte. Réutilise les données déjà
 * chargées par bibliotheque.js (Biblio.data.standard) et sa fonction
 * _dimsSection() pour la liste des dimensions pertinentes par famille.
 */

'use strict';

const CompProfils = {
  sections: [], // { uid, famille, section, longueur }
};

let _compUid = 0;

function _compEsc(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════ */

function compInit() {
  compRendreSelectFamille();
  compMajDesignations();
  compRendreTable();
}

function compRendreSelectFamille() {
  const sel = document.getElementById('comp-sel-famille');
  if (!sel) return;
  const familles = (Biblio?.data?.standard || []).map(f => f.famille);
  sel.innerHTML = familles.map(f => `<option value="${_compEsc(f)}">${_compEsc(f)}</option>`).join('');
}

function compMajDesignations() {
  const selFamille = document.getElementById('comp-sel-famille');
  const selDesig   = document.getElementById('comp-sel-desig');
  if (!selFamille || !selDesig) return;

  const fam = (Biblio?.data?.standard || []).find(f => f.famille === selFamille.value);
  const sections = fam ? fam.sections : [];

  selDesig.innerHTML = sections.map((s, i) => {
    return `<option value="${i}">${_compEsc(s.desig)}</option>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   GESTION DES SECTIONS COMPARÉES
══════════════════════════════════════════════ */

function compAjouterSection() {
  const selFamille = document.getElementById('comp-sel-famille');
  const selDesig   = document.getElementById('comp-sel-desig');
  if (!selFamille?.value || !selDesig?.value) return;

  const fam = (Biblio?.data?.standard || []).find(f => f.famille === selFamille.value);
  if (!fam) return;
  const section = fam.sections[parseInt(selDesig.value, 10)];
  if (!section) return;

  const dejaPresent = CompProfils.sections.some(c => c.famille === fam.famille && c.section.desig === section.desig);
  if (dejaPresent) { alert('Ce profilé est déjà dans le comparatif.'); return; }

  CompProfils.sections.push({ uid: ++_compUid, famille: fam.famille, section, longueur: 6 });
  compRendreTable();
}

function compRetirerSection(uid) {
  CompProfils.sections = CompProfils.sections.filter(c => c.uid !== uid);
  compRendreTable();
}

function compMajLongueur(uid, valeur) {
  const col = CompProfils.sections.find(c => c.uid === uid);
  if (!col) return;
  col.longueur = parseFloat(valeur) || 0;
  compRendreTable();
}

/* ══════════════════════════════════════════════
   RENDU DU TABLEAU
══════════════════════════════════════════════ */

function compRendreTable() {
  const table = document.getElementById('comp-table');
  if (!table) return;

  const cols = CompProfils.sections;
  if (!cols.length) {
    table.innerHTML = `<tbody><tr><td style="text-align:center;color:#aaa;padding:20px">
      Ajoute au moins une section pour démarrer la comparaison.
    </td></tr></tbody>`;
    return;
  }

  // Dimensions par section + union ordonnée des libellés de colonnes
  const dimsParSection = cols.map(c => _dimsSection(c.section, c.famille));
  const labels = [];
  dimsParSection.forEach(dims => dims.forEach(([label]) => {
    if (!labels.includes(label)) labels.push(label);
  }));

  // En-tête : nom de la caractéristique, une colonne par label + Longueur/Poids total
  let thead = '<thead><tr><th style="text-align:left">Section</th>';
  labels.forEach(label => { thead += `<th>${_compEsc(label)}</th>`; });
  thead += '<th>Longueur (m)</th><th>Poids total (kg)</th><th></th></tr></thead>';

  // Une ligne par section comparée
  const lignes = cols.map((c, i) => {
    const nomSection = `${c.famille} — ${c.section.desig}`;
    const poids = (c.section.pml || 0) * (c.longueur || 0);
    let row = `<tr><td style="text-align:left">${_compEsc(nomSection)}</td>`;
    labels.forEach(label => {
      const paire = dimsParSection[i].find(([l]) => l === label);
      row += `<td class="calc-cell-calc">${_compEsc(paire ? paire[1] : '—')}</td>`;
    });
    row += `<td><input type="number" step="0.1" min="0" value="${_compEsc(c.longueur)}"
      onchange="compMajLongueur(${c.uid},this.value)"></td>`;
    row += `<td class="calc-cell-calc">${poids ? poids.toFixed(1) : '0.0'} kg</td>`;
    row += `<td><button type="button" class="calc-btn-suppr" onclick="compRetirerSection(${c.uid})" title="Retirer">✕</button></td>`;
    return row + '</tr>';
  }).join('');

  table.innerHTML = thead + `<tbody>${lignes}</tbody>`;
}

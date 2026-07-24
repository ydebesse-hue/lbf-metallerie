/**
 * calcul-toles.js
 * Sous-onglet "Calcul tôles" — Outils / Stock Métallerie LBF
 *
 * Outil de calcul à la volée (aucune sauvegarde en base) :
 *   1. Convertisseur rapide (dimensions ↔ poids ↔ prix)
 *   2. Répartition des besoins par chantier
 *
 * Densité acier : 7.85 kg par m² et par mm d'épaisseur (7850 kg/m³).
 */

'use strict';

const DENSITE_ACIER = 7.85;
const QUALITES_ACIER = ['S235', 'S275', 'S355', 'S420', 'S460', 'S690'];
const EPAISSEURS_DISPONIBLES = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30];

const CalcToles = {
  initialized: false,
  chantiers: [],              // chantiers actifs chargés depuis Supabase
  chantiersRepartition: [],   // chantiers ajoutés au tableau de répartition
  lignesRepartition: [],      // { id, epaisseur, qualite, largeur, longueur, poids: { [chantierId]: poids } }
};

let _repSeq = 0;

function _calcEsc(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  if (!CalcToles.lignesRepartition.length) {
    [6, 10, 15].forEach(ep => {
      CalcToles.lignesRepartition.push({ id: ++_repSeq, epaisseur: ep, qualite: 'S235', largeur: 1500, longueur: 3000, poids: {} });
    });
  }

  calcRendreSelectChantier();
  calcRendreTableRepartition();
}

/* ══════════════════════════════════════════════
   BLOC 1 — CONVERTISSEUR RAPIDE
══════════════════════════════════════════════ */

function calcConvertisseur() {
  const ep         = parseFloat(document.getElementById('cv-epaisseur').value) || 0;
  const poids      = parseFloat(document.getElementById('cv-poids').value) || 0;
  const surfaceEl  = document.getElementById('cv-surface');

  const surface = ep > 0 ? poids / (ep * DENSITE_ACIER) : 0;
  surfaceEl.value = surface ? surface.toFixed(2) : '';

  const largeurTole  = parseFloat(document.getElementById('cv-tole-largeur').value) || 0;
  const longueurTole = parseFloat(document.getElementById('cv-tole-longueur').value) || 0;
  const surfaceToleEl  = document.getElementById('cv-tole-surface');
  const nombreToleEl   = document.getElementById('cv-tole-nombre');
  const chutePctEl     = document.getElementById('cv-chute-pct');
  const chuteSurfaceEl = document.getElementById('cv-chute-surface');

  const surfaceTole = (largeurTole * longueurTole) / 1e6;
  surfaceToleEl.value = surfaceTole ? surfaceTole.toFixed(2) : '';

  if (surfaceTole > 0 && surface > 0) {
    const nombreToles   = Math.ceil(surface / surfaceTole);
    const surfaceTotale = nombreToles * surfaceTole;
    const chuteSurface  = surfaceTotale - surface;
    const chutePct      = (chuteSurface / surfaceTotale) * 100;
    nombreToleEl.value   = nombreToles;
    chutePctEl.value     = chutePct.toFixed(1) + ' %';
    chuteSurfaceEl.value = chuteSurface.toFixed(2);
  } else {
    nombreToleEl.value = '';
    chutePctEl.value = '';
    chuteSurfaceEl.value = '';
  }
}

function calcReinitialiserConvertisseur() {
  ['cv-epaisseur', 'cv-poids', 'cv-surface',
   'cv-tole-surface', 'cv-tole-nombre', 'cv-chute-pct', 'cv-chute-surface']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('cv-tole-largeur').value = 1500;
  document.getElementById('cv-tole-longueur').value = 3000;
  calcConvertisseur();
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
    ? dispo.map(c => `<option value="${_calcEsc(c.id)}">${_calcEsc([c.numero_affaire, c.nom].filter(Boolean).join(' — '))}</option>`).join('')
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

function calcToggleNouveauChantier(show = true) {
  const zone = document.getElementById('rep-nouveau-chantier');
  if (!zone) return;
  zone.style.display = show ? '' : 'none';
  if (show) {
    document.getElementById('rep-new-affaire').value = '';
    document.getElementById('rep-new-ville').value = '';
    document.getElementById('rep-new-nom').value = '';
    document.getElementById('rep-new-nom').focus();
  }
}

// Chantiers ajoutés à la volée pour cet outil uniquement — jamais enregistrés
// dans la table chantiers, juste utiles pour cette répartition/session.
function calcConfirmerNouveauChantier() {
  const nom     = document.getElementById('rep-new-nom')?.value.trim();
  const affaire = document.getElementById('rep-new-affaire')?.value.trim() || null;
  const ville   = document.getElementById('rep-new-ville')?.value.trim() || null;
  if (!nom) return;

  const local = { id: `local-${Date.now()}`, nom, numero_affaire: affaire, ville, actif: true };
  CalcToles.chantiers.push(local);
  calcRendreSelectChantier();
  calcToggleNouveauChantier(false);
  const sel = document.getElementById('rep-sel-chantier');
  if (sel) sel.value = local.id;
}

function calcAjouterLigneRepartition() {
  CalcToles.lignesRepartition.push({ id: ++_repSeq, epaisseur: 6, qualite: 'S235', largeur: 1500, longueur: 3000, poids: {} });
  calcRendreTableRepartition();
}

function calcSupprimerLigneRepartition(id) {
  CalcToles.lignesRepartition = CalcToles.lignesRepartition.filter(l => l.id !== id);
  calcRendreTableRepartition();
}

function calcCopierTableauRepartition() {
  const table = document.getElementById('rep-table');
  if (!table) return;
  const avecDetail = document.getElementById('rep-copie-detail')?.checked;
  const chantiers = CalcToles.chantiersRepartition;

  const entetes = ['Épaisseur (mm)', 'Qualité', 'Format tôle (mm)', 'Surface totale (m²)', 'Nb tôles', 'Surface tôles (m²)', 'Poids total (kg)', 'Taux de chute (%)'];
  if (avecDetail) {
    chantiers.forEach(c => {
      const nom = [c.numero_affaire, c.nom].filter(Boolean).join(' — ');
      entetes.push(`${nom} — Poids (kg)`, `${nom} — Surface (m²)`);
    });
  }
  const lignes = [];
  const alertes = [];

  CalcToles.lignesRepartition.forEach(l => {
    const tr = table.querySelector(`tr[data-rep-id="${l.id}"]`);
    if (!tr) return;
    const cells = [
      l.epaisseur, l.qualite, `${l.largeur}×${l.longueur}`,
      tr.querySelector('[data-rep-total-surface]').textContent,
      tr.querySelector('[data-rep-nb-toles]').textContent,
      tr.querySelector('[data-rep-surface-toles]').textContent,
      tr.querySelector('[data-rep-total-poids]').textContent,
      tr.querySelector('[data-rep-chute]').textContent,
    ];
    if (avecDetail) {
      chantiers.forEach(c => {
        cells.push(l.poids[c.id] || 0);
        cells.push(tr.querySelector(`[data-rep-surface="${c.id}"]`)?.textContent || '0.00 m²');
      });
    }
    lignes.push(cells);
    alertes.push((l.qualite || '').trim().toUpperCase() !== 'S235');
  });

  const texte = [entetes, ...lignes].map(l => l.join('\t')).join('\n');
  const styleEntete = 'background:#e0e0e0;font-weight:bold;border:1px solid #999;padding:4px 8px';
  const styleCellule = 'border:1px solid #ccc;padding:4px 8px';
  const styleCelluleAlerte = styleCellule + ';background:#fdecea';
  const html = '<table style="border-collapse:collapse">'
    + '<tr>' + entetes.map(e => `<th style="${styleEntete}">${_calcEsc(e)}</th>`).join('') + '</tr>'
    + lignes.map((l, i) => '<tr>' + l.map(v => `<td style="${alertes[i] ? styleCelluleAlerte : styleCellule}">${_calcEsc(v)}</td>`).join('') + '</tr>').join('')
    + '</table>';

  if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      'text/plain': new Blob([texte], { type: 'text/plain' }),
      'text/html':  new Blob([html], { type: 'text/html' }),
    });
    navigator.clipboard.write([item])
      .then(() => alert('Tableau copié dans le presse-papier (collable directement dans Excel/Word).'))
      .catch(() => navigator.clipboard.writeText(texte)
        .then(() => alert('Tableau copié dans le presse-papier.'))
        .catch(() => alert('Impossible de copier automatiquement le tableau.')));
  } else {
    navigator.clipboard.writeText(texte)
      .then(() => alert('Tableau copié dans le presse-papier.'))
      .catch(() => alert('Impossible de copier automatiquement le tableau.'));
  }
}

function calcRendreTableRepartition() {
  const table = document.getElementById('rep-table');
  if (!table) return;
  const chantiers = CalcToles.chantiersRepartition;

  let thead = `<thead><tr>
    <th rowspan="2" style="text-align:left">Épaisseur</th>
    <th rowspan="2" style="text-align:left">Qualité</th>
    <th rowspan="2">Format tôle (mm)</th>
    <th rowspan="2">Surface totale</th>
    <th rowspan="2">Nb tôles</th>
    <th rowspan="2">Surface tôles</th>
    <th rowspan="2">Poids total</th>
    <th rowspan="2">Taux de chute</th>`;
  chantiers.forEach(c => {
    thead += `<th colspan="2">${_calcEsc([c.numero_affaire, c.nom].filter(Boolean).join(' — '))}
      <button type="button" class="calc-btn-suppr" onclick="calcRetirerChantierRepartition('${_calcEsc(c.id)}')" title="Retirer">✕</button>
    </th>`;
  });
  thead += `<th rowspan="2"></th></tr><tr>`;
  chantiers.forEach(() => { thead += `<th>Poids (kg)</th><th>Surface (m²)</th>`; });
  thead += `</tr></thead>`;

  const tbody = CalcToles.lignesRepartition.map(l => {
    let row = `<tr data-rep-id="${l.id}">
      <td>
        <input type="text" inputmode="decimal" list="rep-epaisseurs-dispo" value="${l.epaisseur}"
          onchange="calcMajRepartition(${l.id})" data-rep-field="epaisseur" style="width:60px">
      </td>
      <td>
        <select onchange="calcMajRepartition(${l.id})" data-rep-field="qualite" style="width:80px">
          ${QUALITES_ACIER.map(q => `<option value="${q}"${q === l.qualite ? ' selected' : ''}>${q}</option>`).join('')}
        </select>
      </td>
      <td>
        <input type="text" inputmode="decimal" value="${l.largeur}" onchange="calcMajRepartition(${l.id})" data-rep-field="largeur" style="width:60px">
        ×
        <input type="text" inputmode="decimal" value="${l.longueur}" onchange="calcMajRepartition(${l.id})" data-rep-field="longueur" style="width:60px">
      </td>
      <td class="calc-cell-calc" data-rep-total-surface>0.00 m²</td>
      <td class="calc-cell-calc" data-rep-nb-toles>0</td>
      <td class="calc-cell-calc" data-rep-surface-toles>0.00 m²</td>
      <td class="calc-cell-calc" data-rep-total-poids>0 kg</td>
      <td class="calc-cell-calc" data-rep-chute>—</td>`;
    chantiers.forEach(c => {
      const poids = l.poids[c.id] || 0;
      row += `<td><input type="text" inputmode="decimal" value="${poids}" onchange="calcMajRepartition(${l.id})" data-rep-chantier="${_calcEsc(c.id)}"></td>
        <td class="calc-cell-calc" data-rep-surface="${_calcEsc(c.id)}">0.00 m²</td>`;
    });
    row += `<td><button type="button" class="calc-btn-suppr" onclick="calcSupprimerLigneRepartition(${l.id})" title="Supprimer cette ligne">✕</button></td></tr>`;
    return row;
  }).join('');

  table.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  CalcToles.lignesRepartition.forEach(l => calcMajRepartition(l.id));
}

function calcMajRepartition(id) {
  const tr = document.querySelector(`#rep-table tr[data-rep-id="${id}"]`);
  const ligne = CalcToles.lignesRepartition.find(l => l.id === id);
  if (!tr || !ligne) return;

  const ep       = parseFloat(tr.querySelector('[data-rep-field="epaisseur"]').value) || 0;
  const qualite  = tr.querySelector('[data-rep-field="qualite"]').value;
  const largeur  = parseFloat(tr.querySelector('[data-rep-field="largeur"]').value) || 0;
  const longueur = parseFloat(tr.querySelector('[data-rep-field="longueur"]').value) || 0;
  ligne.epaisseur = ep;
  ligne.qualite   = qualite;
  ligne.largeur   = largeur;
  ligne.longueur  = longueur;

  const estQualiteBase = !qualite.trim() || qualite.trim().toUpperCase() === 'S235';
  tr.classList.toggle('calc-ligne-alerte', !estQualiteBase);

  let totalSurface = 0;
  CalcToles.chantiersRepartition.forEach(c => {
    const inp   = tr.querySelector(`[data-rep-chantier="${c.id}"]`);
    const poids = parseFloat(inp?.value) || 0;
    ligne.poids[c.id] = poids;
    const surfaceChantier = ep > 0 ? poids / (ep * DENSITE_ACIER) : 0;
    const cellSurface = tr.querySelector(`[data-rep-surface="${c.id}"]`);
    if (cellSurface) cellSurface.textContent = surfaceChantier ? surfaceChantier.toFixed(2) + ' m²' : '0.00 m²';
    totalSurface += surfaceChantier;
  });

  const surfaceTole = (largeur * longueur) / 1e6;
  const nbToles = surfaceTole > 0 ? Math.ceil(totalSurface / surfaceTole) : 0;
  const surfaceCommandee = nbToles * surfaceTole;
  const poidsBrut = surfaceCommandee * ep * DENSITE_ACIER;
  const tauxChute = surfaceCommandee > 0 ? ((surfaceCommandee - totalSurface) / surfaceCommandee) * 100 : 0;

  tr.querySelector('[data-rep-total-surface]').textContent = totalSurface.toFixed(2) + ' m²';
  tr.querySelector('[data-rep-nb-toles]').textContent = nbToles || 0;
  tr.querySelector('[data-rep-surface-toles]').textContent = surfaceCommandee.toFixed(2) + ' m²';
  tr.querySelector('[data-rep-total-poids]').textContent = poidsBrut ? poidsBrut.toFixed(0) + ' kg' : '0 kg';
  tr.querySelector('[data-rep-chute]').textContent = totalSurface > 0 ? tauxChute.toFixed(1) + ' %' : '—';
}


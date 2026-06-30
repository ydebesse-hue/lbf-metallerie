/**
 * stock.js — Module Stock Métallerie Le Bras Frères
 * Conv. 5 — Formulaires, modales et persistance localStorage
 * Dépendance : auth/auth.js doit être chargé avant ce fichier
 *
 * IDs HTML utilisés :
 *  Profilés : p-type, p-desig, p-chantier, p-lieu, p-dispo, p-recherche
 *  Tôles    : t-epaisseur, t-chantier, t-lieu, t-dispo, t-recherche
 *  Communs  : tableau-stock, stock-compteur, stock-notif, stock-alerte-attente
 *             toolbar-profils, toolbar-toles
 *             btn-ajout-profil, btn-ajout-tole, btn-ajout-tole-tab
 *             btn-reset-profils, btn-reset-toles
 *
 * Persistance : localStorage, clé 'lbf_stock_modifs'
 *   Structure identique à stock.json pour migration SharePoint (Conv. 7)
 *   Les modifications locales priment sur stock.json
 */

'use strict';

const Stock = (() => {

  /* ──────────────────────────────────────────────────────────────
     CONSTANTES
     ────────────────────────────────────────────────────────────── */

  /** Clé localStorage pour les modifications locales */
  const CLE_LOCAL = 'lbf_stock_modifs';

  /** Clé localStorage pour les demandes d'attribution */
  const CLE_DEMANDES = 'lbf_demandes';

  /** Densité acier (kg/dm³) pour calcul poids tôle */
  const DENSITE_ACIER = 7.85;

  /** Lieux de stockage disponibles */
  const LIEUX = ['Rack 1', 'Rack 2', 'Rack 3', 'Rack 4', 'Extérieur', 'Autre'];


  /* ──────────────────────────────────────────────────────────────
     ÉTAT INTERNE
     ────────────────────────────────────────────────────────────── */

  let _data      = null;        // données fusionnées (stock.json + localStorage)
  let _sections  = null;        // données de sections.json (pour les modales)
  let _onglet    = 'profils';   // onglet actif
  let _tri       = { col: null, ordre: 'asc' };
  let _selection = null;        // élément sélectionné (partagé avec les modales)
  let _demandes  = [];          // demandes en_attente chargées depuis localStorage (Conv. 6)


  /* ──────────────────────────────────────────────────────────────
     INITIALISATION
     ────────────────────────────────────────────────────────────── */

  /**
   * Point d'entrée — appelé au DOMContentLoaded
   */
  async function init() {
    Auth.requireAuth();
    Auth.afficherInfosSession('#header-user', '#header-badge');
    Auth.appliquerDroitsDOM();

    try {
      // Chargement stock depuis Supabase
      let barres = [];
      try {
        barres = await window.SB.lire('stock');
      } catch(e) {
        console.warn('[Stock] Supabase indisponible, fallback JSON :', e);
        const rep = await fetch('../data/stock.json');
        if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
        const json = await rep.json();
        barres = json.barres || [];
      }

      // Calculer le compteur depuis les IDs existants
      const nums = barres.map(b => parseInt((b.id||'').replace(/[^0-9]/g,''),10)).filter(n=>!isNaN(n));
      const compteur = nums.length ? Math.max(...nums) : 0;
      _data = { barres, compteur };

      // Charger les sections (pour cascades dans les modales)
      try {
        const repSec = await fetch('../data/sections.json');
        if (repSec.ok) _sections = await repSec.json();
      } catch(e) { /* sections optionnelles */ }

      // Charger les demandes en attente depuis Supabase
      try {
        const demandes = await window.SB.lire('demandes');
        _demandes = demandes.filter(d => d.statut === 'en_attente');
      } catch(e) {
        _demandes = _chargerDemandes().demandes.filter(d => d.statut === 'en_attente');
      }

    } catch (err) {
      _erreurChargement(err.message);
      return;
    }

    _peuplerFiltres();
    _filtrer();
    _majAlerteAttente();
    _attacherEvenements();
    _initialiserModales();
  }


  /* ──────────────────────────────────────────────────────────────
     PERSISTANCE LOCALSTORAGE
     ────────────────────────────────────────────────────────────── */

  /**
   * Charge les modifications stockées en local
   * @returns {Object} { barres: [], compteur: 0 }
   */
  function _chargerLocal() {
    try {
      const raw = localStorage.getItem(CLE_LOCAL);
      return raw ? JSON.parse(raw) : { barres: [], compteur: 0 };
    } catch (e) {
      return { barres: [], compteur: 0 };
    }
  }

  /**
   * Sauvegarde les modifications locales
   * @param {Object} local — { barres: [], compteur: 0 }
   */
  function _sauvegarderLocal(local) {
    try {
      localStorage.setItem(CLE_LOCAL, JSON.stringify(local));
    } catch (e) {
      console.error('Impossible de sauvegarder dans localStorage :', e);
    }
  }

  /**
   * Fusionne stock.json avec les modifications locales
   * Les modifications locales priment (même id → local remplace JSON)
   * Les nouveaux éléments locaux (id absent de JSON) sont ajoutés
   * @param {Object} stockJson — données brutes de stock.json
   * @returns {Object} données fusionnées
   */
  function _fusionnerAvecLocal(stockJson) {
    const local = _chargerLocal();
    if (!local.barres.length) return stockJson;

    const fusion = { ...stockJson };

    // Remplacer ou ajouter les barres locales
    local.barres.forEach(barreLocale => {
      const idx = fusion.barres.findIndex(b => b.id === barreLocale.id);
      if (idx !== -1) {
        fusion.barres[idx] = barreLocale; // remplacement
      } else {
        fusion.barres.push(barreLocale);  // nouvel ajout
      }
    });

    // Mettre à jour le compteur si le local est plus grand
    if (local.compteur > fusion.compteur) {
      fusion.compteur = local.compteur;
    }

    return fusion;
  }

  /**
   * Génère un nouvel ID pour un profilé (BAR-XXXX)
   * @returns {string}
   */
  function _genererIdBarre() {
    const nums = _data.barres
      .filter(b => b.id && b.id.startsWith('BAR-'))
      .map(b => parseInt(b.id.replace('BAR-',''), 10))
      .filter(n => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return `BAR-${String(max + 1).padStart(4, '0')}`;
  }

  /**
   * Génère un nouvel ID pour une tôle (TOL-XXXX)
   * @returns {string}
   */
  function _genererIdTole() {
    const nums = _data.barres
      .filter(b => b.id && b.id.startsWith('TOL-'))
      .map(b => parseInt(b.id.replace('TOL-',''), 10))
      .filter(n => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return `TOL-${String(max + 1).padStart(4, '0')}`;
  }

  /**
   * Persiste un élément (ajout ou modification) dans Supabase
   * Fallback localStorage si Supabase indisponible
   * @param {Object} element — objet barre ou tôle
   */
  async function _persisterElement(element) {
    // Mettre à jour _data en mémoire immédiatement
    const idxData = _data.barres.findIndex(b => b.id === element.id);
    if (idxData !== -1) {
      _data.barres[idxData] = element;
    } else {
      _data.barres.push(element);
    }

    // Persister dans Supabase
    try {
      await window.SB.upsert('stock', element);
    } catch(e) {
      console.warn('[Stock] Supabase indisponible, fallback localStorage :', e);
      // Fallback localStorage
      const local = _chargerLocal();
      const idx = local.barres.findIndex(b => b.id === element.id);
      if (idx !== -1) { local.barres[idx] = element; } else { local.barres.push(element); }
      _sauvegarderLocal(local);
    }
  }

  /**
   * Charge les demandes d'attribution depuis localStorage
   * @returns {Object} { demandes: [], compteur: 0 }
   */
  function _chargerDemandes() {
    try {
      const raw = localStorage.getItem(CLE_DEMANDES);
      return raw ? JSON.parse(raw) : { demandes: [], compteur: 0 };
    } catch (e) {
      return { demandes: [], compteur: 0 };
    }
  }

  /**
   * Persiste une demande d'attribution dans Supabase
   * Fallback localStorage si Supabase indisponible
   * @param {Object} demande
   */
  async function _persisterDemande(demande) {
    try {
      await window.SB.upsert('demandes', demande);
    } catch(e) {
      console.warn('[Stock] Supabase indisponible, fallback localStorage demande :', e);
      const store = _chargerDemandes();
      store.demandes.push(demande);
      store.compteur = (store.compteur || 0) + 1;
      try { localStorage.setItem(CLE_DEMANDES, JSON.stringify(store)); } catch {}
    }
  }


  /* ──────────────────────────────────────────────────────────────
     FILTRAGE
     ────────────────────────────────────────────────────────────── */

  function _filtrer() {
    if (!_data) return;

    // Récupérer le profil courant pour masquer les éléments refusés
    const session = window.Auth ? window.Auth.getSession() : null;
    const profil  = session ? session.profil : 'consultation';
    const voirRefus = (profil === 'administration');

    const source = _data.barres.filter(b => {
      // Masquer les refusés pour Consultation et Gestion
      if (!voirRefus && b.statut === 'refuse') return false;
      return _onglet === 'profils' ? b.categorie === 'profil' : b.categorie === 'tole';
    });

    let resultats = _onglet === 'profils'
      ? _filtrerProfils(source)
      : _filtrerToles(source);

    if (_tri.col) resultats = _trier(resultats);

    _rendrTableau(resultats);
    _majCompteur(resultats.length, source.length);

    if (_onglet === 'profils') _peuplerDesignations(_val('p-type'));
  }

  function _filtrerProfils(source) {
    const type     = _val('p-type');
    const desig    = _val('p-desig');
    const chantier = _val('p-chantier');
    const lieu     = _val('p-lieu');
    const dispo    = _val('p-dispo');
    const texte    = _val('p-recherche').toLowerCase().trim();

    return source.filter(b => {
      if (type     && b.section_type     !== type)     return false;
      if (desig    && b.designation      !== desig)    return false;
      if (chantier && b.chantier_origine !== chantier) return false;
      if (lieu     && b.lieu_stockage    !== lieu)     return false;
      if (dispo    && b.disponibilite    !== dispo)    return false;
      if (texte) {
        const h = [b.section_type, b.designation, b.chantier_origine,
          b.lieu_stockage, b.commentaire, b.id].join(' ').toLowerCase();
        if (!h.includes(texte)) return false;
      }
      return true;
    });
  }

  function _filtrerToles(source) {
    const epais    = _val('t-epaisseur');
    const chantier = _val('t-chantier');
    const lieu     = _val('t-lieu');
    const dispo    = _val('t-dispo');
    const texte    = _val('t-recherche').toLowerCase().trim();

    return source.filter(b => {
      if (epais    && String(b.epaisseur_mm) !== epais)    return false;
      if (chantier && b.chantier_origine     !== chantier) return false;
      if (lieu     && b.lieu_stockage        !== lieu)     return false;
      if (dispo    && b.disponibilite        !== dispo)    return false;
      if (texte) {
        const h = [b.epaisseur_mm, b.largeur_mm, b.longueur_mm,
          b.chantier_origine, b.lieu_stockage, b.commentaire, b.id].join(' ').toLowerCase();
        if (!h.includes(texte)) return false;
      }
      return true;
    });
  }


  /* ──────────────────────────────────────────────────────────────
     TRI
     ────────────────────────────────────────────────────────────── */

  function _clicTri(col) {
    _tri.ordre = (_tri.col === col && _tri.ordre === 'asc') ? 'desc' : 'asc';
    _tri.col   = col;
    _filtrer();
  }

  function _trier(data) {
    const mult = _tri.ordre === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = _valTri(a), vb = _valTri(b);
      if (typeof va === 'string') return va.localeCompare(vb, 'fr') * mult;
      return (va - vb) * mult;
    });
  }

  function _valTri(item) {
    switch (_tri.col) {
      case 'id':          return item.id               || '';
      case 'type':        return item.section_type     || '';
      case 'designation': return item.designation      || '';
      case 'longueur':    return item.longueur_m       || 0;
      case 'poids':       return item.poids_barre_kg   || item.poids_unitaire_kg || 0;
      case 'chantier':    return item.chantier_origine || '';
      case 'lieu':        return item.lieu_stockage    || '';
      case 'dispo':       return item.disponibilite    || '';
      case 'date':        return item.date_ajout       || '';
      case 'epaisseur':   return item.epaisseur_mm     || 0;
      case 'dimensions':  return (item.largeur_mm || 0) * 100000 + (item.longueur_mm || 0);
      case 'quantite':    return item.quantite         || 0;
      default:            return '';
    }
  }


  /* ──────────────────────────────────────────────────────────────
     RENDU DU TABLEAU
     ────────────────────────────────────────────────────────────── */

  function _rendrTableau(data) {
    const zone = document.getElementById('tableau-stock');
    if (!zone) return;

    zone.innerHTML = _onglet === 'profils'
      ? _htmlProfils(data)
      : _htmlToles(data);

    zone.querySelectorAll('thead th[data-col]').forEach(th => {
      th.addEventListener('click', () => _clicTri(th.dataset.col));
    });
  }

  function _htmlProfils(data) {
    const admin = Auth.hasRight('can_validate');
    const modif = Auth.hasRight('can_edit');

    const cols = [
      { col: 'id',          label: 'ID'               },
      { col: 'type',        label: 'Type'             },
      { col: 'designation', label: 'Désignation'      },
      { col: 'longueur',    label: 'Longueur (m)'     },
      { col: 'poids',       label: 'Poids (kg)'       },
      { col: 'lieu',        label: 'Stockage'         },
      { col: 'date',        label: 'Date ajout'       },
      { col: 'chantier',    label: 'Chantier origine' },
      { col: 'dispo',       label: 'Statut'           },
    ];

    let h = '<table><thead><tr>';
    cols.forEach(c => {
      const actif = _tri.col === c.col;
      const ind   = actif ? (_tri.ordre === 'asc' ? '▲' : '▼') : '⇅';
      h += `<th data-col="${c.col}" class="${actif ? 'tri-actif' : ''}">${c.label} <span class="tri-ind">${ind}</span></th>`;
    });
    h += '<th>Action</th></tr></thead><tbody>';

    if (!data.length) {
      h += `<tr><td colspan="10" class="vide">Aucun profilé ne correspond aux filtres.</td></tr>`;
    } else {
      data.forEach(b => {
        const attente = b.statut === 'en_attente';
        const poids   = b.poids_barre_kg
          ? b.poids_barre_kg.toFixed(1)
          : (b.poids_ml * b.longueur_m).toFixed(1);
        const dateAjout = b.date_ajout
          ? new Date(b.date_ajout).toLocaleDateString('fr-FR')
          : '—';

        h += `<tr${attente ? ' class="ligne-attente"' : ''}>`;
        h += `<td class="td-id"><span class="chip-id">${_e(b.id)}</span></td>`;
        h += `<td><strong>${_e(b.section_type)}</strong></td>`;
        h += `<td>${_e(b.designation)}
          <button class="btn-inline" onclick="Stock.ouvrirFicheSection('${_e(b.section_type)}','${_e(b.designation)}')" title="Fiche section">🔍</button>
        </td>`;
        h += `<td>${b.longueur_m.toFixed(2)}</td>`;
        h += `<td>${poids}</td>`;
        h += `<td>${_e(b.lieu_stockage)}
          <button class="btn-inline btn-inline-carte" onclick="_ouvrirCarte('${_e(b.lieu_stockage)}')" title="Voir sur le plan">📍</button>
        </td>`;
        h += `<td>${dateAjout}</td>`;
        h += `<td>${_e(b.chantier_origine)}${b.chantier_affectation
          ? ` <span class="chip-chantier" title="Affecté à : ${_e(b.chantier_affectation)}">→ ${_e(b.chantier_affectation)}</span>`
          : ''}</td>`;
        h += `<td>${_badgeDispo(b)}</td>`;
        h += `<td class="td-actions">${_actionsLigneProfil(b, modif, admin)}</td>`;
        h += `</tr>`;
      });
    }

    return h + '</tbody></table>';
  }

  function _htmlToles(data) {
    const admin = Auth.hasRight('can_validate');
    const modif = Auth.hasRight('can_edit');

    const cols = [
      { col: 'id',         label: 'ID'               },
      { col: 'epaisseur',  label: 'Ép. (mm)'         },
      { col: 'dimensions', label: 'Dimensions'        },
      { col: 'quantite',   label: 'Qté'              },
      { col: 'poids',      label: 'Poids unit. (kg)' },
      { col: 'lieu',       label: 'Stockage'         },
      { col: 'date',       label: 'Date ajout'       },
      { col: 'chantier',   label: 'Chantier origine' },
      { col: 'dispo',      label: 'Statut'           },
    ];

    let h = '<table><thead><tr>';
    cols.forEach(c => {
      const actif = _tri.col === c.col;
      const ind   = actif ? (_tri.ordre === 'asc' ? '▲' : '▼') : '⇅';
      h += `<th data-col="${c.col}" class="${actif ? 'tri-actif' : ''}">${c.label} <span class="tri-ind">${ind}</span></th>`;
    });
    h += '<th>Action</th></tr></thead><tbody>';

    if (!data.length) {
      h += `<tr><td colspan="10" class="vide">Aucune tôle ne correspond aux filtres.</td></tr>`;
    } else {
      data.forEach(t => {
        const attente  = t.statut === 'en_attente';
        const dims     = `${t.largeur_mm} × ${t.longueur_mm} mm`;
        const dateAjout = t.date_ajout
          ? new Date(t.date_ajout).toLocaleDateString('fr-FR')
          : '—';

        h += `<tr${attente ? ' class="ligne-attente"' : ''}>`;
        h += `<td class="td-id"><span class="chip-id">${_e(t.id)}</span></td>`;
        h += `<td><strong>${t.epaisseur_mm} mm</strong></td>`;
        h += `<td>${dims}</td>`;
        h += `<td>${t.quantite} pièce${t.quantite > 1 ? 's' : ''}</td>`;
        h += `<td>${t.poids_unitaire_kg.toFixed(1)} <span style="color:#999;font-size:11px">(tot.&nbsp;${t.poids_total_kg.toFixed(1)})</span></td>`;
        h += `<td>${_e(t.lieu_stockage)}
          <button class="btn-inline btn-inline-carte" onclick="_ouvrirCarte('${_e(t.lieu_stockage)}')" title="Voir sur le plan">📍</button>
        </td>`;
        h += `<td>${dateAjout}</td>`;
        h += `<td>${_e(t.chantier_origine)}${t.chantier_affectation
          ? ` <span class="chip-chantier" title="Affecté à : ${_e(t.chantier_affectation)}">→ ${_e(t.chantier_affectation)}</span>`
          : ''}</td>`;
        h += `<td>${_badgeDispo(t)}</td>`;
        h += `<td class="td-actions">${_actionsLigneTole(t, modif, admin)}</td>`;
        h += `</tr>`;
      });
    }

    return h + '</tbody></table>';
  }


  /* ──────────────────────────────────────────────────────────────
     BADGES ET BOUTONS LIGNE
     ────────────────────────────────────────────────────────────── */

  function _badgeDispo(item) {
    if (item.statut === 'en_attente')        return `<span class="badge badge-attente">⏳ En attente</span>`;
    // Vérifier si une demande d'attribution est en cours sur cet élément
    const demandeEnCours = _demandes.find(d => d.id_barre === item.id);
    if (demandeEnCours) return `<span class="badge badge-attente">⏳ Attribution demandée</span>`;
    if (item.disponibilite === 'disponible') return `<span class="badge badge-dispo">Disponible</span>`;
    return                                          `<span class="badge badge-affecte">Affecté</span>`;
  }

  function _actionsLigneProfil(b, modif, admin) {
    let h = '';

    if (b.statut === 'en_attente' && admin) {
      // Admin : boutons valider / refuser sur ajout en attente
      h += ` <button class="btn-ligne btn-valider" onclick="Stock.validerElement('${b.id}')" title="Valider">✔</button>`;
      h += ` <button class="btn-ligne btn-refuser" onclick="Stock.refuserElement('${b.id}')" title="Refuser">✘</button>`;
    } else {
      // Vérifier si une demande d'attribution est en attente sur cette barre
      const demandeEnCours = _demandes.find(d => d.id_barre === b.id);
      if (demandeEnCours && admin) {
        // Admin : boutons valider / refuser sur la demande (id DEM-XXXX)
        h += ` <button class="btn-ligne btn-valider" onclick="Stock.validerElement('${_e(demandeEnCours.id)}')" title="Valider la demande">✔</button>`;
        h += ` <button class="btn-ligne btn-refuser" onclick="Stock.refuserElement('${_e(demandeEnCours.id)}')" title="Refuser la demande">✘</button>`;
      } else if (modif) {
        // Gestion / Admin : modifier
        h += ` <button class="btn-ligne btn-modifier" onclick="Stock.ouvrirModification('${b.id}')" title="Modifier">Modifier</button>`;
      }
    }

    // Demander : tous les profils (si disponible et pas de demande en cours)
    const demandeActifP = _demandes.find(d => d.id_barre === b.id);
    if (b.statut !== 'en_attente' && !demandeActifP) {
      const dis = b.disponibilite !== 'disponible' ? ' disabled' : '';
      h += ` <button class="btn-ligne btn-demander"${dis} onclick="Stock.ouvrirDemande('${b.id}')" title="Demander l'attribution">Demander</button>`;
    }

    return h;
  }

  function _actionsLigneTole(t, modif, admin) {
    let h = '';

    if (t.statut === 'en_attente' && admin) {
      h += ` <button class="btn-ligne btn-valider" onclick="Stock.validerElement('${t.id}')" title="Valider">✔</button>`;
      h += ` <button class="btn-ligne btn-refuser" onclick="Stock.refuserElement('${t.id}')" title="Refuser">✘</button>`;
    } else {
      const demandeEnCours = _demandes.find(d => d.id_barre === t.id);
      if (demandeEnCours && admin) {
        h += ` <button class="btn-ligne btn-valider" onclick="Stock.validerElement('${_e(demandeEnCours.id)}')" title="Valider la demande">✔</button>`;
        h += ` <button class="btn-ligne btn-refuser" onclick="Stock.refuserElement('${_e(demandeEnCours.id)}')" title="Refuser la demande">✘</button>`;
      } else if (modif) {
        h += ` <button class="btn-ligne btn-modifier" onclick="Stock.ouvrirModification('${t.id}')" title="Modifier">Modifier</button>`;
      }
    }

    const demandeActifT = _demandes.find(d => d.id_barre === t.id);
    if (t.statut !== 'en_attente' && !demandeActifT) {
      const dis = t.disponibilite !== 'disponible' ? ' disabled' : '';
      h += ` <button class="btn-ligne btn-demander"${dis} onclick="Stock.ouvrirDemande('${t.id}')" title="Demander l'attribution">Demander</button>`;
    }

    return h;
  }


  /* ──────────────────────────────────────────────────────────────
     PEUPLEMENT DES FILTRES
     ────────────────────────────────────────────────────────────── */

  function _peuplerFiltres() {
    const profils = _data.barres.filter(b => b.categorie === 'profil');
    const toles   = _data.barres.filter(b => b.categorie === 'tole');

    _remplirSelect('p-type',
      [...new Set(profils.map(b => b.section_type))].sort()
    );
    _remplirSelect('p-chantier',
      [...new Set(profils.map(b => b.chantier_origine))].sort()
    );
    _remplirSelect('p-lieu',
      [...new Set(profils.map(b => b.lieu_stockage))].sort()
    );
    _remplirSelect('t-epaisseur',
      [...new Set(toles.map(b => String(b.epaisseur_mm)))].sort((a,b) => +a - +b),
      'mm'
    );
    _remplirSelect('t-chantier',
      [...new Set(toles.map(b => b.chantier_origine))].sort()
    );
    _remplirSelect('t-lieu',
      [...new Set(toles.map(b => b.lieu_stockage))].sort()
    );
  }

  function _peuplerDesignations(type) {
    const sel = document.getElementById('p-desig');
    if (!sel) return;
    const valAct = sel.value;
    sel.innerHTML = '<option value="">Toutes désignations</option>';
    if (!type) return;

    const desigs = [...new Set(
      _data.barres
        .filter(b => b.categorie === 'profil' && b.section_type === type)
        .map(b => b.designation)
    )].sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      return isNaN(na) ? a.localeCompare(b) : na - nb;
    });

    desigs.forEach(d => {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      if (d === valAct) o.selected = true;
      sel.appendChild(o);
    });
  }

  function _remplirSelect(id, valeurs, suffixe = '') {
    const sel = document.getElementById(id);
    if (!sel) return;
    const premiere = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(premiere);
    valeurs.forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = suffixe ? `${v} ${suffixe}` : v;
      sel.appendChild(o);
    });
  }


  /* ──────────────────────────────────────────────────────────────
     ONGLETS
     ────────────────────────────────────────────────────────────── */

  function _basculerOnglet(onglet) {
    _onglet = onglet;
    _tri    = { col: null, ordre: 'asc' };

    document.querySelectorAll('.sous-onglet').forEach(b => {
      b.classList.toggle('actif', b.dataset.onglet === onglet);
    });

    const tpro = document.getElementById('toolbar-profils');
    const ttol = document.getElementById('toolbar-toles');
    if (tpro) tpro.style.display = onglet === 'profils' ? '' : 'none';
    if (ttol) ttol.style.display = onglet === 'toles'   ? '' : 'none';

    // Titre dynamique selon l'onglet
    document.title = onglet === 'profils'
      ? 'Stock Profilés — LBF'
      : 'Stock Tôles — LBF';

    _resetFiltres(onglet === 'profils' ? 'toles' : 'profils');
    _filtrer();
  }

  function _resetFiltres(onglet) {
    const ids = onglet === 'profils'
      ? ['p-type','p-desig','p-chantier','p-lieu','p-dispo','p-recherche']
      : ['t-epaisseur','t-chantier','t-lieu','t-dispo','t-recherche'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }


  /* ──────────────────────────────────────────────────────────────
     COMPTEUR ET ALERTE
     ────────────────────────────────────────────────────────────── */

  function _majCompteur(nb, total) {
    const z = document.getElementById('stock-compteur');
    if (!z) return;
    const s = _onglet === 'profils' ? ['profilé','profilés'] : ['tôle','tôles'];
    z.textContent = nb === total
      ? `${nb} ${nb > 1 ? s[1] : s[0]}`
      : `${nb} ${nb > 1 ? s[1] : s[0]} affichés sur ${total}`;
  }

  function _majAlerteAttente() {
    const z = document.getElementById('stock-alerte-attente');
    if (!z || !Auth.hasRight('can_validate')) {
      if (z) z.style.display = 'none';
      return;
    }
    const nb = _data.barres.filter(b => b.statut === 'en_attente').length;
    if (nb === 0) {
      z.style.display = 'none';
    } else {
      z.style.display = 'flex';
      const span = z.querySelector('.alerte-nb');
      if (span) span.textContent = nb;
    }
  }


  /* ──────────────────────────────────────────────────────────────
     ÉVÉNEMENTS PRINCIPAUX
     ────────────────────────────────────────────────────────────── */

  function _attacherEvenements() {
    // Onglets
    document.querySelectorAll('.sous-onglet').forEach(b => {
      b.addEventListener('click', () => _basculerOnglet(b.dataset.onglet));
    });

    // Filtres profilés
    ['p-type','p-desig','p-chantier','p-lieu','p-dispo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', _filtrer);
    });
    const prech = document.getElementById('p-recherche');
    if (prech) prech.addEventListener('input', _filtrer);

    // Filtres tôles
    ['t-epaisseur','t-chantier','t-lieu','t-dispo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', _filtrer);
    });
    const trech = document.getElementById('t-recherche');
    if (trech) trech.addEventListener('input', _filtrer);

    // Reset filtres
    const rp = document.getElementById('btn-reset-profils');
    if (rp) rp.addEventListener('click', () => { _resetFiltres('profils'); _filtrer(); });
    const rt = document.getElementById('btn-reset-toles');
    if (rt) rt.addEventListener('click', () => { _resetFiltres('toles'); _filtrer(); });

    // Boutons ajout → ouvrir modales
    const btnProfil = document.getElementById('btn-ajout-profil');
    if (btnProfil) btnProfil.addEventListener('click', () => _ouvrirModaleAjoutProfil());

    ['btn-ajout-tole','btn-ajout-tole-tab'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => _ouvrirModaleAjoutTole());
    });
  }


  /* ──────────────────────────────────────────────────────────────
     INITIALISATION DES MODALES
     ────────────────────────────────────────────────────────────── */

  /**
   * Branche tous les écouteurs des modales après le chargement du DOM
   */
  function _initialiserModales() {
    // Fermeture au clic sur le fond
    document.querySelectorAll('.modale-bg').forEach(bg => {
      bg.addEventListener('click', e => {
        if (e.target === bg) _fermerModale(bg.id);
      });
    });

    // ── Modale ajout profilé ──────────────────────────────────
    const mAP = document.getElementById('m-ajout-profil');
    if (mAP) {
      const selType  = mAP.querySelector('#ap-type');
      const selDesig = mAP.querySelector('#ap-desig');
      const inpLong  = mAP.querySelector('#ap-longueur');

      if (selType)  selType.addEventListener('change',  () => _apMajDesig(mAP));
      if (selDesig) selDesig.addEventListener('change', () => _apMajSchema(mAP));
      if (inpLong)  inpLong.addEventListener('input',   () => _apMajPoids(mAP));

      const btnSoumettre = mAP.querySelector('.btn-soumettre');
      if (btnSoumettre) btnSoumettre.addEventListener('click', () => _soumettreAjoutProfil(mAP));
    }

    // ── Modale ajout tôle ─────────────────────────────────────
    const mAT = document.getElementById('m-ajout-tole');
    if (mAT) {
      ['#at-epaisseur','#at-largeur','#at-longueur','#at-quantite'].forEach(sel => {
        const el = mAT.querySelector(sel);
        if (el) el.addEventListener('input', () => _atMajApercu(mAT));
      });
      const btnSoumettre = mAT.querySelector('.btn-soumettre');
      if (btnSoumettre) btnSoumettre.addEventListener('click', () => _soumettreAjoutTole(mAT));
    }

    // ── Modale modification ───────────────────────────────────
    const mMod = document.getElementById('m-modification');
    if (mMod) {
      const selType  = mMod.querySelector('#mod-type');
      const selDesig = mMod.querySelector('#mod-desig');
      const inpLong  = mMod.querySelector('#mod-longueur');

      if (selType)  selType.addEventListener('change',  () => _apMajDesig(mMod, '#mod-type', '#mod-desig'));
      if (selDesig) selDesig.addEventListener('change', () => _apMajSchema(mMod, '#mod-type', '#mod-desig'));
      if (inpLong)  inpLong.addEventListener('input',   () => _apMajPoids(mMod, '#mod-longueur'));

      const btnSoumettre = mMod.querySelector('.btn-soumettre');
      if (btnSoumettre) btnSoumettre.addEventListener('click', () => _soumettreModification(mMod));
    }

    // ── Modale demande d'attribution ──────────────────────────
    const mDem = document.getElementById('m-demande');
    if (mDem) {
      const btnSoumettre = mDem.querySelector('.btn-soumettre');
      if (btnSoumettre) btnSoumettre.addEventListener('click', () => _soumettreDemande(mDem));
    }

    // ── Modale validation stock (Conv. 6) ─────────────────────
    const mVS = document.getElementById('m-valider-stock');
    if (mVS) {
      const btnValider = mVS.querySelector('.btn-valider-confirmer');
      const btnRefuser = mVS.querySelector('.btn-refuser-depuis-valider');
      if (btnValider) btnValider.addEventListener('click', _confirmerValidationStock);
      if (btnRefuser) btnRefuser.addEventListener('click', () => {
        const id = mVS.dataset.idEnCours;
        _fermerModale('m-valider-stock');
        refuserElement(id);
      });
    }

    // ── Modale validation demande (Conv. 6) ───────────────────
    const mVD = document.getElementById('m-valider-demande');
    if (mVD) {
      const btnValider = mVD.querySelector('.btn-valider-confirmer');
      const btnRefuser = mVD.querySelector('.btn-refuser-depuis-valider');
      if (btnValider) btnValider.addEventListener('click', _confirmerValidationDemande);
      if (btnRefuser) btnRefuser.addEventListener('click', () => {
        const id = mVD.dataset.idEnCours;
        _fermerModale('m-valider-demande');
        refuserElement(id);
      });
    }

    // ── Modale confirmation refus (Conv. 6) ───────────────────
    const mConf = document.getElementById('m-confirmation');
    if (mConf) {
      const btnConfirmer = mConf.querySelector('.btn-confirmer-refus');
      const btnAnnuler   = mConf.querySelector('.btn-annuler-refus');
      if (btnConfirmer) btnConfirmer.addEventListener('click', _confirmerRefus);
      if (btnAnnuler)   btnAnnuler.addEventListener('click',   () => _fermerModale('m-confirmation'));
    }

    // ── Modale suppression ────────────────────────────────────
    const mModSup = document.getElementById('m-modification');
    if (mModSup) {
      const btnSup = mModSup.querySelector('.btn-supprimer-barre');
      if (btnSup) btnSup.addEventListener('click', () => {
        const id = mModSup.dataset.idEnCours;
        if (id) _ouvrirConfirmationSuppression(id);
      });
    }

    const mSup = document.getElementById('m-supprimer');
    if (mSup) {
      const btnConfirmer = mSup.querySelector('.btn-confirmer-sup');
      const btnAnnuler   = mSup.querySelector('.btn-annuler-sup');
      if (btnConfirmer) btnConfirmer.addEventListener('click', _confirmerSuppression);
      if (btnAnnuler)   btnAnnuler.addEventListener('click',   () => _fermerModale('m-supprimer'));
    }
  }


  /* ──────────────────────────────────────────────────────────────
     MODALE AJOUT PROFILÉ
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la modale d'ajout de profilé et initialise le formulaire
   */
  function _ouvrirModaleAjoutProfil() {
    const m = document.getElementById('m-ajout-profil');
    if (!m) return;

    // Réinitialiser le formulaire
    m.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });

    // Remplir le select type depuis sections.json ou stock.json
    _remplirSelectType(m.querySelector('#ap-type'));

    // Pré-remplir les lieux
    _remplirSelectLieux(m.querySelector('#ap-lieu'));

    // Cacher le schéma et la zone ID
    const schema = m.querySelector('#ap-schema');
    if (schema) schema.style.display = 'none';
    const zoneId = document.getElementById('ap-zone-id');
    if (zoneId) zoneId.style.display = 'none';
    delete m.dataset.idPrevu;

    // Reset désignations
    const selDesig = m.querySelector('#ap-desig');
    if (selDesig) {
      selDesig.innerHTML = '<option value="">— Choisir le type d\'abord —</option>';
    }

    // Note selon profil
    _majNoteStatut(m, '.ap-note-statut');

    _ouvrirModale('m-ajout-profil');
  }

  /**
   * Met à jour les désignations selon le type sélectionné (modale ajout/modif)
   * @param {HTMLElement} m — modale
   * @param {string} selTypeId — sélecteur CSS du select type
   * @param {string} selDesigId — sélecteur CSS du select désignation
   */
  function _apMajDesig(m, selTypeId = '#ap-type', selDesigId = '#ap-desig') {
    const selType  = m.querySelector(selTypeId);
    const selDesig = m.querySelector(selDesigId);
    if (!selType || !selDesig) return;

    const type = selType.value;
    selDesig.innerHTML = '<option value="">— Choisir —</option>';

    if (!type) {
      const schema = m.querySelector('[id$="-schema"]');
      if (schema) schema.style.display = 'none';
      return;
    }

    // Chercher les désignations dans sections.json — taille seule (ex: "140", "200")
    // sections.json stocke desig = "IPE A 140" → on extrait la partie après la série
    let desigs = [];
    if (_sections) {
      _sections.standard.forEach(f => {
        f.sections.forEach(s => {
          if (s.serie === type) {
            // Extraire la taille : supprimer le préfixe série + espace
            const taille = s.desig.startsWith(type + ' ')
              ? s.desig.slice(type.length + 1)
              : s.desig;
            if (!desigs.includes(taille)) desigs.push(taille);
          }
        });
      });
    }

    if (!desigs.length) {
      // Fallback : désignations déjà en stock
      desigs = [...new Set(
        _data.barres
          .filter(b => b.categorie === 'profil' && b.section_type === type)
          .map(b => b.designation)
      )].sort((a, b) => parseFloat(a) - parseFloat(b));
    }

    desigs.forEach(d => {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      selDesig.appendChild(o);
    });
  }

  /**
   * Affiche le schéma SVG et les dimensions selon type + désignation
   * @param {HTMLElement} m — modale
   * @param {string} selTypeId
   * @param {string} selDesigId
   */
  function _apMajSchema(m, selTypeId = '#ap-type', selDesigId = '#ap-desig') {
    const type  = m.querySelector(selTypeId)?.value;
    const desig = m.querySelector(selDesigId)?.value;

    const zoneSchema = m.querySelector('[id$="-schema"]');
    if (!zoneSchema || !type || !desig) {
      if (zoneSchema) zoneSchema.style.display = 'none';
      return;
    }

    zoneSchema.style.display = 'flex';

    // Libellé
    const label = zoneSchema.querySelector('[id$="-schema-label"]');
    if (label) label.textContent = `${type} ${desig}`;

    // Image / SVG — même logique que la fiche section
    const SERIES_IMAGES = {
      'IPE': 'IPE.png', 'IPE A': 'IPEA.png', 'IPE O': 'IPEO.png',
      'IPE 750': 'IPE750.png', 'IPN': 'IPN.png',
      'HEA': 'HEA.png', 'HEA A': 'HEAA.png', 'HEB': 'HEB.png', 'HEM': 'HEM.png',
      'UPN': 'UPN.png', 'UPE': 'UPE.png',
      'L égale': 'Le.png', 'L inégale': 'Li.png',
    };
    const nomFichier = SERIES_IMAGES[type] || null;
    const img   = zoneSchema.querySelector('[id$="-img"]');
    const svgEl = zoneSchema.querySelector('svg');

    if (nomFichier && img) {
      img.src          = `../assets/profils/${nomFichier}`;
      img.alt          = `${type} ${desig}`;
      img.dataset.zoom = '0';
      img.style.cursor = 'zoom-in';
      img.style.display = 'block';
      img.onclick      = () => _zoomImage(img);
      if (svgEl) svgEl.style.display = 'none';

      img.onerror = function() {
        this.style.display = 'none';
        if (svgEl) {
          while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
          _dessinerSVGComplet(svgEl, type);
          svgEl.style.display = 'block';
        }
      };
    } else {
      if (img) img.style.display = 'none';
      if (svgEl) {
        while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
        _dessinerSVGComplet(svgEl, type);
        svgEl.style.display = 'block';
      }
    }

    // Dimensions
    const dimsList = zoneSchema.querySelector('[id$="-dims-list"]');
    if (dimsList) {
      const dims = _getDims(type, desig);
      _rendreDimsList(dimsList, dims);
      m.dataset.poidsml = dims ? dims.pml : '';
    }

    // Recalcul poids barre
    _apMajPoids(m);

    // Afficher l'ID généré si c'est la modale d'ajout (pas de modification)
    const zoneId  = document.getElementById('ap-zone-id');
    const spanId  = document.getElementById('ap-id-genere');
    if (zoneId && spanId && m.id === 'm-ajout-profil') {
      const nouvelId = _genererIdBarre();
      spanId.textContent    = nouvelId;
      m.dataset.idPrevu     = nouvelId; // mémorisé pour la soumission
      zoneId.style.display  = 'block';
    }
  }

  /**
   * Recalcule et affiche le poids de la barre
   * @param {HTMLElement} m — modale
   * @param {string} inpId — sélecteur de l'input longueur
   */
  function _apMajPoids(m, inpId = '#ap-longueur') {
    const inpLong = m.querySelector(inpId);
    const spanPoids = m.querySelector('[id$="-poids-calc"]');
    if (!inpLong || !spanPoids) return;

    const longueur = parseFloat(inpLong.value);
    const poidsml  = parseFloat(m.dataset.poidsml);

    if (!isNaN(longueur) && longueur > 0 && !isNaN(poidsml) && poidsml > 0) {
      spanPoids.textContent = `${(longueur * poidsml).toFixed(1)} kg`;
      spanPoids.style.color = 'var(--vert)';
    } else {
      spanPoids.textContent = '—';
      spanPoids.style.color = '#aaa';
    }
  }

  /**
   * Soumet le formulaire d'ajout de profilé
   * @param {HTMLElement} m — modale
   */
  async function _soumettreAjoutProfil(m) {
    const type    = m.querySelector('#ap-type')?.value?.trim();
    const desig   = m.querySelector('#ap-desig')?.value?.trim();
    const longueur = parseFloat(m.querySelector('#ap-longueur')?.value);
    const chantier = m.querySelector('#ap-chantier')?.value?.trim();
    const lieu     = m.querySelector('#ap-lieu')?.value?.trim();
    const dispo    = m.querySelector('#ap-dispo')?.value || 'disponible';
    const commentaire = m.querySelector('#ap-commentaire')?.value?.trim() || '';

    // Validation
    if (!type)         return _signalerErreur(m, '#ap-type', 'Le type de section est obligatoire');
    if (!desig)        return _signalerErreur(m, '#ap-desig', 'La désignation est obligatoire');
    if (!longueur || longueur <= 0) return _signalerErreur(m, '#ap-longueur', 'La longueur est obligatoire');

    const session = Auth.getSession();
    const isAdmin = Auth.hasRight('can_validate');

    // Récupérer le poids/ml depuis les données ou la modale
    const poidsml = parseFloat(m.dataset.poidsml) || 0;
    const poidsBarre = poidsml > 0 ? Math.round(longueur * poidsml * 10) / 10 : null;

    // Utiliser l'ID déjà affiché à l'opérateur — sinon en générer un nouveau
    const nouvelleId = m.dataset.idPrevu || _genererIdBarre();

    /** @type {Object} Structure identique à stock.json */
    const barre = {
      id: nouvelleId,
      categorie: 'profil',
      section_type: type,
      designation: desig,
      longueur_m: longueur,
      poids_ml: poidsml,
      poids_barre_kg: poidsBarre,
      chantier_origine: chantier || 'Non renseigné',
      lieu_stockage: lieu,
      disponibilite: dispo,
      chantier_affectation: null,
      statut: isAdmin ? 'valide' : 'en_attente',
      date_ajout: _dateAujourdhui(),
      ajoute_par: session?.identifiant || 'inconnu',
      valide_par: isAdmin ? session?.identifiant : null,
      date_validation: isAdmin ? _dateAujourdhui() : null,
      commentaire
    };

    await _persisterElement(barre);
    _fermerModale('m-ajout-profil');
    _peuplerFiltres();
    _filtrer();
    _majAlerteAttente();

    const msg = isAdmin
      ? `Profilé ${type} ${desig} ajouté (${nouvelleId})`
      : `Profilé ${type} ${desig} soumis pour validation`;
    _notif(msg, isAdmin ? 'succes' : 'info');
  }


  /* ──────────────────────────────────────────────────────────────
     MODALE AJOUT TÔLE
     ────────────────────────────────────────────────────────────── */

  function _ouvrirModaleAjoutTole() {
    const m = document.getElementById('m-ajout-tole');
    if (!m) return;

    // Réinitialiser
    m.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });

    _remplirSelectLieux(m.querySelector('#at-lieu'));
    _majNoteStatut(m, '.at-note-statut');
    _atMajApercu(m); // reset aperçu

    _ouvrirModale('m-ajout-tole');
  }

  /**
   * Met à jour l'aperçu poids et dimensions dans la modale tôle
   * @param {HTMLElement} m
   */
  function _atMajApercu(m) {
    const ep  = parseFloat(m.querySelector('#at-epaisseur')?.value);
    const lrg = parseFloat(m.querySelector('#at-largeur')?.value);
    const lng = parseFloat(m.querySelector('#at-longueur')?.value);
    const qty = parseInt(m.querySelector('#at-quantite')?.value) || 1;

    const spanEp  = m.querySelector('#at-aff-ep');
    const spanLrg = m.querySelector('#at-aff-lrg');
    const spanLng = m.querySelector('#at-aff-lng');
    const spanQty = m.querySelector('#at-aff-qty');
    const spanPds = m.querySelector('#at-aff-poids');
    const spanTot = m.querySelector('#at-aff-total');

    if (spanEp)  spanEp.textContent  = !isNaN(ep)  ? `${ep} mm`  : '—';
    if (spanLrg) spanLrg.textContent = !isNaN(lrg) ? `${lrg} mm` : '—';
    if (spanLng) spanLng.textContent = !isNaN(lng) ? `${lng} mm` : '—';
    if (spanQty) spanQty.textContent = `${qty} pièce${qty > 1 ? 's' : ''}`;

    // Poids = épaisseur(m) × largeur(m) × longueur(m) × densité acier (kg/dm³ → kg/m³ = 7850)
    if (!isNaN(ep) && !isNaN(lrg) && !isNaN(lng)) {
      const pU = (ep / 1000) * (lrg / 1000) * (lng / 1000) * 7850;
      const pT = pU * qty;
      if (spanPds) { spanPds.textContent = `${pU.toFixed(1)} kg`; spanPds.style.color = 'var(--vert)'; }
      if (spanTot) { spanTot.textContent = `${pT.toFixed(1)} kg`; spanTot.style.color = 'var(--vert)'; }
    } else {
      if (spanPds) { spanPds.textContent = '—'; spanPds.style.color = '#aaa'; }
      if (spanTot) { spanTot.textContent = '—'; spanTot.style.color = '#aaa'; }
    }
  }

  /**
   * Soumet le formulaire d'ajout de tôle
   * @param {HTMLElement} m
   */
  async function _soumettreAjoutTole(m) {
    const ep  = parseFloat(m.querySelector('#at-epaisseur')?.value);
    const lrg = parseFloat(m.querySelector('#at-largeur')?.value);
    const lng = parseFloat(m.querySelector('#at-longueur')?.value);
    const qty = parseInt(m.querySelector('#at-quantite')?.value) || 1;
    const chantier    = m.querySelector('#at-chantier')?.value?.trim();
    const lieu        = m.querySelector('#at-lieu')?.value?.trim();
    const dispo       = m.querySelector('#at-dispo')?.value || 'disponible';
    const commentaire = m.querySelector('#at-commentaire')?.value?.trim() || '';

    // Validation
    if (isNaN(ep)  || ep  <= 0) return _signalerErreur(m, '#at-epaisseur', 'L\'épaisseur est obligatoire');
    if (isNaN(lrg) || lrg <= 0) return _signalerErreur(m, '#at-largeur',   'La largeur est obligatoire');
    if (isNaN(lng) || lng <= 0) return _signalerErreur(m, '#at-longueur',  'La longueur est obligatoire');

    const session = Auth.getSession();
    const isAdmin = Auth.hasRight('can_validate');

    const poidsU = Math.round(((ep/1000)*(lrg/1000)*(lng/1000)*7850)*10)/10;
    const poidsT = Math.round(poidsU * qty * 10) / 10;
    const nouvelleId = _genererIdTole();

    /** @type {Object} Structure identique à stock.json (tôle) */
    const tole = {
      id: nouvelleId,
      categorie: 'tole',
      epaisseur_mm: ep,
      largeur_mm: lrg,
      longueur_mm: lng,
      quantite: qty,
      poids_unitaire_kg: poidsU,
      poids_total_kg: poidsT,
      chantier_origine: chantier || 'Non renseigné',
      lieu_stockage: lieu,
      disponibilite: dispo,
      chantier_affectation: null,
      statut: isAdmin ? 'valide' : 'en_attente',
      date_ajout: _dateAujourdhui(),
      ajoute_par: session?.identifiant || 'inconnu',
      valide_par: isAdmin ? session?.identifiant : null,
      date_validation: isAdmin ? _dateAujourdhui() : null,
      commentaire
    };

    await _persisterElement(tole);
    _fermerModale('m-ajout-tole');
    _peuplerFiltres();
    _filtrer();
    _majAlerteAttente();

    const msg = isAdmin
      ? `Tôle ${ep}mm ajoutée (${nouvelleId})`
      : `Tôle ${ep}mm soumise pour validation`;
    _notif(msg, isAdmin ? 'succes' : 'info');
  }


  /* ──────────────────────────────────────────────────────────────
     MODALE MODIFICATION
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la modale de modification et pré-remplit les champs
   * @param {string} id — id de la barre ou tôle
   */
  function ouvrirModification(id) {
    _selection = _parId(id);
    if (!_selection) return;

    if (_selection.categorie === 'profil') {
      _ouvrirModificationProfil(_selection);
    } else {
      _ouvrirModificationTole(_selection);
    }
  }

  function _ouvrirModificationProfil(barre) {
    const m = document.getElementById('m-modification');
    if (!m) return;

    // En-tête de la modale
    const titre = m.querySelector('.modale-titre');
    if (titre) titre.textContent = `Modifier — ${barre.section_type} ${barre.designation} (${barre.id})`;

    // Remplir les selects
    _remplirSelectType(m.querySelector('#mod-type'));
    _remplirSelectLieux(m.querySelector('#mod-lieu'));

    // Pré-remplir les valeurs
    _setVal(m, '#mod-type',        barre.section_type);
    _apMajDesig(m, '#mod-type', '#mod-desig');  // cascade désignations
    // Après avoir peuplé les désignations, sélectionner la bonne
    setTimeout(() => {
      _setVal(m, '#mod-desig', barre.designation);
      _apMajSchema(m, '#mod-type', '#mod-desig');
    }, 0);

    _setVal(m, '#mod-longueur',   barre.longueur_m);
    _setVal(m, '#mod-chantier',   barre.chantier_origine);
    _setVal(m, '#mod-lieu',       barre.lieu_stockage);
    _setVal(m, '#mod-dispo',      barre.disponibilite);
    _setVal(m, '#mod-affectation', barre.chantier_affectation || '');
    _setVal(m, '#mod-commentaire', barre.commentaire || '');

    // Stocker l'id en cours de modification
    m.dataset.idEnCours  = barre.id;
    m.dataset.categorieEnCours = 'profil';
    m.dataset.poidsml = barre.poids_ml || '';

    // Note selon profil
    _majNoteStatut(m, '.mod-note-statut');

    _ouvrirModale('m-modification');
  }

  function _ouvrirModificationTole(tole) {
    const m = document.getElementById('m-modification');
    if (!m) return;

    // Utiliser le même formulaire mais en mode tôle
    const titre = m.querySelector('.modale-titre');
    if (titre) titre.textContent = `Modifier — Tôle ${tole.epaisseur_mm}mm (${tole.id})`;

    // Masquer les champs profilé, afficher les champs tôle
    const zoneProfil = m.querySelector('.mod-zone-profil');
    const zoneTole   = m.querySelector('.mod-zone-tole');
    if (zoneProfil) zoneProfil.style.display = 'none';
    if (zoneTole)   zoneTole.style.display   = 'block';

    _remplirSelectLieux(m.querySelector('#mod-t-lieu'));

    _setVal(m, '#mod-t-epaisseur',  tole.epaisseur_mm);
    _setVal(m, '#mod-t-largeur',    tole.largeur_mm);
    _setVal(m, '#mod-t-longueur',   tole.longueur_mm);
    _setVal(m, '#mod-t-quantite',   tole.quantite);
    _setVal(m, '#mod-t-chantier',   tole.chantier_origine);
    _setVal(m, '#mod-t-lieu',       tole.lieu_stockage);
    _setVal(m, '#mod-t-dispo',      tole.disponibilite);
    _setVal(m, '#mod-t-commentaire', tole.commentaire || '');

    m.dataset.idEnCours = tole.id;
    m.dataset.categorieEnCours = 'tole';

    _majNoteStatut(m, '.mod-note-statut');
    _ouvrirModale('m-modification');
  }

  /**
   * Soumet la modification
   * @param {HTMLElement} m
   */
  async function _soumettreModification(m) {
    const categorie = m.dataset.categorieEnCours;
    const id        = m.dataset.idEnCours;
    const original  = _parId(id);
    if (!original) return;

    const session = Auth.getSession();
    const isAdmin = Auth.hasRight('can_validate');

    if (categorie === 'profil') {
      const type    = m.querySelector('#mod-type')?.value?.trim();
      const desig   = m.querySelector('#mod-desig')?.value?.trim();
      const longueur = parseFloat(m.querySelector('#mod-longueur')?.value);
      const chantier = m.querySelector('#mod-chantier')?.value?.trim();
      const lieu     = m.querySelector('#mod-lieu')?.value?.trim();
      const dispo    = m.querySelector('#mod-dispo')?.value || 'disponible';
      const affectation = m.querySelector('#mod-affectation')?.value?.trim() || null;
      const commentaire = m.querySelector('#mod-commentaire')?.value?.trim() || '';

      if (!type)   return _signalerErreur(m, '#mod-type',    'Le type est obligatoire');
      if (!desig)  return _signalerErreur(m, '#mod-desig',   'La désignation est obligatoire');
      if (!longueur || longueur <= 0) return _signalerErreur(m, '#mod-longueur', 'La longueur est obligatoire');

      const poidsml   = parseFloat(m.dataset.poidsml) || original.poids_ml || 0;
      const poidsBarre = poidsml > 0 ? Math.round(longueur * poidsml * 10) / 10 : original.poids_barre_kg;

      /** @type {Object} Barre modifiée — Gestion repasse en en_attente */
      const modif = {
        ...original,
        section_type: type,
        designation: desig,
        longueur_m: longueur,
        poids_ml: poidsml,
        poids_barre_kg: poidsBarre,
        chantier_origine: chantier || original.chantier_origine,
        lieu_stockage: lieu,
        disponibilite: dispo,
        chantier_affectation: affectation,
        commentaire,
        // Gestion → en_attente / Admin → valide direct
        statut: isAdmin ? 'valide' : 'en_attente',
        valide_par: isAdmin ? session?.identifiant : null,
        date_validation: isAdmin ? _dateAujourdhui() : null,
        date_modif: _dateAujourdhui(),
        modifie_par: session?.identifiant || 'inconnu'
      };

      await _persisterElement(modif);

    } else {
      // Modification tôle
      const ep  = parseFloat(m.querySelector('#mod-t-epaisseur')?.value);
      const lrg = parseFloat(m.querySelector('#mod-t-largeur')?.value);
      const lng = parseFloat(m.querySelector('#mod-t-longueur')?.value);
      const qty = parseInt(m.querySelector('#mod-t-quantite')?.value) || 1;
      const chantier    = m.querySelector('#mod-t-chantier')?.value?.trim();
      const lieu        = m.querySelector('#mod-t-lieu')?.value?.trim();
      const dispo       = m.querySelector('#mod-t-dispo')?.value || 'disponible';
      const commentaire = m.querySelector('#mod-t-commentaire')?.value?.trim() || '';

      if (isNaN(ep)  || ep  <= 0) return _signalerErreur(m, '#mod-t-epaisseur', 'L\'épaisseur est obligatoire');
      if (isNaN(lrg) || lrg <= 0) return _signalerErreur(m, '#mod-t-largeur',   'La largeur est obligatoire');
      if (isNaN(lng) || lng <= 0) return _signalerErreur(m, '#mod-t-longueur',  'La longueur est obligatoire');

      const poidsU = Math.round(((ep/1000)*(lrg/1000)*(lng/1000)*7850)*10)/10;
      const poidsT = Math.round(poidsU * qty * 10) / 10;

      const modif = {
        ...original,
        epaisseur_mm: ep,
        largeur_mm: lrg,
        longueur_mm: lng,
        quantite: qty,
        poids_unitaire_kg: poidsU,
        poids_total_kg: poidsT,
        chantier_origine: chantier || original.chantier_origine,
        lieu_stockage: lieu,
        disponibilite: dispo,
        commentaire,
        statut: isAdmin ? 'valide' : 'en_attente',
        valide_par: isAdmin ? session?.identifiant : null,
        date_validation: isAdmin ? _dateAujourdhui() : null,
        date_modif: _dateAujourdhui(),
        modifie_par: session?.identifiant || 'inconnu'
      };

      await _persisterElement(modif);
    }

    // Réafficher la zone correcte
    const zoneProfil = m.querySelector('.mod-zone-profil');
    const zoneTole   = m.querySelector('.mod-zone-tole');
    if (zoneProfil) zoneProfil.style.display = '';
    if (zoneTole)   zoneTole.style.display   = 'none';

    _fermerModale('m-modification');
    _filtrer();
    _majAlerteAttente();

    const msg = isAdmin ? 'Modification enregistrée' : 'Modification soumise pour validation';
    _notif(msg, isAdmin ? 'succes' : 'info');
  }


  /* ──────────────────────────────────────────────────────────────
     MODALE DEMANDE D'ATTRIBUTION
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la modale de demande d'attribution
   * @param {string} id
   */
  function ouvrirDemande(id) {
    _selection = _parId(id);
    if (!_selection) return;

    const m = document.getElementById('m-demande');
    if (!m) return;

    // Réinitialiser les champs
    m.querySelectorAll('input, textarea').forEach(el => el.value = '');

    // Pré-remplir le résumé de la barre
    const infoZone = m.querySelector('#dem-info-barre');
    if (infoZone) {
      if (_selection.categorie === 'profil') {
        infoZone.innerHTML = `
          <strong>${_e(_selection.section_type)} ${_e(_selection.designation)}</strong>
          — ${_selection.longueur_m.toFixed(2)} m
          — ${_e(_selection.lieu_stockage)}
          <span class="badge badge-dispo" style="margin-left:6px">Disponible</span>`;
      } else {
        infoZone.innerHTML = `
          <strong>Tôle ${_selection.epaisseur_mm} mm</strong>
          — ${_selection.largeur_mm} × ${_selection.longueur_mm} mm
          — Qté : ${_selection.quantite}
          — ${_e(_selection.lieu_stockage)}
          <span class="badge badge-dispo" style="margin-left:6px">Disponible</span>`;
      }
    }

    // Pré-remplir le demandeur depuis la session
    const session = Auth.getSession();
    const inpDemandeur = m.querySelector('#dem-demandeur');
    if (inpDemandeur && session?.nom) inpDemandeur.value = session.nom;

    m.dataset.idBarre = id;

    _ouvrirModale('m-demande');
  }

  /**
   * Soumet la demande d'attribution
   * @param {HTMLElement} m
   */
  async function _soumettreDemande(m) {
    const demandeur = m.querySelector('#dem-demandeur')?.value?.trim();
    const chantier  = m.querySelector('#dem-chantier')?.value?.trim();
    const commentaire = m.querySelector('#dem-commentaire')?.value?.trim() || '';
    const idBarre   = m.dataset.idBarre;

    if (!demandeur) return _signalerErreur(m, '#dem-demandeur', 'Le nom du demandeur est obligatoire');
    if (!chantier)  return _signalerErreur(m, '#dem-chantier',  'Le chantier est obligatoire');

    const store = _chargerDemandes();
    const nb    = (store.compteur || 0) + 1;

    /** @type {Object} Structure identique à demandes.json */
    const demande = {
      id: `DEM-${String(nb).padStart(4, '0')}`,
      id_barre: idBarre,
      demandeur,
      chantier_demande: chantier,
      commentaire,
      statut: 'en_attente',
      date_demande: _dateAujourdhui(),
      demande_par: Auth.getSession()?.identifiant || 'visiteur'
    };

    await _persisterDemande(demande);
    _fermerModale('m-demande');
    _notif(`Demande ${demande.id} envoyée — en attente de validation admin`, 'info');
  }


  /* ──────────────────────────────────────────────────────────────
     MODALE DÉTAIL TÔLE
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la fiche détail d'une tôle
   * @param {string} id
   */
  function ouvrirDetailTole(id) {
    _selection = _parId(id);
    if (!_selection) return;

    const m = document.getElementById('m-detail-tole');
    if (!m) return;

    const t = _selection;

    // Titre
    const titre = m.querySelector('.modale-titre');
    if (titre) titre.textContent = `Fiche tôle — ${t.id}`;

    // Infos
    _afficherInfo(m, '#dtole-epaisseur',  `${t.epaisseur_mm} mm`);
    _afficherInfo(m, '#dtole-largeur',    `${t.largeur_mm} mm`);
    _afficherInfo(m, '#dtole-longueur',   `${t.longueur_mm} mm`);
    _afficherInfo(m, '#dtole-quantite',   `${t.quantite} pièce${t.quantite > 1 ? 's' : ''}`);
    _afficherInfo(m, '#dtole-poids-u',    `${t.poids_unitaire_kg.toFixed(1)} kg`);
    _afficherInfo(m, '#dtole-poids-t',    `${t.poids_total_kg.toFixed(1)} kg`);
    _afficherInfo(m, '#dtole-chantier',   t.chantier_origine);
    _afficherInfo(m, '#dtole-lieu',       t.lieu_stockage);
    _afficherInfo(m, '#dtole-date',       t.date_ajout || '—');
    _afficherInfo(m, '#dtole-commentaire', t.commentaire || '—');

    // Badge dispo
    const zoneDispo = m.querySelector('#dtole-dispo');
    if (zoneDispo) zoneDispo.innerHTML = _badgeDispo(t);

    // Bouton modifier — conditionnel
    const btnModif = m.querySelector('#dtole-btn-modifier');
    if (btnModif) {
      const canModif = Auth.hasRight('can_edit');
      btnModif.style.display = canModif ? '' : 'none';
      btnModif.onclick = () => {
        _fermerModale('m-detail-tole');
        ouvrirModification(id);
      };
    }

    _ouvrirModale('m-detail-tole');
  }


  /* ──────────────────────────────────────────────────────────────
     ACTIONS PUBLIQUES
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la modale fiche section directement depuis le stock
   * Remplace la redirection vers bibliotheque.html (Conv. 5 patch)
   * @param {string} type  — ex : 'IPE'
   * @param {string} desig — ex : '200'
   */
  function ouvrirFicheSection(type, desig) {
    const m = document.getElementById('m-fiche-section');
    if (!m) return;

    /* Titre */
    const titre = m.querySelector('.modale-titre');
    if (titre) titre.textContent = `Fiche section — ${type} ${desig}`;

    /* Badge norme + description */
    const badgeNorme = m.querySelector('#fiche-badge-norme');
    const descNorme  = m.querySelector('#fiche-desc-norme');
    const NORMES = {
      'IPE':       { norme: 'EN 10034',    desc: 'Profilé en I à ailes parallèles' },
      'IPE A':     { norme: 'EN 10034',    desc: 'Profilé en I à ailes parallèles — série A' },
      'IPE O':     { norme: 'EN 10034',    desc: 'Profilé en I à ailes parallèles — série O' },
      'IPN':       { norme: 'EN 10024',    desc: 'Profilé en I à ailes inclinées' },
      'HEA':       { norme: 'EN 10034',    desc: 'Profilé en H à larges ailes — série A' },
      'HEB':       { norme: 'EN 10034',    desc: 'Profilé en H à larges ailes — série B' },
      'HEM':       { norme: 'EN 10034',    desc: 'Profilé en H à larges ailes — série M' },
      'UPN':       { norme: 'EN 10279',    desc: 'Profilé en U à ailes inclinées' },
      'UPE':       { norme: 'EN 10279',    desc: 'Profilé en U à ailes parallèles' },
      'Cornière':  { norme: 'EN 10056-1',  desc: 'Cornière à ailes égales ou inégales' },
      'L égale':   { norme: 'EN 10056-1',  desc: 'Cornière à ailes égales' },
      'L inégale': { norme: 'EN 10056-1',  desc: 'Cornière à ailes inégales' },
      'Plat':      { norme: 'EN 10058',    desc: 'Plat laminé à chaud' },
    };
    const info = NORMES[type] || { norme: 'Section normalisée', desc: '' };
    if (badgeNorme) badgeNorme.textContent = info.norme;
    if (descNorme)  descNorme.textContent  = info.desc;

    /* Image de la section — avec fallback SVG si fichier absent */
    const zoneVisuel = m.querySelector('#fiche-visuel');
    if (zoneVisuel) {
      // type = série directe (ex: "IPE", "IPE A", "HEA A", "L égale"...)
      // Correspondance série → fichier image dans assets/profils/
      const SERIES_IMAGES = {
        'IPE':       'IPE.png',
        'IPE A':     'IPEA.png',
        'IPE O':     'IPEO.png',
        'IPE 750':   'IPE750.png',
        'IPN':       'IPN.png',
        'HEA':       'HEA.png',
        'HEA A':     'HEAA.png',
        'HEB':       'HEB.png',
        'HEM':       'HEM.png',
        'UPN':       'UPN.png',
        'UPE':       'UPE.png',
        'L égale':   'Le.png',
        'L inégale': 'Li.png',
      };

      const nomFichier = SERIES_IMAGES[type] || null;

      const img   = zoneVisuel.querySelector('#fiche-img');
      const svgEl = zoneVisuel.querySelector('#fiche-svg');

      if (nomFichier && img) {
        // Afficher l'image — masquer le SVG
        img.src = `../assets/profils/${nomFichier}`;
        img.alt = `Section ${desig}`;
        img.style.display  = 'block';
        img.style.cursor   = 'zoom-in';
        img.dataset.zoom   = '0';
        img.onclick        = () => _zoomImage(img);
        if (svgEl) svgEl.style.display = 'none';

        // Fallback SVG si l'image ne charge pas
        img.onerror = function() {
          this.style.display = 'none';
          if (svgEl) {
            while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
            _dessinerSVGComplet(svgEl, type);
            svgEl.style.display = 'block';
          }
        };
      } else {
        // Pas d'image disponible — garder le SVG généré
        if (img) img.style.display = 'none';
        if (svgEl) {
          while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
          _dessinerSVGComplet(svgEl, type);
          svgEl.style.display = 'block';
        }
      }
    }

    /* Label schéma */
    const schemaLabel = m.querySelector('#fiche-schema-label');
    if (schemaLabel) schemaLabel.textContent = `${desig}`;

    /* Dimensions */
    const dimsList = m.querySelector('#fiche-dims-list');
    if (dimsList) _rendreDimsList(dimsList, _getDims(type, desig));

    /* Inventaire rapide depuis le stock courant */
    const stockInfo = m.querySelector('#fiche-stock-info');
    if (stockInfo && _data) {
      const barres = _data.barres.filter(b =>
        b.categorie === 'profil' &&
        b.section_type === type &&
        b.designation === desig &&
        b.statut === 'valide'
      );
      const nbDispo = barres.filter(b => b.disponibilite === 'disponible').length;
      const nbAff   = barres.length - nbDispo;
      stockInfo.innerHTML = barres.length > 0
        ? `<strong>En stock :</strong> ${nbDispo} barre${nbDispo > 1 ? 's' : ''} disponible${nbDispo > 1 ? 's' : ''} · ${nbAff} affectée${nbAff > 1 ? 's' : ''}`
        : `<strong>En stock :</strong> aucune barre de ce type actuellement`;
    }

    m.classList.add('open');
  }

  /* ──────────────────────────────────────────────────────────────
     VALIDATION ADMIN — Conv. 6
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la modale de validation appropriée selon le type d'élément
   * Distingue : ajout/modif stock (BAR/TOL) vs demande d'attribution (DEM)
   * @param {string} id — identifiant BAR-XXXX, TOL-XXXX ou DEM-XXXX
   */
  async function validerElement(id) {
    if (id.startsWith('DEM-')) {
      // Validation d'une demande d'attribution
      const store   = _chargerDemandes();
      _selection     = store.demandes.find(d => d.id === id) || null;
      if (!_selection) return _notif('Demande introuvable', 'erreur');
      _remplirValidationDemande(_selection);
      _ouvrirModale('m-valider-demande');
    } else {
      // Validation d'un ajout ou d'une modification de stock
      _selection = _parId(id);
      if (!_selection) return _notif('Élément introuvable', 'erreur');
      _remplirValidationStock(_selection);
      _ouvrirModale('m-valider-stock');
    }
  }

  /**
   * Ouvre la modale de confirmation de refus
   * @param {string} id — identifiant BAR-XXXX, TOL-XXXX ou DEM-XXXX
   */
  async function refuserElement(id) {
    if (id.startsWith('DEM-')) {
      const store = _chargerDemandes();
      _selection   = store.demandes.find(d => d.id === id) || null;
    } else {
      _selection = _parId(id);
    }
    if (!_selection) return _notif('Élément introuvable', 'erreur');
    _remplirConfirmationRefus(_selection);
    _ouvrirModale('m-confirmation');
  }

  /**
   * Remplit la modale m-valider-stock avec les données de l'élément sélectionné
   * @param {Object} el — barre ou tôle en statut en_attente
   */
  function _remplirValidationStock(el) {
    const m = document.getElementById('m-valider-stock');
    if (!m) return;

    // Titre dynamique selon catégorie
    const titre = m.querySelector('.modale-titre');
    if (titre) titre.textContent = el.categorie === 'profil'
      ? `Valider l'ajout — ${el.section_type} ${el.designation}`
      : `Valider l'ajout — Tôle ${el.epaisseur_mm} mm`;

    // Stocker l'id pour la confirmation
    m.dataset.idEnCours = el.id;

    // Remplir le récapitulatif
    const recap = m.querySelector('#vstock-recap');
    if (!recap) return;

    const session = el.ajoute_par || '—';
    const date    = el.date_ajout || el.date_modif || '—';
    const typeOp  = el.date_modif ? 'Modification' : 'Ajout';

    if (el.categorie === 'profil') {
      const poids = el.poids_barre_kg ? `${el.poids_barre_kg.toFixed(1)} kg` : '—';
      recap.innerHTML = `
        <div class="dim-row"><span class="dim-label">Opération</span><span class="dim-val">${typeOp}</span></div>
        <div class="dim-row"><span class="dim-label">Référence</span><span class="dim-val">${_e(el.id)}</span></div>
        <div class="dim-row"><span class="dim-label">Section</span><span class="dim-val">${_e(el.section_type)} ${_e(el.designation)}</span></div>
        <div class="dim-row"><span class="dim-label">Longueur</span><span class="dim-val">${el.longueur_m.toFixed(2)} m</span></div>
        <div class="dim-row"><span class="dim-label">Poids barre</span><span class="dim-val">${poids}</span></div>
        <div class="dim-row"><span class="dim-label">Chantier origine</span><span class="dim-val">${_e(el.chantier_origine)}</span></div>
        <div class="dim-row"><span class="dim-label">Lieu stockage</span><span class="dim-val">${_e(el.lieu_stockage)}</span></div>
        <div class="dim-row"><span class="dim-label">Disponibilité</span><span class="dim-val">${el.disponibilite === 'disponible' ? 'Disponible' : 'Affecté'}</span></div>
        <div class="dim-row"><span class="dim-label">Soumis par</span><span class="dim-val">${_e(session)}</span></div>
        <div class="dim-row"><span class="dim-label">Date</span><span class="dim-val">${_e(date)}</span></div>
        ${el.commentaire ? `<div class="dim-row"><span class="dim-label">Commentaire</span><span class="dim-val">${_e(el.commentaire)}</span></div>` : ''}`;
    } else {
      recap.innerHTML = `
        <div class="dim-row"><span class="dim-label">Opération</span><span class="dim-val">${typeOp}</span></div>
        <div class="dim-row"><span class="dim-label">Référence</span><span class="dim-val">${_e(el.id)}</span></div>
        <div class="dim-row"><span class="dim-label">Épaisseur</span><span class="dim-val">${el.epaisseur_mm} mm</span></div>
        <div class="dim-row"><span class="dim-label">Dimensions</span><span class="dim-val">${el.largeur_mm} × ${el.longueur_mm} mm</span></div>
        <div class="dim-row"><span class="dim-label">Quantité</span><span class="dim-val">${el.quantite} pièce${el.quantite > 1 ? 's' : ''}</span></div>
        <div class="dim-row"><span class="dim-label">Poids unitaire</span><span class="dim-val">${el.poids_unitaire_kg.toFixed(1)} kg</span></div>
        <div class="dim-row"><span class="dim-label">Chantier origine</span><span class="dim-val">${_e(el.chantier_origine)}</span></div>
        <div class="dim-row"><span class="dim-label">Lieu stockage</span><span class="dim-val">${_e(el.lieu_stockage)}</span></div>
        <div class="dim-row"><span class="dim-label">Soumis par</span><span class="dim-val">${_e(session)}</span></div>
        <div class="dim-row"><span class="dim-label">Date</span><span class="dim-val">${_e(date)}</span></div>`;
    }
  }

  /**
   * Remplit la modale m-valider-demande avec les données de la demande
   * @param {Object} dem — demande d'attribution en statut en_attente
   */
  function _remplirValidationDemande(dem) {
    const m = document.getElementById('m-valider-demande');
    if (!m) return;

    m.dataset.idEnCours = dem.id;

    // Récupérer la barre concernée
    const barre = _parId(dem.id_barre);

    const recap = m.querySelector('#vdem-recap');
    if (!recap) return;

    const descBarre = barre
      ? (barre.categorie === 'profil'
          ? `${barre.section_type} ${barre.designation} — ${barre.longueur_m.toFixed(2)} m — ${barre.lieu_stockage}`
          : `Tôle ${barre.epaisseur_mm} mm — ${barre.largeur_mm}×${barre.longueur_mm} mm — ${barre.lieu_stockage}`)
      : `Référence : ${dem.id_barre} (introuvable dans le stock actuel)`;

    recap.innerHTML = `
      <div class="dim-row"><span class="dim-label">Demande</span><span class="dim-val">${_e(dem.id)}</span></div>
      <div class="dim-row"><span class="dim-label">Demandeur</span><span class="dim-val">${_e(dem.demandeur)}</span></div>
      <div class="dim-row"><span class="dim-label">Chantier demandé</span><span class="dim-val">${_e(dem.chantier_demande)}</span></div>
      <div class="dim-row"><span class="dim-label">Élément concerné</span><span class="dim-val">${_e(descBarre)}</span></div>
      <div class="dim-row"><span class="dim-label">Date de demande</span><span class="dim-val">${_e(dem.date_demande)}</span></div>
      ${dem.commentaire ? `<div class="dim-row"><span class="dim-label">Commentaire</span><span class="dim-val">${_e(dem.commentaire)}</span></div>` : ''}`;
  }

  /**
   * Remplit la modale m-confirmation pour un refus
   * @param {Object} el — barre, tôle ou demande
   */
  function _remplirConfirmationRefus(el) {
    const m = document.getElementById('m-confirmation');
    if (!m) return;

    m.dataset.idEnCours = el.id;

    // Réinitialiser le textarea motif
    const textarea = m.querySelector('#conf-motif');
    if (textarea) textarea.value = '';

    // Message de confirmation
    const msg = m.querySelector('#conf-message');
    if (!msg) return;

    if (el.id.startsWith('DEM-')) {
      msg.textContent = `Confirmer le refus de la demande ${el.id} (${_e(el.demandeur)} — ${_e(el.chantier_demande)}) ?`;
    } else if (el.categorie === 'profil') {
      msg.textContent = `Confirmer le refus de l'élément ${el.id} (${el.section_type} ${el.designation} — ${el.longueur_m.toFixed(2)} m) ?`;
    } else {
      msg.textContent = `Confirmer le refus de l'élément ${el.id} (Tôle ${el.epaisseur_mm} mm) ?`;
    }
  }

  /**
   * Exécute la validation d'un élément stock (BAR/TOL)
   * Appelée par le bouton Valider de m-valider-stock
   */
  async function _confirmerValidationStock() {
    const m = document.getElementById('m-valider-stock');
    if (!m) return;
    const id = m.dataset.idEnCours;
    if (!id) return;

    const el = _parId(id);
    if (!el) return _notif('Élément introuvable', 'erreur');

    const session = Auth.getSession();

    // Mise à jour du statut
    const valide = {
      ...el,
      statut: 'valide',
      valide_par: session?.identifiant || 'admin',
      date_validation: _dateAujourdhui()
    };

    await _persisterElement(valide);
    _fermerModale('m-valider-stock');
    _filtrer();
    _majAlerteAttente();

    _notif(`${id} validé avec succès`, 'succes');
  }

  /**
   * Exécute la validation d'une demande d'attribution (DEM)
   * Appelée par le bouton Valider de m-valider-demande
   */
  async function _confirmerValidationDemande() {
    const m = document.getElementById('m-valider-demande');
    if (!m) return;
    const idDem = m.dataset.idEnCours;
    if (!idDem) return;

    const dem = _demandes.find(d => d.id === idDem);
    if (!dem) return _notif('Demande introuvable', 'erreur');

    const session = Auth.getSession();
    const demMAJ = {
      ...dem,
      statut: 'valide',
      date_traitement: _dateAujourdhui(),
      traite_par: session?.identifiant || 'admin'
    };

    // Persister la demande mise à jour dans Supabase
    try {
      await window.SB.upsert('demandes', demMAJ);
    } catch(e) {
      console.warn('[Stock] Supabase indisponible pour la demande :', e);
      const store = _chargerDemandes();
      const idx = store.demandes.findIndex(d => d.id === idDem);
      if (idx !== -1) { store.demandes[idx] = demMAJ; } else { store.demandes.push(demMAJ); }
      try { localStorage.setItem(CLE_DEMANDES, JSON.stringify(store)); } catch {}
    }

    // Mettre à jour la barre → affectée au chantier demandé
    const barre = _parId(dem.id_barre);
    if (barre) {
      const barreMAJ = {
        ...barre,
        disponibilite: 'affecte',
        chantier_affectation: dem.chantier_demande,
        statut: 'valide',
        date_modif: _dateAujourdhui(),
        modifie_par: session?.identifiant || 'admin'
      };
      await _persisterElement(barreMAJ);
    }

    // Rafraîchir la liste des demandes en mémoire
    try {
      const demandes = await window.SB.lire('demandes');
      _demandes = demandes.filter(d => d.statut === 'en_attente');
    } catch(e) {
      _demandes = _chargerDemandes().demandes.filter(d => d.statut === 'en_attente');
    }

    _fermerModale('m-valider-demande');
    _filtrer();
    _majAlerteAttente();
    _notif(`Demande ${idDem} validée — barre affectée à "${dem.chantier_demande}"`, 'succes');
  }

  /**
   * Exécute le refus d'un élément (stock ou demande)
   * Appelée par le bouton Confirmer le refus de m-confirmation
   */
  async function _confirmerRefus() {
    const m = document.getElementById('m-confirmation');
    if (!m) return;
    const id    = m.dataset.idEnCours;
    const motif = m.querySelector('#conf-motif')?.value?.trim() || '';
    if (!id) return;

    const session = Auth.getSession();

    if (id.startsWith('DEM-')) {
      const dem = _demandes.find(d => d.id === id);
      if (dem) {
        const demRefus = {
          ...dem,
          statut: 'refuse',
          motif_refus: motif,
          date_traitement: _dateAujourdhui(),
          traite_par: session?.identifiant || 'admin'
        };
        try {
          await window.SB.upsert('demandes', demRefus);
        } catch(e) {
          const store = _chargerDemandes();
          const idx = store.demandes.findIndex(d => d.id === id);
          if (idx !== -1) { store.demandes[idx] = demRefus; } else { store.demandes.push(demRefus); }
          try { localStorage.setItem(CLE_DEMANDES, JSON.stringify(store)); } catch {}
        }
      }
      try {
        const demandes = await window.SB.lire('demandes');
        _demandes = demandes.filter(d => d.statut === 'en_attente');
      } catch(e) {
        _demandes = _chargerDemandes().demandes.filter(d => d.statut === 'en_attente');
      }
      _fermerModale('m-confirmation');
      _filtrer();
      _notif(`Demande ${id} refusée`, 'info');
    } else {
      const el = _parId(id);
      if (!el) return _notif('Élément introuvable', 'erreur');
      const refuse = {
        ...el,
        statut: 'refuse',
        motif_refus: motif,
        date_validation: _dateAujourdhui(),
        valide_par: session?.identifiant || 'admin'
      };
      await _persisterElement(refuse);
      _fermerModale('m-confirmation');
      _filtrer();
      _majAlerteAttente();
      _notif(`${id} refusé`, 'info');
    }
  }

  /** Retourne l'élément sélectionné */
  function getSelection() { return _selection; }


  /* ──────────────────────────────────────────────────────────────
     HELPERS MODALES
     ────────────────────────────────────────────────────────────── */

  function _ouvrirModale(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('open');
  }

  function _fermerModale(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
    // Nettoyer l'overlay zoom s'il est ouvert
    const overlay = document.getElementById('stock-zoom-overlay');
    if (overlay) {
      overlay.remove();
      // Remettre l'état zoom de l'image à zéro
      const img = document.getElementById('fiche-img');
      if (img) { img.dataset.zoom = '0'; img.style.cursor = 'zoom-in'; }
    }
  }

  /**
   * Affiche la note de statut selon le profil (en_attente ou direct)
   * @param {HTMLElement} m — modale
   * @param {string} selector — sélecteur de la note
   */
  function _majNoteStatut(m, selector) {
    const note = m.querySelector(selector);
    if (!note) return;
    const isAdmin = Auth.hasRight('can_validate');
    note.textContent = isAdmin
      ? '✔ En tant qu\'administrateur, cet enregistrement sera validé directement.'
      : '⏳ Cet enregistrement sera soumis à validation par l\'administrateur.';
    note.className = isAdmin
      ? `note-statut note-statut-direct ${selector.replace('.','')}`
      : `note-statut note-statut-attente ${selector.replace('.','')}`;;
  }

  /**
   * Remplit un select avec les types de sections disponibles
   * @param {HTMLSelectElement} sel
   */
  function _remplirSelectType(sel) {
    if (!sel) return;
    sel.innerHTML = '<option value="">— Choisir —</option>';
    let series = [];

    if (_sections?.standard) {
      // Extraire toutes les séries uniques toutes familles confondues
      // ex : "IPE", "IPE A", "IPE O", "IPN", "HEA", "HEA A", "HEB", "HEM"...
      _sections.standard.forEach(f => {
        f.sections.forEach(s => {
          if (!series.includes(s.serie)) series.push(s.serie);
        });
      });
    } else if (_data?.barres) {
      series = [...new Set(_data.barres
        .filter(b => b.categorie === 'profil')
        .map(b => b.section_type))].sort();
    }

    series.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      sel.appendChild(o);
    });
  }

  /**
   * Remplit un select avec les lieux de stockage
   * @param {HTMLSelectElement} sel
   */
  function _remplirSelectLieux(sel) {
    if (!sel) return;
    sel.innerHTML = '<option value="">— Choisir —</option>';
    LIEUX.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l;
      sel.appendChild(o);
    });
  }

  /**
   * Récupère les dimensions d'une section depuis sections.json
   * @param {string} type
   * @param {string} desig
   * @returns {Object|null}
   */
  function _getDims(type, desig) {
    if (!_sections?.standard) return null;
    // type = série (ex: "IPE A"), desig = taille (ex: "140")
    // sections.json stocke desig complet = "IPE A 140"
    const desigComplete = `${type} ${desig}`;
    for (const famille of _sections.standard) {
      const section = famille.sections.find(s => s.serie === type && s.desig === desigComplete);
      if (section) return section;
    }
    return null;
  }

  /**
   * Affiche la liste des dimensions dans un conteneur
   * @param {HTMLElement} el
   * @param {Object|null} dims
   */
  function _rendreDimsList(el, dims) {
    if (!dims) {
      el.innerHTML = '<div style="color:#aaa;font-size:12px">Dimensions standard — voir bibliothèque</div>';
      return;
    }
    const rows = [];
    if (dims.h   !== undefined) rows.push(['h — Hauteur',       `${dims.h} mm`]);
    if (dims.b   !== undefined) rows.push(['b — Largeur',       `${dims.b} mm`]);
    if (dims.tw  !== undefined) rows.push(['tw — Ép. âme',      `${dims.tw} mm`]);
    if (dims.tf  !== undefined) rows.push(['tf — Ép. aile',     `${dims.tf} mm`]);
    if (dims.r   !== undefined) rows.push(['r — Congé',         `${dims.r} mm`]);
    if (dims.pml !== undefined) rows.push(['Poids/ml',          `${dims.pml} kg/m`]);
    if (dims.A   !== undefined) rows.push(['Section',           `${dims.A} cm²`]);

    el.innerHTML = rows.map(r =>
      `<div class="dim-row"><span class="dim-label">${r[0]}</span><span class="dim-val">${r[1]}</span></div>`
    ).join('');
  }

  /**
   * Dessine le schéma SVG complet selon le type de section
   * @param {SVGElement} svg
   * @param {string} type
   */
  function _dessinerSVGComplet(svg, type) {
    const S = '#333', F = '#c8d4de';
    const e = (tag, attrs) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };

    svg.setAttribute('viewBox', '0 0 160 160');

    if (['IPE','HEA','HEB'].includes(type)) {
      const w  = type === 'IPE' ? 90 : 110;
      const ox = (160 - w) / 2;
      const th = type === 'HEB' ? 16 : 11;
      svg.appendChild(e('rect', { x:ox, y:18, width:w, height:th, fill:F, stroke:S, 'stroke-width':1.5 }));
      svg.appendChild(e('rect', { x:ox, y:142-th, width:w, height:th, fill:F, stroke:S, 'stroke-width':1.5 }));
      svg.appendChild(e('rect', { x:ox+(w/2)-5, y:18+th, width:10, height:142-18-2*th, fill:F, stroke:S, 'stroke-width':1.5 }));
    } else if (type === 'UPN') {
      svg.appendChild(e('rect', { x:40, y:18, width:80, height:10, fill:F, stroke:S, 'stroke-width':1.5 }));
      svg.appendChild(e('rect', { x:40, y:132, width:80, height:10, fill:F, stroke:S, 'stroke-width':1.5 }));
      svg.appendChild(e('rect', { x:40, y:28, width:10, height:104, fill:F, stroke:S, 'stroke-width':1.5 }));
    } else if (type === 'Cornière') {
      svg.appendChild(e('rect', { x:35, y:125, width:90, height:10, fill:F, stroke:S, 'stroke-width':1.5 }));
      svg.appendChild(e('rect', { x:35, y:25,  width:10, height:100, fill:F, stroke:S, 'stroke-width':1.5 }));
    } else if (type === 'Plat') {
      svg.appendChild(e('rect', { x:20, y:65, width:120, height:30, fill:F, stroke:S, 'stroke-width':1.5 }));
    } else if (type === 'Tube □') {
      svg.appendChild(e('rect', { x:25, y:25,  width:110, height:110, fill:F, stroke:S, 'stroke-width':1.5 }));
      svg.appendChild(e('rect', { x:38, y:38,  width:84,  height:84,  fill:'white', stroke:S, 'stroke-width':1.5 }));
    } else if (type === 'Tube ○') {
      svg.appendChild(e('circle', { cx:80, cy:80, r:58, fill:F, stroke:S, 'stroke-width':1.5 }));
      svg.appendChild(e('circle', { cx:80, cy:80, r:45, fill:'white', stroke:S, 'stroke-width':1.5 }));
    }

    // Cote h minimale
    svg.appendChild(e('line', { x1:12, y1:18, x2:12, y2:142, stroke:'#d22323', 'stroke-width':1 }));
    svg.appendChild(e('line', { x1:9,  y1:18, x2:28, y2:18,  stroke:'#d22323', 'stroke-width':1 }));
    svg.appendChild(e('line', { x1:9,  y1:142, x2:28, y2:142, stroke:'#d22323', 'stroke-width':1 }));
    const t = e('text', { x:5, y:80, 'font-size':8, fill:'#d22323', 'font-family':'Tahoma', 'text-anchor':'middle' });
    t.setAttribute('transform', 'rotate(-90,5,80)');
    t.textContent = 'h';
    svg.appendChild(t);
  }

  /** Signale visuellement un champ invalide et affiche un message */
  function _signalerErreur(m, selector, message) {
    const el = m.querySelector(selector);
    if (el) {
      el.style.borderColor = 'var(--rouge)';
      el.focus();
      setTimeout(() => el.style.borderColor = '', 3000);
    }
    _notif(message, 'erreur');
  }

  /** Définit la valeur d'un champ dans la modale */
  function _setVal(m, selector, valeur) {
    const el = m.querySelector(selector);
    if (el) el.value = valeur ?? '';
  }

  /** Injecte du texte dans un conteneur info */
  function _afficherInfo(m, selector, valeur) {
    const el = m.querySelector(selector);
    if (el) el.textContent = valeur ?? '—';
  }

  /** Retourne la date du jour au format ISO (YYYY-MM-DD) */
  function _dateAujourdhui() {
    return new Date().toISOString().split('T')[0];
  }


  /* ──────────────────────────────────────────────────────────────
     UTILITAIRES INTERNES
     ────────────────────────────────────────────────────────────── */

  function _val(id) { return document.getElementById(id)?.value || ''; }

  function _parId(id) { return _data?.barres.find(b => b.id === id) || null; }

  function _e(val) {
    if (val == null) return '';
    return String(val)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _notif(msg, type = 'info') {
    const z = document.getElementById('stock-notif');
    if (!z) return;
    z.className   = `notif notif-${type} notif-visible`;
    z.textContent = msg;
    clearTimeout(z._t);
    z._t = setTimeout(() => { z.className = 'notif'; }, 3500);
  }

  function _erreurChargement(msg) {
    const z = document.getElementById('tableau-stock');
    if (z) z.innerHTML = `
      <div class="erreur-chargement">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <strong>Impossible de charger le stock</strong>
        <p style="margin:10px 0 6px;color:#555">La base de données est inaccessible ou la connexion a échoué.</p>
        <p style="font-size:12px;color:#aaa;margin-bottom:16px">${_e(msg)}</p>
        <button onclick="window.location.reload()"
          style="padding:8px 18px;background:rgb(210,35,42);color:white;border:none;border-radius:3px;cursor:pointer;font-family:Tahoma;font-weight:bold">
          🔄 Réessayer
        </button>
      </div>`;
  }


  /* ──────────────────────────────────────────────────────────────
     MODALE CARTE DE STOCKAGE
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la modale de plan de stockage et met en évidence la zone.
   * @param {string} lieu — nom du lieu de stockage
   */
  function _ouvrirCarte(lieu) {
    const m = document.getElementById('m-carte');
    if (!m) return;

    // Titre
    const titre = m.querySelector('#carte-titre');
    if (titre) titre.textContent = `Emplacement : ${lieu}`;

    // Mettre en évidence la zone correspondante sur le plan SVG
    m.querySelectorAll('.zone-stockage').forEach(z => {
      const actif = z.dataset.zone === lieu;
      z.classList.toggle('zone-active', actif);
      z.classList.toggle('zone-inactive', !actif);
    });

    m.classList.add('open');
  }

  // Exposer _ouvrirCarte globalement (appelée depuis le HTML généré)
  window._ouvrirCarte = _ouvrirCarte;

  /* ──────────────────────────────────────────────────────────────
     SUPPRESSION D'UNE BARRE
     ────────────────────────────────────────────────────────────── */

  /**
   * Ouvre la modale de confirmation de suppression
   * @param {string} id — BAR-XXXX ou TOL-XXXX
   */
  function _ouvrirConfirmationSuppression(id) {
    const el = _parId(id);
    if (!el) return;

    // Remplir le résumé de la barre
    const info = document.getElementById('sup-info-barre');
    if (info) {
      if (el.categorie === 'profil') {
        info.innerHTML = `<strong>${_e(el.id)}</strong> — ${_e(el.section_type)} ${_e(el.designation)} · ${el.longueur_m.toFixed(2)} m · ${_e(el.lieu_stockage)}`;
      } else {
        info.innerHTML = `<strong>${_e(el.id)}</strong> — Tôle ${el.epaisseur_mm} mm · ${el.largeur_mm}×${el.longueur_mm} mm · ${el.quantite} pièce(s) · ${_e(el.lieu_stockage)}`;
      }
    }

    // Mémoriser l'ID pour la confirmation
    const mSup = document.getElementById('m-supprimer');
    if (mSup) mSup.dataset.idEnCours = id;

    // Fermer la modale modification et ouvrir la confirmation
    _fermerModale('m-modification');
    _ouvrirModale('m-supprimer');
  }

  /**
   * Exécute la suppression après confirmation
   */
  async function _confirmerSuppression() {
    const mSup = document.getElementById('m-supprimer');
    if (!mSup) return;

    const id = mSup.dataset.idEnCours;
    if (!id) return;

    // Supprimer de Supabase
    try {
      await window.SB.supprimer('stock', id);
    } catch(e) {
      console.warn('[Stock] Supabase indisponible, suppression locale :', e);
      // Fallback : marquer comme "refuse" en localStorage pour simuler la suppression
      const local = _chargerLocal();
      const idx = local.barres.findIndex(b => b.id === id);
      if (idx !== -1) {
        local.barres.splice(idx, 1);
      } else {
        // Marquer pour exclusion si la barre vient de stock.json
        local.barres.push({ id, _supprime: true });
      }
      _sauvegarderLocal(local);
    }

    // Supprimer de _data en mémoire
    _data.barres = _data.barres.filter(b => b.id !== id);

    _fermerModale('m-supprimer');
    _peuplerFiltres();
    _filtrer();
    _majAlerteAttente();
    _notif(`Élément ${id} supprimé du stock`, 'succes');
  }


  /* ──────────────────────────────────────────────────────────────
     ZOOM IMAGE FICHE SECTION
     ────────────────────────────────────────────────────────────── */

  /**
   * Toggle zoom plein écran sur l'image de la fiche section
   * Identique au comportement de la bibliothèque (mfZoomImage)
   * @param {HTMLImageElement} img
   */
  function _zoomImage(img) {
    const estZoom = img.dataset.zoom === '1';

    if (estZoom) {
      // Retour à la normale
      img.dataset.zoom   = '0';
      img.style.cursor   = 'zoom-in';
      const overlay = document.getElementById('stock-zoom-overlay');
      if (overlay) overlay.remove();
    } else {
      // Créer l'overlay plein écran
      img.dataset.zoom = '1';
      img.style.cursor = 'zoom-out';

      const overlay = document.createElement('div');
      overlay.id = 'stock-zoom-overlay';
      overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.75);
        display:flex; align-items:center; justify-content:center;
        z-index:9999; cursor:zoom-out;`;
      overlay.onclick = () => _zoomImage(img);

      // Image agrandie
      const imgGrande = document.createElement('img');
      imgGrande.src   = img.src;
      imgGrande.alt   = img.alt;
      imgGrande.style.cssText = `
        max-width:90vw; max-height:85vh;
        object-fit:contain; display:block;
        border-radius:4px; box-shadow:0 8px 40px rgba(0,0,0,0.6);`;
      overlay.appendChild(imgGrande);

      // Bouton fermer
      const btnFermer = document.createElement('button');
      btnFermer.textContent = '✕';
      btnFermer.style.cssText = `
        position:absolute; top:16px; right:20px;
        background:rgba(255,255,255,0.15); border:none; color:white;
        font-size:22px; cursor:pointer; border-radius:50%;
        width:36px; height:36px; display:flex; align-items:center; justify-content:center;`;
      btnFermer.onclick = (e) => { e.stopPropagation(); _zoomImage(img); };
      overlay.appendChild(btnFermer);

      document.body.appendChild(overlay);
    }
  }


  /* ──────────────────────────────────────────────────────────────
     API PUBLIQUE
     ────────────────────────────────────────────────────────────── */
  return {
    init,
    ouvrirFicheSection,
    ouvrirModification,
    ouvrirDemande,
    ouvrirDetailTole,
    validerElement,
    refuserElement,
    getSelection,
  };

})();

// Démarrage automatique
document.addEventListener('DOMContentLoaded', () => Stock.init());

/* ============================================================
   GESTION DES COMPTES — comptes.js
   Extrait de views/comptes.html pour intégration dans stock.html.
   Données lues depuis data/users.json
   Modifications persistées dans localStorage (clé lbf_users_modifs)
   Migration SharePoint Conv. 7 : remplacer _chargerUsers / _persisterUsers
   ============================================================ */

// ── État local ───────────────────────────────────────────────
let _users   = [];   // Tableau complet des comptes
let _editId  = null; // ID du compte en cours de modification
let _supId   = null; // ID du compte à supprimer

// ── Clé localStorage ────────────────────────────────────────
const CLE_USERS = 'lbf_users_modifs';

/* ============================================================
   CHARGEMENT DES DONNÉES
   ============================================================ */

/**
 * Charge users.json et fusionne les modifications localStorage.
 */
async function chargerUsers() {
  try {
    _users = await window.SB.lire('users');
  } catch (err) {
    console.warn('[Comptes] Supabase indisponible, fallback JSON :', err);
    try {
      const rep = await fetch('../data/users.json');
      if (!rep.ok) throw new Error('users.json introuvable');
      const data = await rep.json();
      _users = data.users || [];
    } catch(e) {
      afficherNotif('Impossible de charger la liste des comptes.', 'erreur');
      _users = [];
    }
  }
  _rendreTableau();
}

/**
 * Lit les comptes modifiés depuis localStorage.
 * @returns {Array}
 */
function _chargerLocal() {
  try {
    const raw = localStorage.getItem(CLE_USERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persiste un compte (ajout ou modification) dans localStorage.
 * @param {Object} user
 */
async function _persisterUser(user) {
  try {
    await window.SB.upsert('users', user);
  } catch(e) {
    console.warn('[Comptes] Supabase indisponible, fallback localStorage :', e);
    const local = _chargerLocal();
    const idx = local.findIndex(u => u.id === user.id);
    if (idx !== -1) { local[idx] = user; } else { local.push(user); }
    localStorage.setItem(CLE_USERS, JSON.stringify(local));
  }
  // Mettre à jour l'état en mémoire
  const idxData = _users.findIndex(u => u.id === user.id);
  if (idxData !== -1) { _users[idxData] = user; } else { _users.push(user); }
}

/**
 * Génère un nouvel ID de type USR-XXX.
 * @returns {string}
 */
function _genIdUser() {
  const nums = _users
    .map(u => parseInt((u.id || '').replace('USR-', ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'USR-' + String(max + 1).padStart(3, '0');
}

/* ============================================================
   AFFICHAGE DU TABLEAU
   ============================================================ */

/**
 * Rendu du tableau des comptes.
 */
function _rendreTableau() {
  const tbody = document.getElementById('comptes-tbody');
  if (!tbody) return;

  if (!_users.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="zone-vide">Aucun compte trouvé.</td></tr>';
    return;
  }

  const sessionCourante = Auth.getSession();

  tbody.innerHTML = _users.map(u => {
    const estMoi   = (u.id === sessionCourante?.id);
    const estAdmin = (u.profil === 'administration');

    const labelProfil = {
      consultation:   'Consultation',
      gestion:        'Gestion',
      administration: 'Administration',
    };

    const profilHtml = `<span class="profil-label profil-${u.profil}">
      ${labelProfil[u.profil] || u.profil}
    </span>`;

    const statutHtml = u.actif
      ? '<span class="statut-actif">● Actif</span>'
      : '<span class="statut-inactif">○ Désactivé</span>';

    // Bouton supprimer désactivé pour son propre compte
    const btnSup = estMoi
      ? `<button class="btn-ligne bl-supprimer" disabled title="Impossible de supprimer son propre compte">Supprimer</button>`
      : `<button class="btn-ligne bl-supprimer" onclick="ouvrirSuppression('${_esc(u.id)}','${_esc(u.nomComplet)}')">Supprimer</button>`;

    return `<tr>
      <td><strong>${_esc(u.identifiant)}</strong>${estMoi ? ' <span style="color:#aaa;font-size:10px">(vous)</span>' : ''}</td>
      <td>${_esc(u.prenom || '')}</td>
      <td>${_esc(u.nom || u.nomComplet || '')}</td>
      <td>${_esc(u.email || '')}</td>
      <td>${profilHtml}</td>
      <td>${statutHtml}</td>
      <td>
        <button class="btn-ligne bl-modifier" onclick="ouvrirModification('${_esc(u.id)}')">Modifier</button>
        <button class="btn-ligne bl-mdp" onclick="ouvrirChangeMdp('${_esc(u.id)}','${_esc(u.nomComplet || u.nom || '')}')">🔑 MDP</button>
        ${btnSup}
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================
   MODALE CRÉATION
   ============================================================ */

function ouvrirCreation() {
  _editId = null;
  document.getElementById('m-compte-titre').textContent = 'Nouveau compte';
  document.getElementById('mc-identifiant').value = '';
  document.getElementById('mc-prenom').value       = '';
  document.getElementById('mc-nom').value          = '';
  document.getElementById('mc-email').value        = '';
  document.getElementById('mc-profil').value       = 'consultation';
  document.getElementById('mc-mdp').value          = '';
  document.getElementById('mc-mdp2').value         = '';
  document.getElementById('mc-actif').value        = 'true';
  document.getElementById('mc-mdp-zone').style.display  = '';
  document.getElementById('mc-mdp2-zone').style.display = '';
  document.getElementById('m-compte-info').style.display = 'none';
  _cacherErreur('mc-erreur');
  ouvrirM('m-compte');
  document.getElementById('mc-identifiant').focus();
}

/* ============================================================
   MODALE MODIFICATION
   ============================================================ */

function ouvrirModification(id) {
  const u = _users.find(u => u.id === id);
  if (!u) return;

  _editId = id;
  document.getElementById('m-compte-titre').textContent = 'Modifier le compte';
  document.getElementById('mc-identifiant').value = u.identifiant;
  document.getElementById('mc-prenom').value       = u.prenom  || '';
  document.getElementById('mc-nom').value          = u.nom     || u.nomComplet || '';
  document.getElementById('mc-email').value        = u.email   || '';
  document.getElementById('mc-profil').value       = u.profil;
  document.getElementById('mc-actif').value        = String(u.actif);

  // Pas de champs MDP en modification (utiliser modale dédiée)
  document.getElementById('mc-mdp-zone').style.display  = 'none';
  document.getElementById('mc-mdp2-zone').style.display = 'none';

  const info = document.getElementById('m-compte-info');
  info.textContent = 'Pour changer le mot de passe, utilisez le bouton 🔑 MDP dans la liste.';
  info.style.display = 'block';

  _cacherErreur('mc-erreur');
  ouvrirM('m-compte');
}

/* ============================================================
   SAUVEGARDE COMPTE (création + modification)
   ============================================================ */

async function sauvegarderCompte() {
  const identifiant = document.getElementById('mc-identifiant').value.trim();
  const prenom      = document.getElementById('mc-prenom').value.trim();
  const nom         = document.getElementById('mc-nom').value.trim();
  const email       = document.getElementById('mc-email').value.trim();
  const profil      = document.getElementById('mc-profil').value;
  const actif       = document.getElementById('mc-actif').value === 'true';
  const mdp1        = document.getElementById('mc-mdp').value;
  const mdp2        = document.getElementById('mc-mdp2').value;
  const nomComplet  = [prenom, nom].filter(Boolean).join(' ');

  // Validations
  if (!identifiant || !nom) {
    afficherErreurModale('mc-erreur', 'Identifiant et nom sont obligatoires.');
    return;
  }

  // En création, vérifier unicité identifiant
  if (!_editId) {
    const doublon = _users.find(u => u.identifiant.toLowerCase() === identifiant.toLowerCase());
    if (doublon) {
      afficherErreurModale('mc-erreur', 'Cet identifiant est déjà utilisé.');
      return;
    }
    if (!mdp1) {
      afficherErreurModale('mc-erreur', 'Un mot de passe est requis pour créer un compte.');
      return;
    }
    if (mdp1 !== mdp2) {
      afficherErreurModale('mc-erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }
  }

  // Construire l'objet
  let user;
  if (_editId) {
    // Modification — conserver le MDP existant
    user = { ..._users.find(u => u.id === _editId) };
    user.identifiant = identifiant;
    user.prenom      = prenom;
    user.nom         = nom;
    user.email       = email;
    user.nomComplet  = nomComplet;
    user.profil      = profil;
    user.actif       = actif;
  } else {
    // Création — hacher le mot de passe
    const hashMdp = await sha256(mdp1);
    user = {
      id:          _genIdUser(),
      identifiant: identifiant,
      prenom:      prenom,
      nom:         nom,
      email:       email,
      nomComplet:  nomComplet,
      profil:      profil,
      motDePasse:  hashMdp,
      actif:       actif,
    };
  }

  await _persisterUser(user);
  _rendreTableau();
  fermerM('m-compte');
  afficherNotif(_editId ? 'Compte modifié.' : 'Compte créé avec succès.', 'succes');
}

/* ============================================================
   MODALE CHANGEMENT MOT DE PASSE
   ============================================================ */

function ouvrirChangeMdp(id, nom) {
  _editId = id;
  document.getElementById('mdp-nom-compte').textContent = nom;
  document.getElementById('mdp-nouveau').value  = '';
  document.getElementById('mdp-confirme').value = '';
  _cacherErreur('mdp-erreur');
  ouvrirM('m-mdp');
  document.getElementById('mdp-nouveau').focus();
}

async function sauvegarderMdp() {
  const mdp1 = document.getElementById('mdp-nouveau').value;
  const mdp2 = document.getElementById('mdp-confirme').value;

  if (!mdp1) {
    afficherErreurModale('mdp-erreur', 'Le nouveau mot de passe est obligatoire.');
    return;
  }
  if (mdp1 !== mdp2) {
    afficherErreurModale('mdp-erreur', 'Les mots de passe ne correspondent pas.');
    return;
  }
  if (mdp1.length < 6) {
    afficherErreurModale('mdp-erreur', 'Le mot de passe doit contenir au moins 6 caractères.');
    return;
  }

  const user = _users.find(u => u.id === _editId);
  if (!user) return;

  const hashMdp = await sha256(mdp1);
  const userMaj = { ...user, motDePasse: hashMdp };
  await _persisterUser(userMaj);

  fermerM('m-mdp');
  afficherNotif('Mot de passe mis à jour.', 'succes');
}

/* ============================================================
   SUPPRESSION
   ============================================================ */

function ouvrirSuppression(id, nom) {
  _supId = id;
  document.getElementById('sup-nom-compte').textContent = nom;
  ouvrirM('m-supprimer');
}

async function confirmerSuppression() {
  if (!_supId) return;

  try {
    await window.SB.supprimer('users', _supId);
  } catch(e) {
    console.warn('[Comptes] Supabase indisponible, fallback localStorage :', e);
    const user = _users.find(u => u.id === _supId);
    if (user) {
      const local = _chargerLocal();
      local.push({ ...user, _supprime: true });
      localStorage.setItem(CLE_USERS, JSON.stringify(local));
    }
  }

  _users = _users.filter(u => u.id !== _supId);
  _supId = null;

  _rendreTableau();
  fermerM('m-supprimer');
  afficherNotif('Compte supprimé.', 'succes');
}

/* ============================================================
   UTILITAIRES CRYPTO
   ============================================================ */

/**
 * Calcule le hash SHA-256 d'une chaîne via l'API Web Crypto native.
 * @param {string} texte
 * @returns {Promise<string>} hex
 */
async function sha256(texte) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(texte)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ============================================================
   UTILITAIRES UI
   ============================================================ */

function ouvrirM(id) {
  document.getElementById(id).classList.add('open');
}

function fermerM(id) {
  document.getElementById(id).classList.remove('open');
}

function bgClose(e, id) {
  if (e.target === document.getElementById(id)) fermerM(id);
}

function toggleMdp(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const visible = inp.type === 'text';
  inp.type = visible ? 'password' : 'text';
  btn.textContent = visible ? '👁' : '🙈';
}

function afficherErreurModale(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

function _cacherErreur(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('visible');
}

/**
 * Notification temporaire via l'élément #stock-notif partagé dans stock.html.
 * @param {string} msg
 * @param {'succes'|'erreur'|'info'} type
 */
function afficherNotif(msg, type) {
  const z = document.getElementById('stock-notif');
  if (!z) return;
  const t = type === 'succes' ? 'succes' : (type === 'erreur' ? 'alerte' : 'info');
  z.className = `notif notif-${t} notif-visible`;
  z.textContent = msg;
  clearTimeout(z._t);
  z._t = setTimeout(() => { z.className = 'notif'; }, 3500);
}

/**
 * Échappe les caractères HTML pour éviter les injections.
 * @param {string} str
 * @returns {string}
 */
function _esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// chargerUsers() est appelé depuis stock.js lors de l'activation de l'onglet Comptes.

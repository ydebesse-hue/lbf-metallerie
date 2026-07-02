/* ============================================================
   GESTION DES COMPTES — comptes.js
   Intégré dans l'onglet Administration → Comptes de stock.html.

   Comptes réels Supabase Auth (email + mot de passe). Toutes les
   opérations d'administration (créer, modifier profil/statut,
   supprimer) passent par l'Edge Function "manage-users", qui
   vérifie que l'appelant est administrateur avant d'utiliser ses
   privilèges élevés (jamais exposés côté client).

   Prénom, nom, profil et statut se modifient directement dans le
   tableau (sauvegarde immédiate au blur/change) — pas de modale
   d'édition. Seules la création, la réinitialisation du mot de
   passe et la suppression passent par une modale.
   ============================================================ */

// ── État local ───────────────────────────────────────────────
let _users  = [];   // Tableau complet des comptes
let _editId = null; // ID du compte concerné par la réinitialisation de mdp
let _supId  = null; // ID du compte à supprimer

/* ============================================================
   CHARGEMENT DES DONNÉES
   ============================================================ */

/**
 * Charge la liste des comptes via l'Edge Function manage-users.
 */
async function chargerUsers() {
  try {
    const res = await window.SB.appelerFonction('manage-users', { action: 'list' });
    _users = res.users || [];
  } catch (err) {
    console.error('[Comptes] Erreur chargement des comptes :', err);
    afficherNotif('Impossible de charger la liste des comptes.', 'erreur');
    _users = [];
  }
  _rendreTableau();
}

/* ============================================================
   AFFICHAGE DU TABLEAU
   ============================================================ */

/**
 * Rendu du tableau des comptes. Prénom/nom/profil/statut sont des
 * champs éditables directement dans la ligne.
 */
function _rendreTableau() {
  const tbody = document.getElementById('comptes-tbody');
  if (!tbody) return;

  if (!_users.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="vide" style="padding:20px;text-align:center;color:#aaa">Aucun compte trouvé.</td></tr>';
    return;
  }

  const sessionCourante = Auth.getSession();

  tbody.innerHTML = _users.map(u => {
    const estMoi = (u.id === sessionCourante?.id);
    const [prenom, ...resteNom] = (u.nomComplet || '').split(' ');
    const nom = resteNom.join(' ') || (resteNom.length ? '' : '');

    // Bouton supprimer désactivé pour son propre compte
    const btnSup = estMoi
      ? `<button class="btn-ligne bl-supprimer" disabled title="Impossible de supprimer son propre compte">Supprimer</button>`
      : `<button class="btn-ligne bl-supprimer" onclick="ouvrirSuppression('${_esc(u.id)}','${_esc(u.nomComplet)}')">Supprimer</button>`;

    return `<tr data-id="${_esc(u.id)}">
      <td><strong>${_esc(u.email)}</strong>${estMoi ? ' <span style="color:#aaa;font-size:10px">(vous)</span>' : ''}</td>
      <td><input type="text" class="cpt-inline-input" data-field="prenom" value="${_esc(prenom || '')}" placeholder="Prénom"></td>
      <td><input type="text" class="cpt-inline-input" data-field="nom" value="${_esc(nom || '')}" placeholder="Nom"></td>
      <td>
        <select class="cpt-inline-input" data-field="profil">
          <option value="consultation"${u.profil === 'consultation' ? ' selected' : ''}>Consultation</option>
          <option value="gestion"${u.profil === 'gestion' ? ' selected' : ''}>Gestion</option>
          <option value="administration"${u.profil === 'administration' ? ' selected' : ''}>Administration</option>
        </select>
      </td>
      <td>
        <select class="cpt-inline-input" data-field="actif"${estMoi ? ' disabled title="Impossible de désactiver son propre compte"' : ''}>
          <option value="true"${u.actif ? ' selected' : ''}>● Actif</option>
          <option value="false"${!u.actif ? ' selected' : ''}>○ Désactivé</option>
        </select>
      </td>
      <td>
        <button class="btn-ligne bl-mdp" onclick="ouvrirChangeMdp('${_esc(u.id)}','${_esc(u.nomComplet)}','${_esc(u.email)}')">🔑 Réinitialiser</button>
        ${btnSup}
      </td>
    </tr>`;
  }).join('');
}

/**
 * Sauvegarde immédiate d'un champ modifié en ligne (prénom, nom, profil, statut).
 */
async function _sauvegarderChampInline(tr, field, valeur) {
  const id = tr.dataset.id;
  const u = _users.find(u => u.id === id);
  if (!u) return;

  let nomComplet = u.nomComplet;
  let profil     = u.profil;
  let actif      = u.actif;

  if (field === 'prenom' || field === 'nom') {
    const prenomInp = tr.querySelector('[data-field="prenom"]').value.trim();
    const nomInp    = tr.querySelector('[data-field="nom"]').value.trim();
    if (!nomInp) {
      afficherNotif('Le nom est obligatoire.', 'erreur');
      _rendreTableau();
      return;
    }
    nomComplet = [prenomInp, nomInp].filter(Boolean).join(' ');
    if (nomComplet === u.nomComplet) return;
  } else if (field === 'profil') {
    profil = valeur;
    if (profil === u.profil) return;
  } else if (field === 'actif') {
    actif = (valeur === 'true');
    if (actif === u.actif) return;
  }

  try {
    await window.SB.appelerFonction('manage-users', {
      action: 'update', id, profil, actif, nomComplet,
    });
    u.nomComplet = nomComplet;
    u.profil     = profil;
    u.actif      = actif;
    afficherNotif('Compte modifié.', 'succes');
  } catch (err) {
    afficherNotif(err.message || 'Erreur lors de la modification.', 'erreur');
    _rendreTableau(); // revert visuel sur échec
  }
}

// Délégation d'événements sur le tableau : sauvegarde au blur (texte) / change (select)
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('comptes-tbody');
  if (!tbody) return;

  tbody.addEventListener('blur', e => {
    const inp = e.target.closest('input.cpt-inline-input');
    if (!inp) return;
    const tr = inp.closest('tr');
    if (tr) _sauvegarderChampInline(tr, inp.dataset.field, inp.value);
  }, true);

  tbody.addEventListener('change', e => {
    const sel = e.target.closest('select.cpt-inline-input');
    if (!sel) return;
    const tr = sel.closest('tr');
    if (tr) _sauvegarderChampInline(tr, sel.dataset.field, sel.value);
  });
});

/* ============================================================
   MODALE CRÉATION
   ============================================================ */

async function ouvrirCreation() {
  await chargerUsers(); // liste à jour avant la vérification de doublon
  document.getElementById('m-compte-titre').textContent = 'Nouveau compte';
  document.getElementById('mc-email').value    = '';
  document.getElementById('mc-email').disabled = false;
  document.getElementById('mc-prenom').value   = '';
  document.getElementById('mc-nom').value      = '';
  document.getElementById('mc-profil').value   = 'consultation';
  const info = document.getElementById('m-compte-info');
  info.textContent = 'Un email d\'invitation sera envoyé à cette adresse pour que l\'utilisateur choisisse son mot de passe.';
  info.style.display = 'block';
  _cacherErreur('mc-erreur');
  ouvrirM('m-compte');
  document.getElementById('mc-email').focus();
}

/* ============================================================
   SAUVEGARDE COMPTE (création uniquement — modification en ligne)
   ============================================================ */

async function sauvegarderCompte() {
  const email  = document.getElementById('mc-email').value.trim();
  const prenom = document.getElementById('mc-prenom').value.trim();
  const nom    = document.getElementById('mc-nom').value.trim();
  const profil = document.getElementById('mc-profil').value;
  const nomComplet = [prenom, nom].filter(Boolean).join(' ');

  if (!email || !nom) {
    afficherErreurModale('mc-erreur', 'Email et nom sont obligatoires.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    afficherErreurModale('mc-erreur', 'Adresse email invalide.');
    return;
  }

  const doublon = _users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (doublon) {
    afficherErreurModale('mc-erreur', 'Cet email est déjà utilisé.');
    return;
  }

  try {
    const redirectTo = window.location.origin + window.location.pathname.replace(/views\/.*$/, 'login.html');
    await window.SB.appelerFonction('manage-users', {
      action: 'create', email, nomComplet, profil, redirectTo,
    });
    afficherNotif('Compte créé — email d\'invitation envoyé.', 'succes');
    await chargerUsers();
    fermerM('m-compte');
  } catch (err) {
    afficherErreurModale('mc-erreur', err.message || 'Erreur lors de l\'enregistrement.');
  }
}

/* ============================================================
   RÉINITIALISATION DU MOT DE PASSE
   ============================================================ */

function ouvrirChangeMdp(id, nom, email) {
  _editId = id;
  document.getElementById('mdp-nom-compte').textContent   = nom;
  document.getElementById('mdp-email-compte').textContent = email;
  _cacherErreur('mdp-erreur');
  ouvrirM('m-mdp');
}

async function sauvegarderMdp() {
  const user = _users.find(u => u.id === _editId);
  if (!user) return;

  try {
    // Ne nécessite pas de privilèges admin : disponible avec la clé anon.
    const { error } = await window.SB.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin + window.location.pathname.replace(/views\/.*$/, 'login.html'),
    });
    if (error) throw error;
    fermerM('m-mdp');
    afficherNotif('Email de réinitialisation envoyé.', 'succes');
  } catch (err) {
    afficherErreurModale('mdp-erreur', err.message || 'Erreur lors de l\'envoi.');
  }
}

/* ============================================================
   SUPPRESSION
   ============================================================ */

function ouvrirSuppression(id, nom) {
  _supId = id;
  document.getElementById('sup-nom-compte').textContent = nom;
  ouvrirM('m-supprimer-compte');
}

async function confirmerSuppression() {
  if (!_supId) return;

  try {
    await window.SB.appelerFonction('manage-users', { action: 'delete', id: _supId });
    _users = _users.filter(u => u.id !== _supId);
    _rendreTableau();
    afficherNotif('Compte supprimé.', 'succes');
  } catch (err) {
    afficherNotif(err.message || 'Erreur lors de la suppression.', 'erreur');
  }

  _supId = null;
  fermerM('m-supprimer-compte');
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

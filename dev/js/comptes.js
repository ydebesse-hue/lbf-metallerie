/* ============================================================
   GESTION DES COMPTES — comptes.js
   Intégré dans l'onglet Administration → Comptes de stock.html.

   Comptes réels Supabase Auth (email + mot de passe). Toutes les
   opérations d'administration (créer, modifier profil/statut,
   supprimer) passent par l'Edge Function "manage-users", qui
   vérifie que l'appelant est administrateur avant d'utiliser ses
   privilèges élevés (jamais exposés côté client).
   ============================================================ */

// ── État local ───────────────────────────────────────────────
let _users   = [];   // Tableau complet des comptes
let _editId  = null; // ID du compte en cours de modification/reset
let _supId   = null; // ID du compte à supprimer

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
 * Rendu du tableau des comptes.
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
      <td><strong>${_esc(u.email)}</strong>${estMoi ? ' <span style="color:#aaa;font-size:10px">(vous)</span>' : ''}</td>
      <td>${_esc(prenom || '')}</td>
      <td>${_esc(nom || '')}</td>
      <td>${profilHtml}</td>
      <td>${statutHtml}</td>
      <td>
        <button class="btn-ligne bl-modifier" onclick="ouvrirModification('${_esc(u.id)}')">Modifier</button>
        <button class="btn-ligne bl-mdp" onclick="ouvrirChangeMdp('${_esc(u.id)}','${_esc(u.nomComplet)}','${_esc(u.email)}')">🔑 Réinitialiser</button>
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
  document.getElementById('mc-email').value    = '';
  document.getElementById('mc-email').disabled = false;
  document.getElementById('mc-prenom').value   = '';
  document.getElementById('mc-nom').value      = '';
  document.getElementById('mc-profil').value   = 'consultation';
  document.getElementById('mc-actif').value    = 'true';
  document.getElementById('mc-actif-zone').style.display = 'none'; // nouveau compte : toujours actif
  const info = document.getElementById('m-compte-info');
  info.textContent = 'Un email d\'invitation sera envoyé à cette adresse pour que l\'utilisateur choisisse son mot de passe.';
  info.style.display = 'block';
  _cacherErreur('mc-erreur');
  ouvrirM('m-compte');
  document.getElementById('mc-email').focus();
}

/* ============================================================
   MODALE MODIFICATION
   ============================================================ */

function ouvrirModification(id) {
  const u = _users.find(u => u.id === id);
  if (!u) return;

  const [prenom, ...resteNom] = (u.nomComplet || '').split(' ');

  _editId = id;
  document.getElementById('m-compte-titre').textContent = 'Modifier le compte';
  document.getElementById('mc-email').value    = u.email;
  document.getElementById('mc-email').disabled = true; // email non modifiable (identifiant de connexion)
  document.getElementById('mc-prenom').value   = prenom || '';
  document.getElementById('mc-nom').value      = resteNom.join(' ') || '';
  document.getElementById('mc-profil').value   = u.profil;
  document.getElementById('mc-actif').value    = String(u.actif);
  document.getElementById('mc-actif-zone').style.display = '';

  const info = document.getElementById('m-compte-info');
  info.textContent = 'Pour réinitialiser le mot de passe, utilisez le bouton 🔑 Réinitialiser dans la liste.';
  info.style.display = 'block';

  _cacherErreur('mc-erreur');
  ouvrirM('m-compte');
}

/* ============================================================
   SAUVEGARDE COMPTE (création + modification)
   ============================================================ */

async function sauvegarderCompte() {
  const email  = document.getElementById('mc-email').value.trim();
  const prenom = document.getElementById('mc-prenom').value.trim();
  const nom    = document.getElementById('mc-nom').value.trim();
  const profil = document.getElementById('mc-profil').value;
  const actif  = document.getElementById('mc-actif').value === 'true';
  const nomComplet = [prenom, nom].filter(Boolean).join(' ');

  if (!email || !nom) {
    afficherErreurModale('mc-erreur', 'Email et nom sont obligatoires.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    afficherErreurModale('mc-erreur', 'Adresse email invalide.');
    return;
  }

  try {
    if (_editId) {
      await window.SB.appelerFonction('manage-users', {
        action: 'update', id: _editId, profil, actif, nomComplet,
      });
      afficherNotif('Compte modifié.', 'succes');
    } else {
      const doublon = _users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (doublon) {
        afficherErreurModale('mc-erreur', 'Cet email est déjà utilisé.');
        return;
      }
      const redirectTo = window.location.origin + window.location.pathname.replace(/views\/.*$/, 'login.html');
      await window.SB.appelerFonction('manage-users', {
        action: 'create', email, nomComplet, profil, redirectTo,
      });
      afficherNotif('Compte créé — email d\'invitation envoyé.', 'succes');
    }
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
  ouvrirM('m-supprimer');
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
  fermerM('m-supprimer');
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

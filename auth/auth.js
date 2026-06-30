/**
 * auth.js — Moteur d'authentification Stock Métallerie LBF
 * Session courte : sessionStorage (effacée à la fermeture de l'onglet)
 * Pas de dépendance externe — JS Vanilla pur
 */

// ═══════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════

// Calcule la racine absolue du site (fonctionne sur GitHub Pages et en local)
const _racine = (function() {
  const path = window.location.pathname;
  // Supprimer tout ce qui suit /auth/ ou /views/ ou le fichier html à la racine
  const base = path
    .replace(/\/auth\/[^/]*$/, '/')
    .replace(/\/views\/[^/]*$/, '/')
    .replace(/\/[^/]*\.html$/, '/');
  return window.location.origin + base;
})();

const AUTH_CONFIG = {
  sessionKey: 'lbf_session',
  usersPath:  _racine + 'data/users.json',
  loginPage:  _racine + 'login.html',
  homePage:   _racine + 'index.html',
};

// Table des droits par profil
const DROITS = {
  consultation: {
    can_view:          true,
    can_request:       true,  // Demander une attribution
    can_edit:          false,
    can_add:           false,
    can_validate:      false,
    can_manage_users:  false,
  },
  gestion: {
    can_view:          true,
    can_request:       true,
    can_edit:          true,   // Modifier une entrée (soumis à validation)
    can_add:           true,   // Ajouter au stock (soumis à validation)
    can_validate:      false,
    can_manage_users:  false,
  },
  administration: {
    can_view:          true,
    can_request:       true,
    can_edit:          true,
    can_add:           true,
    can_validate:      true,   // Valider ajouts, attributions, sections
    can_manage_users:  true,   // Gérer les comptes
  },
};

// Page de redirection selon le profil après connexion
const REDIRECT_APRES_LOGIN = {
  consultation:    '../views/stock.html',
  gestion:         '../views/stock.html',
  administration:  '../views/stock.html',
};


// ═══════════════════════════════════════════════════════
//  LECTURE DES UTILISATEURS (Supabase)
// ═══════════════════════════════════════════════════════

/**
 * Charge les utilisateurs depuis Supabase.
 * Fallback sur users.json local si Supabase indisponible.
 * @returns {Promise<Array>}
 */
async function chargerUtilisateurs() {
  // Tentative Supabase
  try {
    if (window.SB) {
      const users = await window.SB.lire('users');
      if (users && users.length) return users;
    }
  } catch (err) {
    console.warn('[Auth] Supabase indisponible, fallback JSON :', err);
  }

  // Fallback — fichier JSON local
  try {
    const racine = _racine;
    const rep = await fetch(racine + 'data/users.json');
    if (!rep.ok) throw new Error('Impossible de charger users.json');
    const data = await rep.json();
    return data.users || [];
  } catch (err) {
    console.error('[Auth] Erreur chargement users.json :', err);
    return [];
  }
}


// ═══════════════════════════════════════════════════════
//  HACHAGE MOT DE PASSE (SHA-256 natif)
// ═══════════════════════════════════════════════════════

/**
 * Retourne le hash SHA-256 d'une chaîne (hex).
 * @param {string} texte
 * @returns {Promise<string>}
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


// ═══════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════

/**
 * Tente de connecter un utilisateur.
 * @param {string} identifiant
 * @param {string} motDePasse   — texte clair (sera haché ici)
 * @returns {Promise<{ok: boolean, erreur?: string, utilisateur?: object}>}
 */
async function login(identifiant, motDePasse) {
  if (!identifiant || !motDePasse) {
    return { ok: false, erreur: 'Identifiant et mot de passe requis.' };
  }

  const utilisateurs = await chargerUtilisateurs();
  const user = utilisateurs.find(
    u => u.identifiant.toLowerCase() === identifiant.toLowerCase()
  );

  if (!user) {
    return { ok: false, erreur: 'Identifiant introuvable.' };
  }

  if (!user.actif) {
    return { ok: false, erreur: 'Compte désactivé. Contactez l\'administrateur.' };
  }

  // Comparaison mot de passe
  // users.json peut stocker soit le hash SHA-256, soit le texte clair (dev)
  let mdpValide = false;
  if (user.motDePasse.length === 64) {
    // Hash SHA-256 stocké
    const hash = await sha256(motDePasse);
    mdpValide = (hash === user.motDePasse);
  } else {
    // Texte clair (environnement de dev uniquement)
    mdpValide = (motDePasse === user.motDePasse);
  }

  if (!mdpValide) {
    return { ok: false, erreur: 'Mot de passe incorrect.' };
  }

  // Création de la session
  const session = {
    id:           user.id,
    identifiant:  user.identifiant,
    nomComplet:   user.nomComplet,
    profil:       user.profil,
    droits:       DROITS[user.profil] || DROITS.consultation,
    loginAt:      Date.now(),
  };

  sessionStorage.setItem(AUTH_CONFIG.sessionKey, JSON.stringify(session));
  return { ok: true, utilisateur: session };
}


// ═══════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════

/**
 * Déconnecte l'utilisateur et redirige vers la page de login.
 */
function logout() {
  sessionStorage.removeItem(AUTH_CONFIG.sessionKey);
  window.location.href = AUTH_CONFIG.loginPage;
}


// ═══════════════════════════════════════════════════════
//  LECTURE SESSION
// ═══════════════════════════════════════════════════════

/**
 * Retourne l'utilisateur en session, ou null.
 * @returns {object|null}
 */
function getSession() {
  const raw = sessionStorage.getItem(AUTH_CONFIG.sessionKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}


// ═══════════════════════════════════════════════════════
//  GARDE DE ROUTE
// ═══════════════════════════════════════════════════════

/**
 * À appeler en tête de chaque page protégée.
 * Redirige vers login si pas de session, ou si le profil est insuffisant.
 *
 * @param {string|null} profilMinimum  — 'consultation' | 'gestion' | 'administration' | null
 * @returns {object|null}              — session si OK, null + redirection sinon
 */
function requireAuth(profilMinimum = null) {
  const session = getSession();

  if (!session) {
    window.location.href = AUTH_CONFIG.loginPage;
    return null;
  }

  if (profilMinimum) {
    const niveaux = { consultation: 1, gestion: 2, administration: 3 };
    const niveauSession  = niveaux[session.profil]       || 0;
    const niveauRequis   = niveaux[profilMinimum]        || 0;

    if (niveauSession < niveauRequis) {
      // Profil insuffisant : redirige vers stock en lecture seule
      window.location.href = REDIRECT_APRES_LOGIN.consultation;
      return null;
    }
  }

  return session;
}


// ═══════════════════════════════════════════════════════
//  VÉRIFICATION D'UN DROIT PRÉCIS
// ═══════════════════════════════════════════════════════

/**
 * Vérifie si l'utilisateur en session possède un droit précis.
 * @param {string} droit  — ex: 'can_edit', 'can_validate'
 * @returns {boolean}
 */
function hasRight(droit) {
  const session = getSession();
  if (!session || !session.droits) return false;
  return session.droits[droit] === true;
}


// ═══════════════════════════════════════════════════════
//  UTILITAIRES UI
// ═══════════════════════════════════════════════════════

/**
 * Injecte dans un élément le nom et le profil de l'utilisateur connecté.
 * @param {string} selectorNom    — ex: '#user-nom'
 * @param {string} selectorBadge  — ex: '#user-badge'
 */
function afficherInfosSession(selectorNom, selectorBadge) {
  const session = getSession();
  if (!session) return;

  const elNom   = document.querySelector(selectorNom);
  const elBadge = document.querySelector(selectorBadge);

  const labelsProfil = {
    consultation:   'Consultation',
    gestion:        'Gestion',
    administration: 'Administration',
  };

  const classesBadge = {
    consultation:   'badge-rouge',
    gestion:        'badge-vert',
    administration: 'badge-or',
  };

  if (elNom)   elNom.textContent   = session.nomComplet;
  if (elBadge) {
    elBadge.textContent  = labelsProfil[session.profil] || session.profil;
    elBadge.className    = `badge ${classesBadge[session.profil] || 'badge-rouge'}`;
  }
}

/**
 * Masque les éléments DOM qui nécessitent un droit non accordé.
 * Usage : <button data-require="can_validate">Valider</button>
 */
function appliquerDroitsDOM() {
  const session = getSession();
  const droits  = session?.droits || {};

  document.querySelectorAll('[data-require]').forEach(el => {
    const droit = el.getAttribute('data-require');
    if (!droits[droit]) {
      el.style.display = 'none';
    }
  });
}


// ═══════════════════════════════════════════════════════
//  EXPORT (compatible modules ES et script classique)
// ═══════════════════════════════════════════════════════

// Disponible en script classique via window.Auth
window.Auth = {
  login,
  logout,
  getSession,
  requireAuth,
  hasRight,
  afficherInfosSession,
  appliquerDroitsDOM,
  DROITS,
};

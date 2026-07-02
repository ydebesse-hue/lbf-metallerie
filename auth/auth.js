/**
 * auth.js — Moteur d'authentification Stock Métallerie LBF (Supabase Auth)
 *
 * L'authentification réelle (email + mot de passe) est déléguée à Supabase Auth.
 * Pour compatibilité avec le reste de l'application (qui lit la session de façon
 * synchrone un peu partout), la session est mise en cache localement dès le
 * chargement du script. Les pages qui décident d'un accès dès le chargement
 * (redirection si non connecté, etc.) doivent `await Auth.ready()` avant de lire
 * la session — c'est la seule différence de branchement par rapport à avant.
 *
 * L'accès « Consulter sans connexion » (visiteur anonyme) reste géré à part,
 * via sessionStorage, sans passer par Supabase Auth.
 */

// ═══════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════

// Calcule la racine absolue du site (fonctionne sur GitHub Pages et en local)
const _racine = (function() {
  const path = window.location.pathname;
  const base = path
    .replace(/\/auth\/[^/]*$/, '/')
    .replace(/\/views\/[^/]*$/, '/')
    .replace(/\/[^/]*\.html$/, '/');
  return window.location.origin + base;
})();

const AUTH_CONFIG = {
  sessionAnonKey: 'lbf_session_anon',
  loginPage:      _racine + 'login.html',
  homePage:       _racine + 'index.html',
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
//  CACHE DE SESSION (alimenté par Supabase Auth)
// ═══════════════════════════════════════════════════════

let _cachedSession = null;
let _isReady        = false;
let _readyResolve;
const _readyPromise  = new Promise(res => { _readyResolve = res; });

/**
 * Construit l'objet session applicatif à partir d'un utilisateur Supabase Auth.
 * Le rôle (« profil ») est stocké dans user_metadata à la création du compte.
 * @param {Object|null} supaUser
 * @returns {object|null}
 */
function _construireSession(supaUser) {
  if (!supaUser) return null;
  const profil = supaUser.user_metadata?.profil;
  if (!DROITS[profil]) return null;
  if (supaUser.user_metadata?.actif === false) return null;
  return {
    id:          supaUser.id,
    identifiant: supaUser.email,
    nomComplet:  supaUser.user_metadata?.nom_complet || supaUser.email,
    profil,
    droits:      DROITS[profil],
    loginAt:     Date.now(),
  };
}

/**
 * Initialise le cache de session au chargement du script :
 * lit la session Supabase déjà persistée (si l'utilisateur était connecté),
 * puis écoute les changements (login/logout/refresh de token).
 */
async function _initAuth() {
  if (!window.SB?.client) {
    _isReady = true;
    _readyResolve();
    return;
  }
  try {
    const { data: { session } } = await window.SB.client.auth.getSession();
    _cachedSession = _construireSession(session?.user);
  } catch (err) {
    console.warn('[Auth] Erreur lecture session initiale :', err);
  }
  _isReady = true;
  _readyResolve();

  window.SB.client.auth.onAuthStateChange((_event, session) => {
    _cachedSession = _construireSession(session?.user);
  });
}
_initAuth();

/**
 * Attend que la session initiale ait été chargée depuis Supabase.
 * À `await` avant tout appel à getSession()/requireAuth() en tête de page.
 * @returns {Promise<void>}
 */
function ready() {
  return _isReady ? Promise.resolve() : _readyPromise;
}


// ═══════════════════════════════════════════════════════
//  SESSION VISITEUR (consultation anonyme, sans compte)
// ═══════════════════════════════════════════════════════

function _lireSessionAnon() {
  const raw = sessionStorage.getItem(AUTH_CONFIG.sessionAnonKey);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s?.anonyme === true ? s : null;
  } catch {
    return null;
  }
}

/**
 * Ouvre un accès en lecture seule sans compte (lien « Consulter sans connexion »).
 */
function entrerEnConsultation() {
  const sessionAnon = {
    id:          'anon',
    identifiant: 'visiteur',
    nomComplet:  'Visiteur',
    profil:      'consultation',
    droits:      DROITS.consultation,
    loginAt:     Date.now(),
    anonyme:     true,
  };
  sessionStorage.setItem(AUTH_CONFIG.sessionAnonKey, JSON.stringify(sessionAnon));
}


// ═══════════════════════════════════════════════════════
//  LOGIN / LOGOUT
// ═══════════════════════════════════════════════════════

/**
 * Tente de connecter un utilisateur via Supabase Auth.
 * @param {string} email
 * @param {string} motDePasse
 * @returns {Promise<{ok: boolean, erreur?: string, utilisateur?: object}>}
 */
async function login(email, motDePasse) {
  if (!email || !motDePasse) {
    return { ok: false, erreur: 'Email et mot de passe requis.' };
  }
  if (!window.SB?.client) {
    return { ok: false, erreur: 'Service de connexion indisponible.' };
  }

  const { data, error } = await window.SB.client.auth.signInWithPassword({
    email:    email.trim(),
    password: motDePasse,
  });

  if (error) {
    return { ok: false, erreur: 'Identifiant ou mot de passe incorrect.' };
  }

  const session = _construireSession(data.user);
  if (!session) {
    await window.SB.client.auth.signOut();
    return { ok: false, erreur: 'Compte désactivé ou non configuré. Contactez l\'administrateur.' };
  }

  sessionStorage.removeItem(AUTH_CONFIG.sessionAnonKey);
  _cachedSession = session;
  return { ok: true, utilisateur: session };
}

/**
 * Déconnecte l'utilisateur et redirige vers la page de login.
 */
async function logout() {
  sessionStorage.removeItem(AUTH_CONFIG.sessionAnonKey);
  _cachedSession = null;
  if (window.SB?.client) {
    try { await window.SB.client.auth.signOut(); } catch {}
  }
  window.location.href = AUTH_CONFIG.loginPage;
}


// ═══════════════════════════════════════════════════════
//  LECTURE SESSION
// ═══════════════════════════════════════════════════════

/**
 * Retourne l'utilisateur en session (compte réel ou visiteur anonyme), ou null.
 * Lecture synchrone depuis le cache — appeler `Auth.ready()` avant en tête de page.
 * @returns {object|null}
 */
function getSession() {
  return _cachedSession || _lireSessionAnon();
}


// ═══════════════════════════════════════════════════════
//  GARDE DE ROUTE
// ═══════════════════════════════════════════════════════

/**
 * À appeler en tête de chaque page protégée (après `await Auth.ready()`).
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
  ready,
  login,
  logout,
  getSession,
  requireAuth,
  hasRight,
  entrerEnConsultation,
  afficherInfosSession,
  appliquerDroitsDOM,
  DROITS,
};

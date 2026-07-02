# Migration v3 — Passage à Supabase Auth

> **But de ce fichier** : récapituler le plan décidé pour la v3, afin de repartir
> avec tout le contexte dans une conversation dédiée, sans avoir à tout réexpliquer.
>
> **Date de rédaction** : 2026-05-28
> **Stratégie** : la v2 reste intacte et stable. La v3 est une **copie isolée**
> (repo GitHub + projet Supabase séparés) sur laquelle on fait la migration auth.

---

## 0. Choix validés

| Sujet | Décision |
|---|---|
| Méthode de connexion | **Email + mot de passe** (Supabase Auth) |
| Gestion des comptes | **Écran « Comptes » conservé**, mais branché sur une **Edge Function** |
| Sessions | **Persistantes** (le SDK gère token + refresh automatiquement) |
| Lien « entrer en consultation » | Conservé (clé `anon` en lecture seule via RLS) |

---

## 1. Avant de commencer — créer la copie v3

### GitHub
- **Recommandé** : nouveau repo `lbf-stock-v3` (copie indépendante, zéro risque de
  pousser par erreur sur la v2).
- Alternative : branche `v3` dans le repo actuel (plus léger mais risque de confusion).

### Supabase
- Pas de duplication automatique → **créer un nouveau projet Supabase v3**.
- Étapes :
  1. `pg_dump` (ou backup dashboard) du schéma + données de la v2.
  2. Réimport dans le projet v3.
  3. ⚠️ **PIÈGE N°1** : changer `SUPABASE_URL` et `SUPABASE_ANON` dans `js/supabase.js`
     pour pointer vers le projet **v3**. Sinon la v3 taperait sur la base v2 et tout
     l'isolement serait annulé.

### Vérification de départ
Avant toute migration : confirmer que la **v3 tourne à l'identique** de la v2
(même comportement, mêmes données). On part d'une base saine.

---

## 2. État actuel (v2) — point de départ

```
AUJOURD'HUI                         APRÈS MIGRATION (v3)
──────────────────────────────────  ─────────────────────────────────────
table users  ←→  auth.js (client)   Supabase Auth  ←→  auth.js (client)
SHA-256 maison                       bcrypt géré par Supabase
sessionStorage (manuel)              SDK gère token + refresh automatique
RLS : USING (true) partout           RLS : vérifie auth.jwt() ->> 'profil'
comptes.js écrit dans users table    comptes.js appelle une Edge Function
```

---

## 3. Les étapes de migration

### Étape 1 — Dashboard Supabase (manuel, ~1h)
1. **Authentication → Settings** : désactiver « Confirm email » (outil interne,
   pas de mail de confirmation souhaité) ; activer « email + password ».
2. Prévoir le champ `profil` dans `user_metadata` (JSON libre, pas de migration SQL).
3. Créer les comptes auth des **5 utilisateurs existants** via
   `Authentication → Users → Invite user` avec leurs **emails réels**
   → Supabase envoie un lien de reset, zéro réinitialisation manuelle.
4. Ajouter une colonne `auth_id UUID` dans la table `users` (on garde `users`
   pour ne pas tout casser ; alternative : table `profiles` légère).

> **À préparer avant** : une adresse email valide par utilisateur
> (p.dupont, m.leroy, admin, michel, …).

### Étape 2 — Remplacer `js/supabase.js` par le SDK officiel (~3h)
- Actuel : ~271 lignes de `fetch` bruts avec la clé anon en header.
- Après : `supabase-js` via CDN, le JWT de l'utilisateur est joint automatiquement.

```html
<!-- index.html, login.html, views/*.html -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

```javascript
// js/supabase.js passe de ~271 lignes à ~50
const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
// SB.lire / SB.inserer / etc. délèguent au query builder.
// Plus de gestion manuelle des headers/token.
```

- **Impact sur `stock.js`, `bibliotheque.js`, `comptes.js`** : *aucun* — l'API
  `SB.lire()`, `SB.inserer()`, etc. reste identique côté appelant.

### Étape 3 — Réécrire `auth/auth.js` (~4h)
- Changement clé : `getSession()` devient **async** (le SDK lit le token en async).

| Fonction actuelle | Remplacée par |
|---|---|
| `login(id, mdp)` | `_sb.auth.signInWithPassword({ email, password })` |
| `logout()` | `_sb.auth.signOut()` |
| `getSession()` (sync) | `_sb.auth.getSession()` (async) |
| `hasRight(droit)` | lit `session.user.user_metadata.profil` |
| `requireAuth()` | même logique, attend la session async |

- Profil (`gestion` / `administration` / `consultation`) stocké dans `user_metadata`
  à la création du compte (par l'Edge Function).
- **Impact** : auditer les pages appelant `Auth.requireAuth()` / `Auth.hasRight()`
  en tête de page (peu nombreux, localisés).

### Étape 4 — Edge Function `manage-users` (~5h) — cœur du chantier
- L'écran « Comptes » reste dans l'app, mais appelle une fonction Deno déployée sur
  Supabase qui détient la `service_role` (jamais exposée côté client).

```
supabase/functions/manage-users/index.ts
```

```typescript
// 1. Vérifier que l'appelant est authentifié ET profil = 'administration'
// 2. Dispatch selon l'action :
switch (action) {
  case 'list':   // lister les utilisateurs
  case 'create': // supabase.auth.admin.createUser()
  case 'update': // role, nom, email
  case 'delete': // supabase.auth.admin.deleteUser()
  case 'reset':  // envoyer un email de reset
}
```

- **Dans `js/comptes.js`** : `SB.lire('users')` → `fetch('/functions/v1/manage-users', { action: 'list' })`.

### Étape 5 — Réécrire les politiques RLS (~2h)
- De `USING (true)` à des vérifications réelles. Fichier : `data/sql/rls_policies.sql`.

```sql
-- Mise à jour : administration, ou gestion sur ses ajouts en attente
CREATE POLICY "stock_update_admin" ON stock
  FOR UPDATE TO authenticated
  USING (
    auth.jwt() ->> 'profil' = 'administration'
    OR (auth.jwt() ->> 'profil' = 'gestion' AND statut = 'en_attente')
  );

-- Lecture pour tous les connectés
CREATE POLICY "stock_select_auth" ON stock
  FOR SELECT TO authenticated USING (true);

-- Visiteur (consultation) : lecture seule en anon
CREATE POLICY "stock_select_anon" ON stock
  FOR SELECT TO anon USING (true);
```

### Étape 6 — Lien « entrer en consultation » (visiteur)
- Reste fonctionnel sans toucher à l'UX : la clé `anon` conserve le SELECT sur
  les tables principales (stock, sections, chantiers) via RLS en lecture seule.

---

## 4. Récapitulatif des fichiers touchés

| Fichier | Changement | Ampleur |
|---|---|---|
| `js/supabase.js` | Réécriture complète (SDK) | Moyen |
| `auth/auth.js` | Réécriture complète (async + Supabase Auth) | Important |
| `js/comptes.js` | Appels Edge Function au lieu de SB direct | Moyen |
| `login.html` | Champ identifiant → email, flux login | Léger |
| `views/comptes.html` | Formulaire email + adaptation | Léger |
| `data/sql/rls_policies.sql` | Réécriture totale | Moyen |
| `supabase/functions/manage-users/index.ts` | Nouveau fichier | Important |
| `data/users.json` | Obsolète (gardé en fallback offline) | — |

**Ne change pas du tout** : `js/stock.js`, `js/bibliotheque.js`, `js/profils-utils.js`,
toutes les vues sauf `views/comptes.html` et `login.html`.

---

## 5. Ordre d'exécution recommandé

1. **Étapes 2 + 5** (SDK + RLS) — sans risque, améliorent déjà la situation.
2. **Étapes 3 + 4 ensemble** (auth.js + Edge Function) — la bascule finale.
3. Vérifier les étapes 1 et 6 en parallèle.

- Estimation : **~15h** réparties sur 4-5 sessions.
- Les étapes 1-2-5 peuvent être faites indépendamment sans casser l'app en cours
  de route → migration progressive possible.

---

## 6. Pièges à retenir

- ⚠️ **Vérifier que `SUPABASE_URL` / `SUPABASE_ANON` de la v3 pointent bien vers
  le projet Supabase v3** (et pas la v2).
- ⚠️ La `service_role` ne doit **jamais** apparaître côté client — uniquement
  dans l'Edge Function.
- ⚠️ `getSession()` devient **async** : penser à `await` partout où il est appelé.

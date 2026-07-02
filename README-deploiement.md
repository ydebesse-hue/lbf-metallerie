# Déploiement — Stock Métallerie LBF
## Hébergement SharePoint / OneDrive

---

### Structure à uploader

Uploader le dossier `LBF-Stock/` tel quel dans une bibliothèque de documents SharePoint ou un dossier OneDrive partagé :

```
LBF-Stock/
├── index.html
├── login.html
├── auth/
│   └── auth.js
├── assets/
│   └── Logo_LBF.png
├── data/
│   ├── users.json      ← à personnaliser avant mise en ligne
│   ├── sections.json   ← issu du ZIP Conv. 3
│   ├── stock.json
│   ├── toles.json
│   └── demandes.json
├── js/
│   ├── stock.js
│   └── bibliotheque.js
└── views/
    ├── stock.html
    ├── bibliotheque.html
    └── comptes.html
```

---

### Accès depuis SharePoint Online

1. Uploader tous les fichiers dans **une bibliothèque de documents** SharePoint
   (ex : `Sites/Metallerie/Documents/LBF-Stock/`)
2. Ouvrir `index.html` dans le navigateur via l'URL SharePoint
3. SharePoint sert les fichiers statiques sans configuration serveur supplémentaire

> ⚠ **CORS** : les `fetch()` vers les fichiers JSON fonctionnent si les fichiers sont
> dans la **même origine** (même site SharePoint). Ne pas héberger les JSON sur un autre domaine.

---

### Accès depuis OneDrive Entreprise

1. Uploader le dossier dans OneDrive Entreprise (OneDrive for Business)
2. Partager le dossier avec les utilisateurs concernés
3. Ouvrir `index.html` via **"Ouvrir dans le navigateur"** depuis OneDrive
4. Copier l'URL et la distribuer à l'équipe

> ⚠ OneDrive personnel ne supporte pas les `fetch()` vers des fichiers locaux.
> Utiliser **OneDrive Entreprise** (Microsoft 365) ou SharePoint Online.

---

### Chemins relatifs — vérification

Tous les chemins sont relatifs à la racine du projet :

| Fichier | Chemin auth.js | Chemin data/ |
|---------|---------------|-------------|
| `index.html` | `auth/auth.js` | — |
| `login.html` | `auth/auth.js` | `data/users.json` (via auth.js) |
| `views/stock.html` | `../auth/auth.js` | `../data/stock.json` |
| `views/bibliotheque.html` | `../auth/auth.js` | `../data/sections.json` |
| `views/comptes.html` | `../auth/auth.js` | `../data/users.json` |

Si SharePoint modifie les chemins (ex. préfixe `/sites/metallerie/`), adapter
`AUTH_CONFIG.usersPath` dans `auth/auth.js` et les `fetch()` dans `js/stock.js`
et `js/bibliotheque.js`.

---

### Mise à jour des données JSON en production

Les modifications faites via l'interface sont stockées dans **localStorage** du navigateur.
Pour les sauvegarder de façon permanente :

#### Procédure d'export (administrateur)

1. Se connecter avec le compte `admin`
2. Ouvrir la **console développeur** du navigateur (F12 → Console)
3. Taper la commande suivante pour récupérer les données modifiées :

```javascript
// Exporter les modifications stock
console.log(JSON.stringify(JSON.parse(localStorage.getItem('lbf_stock_modifs') || '{}'), null, 2));

// Exporter les demandes
console.log(JSON.stringify(JSON.parse(localStorage.getItem('lbf_demandes') || '{}'), null, 2));

// Exporter les modifications comptes
console.log(JSON.stringify(JSON.parse(localStorage.getItem('lbf_users_modifs') || '[]'), null, 2));
```

4. Copier le contenu affiché et le fusionner manuellement dans les fichiers JSON correspondants
5. Uploader les JSON mis à jour sur SharePoint / OneDrive

> 💡 Pour une mise à jour automatique en production, l'étape suivante consiste
> à intégrer l'API Microsoft Graph pour écrire directement dans les fichiers SharePoint.
> Cela nécessite l'enregistrement d'une application Azure AD — hors périmètre actuel.

---

### Avant la mise en production

- [ ] Changer les mots de passe dans `data/users.json`
  (utiliser des mots de passe forts — ils seront hachés en SHA-256 au premier changement via l'interface)
- [ ] Remplacer le `sections.json` par celui du ZIP Conv. 3
- [ ] Vérifier que `assets/Logo_LBF.png` est bien présent
- [ ] Tester la connexion depuis un mobile (responsive)
- [ ] Tester la connexion / déconnexion sur chaque profil

---

*Le Bras Frères — Atelier Métallerie · Application interne*

# Mise en place de `lbf-metallerie` — repartir sur de bonnes bases

> **But** : créer un repo neuf et propre pour l'application de stock métallerie,
> avec un vrai circuit « version stable → améliorations → test → mise en prod »,
> et une **trace archivée de chaque version**.
>
> **Date** : 2026-06-30

---

## 1. L'architecture cible

```
        lbf-metallerie  (repo neuf, historique propre)
        │
        ├── main   ← 🟢 VERSION STABLE = le site en ligne (GitHub Pages publie ça)
        │            l'adresse que tu donnes à l'équipe
        │
        └── dev    ← 🛠️ on y fait les améliorations + on teste
                     rien ne va sur main tant que ce n'est pas validé
```

| Élément | Rôle |
|---|---|
| `main` | 🟢 Version stable = le site en ligne |
| `dev` | 🛠️ Améliorations + tests |
| **Releases (`v1`, `v2`…)** | 📌 Trace datée de chaque version, restaurable en 1 clic |
| Départ | Copie propre de l'application actuelle (en ligne aujourd'hui) |
| Repris de l'ancien repo | keep-alive Supabase + notes migration v3 |

---

## 2. Le circuit de travail

```
1. dev      🛠️  on améliore + on teste
                 │
2. (tu valides)  ▼
3. 📌 on FIGE l'état actuel de main  →  archive "v(n)"   ← la trace AVANT modif
                 │
4. merge dev → main                                      ← nouvelle version en ligne
                 │
5. 🌐 le site se met à jour tout seul
```

**Le principe clé** : le site en ligne (`main`) ne bouge **que** quand TOI tu valides.
Tant qu'on travaille sur `dev`, le site reste intact.

---

## 3. Garder une trace de chaque version (tags / Releases)

Chaque version stable est **figée, datée et nommée** sur GitHub (un *tag* + une *Release*),
comme un « Enregistrer sous » daté. Exemple de ce que ça donnera :

```
Releases
├── v3  — 30/06/2026  « ajout export Excel »          ← version en ligne
├── v2  — 15/05/2026  « plan de stockage »            ← restaurable
└── v1  — 01/05/2026  « version stable initiale »     ← restaurable
```

→ Si une amélioration pose problème, on **restaure la version précédente en un clic**.

> 💡 On pourra automatiser cet archivage (un petit robot GitHub Actions qui crée
> la sauvegarde datée à chaque mise à jour de `main`), comme le keep-alive Supabase.

---

## 4. Étapes de création du repo

### Étape A — Créer la coquille vide (à faire par toi)
1. Aller sur https://github.com/new
2. **Repository name** : `lbf-metallerie`
3. Visibilité : **Private** (recommandé, outil interne)
4. **Ne rien cocher** (pas de README, pas de .gitignore) → repo totalement vide
5. Cliquer **Create repository**

### Étape B — Y mettre l'application (version stable v1)
Deux méthodes au choix :

- **Méthode simple (sans informatique)** : utiliser le fichier ZIP fourni
  (`lbf-metallerie-v1.zip`) → le dézipper → glisser-déposer les fichiers dans
  l'onglet **« uploading an existing file »** de GitHub. Premier commit = version v1 propre.

- **Méthode assistée (recommandée)** : démarrer une nouvelle session Claude Code
  **connectée à `lbf-metallerie`**, et demander : *« installe l'application et
  configure le circuit selon SETUP-LBF-METALLERIE.md »*. Claude fait tout :
  contenu, branche `dev`, Pages, archivage des versions.

### Étape C — Brancher le site en ligne (GitHub Pages)
1. Dans `lbf-metallerie` → **Settings → Pages**
2. **Source** : *Deploy from a branch*
3. **Branch** : `main` / `/ (root)` → **Save**
4. Au bout d'1-2 min, le site est en ligne à l'adresse indiquée.

### Étape D — Figer la première version
1. Onglet **Releases** → **Create a new release**
2. **Tag** : `v1` · **Titre** : « Version stable initiale » → **Publish release**

---

## 5. À reprendre depuis l'ancien repo (déjà inclus dans le ZIP)

- ✅ `.github/workflows/keep-supabase-awake.yml` — keep-alive Supabase (anti-pause 7 jours)
- ✅ `MIGRATION-V3.md` — plan de migration vers Supabase Auth (pour plus tard)
- ✅ Toute l'application (stock, synthèse, plan de stockage, tôles v2, comptes, PDF…)

> ⚠️ Le keep-alive pointe vers la base Supabase actuelle (`ihpwdcndytxdnqjdcrsn`).
> Tant qu'on garde la même base, rien à changer.

---

## 6. Checklist de démarrage

- [ ] Repo `lbf-metallerie` créé (vide, privé)
- [ ] Application uploadée sur `main` (version stable v1)
- [ ] Branche `dev` créée
- [ ] GitHub Pages activé depuis `main` — site en ligne vérifié
- [ ] Release `v1` publiée
- [ ] (optionnel) Robot d'archivage automatique des versions
- [ ] Ancien repo `lbf-stock-v2` : à conserver en archive, ne plus y toucher

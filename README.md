# L'Atelier — Ebook-V-001 (version Web)

Application SaaS personnelle : **plans personnalisés**, **création d'e-books**, **suivi d'avancement** (Gantt, priorités, échéances), **coach IA** — avec une **vraie base de données** (Supabase/PostgreSQL) et des comptes utilisateurs.

**Stack** : React 18 + Vite · Supabase (auth + base de données, gratuit) · Tailwind (CDN) · lucide-react · IA optionnelle via l'API Anthropic.

**Coût : 0 €** pour tout, sauf l'IA qui est optionnelle (elle nécessite votre propre clé API Anthropic, facturée à l'usage). Sans clé, l'application est entièrement utilisable : modèles de plans prêts à l'emploi, édition manuelle, Gantt, exports, base de données.

---

## 1. Prérequis

- Node.js 18 ou plus récent (`node -v` pour vérifier)
- Un compte GitHub (gratuit)
- Un compte Supabase (gratuit) : https://supabase.com
- Pour le déploiement : un compte Vercel (gratuit, recommandé) ou GitHub Pages

---

## 2. Créer la base de données Supabase (≈ 5 minutes)

1. Connectez-vous sur https://supabase.com → **New project**.
   Choisissez un nom (ex. `atelier-ebook`), un mot de passe de base de données (notez-le), une région proche (ex. `eu-west-3`, Paris). Plan **Free**.
2. Une fois le projet créé, ouvrez **SQL Editor** (menu de gauche) → **New query**.
3. Copiez-collez **tout le contenu** du fichier [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Cela crée la table `user_data` avec la sécurité Row Level Security : chaque utilisateur ne peut lire et écrire que ses propres données.
4. Récupérez vos deux clés : **Settings → API** :
   - `Project URL` → ce sera `VITE_SUPABASE_URL`
   - `anon public` key → ce sera `VITE_SUPABASE_ANON_KEY`
   (La clé `anon` est faite pour être publique : la sécurité est assurée par les policies RLS créées à l'étape 3. Ne partagez jamais la clé `service_role`.)
5. Optionnel mais recommandé pour tester vite : **Authentication → Sign In / Up → Email** → désactivez **Confirm email**. Sinon, chaque nouveau compte devra cliquer un lien de confirmation reçu par email avant de pouvoir se connecter.

---

## 3. Lancer en local (≈ 3 minutes)

```bash
# 1. Dans le dossier du projet
npm install

# 2. Configuration
cp .env.example .env
# → ouvrez .env et collez vos deux valeurs Supabase (étape 2.4)

# 3. Démarrer
npm run dev
# → http://localhost:5173
```

Créez un compte (email + mot de passe), puis créez un plan depuis un modèle : il apparaît dans la table `user_data` de Supabase (visible dans **Table Editor**).

---

## 4. Déployer

### Option A — Vercel (recommandé : le plus simple)

1. Poussez le projet sur un repo GitHub :
   ```bash
   git init && git add . && git commit -m "L'Atelier v2 web"
   git branch -M main
   git remote add origin https://github.com/VOTRE-USER/VOTRE-REPO.git
   git push -u origin main
   ```
2. Sur https://vercel.com → **Add New → Project** → importez le repo.
   Vercel détecte Vite automatiquement (build `npm run build`, output `dist`).
3. Avant de cliquer Deploy, ouvrez **Environment Variables** et ajoutez :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy**. Votre app est en ligne sur `https://votre-projet.vercel.app`, avec HTTPS, et se redéploie à chaque `git push`.

### Option B — GitHub Pages

Le workflow est déjà fourni : [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Poussez le projet sur GitHub (voir ci-dessus).
2. Dans le repo : **Settings → Pages → Source : GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret** — créez :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Poussez sur `main` (ou lancez le workflow depuis l'onglet Actions). L'app sera servie sur
   `https://votre-user.github.io/votre-repo/` (le chemin de base est géré automatiquement par le workflow via `BASE_PATH`).

---

## 5. Activer l'IA (optionnel, facturé à l'usage)

Sans clé, tout fonctionne sauf la génération automatique (plans IA, sommaires, chapitres, coach).

1. Créez une clé API sur https://console.anthropic.com (nécessite d'ajouter des crédits — quelques euros suffisent largement pour un usage personnel).
2. Dans l'application : **Suivi & données → IA (optionnel)** → collez la clé → Enregistrer.

La clé est stockée **uniquement dans votre navigateur** (localStorage), jamais dans Supabase. L'appel se fait directement depuis le navigateur grâce à l'en-tête `anthropic-dangerous-direct-browser-access` ; c'est acceptable pour un outil personnel, mais si un jour vous ouvrez l'app au public, déplacez ces appels vers un backend (ex. Supabase Edge Function) pour ne pas exposer de clé dans le navigateur des visiteurs. Docs : https://docs.claude.com/en/api/overview

---

## 6. Structure du projet

```
.
├── index.html                  # Point d'entrée (Tailwind via CDN)
├── package.json
├── vite.config.js              # base configurable pour GitHub Pages
├── .env.example                # → à copier en .env
├── supabase/
│   └── schema.sql              # Table user_data + policies RLS (à exécuter 1 fois)
├── .github/workflows/
│   └── deploy.yml              # Déploiement GitHub Pages automatique
└── src/
    ├── main.jsx
    ├── App.jsx                 # Toute l'application (vues, Gantt, coach…)
    └── lib/
        ├── supabase.js         # Client + load/save des données utilisateur
        └── ai.js               # Appels API Anthropic (clé optionnelle)
```

**Modèle de données** : un enregistrement JSONB par utilisateur dans `user_data`
(`{ plans, ebooks, activity, coach, settings }`), sauvegardé automatiquement 800 ms
après chaque modification (indicateur « Base Supabase · synchronisée » dans la barre latérale).
Un export/import JSON manuel reste disponible dans **Suivi & données** comme copie de secours.

---

## 7. Fonctionnalités

- **Plans personnalisés** : génération IA ou 3 modèles prêts à l'emploi ; phases → étapes → tâches cochables ; dates d'échéance et priorités attribuées automatiquement ; ajout/suppression de tâches ; notes.
- **Diagramme de Gantt** par plan : barres colorées par priorité, repères de mois, ligne « aujourd'hui ».
- **E-books** : sommaire généré puis validé/modifié ; rédaction chapitre par chapitre (IA ou manuelle) ; aperçu mis en page ; exports Markdown et HTML (imprimable en PDF).
- **Suivi** : progression par projet, prochaines échéances, journal d'activité, compteur de mots.
- **Coach IA** : chatbot connecté à l'état réel de vos projets.
- **Partage** : envoi d'un plan par email (mailto:), export PDF du plan (HTML imprimable).
- **Comptes & base de données** : auth email/mot de passe, données par utilisateur, RLS, multi-appareils.
- Thème clair (par défaut) / sombre, animations, responsive mobile.

---

## 8. Dépannage

| Problème | Solution |
|---|---|
| Écran « Configuration Supabase manquante » | Le fichier `.env` est absent ou mal rempli. Relancez `npm run dev` après modification. Sur Vercel/GitHub : vérifiez les variables d'environnement puis redéployez. |
| « Échec de la sauvegarde » dans la barre latérale | Le schéma SQL n'a pas été exécuté (table `user_data` absente) ou les policies RLS manquent. Rejouez `supabase/schema.sql`. |
| Inscription ok mais connexion impossible | La confirmation par email est activée : cliquez le lien reçu, ou désactivez **Confirm email** (étape 2.5). |
| Erreur API 401 côté IA | Clé API invalide ou sans crédit. Vérifiez sur console.anthropic.com. |
| Page blanche sur GitHub Pages | Vérifiez que le déploiement vient bien du workflow (Source : GitHub Actions) — il définit le bon chemin de base. |

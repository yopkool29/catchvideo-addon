# CatchVideo Button — Firefox Addon

Extension Firefox qui ajoute un bouton "Catch!" sur YouTube pour télécharger
vidéos et audio via catchvideo.net. L'addon fait aussi office de proxy CORS/UA
pour que le site puisse fetch les streams directement.

## Structure

```
addon/
├── src/
│   ├── icons/              # icônes PNG
│   ├── content.js          # bouton sur YouTube (utilise __SITE_URL__)
│   ├── background.js       # service worker (proxy CORS/UA/cookies)
│   ├── content-relay.js    # relay messages page ↔ background
│   ├── options.html        # page d'options (toggle bouton)
│   └── options.js
├── scripts/
│   ├── copy-assets.js      # post-build: copie icônes + aplatit dist/
│   └── watch.js            # watch mode avec rebuild auto
├── manifest.json           # template de base (champs communs)
├── vite.config.js          # config Vite + 3 modes (dev/beta/prod)
└── package.json
```

## Prérequis

- Node.js 20+
- pnpm 10+

```bash
cd addon
pnpm install
```

## Build

Trois modes selon l'environnement cible :

| Mode | SITE_URL | Relay matches | Homepage |
|------|----------|---------------|----------|
| `dev` | `http://localhost:3005` | `http://localhost/*` | — |
| `beta` | `https://beta.catchvideo.net` | `https://*.beta.catchvideo.net/*` | `https://beta.catchvideo.net` |
| `prod` | `https://catchvideo.net` | `https://*.catchvideo.net/*` | `https://catchvideo.net` |

```bash
pnpm build:dev    # → dist/ (localhost)
pnpm build:beta   # → dist/ (beta.catchvideo.net)
pnpm build:prod   # → dist/ (catchvideo.net)
```

Le build produit un dossier `dist/` plat :

```
dist/
├── manifest.json
├── background.js
├── content.js
├── content-relay.js
├── options.html
├── options.js
└── icons/
    ├── icon16.png
    ├── icon32.png
    └── icon48.png
```

## Watch mode (rebuild auto)

Rebuild automatique quand un fichier source change :

```bash
pnpm watch:dev    # watch en mode dev
pnpm watch:beta   # watch en mode beta
pnpm watch:prod   # watch en mode prod
```

Le navigateur ne s'ouvre pas automatiquement (`disableAutoLaunch: true`).

## Charger l'addon dans Firefox

1. Ouvrir `about:debugging#/runtime/this-firefox`
2. Cliquer "Load Temporary Add-on..."
3. Sélectionner `dist/manifest.json`

## Soumission AMO (production)

1. `pnpm build:prod`
2. Zipper le contenu de `dist/` (pas le dossier lui-même) :
   ```bash
   cd dist && zip -r ../catchvideo-button-3.0.0.zip . && cd ..
   ```
3. Soumettre sur https://addons.mozilla.org/developers/
4. Voir `docs/ADDON_REVIEW_RISK.md` pour les points de review

## Documentation complémentaire

- `docs/ADDON_DISTRIBUTED_FETCH.md` — architecture détaillée (proxy, mux, LibAV)
- `docs/ADDON_REVIEW_RISK.md` — risques de review AMO et actions
- `docs/ADDON_CHROME_OPERA.md` — plan pour Chromium (declarativeNetRequest)
- `addon/SPECIFICATION.md` — spec originale (POST/GET backend, flux)

# CatchVideo Addon

Browser extensions that add a **Catch!** button on YouTube and act as a
CORS/UA proxy so [catchvideo.net](https://catchvideo.net) can fetch video streams directly.

This repository is a submodule of [catchvideo4.net](https://github.com/yopkool29/catchvideo4.net)
mounted at `addon/`.

## Structure

```
addon/
├── firefox/          # Firefox addon (MV3, .xpi for AMO)
│   ├── manifest.json / manifest.full.json / manifest.lite.json
│   ├── src/          # full/ + lite/ variants, shared icons
│   ├── scripts/      # copy-assets, package (.xpi), watch
│   └── vite.config.js
└── chrome/           # Chrome extension (MV3, .zip for the Web Store)
    ├── manifest.full.json
    ├── manifest.lite.json
    ├── src/          # same layout — full background uses DNR session rules
    ├── scripts/
    └── package.json
```

## Variants

| Variant | Permissions | Scope |
|---|---|---|
| **full** | cookies + header injection (Firefox: webRequestBlocking, Chrome: DNR session rules) | all supported sites |
| **lite** | declarativeNetRequest only | limited sites, no header injection |

## Build

Two modes per browser: `dev` (localhost:3005) and `prod` (catchvideo.net).

```bash
# Firefox
cd firefox && pnpm install
pnpm build:prod            # → dist/prod-full/ + .xpi
pnpm build:prod:lite       # → dist/prod-lite/ + .xpi

# Chrome
cd chrome && pnpm install
pnpm build:prod            # → dist/prod-full/ + .zip
pnpm build:prod:lite       # → dist/prod-lite.zip
```

## Deployment to the website

The packages are served from the website at `/downloads/` as
`catchvideo-addon-prod{-lite}.{zip,xpi}`. Copy them after building
(`build:prod` already runs the package step):

```bash
cd addon
cp chrome/dist/catchvideo-addon-*-prod.zip            ../frontend/public/downloads/catchvideo-addon-prod.zip
cp chrome/dist/catchvideo-addon-*-prod-lite.zip       ../frontend/public/downloads/catchvideo-addon-prod-lite.zip
cp firefox/dist/catchvideo-addon-*-prod.xpi           ../frontend/public/downloads/catchvideo-addon-prod.xpi
cp firefox/dist/catchvideo-addon-*-prod-lite.xpi      ../frontend/public/downloads/catchvideo-addon-prod-lite.xpi
```

(see `frontend/public/images/addon-debug/README.md` for the exact names)

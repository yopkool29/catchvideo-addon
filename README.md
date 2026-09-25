# CatchVideo Addon

Browser extensions that add a **Catch!** button on YouTube and act as a
CORS/UA proxy so catchvideo.net can fetch video streams directly.

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

Three modes per browser: `dev` (localhost:3005), `beta` (beta4.catchvideo.net),
`prod` (catchvideo.net).

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

The packages are served from the website at `/downloads/` under public names
that keep the channel — `catchvideo-addon-{beta,prod}{-lite}.{zip,xpi}` — so
the served channel can never be mixed up. The frontend picks `-beta` or
`-prod` via `NUXT_PUBLIC_ADD_ON_BETA`. Copy both channels after building
(`build:prod`/`build:beta` already run the package step):

```bash
cd addon
for ch in beta prod; do
  cp chrome/dist/catchvideo-addon-*-$ch.zip           ../frontend/public/downloads/catchvideo-addon-$ch.zip
  cp chrome/dist/catchvideo-addon-*-$ch-lite.zip      ../frontend/public/downloads/catchvideo-addon-$ch-lite.zip
  cp firefox/dist/catchvideo-addon-*-$ch.xpi          ../frontend/public/downloads/catchvideo-addon-$ch.xpi
  cp firefox/dist/catchvideo-addon-*-$ch-lite.xpi     ../frontend/public/downloads/catchvideo-addon-$ch-lite.xpi
done
```

(see `frontend/public/images/addon-debug/README.md` for the exact names)

// Post-build step:
// 1. Copy static assets referenced in the manifest (icons) into dist/.
// 2. Flatten dist/src/ -> dist/ so the extension root is clean.
// 3. Remove the other variant directory to keep the XPI clean.
// vite-plugin-web-extension bundles into dist/src/ preserving the source
// tree, but Firefox expects manifest.json and all files at the same level.
import { cpSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(process.cwd())
const variant = process.env.ADDON_VARIANT === 'lite' ? 'lite' : 'full'
const mode = process.env.ADDON_MODE || 'dev'
const dist = join(root, 'dist', `${mode}-${variant}`)
const distSrc = join(dist, 'src')

// Get the addon variant to determine which manifest to read
const manifestFile = `manifest.${variant}.json`

// --- 1. Copy static assets (icons) from src/ to dist/ ---
const manifest = JSON.parse(readFileSync(join(root, manifestFile), 'utf8'))
const assets = Object.values(manifest.icons || {})
let copied = 0

for (const assetPath of assets) {
	const src = join(root, assetPath)
	const dest = join(dist, assetPath.replace(/^src\//, ''))
	if (existsSync(src)) {
		mkdirSync(dirname(dest), { recursive: true })
		cpSync(src, dest)
		copied++
		console.log(`  copied: ${assetPath}`)
	} else {
		console.warn(`  missing: ${assetPath}`)
	}
}
console.log(`copy-assets: ${copied}/${assets.length} static assets copied`)

// --- 2. Flatten dist/src/ -> dist/ ---
if (existsSync(distSrc)) {
	const entries = readdirSync(distSrc)
	for (const entry of entries) {
		const from = join(distSrc, entry)
		const to = join(dist, entry)
		if (existsSync(to)) {
			rmSync(to, { recursive: true })
		}
		renameSync(from, to)
		console.log(`  flattened: src/${entry} -> ${entry}`)
	}
	rmSync(distSrc, { recursive: true })
	console.log('copy-assets: flattened dist/src/ -> dist/')
}

// --- 2b. Copy declarativeNetRequest rules (lite only, after flatten) ---
if (variant === 'lite') {
	const rulesSrc = join(root, 'src/lite/rules.json')
	const rulesDest = join(dist, 'lite/rules.json')
	if (existsSync(rulesSrc)) {
		mkdirSync(dirname(rulesDest), { recursive: true })
		cpSync(rulesSrc, rulesDest)
		console.log('  copied: src/lite/rules.json -> lite/rules.json')
	}
}

// --- 3. Remove the other variant directory ---
const otherVariant = variant === 'full' ? 'lite' : 'full'
const otherDir = join(dist, otherVariant)
if (existsSync(otherDir)) {
	rmSync(otherDir, { recursive: true })
	console.log(`copy-assets: removed ${otherVariant}/ (not needed for ${variant} build)`)
}

// --- 4. Remove Vite virtual-module artifacts (empty sourcemaps, not shippable) ---
for (const entry of readdirSync(dist)) {
	if (entry.startsWith('virtual:')) {
		rmSync(join(dist, entry))
		console.log(`  removed artifact: ${entry}`)
	}
}

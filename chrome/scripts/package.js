// Post-build step: create a .zip package of dist/ for the Chrome Web Store.
// Reads the version from package.json to name the output file.
// Includes the variant (full/lite) in the filename when ADDON_VARIANT is set.
import { statSync, readFileSync, existsSync, copyFileSync } from 'node:fs'
import { join, resolve, relative, basename, extname } from 'node:path'
import { execSync } from 'node:child_process'

const root = resolve(process.cwd())
const variant = process.env.ADDON_VARIANT === 'lite' ? 'lite' : 'full'
const mode = process.env.ADDON_MODE || 'dev'
const dist = join(root, 'dist', `${mode}-${variant}`)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const variantSuffix = variant === 'lite' ? '-lite' : ''
const outFile = join(root, `dist/catchvideo-addon-${pkg.version}-${mode}${variantSuffix}.zip`)

// Use the system zip command — reliable and no dependency needed.
// -r = recursive, -X = exclude extra file attributes (portable zip)
execSync(`zip -r -X "${outFile}" .`, { cwd: dist, stdio: 'inherit' })

const size = statSync(outFile).size
console.log(`package: created ${relative(root, outFile)} (${(size / 1024).toFixed(1)} kB)`)

// Sync release packages into the frontend's public downloads so the site always
// serves the latest build (version-stripped name). Dev packages are not published.
if (mode !== 'dev') {
	const publicDir = resolve(root, '../../frontend/public/downloads')
	if (existsSync(publicDir)) {
		const siteFile = join(publicDir, `catchvideo-addon-${mode}${variantSuffix}${extname(outFile)}`)
		copyFileSync(outFile, siteFile)
		console.log(`package: synced ${basename(siteFile)}`)
	}
}

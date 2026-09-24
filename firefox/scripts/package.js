// Post-build step: create a .xpi package of dist/ for Firefox/AMO submission.
// A .xpi is just a zip with a different extension.
// Reads the version from package.json to name the output file.
// Includes the variant (full/lite) in the filename when ADDON_VARIANT is set.
import { statSync, readFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { execSync } from 'node:child_process'

const root = resolve(process.cwd())
const variant = process.env.ADDON_VARIANT === 'lite' ? 'lite' : 'full'
const mode = process.env.ADDON_MODE || 'dev'
const dist = join(root, 'dist', `${mode}-${variant}`)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const variantSuffix = variant === 'lite' ? '-lite' : ''
const outFile = join(root, `dist/catchvideo-addon-${pkg.version}-${mode}${variantSuffix}.xpi`)

// Use the system zip command — reliable and no dependency needed.
// -r = recursive, -X = exclude extra file attributes (portable zip)
execSync(`zip -r -X "${outFile}" .`, { cwd: dist, stdio: 'inherit' })

const size = statSync(outFile).size
console.log(`package: created ${relative(root, outFile)} (${(size / 1024).toFixed(1)} kB)`)

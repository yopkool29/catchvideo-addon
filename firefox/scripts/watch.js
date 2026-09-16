// Watch mode: runs `vite build --watch` and re-executes copy-assets.js
// whenever the build output changes.
import { spawn, execSync } from 'node:child_process'
import { watch, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = resolve(process.cwd())
const dist = join(root, 'dist')
const mode = process.argv[2] || 'dev'

console.log(`[watch] Starting vite build --watch --mode ${mode}`)

const vite = spawn('npx', ['vite', 'build', '--watch', '--mode', mode], {
	stdio: 'inherit',
	shell: true,
})

let debounce = null

function runCopyAssets() {
	if (debounce) clearTimeout(debounce)
	debounce = setTimeout(() => {
		try {
			execSync('node scripts/copy-assets.js', { stdio: 'inherit', cwd: root })
			console.log('[watch] Post-build assets ready')
		} catch (err) {
			console.error('[watch] copy-assets failed:', err.message)
		}
	}, 300)
}

// Watch dist/ for changes (vite writes here on rebuild)
if (existsSync(dist)) {
	watch(dist, { recursive: true }, (event, filename) => {
		if (filename && filename.endsWith('.js') || filename?.endsWith('.html') || filename?.endsWith('.json')) {
			runCopyAssets()
		}
	})
} else {
	// dist doesn't exist yet, poll until it does
	const poll = setInterval(() => {
		if (existsSync(dist)) {
			clearInterval(poll)
			watch(dist, { recursive: true }, (event, filename) => {
				if (filename && (filename.endsWith('.js') || filename.endsWith('.html') || filename.endsWith('.json'))) {
					runCopyAssets()
				}
			})
		}
	}, 500)
}

// Also run copy-assets once after the initial build
setTimeout(runCopyAssets, 2000)

vite.on('close', () => process.exit(0))
process.on('SIGINT', () => { vite.kill(); process.exit(0) })

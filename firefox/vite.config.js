import { defineConfig } from 'vite'
import webExtension, { readJsonFile } from 'vite-plugin-web-extension'

// Environment-specific configuration
const envConfig = {
	dev: {
		siteUrl: 'http://localhost:3005',
		relayMatches: ['http://localhost/*'],
		homepageUrl: undefined,
		dataCollectionPermissions: undefined,
		addonIdFull: 'catchvideo-net@local',
		addonIdLite: 'catchvideo-net-lite@local',
	},
	beta: {
		siteUrl: 'https://beta4.catchvideo.net',
		relayMatches: ['https://beta4.catchvideo.net/*'],
		homepageUrl: 'https://beta4.catchvideo.net',
		dataCollectionPermissions: { required: ['none'] },
		addonIdFull: 'catchvideo-net@beta.catchvideo.net',
		addonIdLite: 'catchvideo-net-lite@beta.catchvideo.net',
	},
	prod: {
		siteUrl: 'https://catchvideo.net',
		relayMatches: ['https://catchvideo.net/*'],
		homepageUrl: 'https://catchvideo.net',
		dataCollectionPermissions: { required: ['none'] },
		addonIdFull: 'catchvideo-net@catchvideo.net',
		addonIdLite: 'catchvideo-net-lite@catchvideo.net',
	},
}

// Remove the "src/" prefix from a path so the output manifest references
// files at the root of dist/ instead of dist/src/.
const flatten = (p) => p.replace(/^src\//, '')

// Get the addon variant from ADDON_VARIANT env var (default: full)
// full = webRequest + cookies + all_urls (Firefox only)
// lite = simple fetch only, limited host_permissions (Firefox + Chrome)
const getVariant = () => {
	const variant = process.env.ADDON_VARIANT || 'full'
	return variant === 'lite' ? 'lite' : 'full'
}

export default defineConfig(({ mode }) => {
	const config = envConfig[mode] || envConfig.dev
	const variant = getVariant()

	return {
		plugins: [
			webExtension({
				browser: 'firefox',
			disableAutoLaunch: true,
				manifest: () => {
					const pkg = readJsonFile('package.json')
					const base = readJsonFile(`manifest.${variant}.json`)

					const manifest = {
						...base,
						version: pkg.version,
						content_scripts: [
							{
								matches: config.relayMatches,
								js: [`src/${variant}/content-relay.js`],
								run_at: 'document_start',
							},
							{
								matches: ['https://*.youtube.com/*'],
								js: [`src/${variant}/content.js`],
								run_at: 'document_idle',
							},
						],
					}

					// Override addon ID based on environment and variant
					const addonId = variant === 'lite' ? config.addonIdLite : config.addonIdFull
					manifest.browser_specific_settings.gecko.id = addonId

					if (config.homepageUrl) {
						manifest.homepage_url = config.homepageUrl
					}

					if (config.dataCollectionPermissions) {
						manifest.browser_specific_settings.gecko.data_collection_permissions = config.dataCollectionPermissions
					}

					return manifest
				},
				// Flatten paths in the final manifest so files are at dist/ root
				transformManifest: (manifest) => {
					if (manifest.background?.scripts) {
						manifest.background.scripts = manifest.background.scripts.map(flatten)
					}
					if (manifest.options_ui?.page) {
						manifest.options_ui.page = flatten(manifest.options_ui.page)
					}
					if (manifest.icons) {
						const flat = {}
						for (const [k, v] of Object.entries(manifest.icons)) {
							flat[k] = flatten(v)
						}
						manifest.icons = flat
					}
					for (const cs of manifest.content_scripts || []) {
						if (cs.js) cs.js = cs.js.map(flatten)
					}
					return manifest
				},
			}),
		],
		define: {
			__SITE_URL__: JSON.stringify(config.siteUrl),
			__ENV__: JSON.stringify(mode),
			__VARIANT__: JSON.stringify(variant),
		},
		build: {
			// Keep console.logs in beta for debugging, strip in prod
			minify: mode === 'prod' ? 'esbuild' : false,
			sourcemap: mode !== 'prod',
			outDir: `dist/${mode}-${variant}`,
			emptyOutDir: true,
		},
	}
})

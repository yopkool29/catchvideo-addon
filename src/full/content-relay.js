/**
 * Catchvideo.net — Content relay script
 * Injected on catchvideo.net (or localhost in dev mode)
 * Relays messages between the page and the background script via postMessage
 */

console.log('[Catchvideo.net] Content relay script loaded on:', window.location.href)

// Notify the page that the addon is present
window.postMessage({ type: 'catchvideo-addon-available', variant: __VARIANT__ }, '*')

// Listen for messages from the page (catchvideo.net)
window.addEventListener('message', async (event) => {
	if (event.source !== window) return

	const data = event.data
	if (!data || !data.type) return

	// Ping — check if addon is available
	if (data.type === 'catchvideo-ping') {
		try {
			const response = await chrome.runtime.sendMessage({ action: 'ping' })
			window.postMessage({
				type: 'catchvideo-ping-result',
				id: data.id,
				ok: response?.ok === true,
				variant: response?.variant || __VARIANT__,
			}, '*')
		} catch (err) {
			window.postMessage({
				type: 'catchvideo-ping-result',
				id: data.id,
				ok: false
			}, '*')
		}
		return
	}

	// Generic fetch proxy for yt-dlp browser proxy — body is base64 encoded
	if (data.type === 'catchvideo-fetch') {
		try {
			const response = await chrome.runtime.sendMessage({
				action: 'catchvideo-fetch',
				id: data.id,
				url: data.url,
				method: data.method,
				headers: data.headers,
				body: data.body,
			})
			window.postMessage({
				type: 'catchvideo-fetch-result',
				id: data.id,
				result: response,
			}, '*')
		} catch (err) {
			window.postMessage({
				type: 'catchvideo-fetch-result',
				id: data.id,
				result: { status: 'error', reason: err.message },
			}, '*')
		}
		return
	}

	// Fetch with headers for downloads (chunked fetch, HLS segments)
	if (data.type === 'catchvideo-fetch-with-headers') {
		try {
			const response = await chrome.runtime.sendMessage({
				action: 'fetch-with-headers',
				url: data.url,
				method: data.method,
				headers: data.headers,
				body: data.body,
				stripHeaders: data.stripHeaders,
				injectHeaders: data.injectHeaders
			})
			window.postMessage({
				type: 'catchvideo-fetch-with-headers-result',
				id: data.id,
				result: response
			}, '*')
		} catch (err) {
			window.postMessage({
				type: 'catchvideo-fetch-with-headers-result',
				id: data.id,
				result: { status: 'error', reason: err.message }
			}, '*')
		}
		return
	}

	// Get cookies for a domain (extension-only permission)
	if (data.type === 'catchvideo-get-cookies') {
		try {
			const response = await chrome.runtime.sendMessage({
				action: 'get-cookies',
				domain: data.domain
			})
			window.postMessage({
				type: 'catchvideo-get-cookies-result',
				id: data.id,
				result: response
			}, '*')
		} catch (err) {
			window.postMessage({
				type: 'catchvideo-get-cookies-result',
				id: data.id,
				result: { status: 'error', reason: err.message }
			}, '*')
		}
		return
	}

	// Open the browser's default download folder
	if (data.type === 'catchvideo-open-download-folder') {
		try {
			await chrome.runtime.sendMessage({ action: 'open-download-folder' })
		} catch (err) {
			console.error('[Catchvideo.net] Open download folder failed:', err)
		}
		return
	}
})

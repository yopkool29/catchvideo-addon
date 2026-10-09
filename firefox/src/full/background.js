/**
 * Catchvideo.net — Service Worker (MV3)
 *
 * Thin proxy: the site controls everything (headers to strip, UA, cookies).
 * The addon only executes what the site asks — no hardcoded logic.
 */

// Per-request config. The site controls stripHeaders, injectHeaders, and userAgent.
// We use a Map keyed by URL so concurrent fetches (e.g. mux video+audio in parallel)
// don't race on a single global. onBeforeSendHeaders matches by URL, onHeadersReceived
// matches by requestId (resolved from the URL entry).
const activeConfigs = new Map()

function mergeCookieHeaders(browserCookie, injectedCookie) {
	const cookies = new Map()
	for (const header of [browserCookie, injectedCookie]) {
		for (const part of (header || '').split(';')) {
			const separator = part.indexOf('=')
			if (separator < 1) continue
			cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
		}
	}
	return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

chrome.webRequest.onBeforeSendHeaders.addListener(
	(details) => {
		const config = activeConfigs.get(details.url)
		if (!config) return {}
		config.requestId = details.requestId

		let headers = (details.requestHeaders || [])

		// Strip headers requested by the site
		if (config.stripHeaders && config.stripHeaders.length > 0) {
			const toStrip = new Set(config.stripHeaders.map(h => h.toLowerCase()))
			headers = headers.filter(h => !toStrip.has(h.name.toLowerCase()))
		}

		// Always strip browser-added headers that reveal this is an extension request.
		// Twitter and other APIs block requests with Origin: moz-extension://...
		const browserHeaders = new Set(['origin', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user', 'sec-fetch-dest'])
		headers = headers.filter(h => !browserHeaders.has(h.name.toLowerCase()))

		// Override User-Agent if the site requested one
		if (config.userAgent) {
			headers = headers.filter(h => h.name.toLowerCase() !== 'user-agent')
			headers.push({ name: 'User-Agent', value: config.userAgent })
		}

		// Inject custom headers that fetch() can't set (Cookie, Referer, etc.)
		if (config.injectHeaders) {
			for (const [key, value] of Object.entries(config.injectHeaders)) {
				const existing = headers.find(h => h.name.toLowerCase() === key.toLowerCase())
				const injectedValue = key.toLowerCase() === 'cookie'
					? mergeCookieHeaders(existing?.value, value)
					: value
				headers = headers.filter(h => h.name.toLowerCase() !== key.toLowerCase())
				headers.push({ name: key, value: injectedValue })
			}
		}

		return { requestHeaders: headers }
	},
	{ urls: ['https://*/*', 'http://*/*'] },
	['blocking', 'requestHeaders']
)

chrome.webRequest.onHeadersReceived.addListener(
	(details) => {
		const config = activeConfigs.get(details.url)
		if (!config || details.requestId !== config.requestId || !config.captureResponseCookies) return
		config.setCookies = (details.responseHeaders || [])
			.filter(header => header.name.toLowerCase() === 'set-cookie')
			.map(header => header.value)
	},
	{ urls: ['https://*/*', 'http://*/*'] },
	['responseHeaders']
)

// Get cookies for a domain (extension-only permission)
async function getCookiesForDomain(domain) {
	try {
		const cookies = await chrome.cookies.getAll({ domain })
		return (cookies || []).map(c => `${c.name}=${c.value}`).join('; ')
	} catch {
		return ''
	}
}

// ArrayBuffer to base64 helper
function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	const chunk = 0x8000
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
	}
	return btoa(binary)
}

// Headers that fetch() cannot set and must go through webRequest.
const FORBIDDEN_HEADERS = new Set([
	'user-agent', 'cookie', 'referer', 'origin',
	'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
	'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user', 'sec-fetch-dest',
	'accept-encoding', 'content-length', 'upgrade-insecure-requests', 'priority',
])

// Per-URL fetch queue: activeConfigs is keyed by URL, so two concurrent
// fetches to the same URL would overwrite each other's config mid-flight.
// Different URLs still run in parallel.
const perUrlLocks = new Map()

function performFetch(args) {
	const key = args.url || ''
	const tail = (perUrlLocks.get(key) || Promise.resolve())
		.catch(() => {})
		.then(() => performFetchInner(args))
	perUrlLocks.set(key, tail)
	tail.finally(() => {
		if (perUrlLocks.get(key) === tail) perUrlLocks.delete(key)
	})
	return tail
}

// Unified fetch: used by both the browser proxy (catchvideo-fetch) and
// the download path (fetch-with-headers). Body is base64 in/out.
// Splits headers into standard (fetch) vs forbidden (webRequest injection).
async function performFetchInner({ url, method, headers, body, stripHeaders, injectHeaders, withCookies }) {
	const allHeaders = headers || {}
	const userAgent = allHeaders['User-Agent'] || allHeaders['user-agent'] || ''

	const fetchHeaders = {}
	const computedInject = { ...(injectHeaders || {}) }

	for (const [key, value] of Object.entries(allHeaders)) {
		if (key.toLowerCase() === 'user-agent') continue
		if (FORBIDDEN_HEADERS.has(key.toLowerCase())) {
			computedInject[key] = value
		} else {
			fetchHeaders[key] = value
		}
	}

	// Default: 'omit' — don't send browser cookies, yt-dlp expects a public/guest response.
	// TikTok: needs cookies to bypass anti-bot.
	// Dailymotion: needs cookies (access_token/client_token) to bypass 401 on GraphQL API.
	const fetchUrl = url || ''
	const cookieSites = ['tiktok.com', 'dailymotion.com']
	// withCookies: requested by the site when a CDN rejects cookie-less
	// downloads (401/403/503) — same mechanism as the builtin cookie sites.
	const needsCookies = cookieSites.some(d => fetchUrl.includes(d)) || withCookies === true
	const credentialsMode = needsCookies ? 'include' : 'omit'

	const fetchOptions = {
		method: method || 'GET',
		headers: fetchHeaders,
		credentials: credentialsMode,
	}

	if (body && method && method.toUpperCase() !== 'GET') {
		// body is base64-encoded
		const binStr = atob(body)
		const bytes = new Uint8Array(binStr.length)
		for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
		fetchOptions.body = bytes
	}

	const config = { url, userAgent, stripHeaders: stripHeaders || [], injectHeaders: computedInject, captureResponseCookies: !needsCookies, requestId: null, setCookies: [] }
	activeConfigs.set(url, config)
	try {
		const response = await fetch(url, fetchOptions)
		const buffer = await response.arrayBuffer()
		const bodyBase64 = arrayBufferToBase64(buffer)

		const responseHeaders = {}
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value
		})
		const setCookies = config.setCookies

		return {
			status: 'ok',
			httpStatus: response.status,
			httpStatusText: response.statusText,
			responseHeaders,
			setCookies,
			body: bodyBase64,
		}
	} catch (err) {
		return {
			status: 'error',
			reason: err.message || String(err),
		}
	} finally {
		activeConfigs.delete(url)
	}
}

// Shared message handler — used by onMessage (content-relay)
function handleMessage(request, sender, sendResponse) {
	if (request.action === 'ping') {
		sendResponse({ ok: true, variant: 'full' })
		return
	}

	// Generic fetch for yt-dlp browser proxy (body base64 in/out)
	if (request.action === 'catchvideo-fetch') {
		performFetch({
			url: request.url,
			method: request.method,
			headers: request.headers,
			body: request.body,
		})
			.then(result => sendResponse({ id: request.id, ...result }))
			.catch(err => sendResponse({
				id: request.id,
				status: 'error',
				reason: err.message || String(err),
			}))
		return true
	}

	// Fetch with headers for downloads (chunked fetch, HLS segments)
	if (request.action === 'fetch-with-headers') {
		performFetch({
			url: request.url,
			method: request.method,
			headers: request.headers,
			body: request.body,
			stripHeaders: request.stripHeaders,
			injectHeaders: request.injectHeaders,
			withCookies: request.withCookies,
		})
			.then(result => sendResponse({ ...result }))
			.catch(err => sendResponse({ status: 'error', reason: err.message }))
		return true
	}

	if (request.action === 'get-cookies') {
		const { domain } = request
		getCookiesForDomain(domain)
			.then(cookies => sendResponse({ status: 'ok', cookies }))
			.catch(err => sendResponse({ status: 'error', reason: err.message }))
		return true
	}

	if (request.action === 'open-download-folder') {
		// Firefox: open the downloads panel
		if (chrome.downloads && chrome.downloads.showDefaultFolder) {
			chrome.downloads.showDefaultFolder()
		}
		sendResponse({ status: 'ok' })
		return
	}
}

// Listen for messages from content-relay.js
chrome.runtime.onMessage.addListener(handleMessage)

console.log('Catchvideo.net service worker loaded (MV3)')

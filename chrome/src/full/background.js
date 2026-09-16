/**
 * Catchvideo.net — Service Worker (Chrome MV3)
 *
 * Thin proxy: the site controls everything (headers to strip, UA, cookies).
 * The addon only executes what the site asks — no hardcoded logic.
 *
 * Chrome MV3 has no blocking webRequest. Header injection/stripping is done
 * with declarativeNetRequest SESSION rules: one rule per fetch, scoped to the
 * exact URL (regexFilter), added before the fetch and removed after.
 */

// Session rules in flight, keyed by URL so concurrent fetches to different
// URLs don't remove each other's rules.
const activeRules = new Map()
let nextRuleId = 1

function escapeRegex(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Create a session rule applying the header modifications for this URL.
async function applySessionRule(url, { userAgent, stripHeaders, injectHeaders }) {
	const requestHeaders = []

	// Headers the site asked to strip...
	const toStrip = new Set((stripHeaders || []).map(h => h.toLowerCase()))
	// ...plus browser-added headers that reveal this is an extension request.
	// Twitter and other APIs block requests with Origin: chrome-extension://...
	for (const h of ['origin', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user', 'sec-fetch-dest']) {
		toStrip.add(h)
	}
	for (const header of toStrip) {
		requestHeaders.push({ header, operation: 'remove' })
	}

	// Override User-Agent if the site requested one
	if (userAgent) {
		requestHeaders.push({ header: 'User-Agent', operation: 'set', value: userAgent })
	}

	// Inject custom headers that fetch() can't set (Cookie, Referer, etc.)
	for (const [key, value] of Object.entries(injectHeaders || {})) {
		requestHeaders.push({ header: key, operation: 'set', value })
	}

	const rule = {
		id: nextRuleId++,
		priority: 1,
		action: { type: 'modifyHeaders', requestHeaders },
		condition: { regexFilter: escapeRegex(url), resourceTypes: ['xmlhttprequest'] },
	}
	await chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule] })
	activeRules.set(url, rule.id)
}

// Remove the session rule registered for this URL (no-op if already gone).
async function clearSessionRule(url) {
	const ruleId = activeRules.get(url)
	if (!ruleId) return
	activeRules.delete(url)
	try {
		await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] })
	} catch {
		// Session already cleared (service worker restart) — nothing to do.
	}
}

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

// Headers that fetch() cannot set and must go through a DNR session rule.
const FORBIDDEN_HEADERS = new Set([
	'user-agent', 'cookie', 'referer', 'origin',
	'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
	'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user', 'sec-fetch-dest',
	'accept-encoding', 'content-length', 'upgrade-insecure-requests', 'priority',
])

// Unified fetch: used by both the browser proxy (catchvideo-fetch) and
// the download path (fetch-with-headers). Body is base64 in/out.
// Splits headers into standard (fetch) vs forbidden (DNR session rule).
async function performFetch({ url, method, headers, body, stripHeaders, injectHeaders }) {
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
	const needsCookies = cookieSites.some(d => fetchUrl.includes(d))
	const credentialsMode = needsCookies ? 'include' : 'omit'

	// Cookie merge must happen BEFORE the DNR rule is created — the rule
	// replaces the whole header, so browser cookies are folded in here.
	if (computedInject.Cookie || computedInject.cookie) {
		const injected = computedInject.Cookie || computedInject.cookie
		delete computedInject.Cookie
		delete computedInject.cookie
		try {
			const browserCookie = await getCookiesForDomain(new URL(fetchUrl).hostname)
			computedInject.Cookie = mergeCookieHeaders(browserCookie, injected)
		} catch {
			computedInject.Cookie = injected
		}
	}

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

	// Create the session rule only when there is something to modify.
	const hasModifications = Object.keys(computedInject).length > 0
		|| (stripHeaders && stripHeaders.length > 0) || Boolean(userAgent)
	if (hasModifications) {
		try {
			await applySessionRule(fetchUrl, { userAgent, stripHeaders, injectHeaders: computedInject })
		} catch {
			// DNR unavailable — fall back to a plain fetch (lite behaviour).
		}
	}

	try {
		const response = await fetch(url, fetchOptions)
		const buffer = await response.arrayBuffer()
		const bodyBase64 = arrayBufferToBase64(buffer)

		const responseHeaders = {}
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value
		})

		return {
			status: 'ok',
			httpStatus: response.status,
			httpStatusText: response.statusText,
			responseHeaders,
			setCookies: [],
			body: bodyBase64,
		}
	} catch (err) {
		return {
			status: 'error',
			reason: err.message || String(err),
		}
	} finally {
		await clearSessionRule(fetchUrl)
	}
}

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
		// Chrome has no "open downloads folder" API — open the downloads page.
		chrome.tabs.create({ url: 'chrome://downloads' }).catch(() => {})
		sendResponse({ status: 'ok' })
		return
	}
}

// Listen for messages from content-relay.js
chrome.runtime.onMessage.addListener(handleMessage)

console.log('Catchvideo.net service worker loaded (Chrome MV3, DNR session rules)')

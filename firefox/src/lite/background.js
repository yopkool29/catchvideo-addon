/**
 * Catchvideo.net Lite — Service Worker (MV3)
 *
 * Simple fetch only — no webRequest, no cookie injection, no header modification.
 * Compatible with Chrome MV3 and Firefox MV3.
 * Supports: YouTube, Dailymotion, Vimeo, and other sites that work with basic fetch().
 * Does NOT support: TikTok, Instagram, Twitter (require header/cookie injection).
 */

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

// Simple fetch — no header modification, no cookie injection.
// credentials: 'omit' to avoid sending browser cookies that break yt-dlp parsing.
async function performFetch({ url, method, headers, body, withCookies }) {
	const allHeaders = headers || {}

	// Filter out headers that fetch() cannot set (browser will handle them)
	const fetchHeaders = {}
	for (const [key, value] of Object.entries(allHeaders)) {
		const lower = key.toLowerCase()
		if (lower === 'user-agent' || lower === 'cookie' || lower === 'referer'
			|| lower === 'origin' || lower === 'sec-fetch-mode' || lower === 'sec-fetch-site'
			|| lower === 'sec-fetch-user' || lower === 'sec-fetch-dest'
			|| lower === 'accept-encoding' || lower === 'content-length') {
			continue
		}
		fetchHeaders[key] = value
	}

	// Same logic as full version: 'omit' by default.
	// TikTok/Instagram/Dailymotion: need browser cookies to bypass anti-bot/401.
	const fetchUrl = url || ''
	const cookieSites = ['tiktok.com', 'instagram.com', 'dailymotion.com']
	// withCookies: requested by the site when a CDN rejects cookie-less downloads.
	const needsCookies = cookieSites.some(d => fetchUrl.includes(d)) || withCookies === true

	const fetchOptions = {
		method: method || 'GET',
		headers: fetchHeaders,
		credentials: needsCookies ? 'include' : 'omit',
	}

	if (body && method && method.toUpperCase() !== 'GET') {
		const binStr = atob(body)
		const bytes = new Uint8Array(binStr.length)
		for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
		fetchOptions.body = bytes
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
			body: bodyBase64,
		}
	} catch (err) {
		return {
			status: 'error',
			reason: err.message || String(err),
		}
	}
}

// Shared message handler — used by onMessage (content-relay)
function handleMessage(request, sender, sendResponse) {
	if (request.action === 'ping') {
		sendResponse({ ok: true, variant: 'lite' })
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
			withCookies: request.withCookies,
		})
			.then(result => sendResponse({ ...result }))
			.catch(err => sendResponse({ status: 'error', reason: err.message }))
		return true
	}

	if (request.action === 'open-download-folder') {
		if (chrome.downloads && chrome.downloads.showDefaultFolder) {
			chrome.downloads.showDefaultFolder()
		}
		sendResponse({ status: 'ok' })
		return
	}
}

// Listen for messages from content-relay.js
chrome.runtime.onMessage.addListener(handleMessage)

console.log('Catchvideo.net Lite service worker loaded (MV3)')

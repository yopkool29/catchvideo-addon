(() => {
	// Target site URL — injected at build time via Vite define
	const SITE_URL = __SITE_URL__

	// Whether to show the button (loaded from storage, default: true)
	let showButton = true

	// Load setting from storage
	chrome.storage.local.get('showButton', (result) => {
		showButton = result.showButton !== false
		tryInject()
	})

	// Listen for toggle messages from the popup
	chrome.runtime.onMessage.addListener((msg) => {
		if (msg.action === 'toggle-button') {
			showButton = msg.show !== false
			if (!showButton) {
				const old = document.getElementById('catchvideo-btn')
				if (old) old.remove()
				const wrapper = document.getElementById('catchvideo-btn-wrapper')
				if (wrapper) wrapper.remove()
			} else {
				tryInject()
			}
		}
	})

	// Build the site URL with the current page URL as a parameter
	// The site decides what to do with it (extract, search, etc.)
	function buildSiteLinkUrl() {
		return `${SITE_URL}/?addon&url=${encodeURIComponent(window.location.href)}`
	}

	// Inject a "Catch" button next to the Like button on YouTube watch pages
	function injectCatchButton() {
		// Already injected
		if (document.getElementById('catchvideo-btn')) return

		// Only inject on watch pages (not shorts, live, embed — those keep the floating button)
		if (!window.location.href.includes('youtube.com/watch')) return

		// Check if button should be shown
		if (!showButton) return

		const match = window.location.href.match(/(?:v=)([a-zA-Z0-9_-]{11})/)
		if (!match) return
		const videoId = match[1]

		// Find the action menu container — YouTube uses #top-level-buttons-computed
		// The like/dislike is a segmented button, then there's a Share button
		const container = document.querySelector('#top-level-buttons-computed')
		if (!container) return

		// Build the button using YouTube's own button classes for a native look
		const wrapper = document.createElement('yt-button-view-model')
		wrapper.className = 'ytd-menu-renderer'
		wrapper.id = 'catchvideo-btn-wrapper'

		const btnInner = document.createElement('button-view-model')
		btnInner.className = 'ytSpecButtonViewModelHost style-scope ytd-menu-renderer'

		const btn = document.createElement('button')
		btn.id = 'catchvideo-btn'
		btn.className = 'ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconLeading ytSpecButtonShapeNextEnableBackdropFilterExperiment'
		btn.title = 'Catch this video with CatchVideo'
		btn.setAttribute('aria-label', 'Catch')
		btn.setAttribute('aria-disabled', 'false')
		btn.style.background = 'linear-gradient(135deg,#e05a3f,#c14a30)'
		btn.style.color = '#fff'

		// Icon
		const iconDiv = document.createElement('div')
		iconDiv.className = 'ytSpecButtonShapeNextIcon'
		iconDiv.setAttribute('aria-hidden', 'true')
		iconDiv.innerHTML = `<span class="ytIconWrapperHost" style="width:24px;height:24px"><span class="yt-icon-shape ytSpecIconShapeHost"><div style="width:100%;height:100%;display:block;fill:currentColor"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 36 36" width="24" focusable="false" aria-hidden="true" style="pointer-events:none;display:inherit;width:100%;height:100%"><path d="M13 11.5C13 10.67 13.9 10.16 14.61 10.57L23.44 15.79C24.16 16.2 24.16 17.23 23.44 17.64L14.61 22.86C13.9 23.27 13 22.76 13 21.93V11.5Z" fill="white"/><path d="M18 24V28M18 28L15.5 25.5M18 28L20.5 25.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 30H24" stroke="white" stroke-width="2" stroke-linecap="round"/></svg></div></span></span>`

		// Textr
		const textDiv = document.createElement('div')
		textDiv.className = 'ytSpecButtonShapeNextButtonTextContent'
		textDiv.textContent = 'Catch!'
		textDiv.style.marginLeft = '-4px'
		textDiv.style.paddingTop = '1px'

		btn.appendChild(iconDiv)
		btn.appendChild(textDiv)

		// Touch feedback (YouTube style)
		const touchFeedback = document.createElement('yt-touch-feedback-shape')
		touchFeedback.className = 'ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse'
		touchFeedback.setAttribute('aria-hidden', 'true')
		touchFeedback.innerHTML = '<div class="ytSpecTouchFeedbackShapeStroke"></div><div class="ytSpecTouchFeedbackShapeFill"></div>'
		btn.appendChild(touchFeedback)

		// Wrap in link
		const link = document.createElement('a')
		link.href = buildSiteLinkUrl()
		link.target = '_blank'
		link.rel = 'noopener'
		link.style.textDecoration = 'none'
		link.style.display = 'inline-flex'
		link.appendChild(btn)

		btnInner.appendChild(link)
		wrapper.appendChild(btnInner)

		// Insert after the last button (Share button)
		container.appendChild(wrapper)
	}

	// Inject floating button for shorts/live/embed (no action menu there)
	function injectFloatingButton() {
		if (document.getElementById('catchvideo-btn')) return

		// Check if button should be shown
		if (!showButton) return

		// Only inject on pages with a valid video ID (shorts/live/embed)
		const match = window.location.href.match(/(?:shorts\/|live\/|embed\/)([a-zA-Z0-9_-]{11})/)
		if (!match) return

		const btn = document.createElement('a')
		btn.id = 'catchvideo-btn'
		btn.href = buildSiteLinkUrl()
		btn.target = '_blank'
		btn.rel = 'noopener'
		btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:6px;vertical-align:middle"><path d="M12 3v13M5 16l7 7 7-7"/></svg>Catch`
		btn.style.cssText = [
			'position:fixed',
			'bottom:24px',
			'right:24px',
			'z-index:9999',
			'display:flex',
			'align-items:center',
			'padding:10px 18px',
			'background:linear-gradient(135deg,#e05a3f,#c14a30)',
			'color:#fff',
			'font-family:Roboto,Arial,sans-serif',
			'font-size:14px',
			'font-weight:700',
			'border-radius:12px',
			'text-decoration:none',
			'box-shadow:0 4px 20px rgba(224,90,63,0.4)',
			'transition:transform 0.15s,box-shadow 0.15s',
			'cursor:pointer'
		].join(';')

		btn.addEventListener('mouseenter', () => {
			btn.style.transform = 'translateY(-2px)'
			btn.style.boxShadow = '0 6px 28px rgba(224,90,63,0.5)'
		})
		btn.addEventListener('mouseleave', () => {
			btn.style.transform = ''
			btn.style.boxShadow = '0 4px 20px rgba(224,90,63,0.4)'
		})

		document.body.appendChild(btn)
	}

	function tryInject() {
		// Remove old button first
		const old = document.getElementById('catchvideo-btn')
		if (old) old.remove()

		if (window.location.href.includes('youtube.com/watch')) {
			injectCatchButton()
		} else {
			injectFloatingButton()
		}
	}

	// Try injecting periodically until the action menu is available
	let attempts = 0
	const interval = setInterval(() => {
		tryInject()
		attempts++
		// Stop after 10 attempts (20s) if on watch page and button is injected
		if (document.getElementById('catchvideo-btn') && attempts >= 3) {
			clearInterval(interval)
		}
		if (attempts >= 10) clearInterval(interval)
	}, 2000)

	// Re-inject on SPA navigation
	let lastUrl = window.location.href
	const observer = new MutationObserver(() => {
		if (window.location.href !== lastUrl) {
			lastUrl = window.location.href
			attempts = 0
			const old = document.getElementById('catchvideo-btn')
			if (old) old.remove()
			// Reset interval for new page
			setTimeout(tryInject, 1500)
		}
	})
	observer.observe(document.body, { childList: true, subtree: true })
})()

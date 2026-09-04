(() => {
	const toggle = document.getElementById('toggle')

	// Load current setting (default: true)
	chrome.storage.local.get('showButton', (result) => {
		const show = result.showButton !== false
		toggle.classList.toggle('on', show)
	})

	// Toggle on click
	toggle.addEventListener('click', () => {
		const isOn = toggle.classList.toggle('on')
		chrome.storage.local.set({ showButton: isOn })

		// Notify all YouTube tabs to update
		chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
			for (const tab of tabs) {
				chrome.tabs.sendMessage(tab.id, { action: 'toggle-button', show: isOn }).catch(() => {})
			}
		})
	})
})()

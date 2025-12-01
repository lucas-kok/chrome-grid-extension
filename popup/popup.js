document.addEventListener("DOMContentLoaded", () => {
	const addVerticalBtn = document.getElementById("add-vertical");
	const addHorizontalBtn = document.getElementById("add-horizontal");
	const toggleRulerBtn = document.getElementById("toggle-ruler");
	const boxElementBtn = document.getElementById("box-element");
	const clearAllBtn = document.getElementById("clear-all");
	const colorInput = document.getElementById("line-color");
	const themeToggleBtn = document.getElementById("theme-toggle");

	// Theme handling
	function applyTheme(theme) {
		if (theme === "dark" || theme === "light") {
			document.documentElement.setAttribute("data-theme", theme);
		} else {
			document.documentElement.removeAttribute("data-theme");
		}
	}

	// Load saved settings
	chrome.storage.local.get(["lineColor", "theme"], (result) => {
		if (result.lineColor) {
			colorInput.value = result.lineColor;
		}
		if (result.theme) {
			applyTheme(result.theme);
		}
	});

	themeToggleBtn.addEventListener("click", () => {
		const currentTheme =
			document.documentElement.getAttribute("data-theme");
		const systemDark = window.matchMedia(
			"(prefers-color-scheme: dark)"
		).matches;

		let newTheme;
		if (currentTheme) {
			newTheme = currentTheme === "dark" ? "light" : "dark";
		} else {
			// If no override, switch to opposite of system
			newTheme = systemDark ? "light" : "dark";
		}

		applyTheme(newTheme);
		chrome.storage.local.set({ theme: newTheme });
	});

	// Helper to send message to active tab
	function sendMessageToActiveTab(message) {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]) {
				chrome.tabs.sendMessage(tabs[0].id, message);
			}
		});
	}

	addVerticalBtn.addEventListener("click", () => {
		sendMessageToActiveTab({
			action: "add-vertical",
			color: colorInput.value,
		});
	});

	addHorizontalBtn.addEventListener("click", () => {
		sendMessageToActiveTab({
			action: "add-horizontal",
			color: colorInput.value,
		});
	});

	toggleRulerBtn.addEventListener("click", () => {
		sendMessageToActiveTab({ action: "toggle-ruler" });
	});

	boxElementBtn.addEventListener("click", () => {
		sendMessageToActiveTab({ action: "toggle-picker" });
		window.close(); // Close popup to let user pick immediately
	});

	clearAllBtn.addEventListener("click", () => {
		sendMessageToActiveTab({ action: "clear-all" });
	});

	colorInput.addEventListener("change", (e) => {
		const newColor = e.target.value;
		chrome.storage.local.set({ lineColor: newColor });
		sendMessageToActiveTab({ action: "update-color", color: newColor });
	});
});

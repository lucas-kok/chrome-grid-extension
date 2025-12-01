(() => {
	// State
	let lines = [];
	let activeLine = null;
	let isDragging = false;
	let defaultColor = "#ff0000";

	// Constants
	const STORAGE_KEY_PREFIX = "layout-grid-lines-";

	// Helper to get storage key for current page
	const getStorageKey = () => {
		// Use origin + pathname to be specific but ignore query params/hashes if desired
		// For now, let's use the full URL to be safe, or maybe just origin+pathname
		return (
			STORAGE_KEY_PREFIX +
			window.location.origin +
			window.location.pathname
		);
	};

	// Initialize
	function init() {
		loadLines();
		setupEventListeners();

		// Load default color preference
		chrome.storage.local.get(["lineColor"], (result) => {
			if (result.lineColor) {
				defaultColor = result.lineColor;
			}
		});
	}

	// Create a line element
	function createLine(type, position, color = defaultColor) {
		const line = document.createElement("div");
		line.classList.add("layout-grid-line");
		line.classList.add(
			type === "vertical"
				? "layout-grid-line-vertical"
				: "layout-grid-line-horizontal"
		);
		line.style.backgroundColor = color;

		// Store metadata on the element
		line.dataset.type = type;

		if (type === "vertical") {
			// Default to center if no position provided
			const left =
				position !== undefined ? position : window.innerWidth / 2;
			line.style.left = `${left}px`;
		} else {
			// Default to center if no position provided
			const top =
				position !== undefined ? position : window.innerHeight / 2;
			line.style.top = `${top}px`;
		}

		// Add event listeners for this specific line
		line.addEventListener("mousedown", handleLineMouseDown);
		line.addEventListener("contextmenu", handleLineRightClick);

		document.body.appendChild(line);
		lines.push(line);

		if (position === undefined) {
			saveLines(); // Save immediately if it's a new line
		}

		return line;
	}

	// Event Handlers
	function handleLineMouseDown(e) {
		if (e.button !== 0) return; // Only left click
		e.preventDefault();
		activeLine = e.target;
		isDragging = true;
	}

	function handleLineRightClick(e) {
		e.preventDefault();
		removeLine(e.target);
	}

	function handleMouseMove(e) {
		if (!isDragging || !activeLine) return;

		e.preventDefault();

		const type = activeLine.dataset.type;
		if (type === "vertical") {
			activeLine.style.left = `${e.clientX}px`;
		} else {
			activeLine.style.top = `${e.clientY}px`;
		}
	}

	function handleMouseUp(e) {
		if (isDragging) {
			isDragging = false;
			activeLine = null;
			saveLines();
		}
	}

	function handleKeyDown(e) {
		// Shortcuts: Shift + V, Shift + H
		if (e.shiftKey && e.key.toLowerCase() === "v") {
			createLine("vertical");
		} else if (e.shiftKey && e.key.toLowerCase() === "h") {
			createLine("horizontal");
		}
	}

	function removeLine(line) {
		if (line && line.parentNode) {
			line.parentNode.removeChild(line);
			lines = lines.filter((l) => l !== line);
			saveLines();
		}
	}

	function clearAllLines() {
		lines.forEach((line) => {
			if (line.parentNode) line.parentNode.removeChild(line);
		});
		lines = [];
		saveLines();
	}

	function updateAllColors(color) {
		defaultColor = color;
		lines.forEach((line) => {
			line.style.backgroundColor = color;
		});
		saveLines();
	}

	// Persistence
	function saveLines() {
		const data = lines.map((line) => ({
			type: line.dataset.type,
			position:
				line.dataset.type === "vertical"
					? parseFloat(line.style.left)
					: parseFloat(line.style.top),
			color: line.style.backgroundColor,
		}));

		const key = getStorageKey();
		chrome.storage.local.set({ [key]: data });
	}

	function loadLines() {
		const key = getStorageKey();
		chrome.storage.local.get([key], (result) => {
			const savedLines = result[key];
			if (savedLines && Array.isArray(savedLines)) {
				savedLines.forEach((data) => {
					createLine(data.type, data.position, data.color);
				});
			}
		});
	}

	// Global Listeners
	function setupEventListeners() {
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("keydown", handleKeyDown);

		// Listen for messages from popup
		chrome.runtime.onMessage.addListener(
			(request, sender, sendResponse) => {
				switch (request.action) {
					case "add-vertical":
						createLine("vertical", undefined, request.color);
						break;
					case "add-horizontal":
						createLine("horizontal", undefined, request.color);
						break;
					case "clear-all":
						clearAllLines();
						break;
					case "update-color":
						updateAllColors(request.color);
						break;
				}
			}
		);
	}

	// Run init
	init();
})();

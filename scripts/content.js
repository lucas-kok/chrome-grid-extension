(() => {
	// State
	let lines = [];
	let activeLine = null;
	let isDragging = false;
	let defaultColor = "#ff0000";
	let isRulerVisible = false;
	let rulerElements = { top: null, left: null, corner: null };
	let isPickingElement = false;
	let hoveredElement = null;

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
		chrome.storage.local.get(["lineColor", "rulerVisible"], (result) => {
			if (result.lineColor) {
				defaultColor = result.lineColor;
			}
			if (result.rulerVisible) {
				toggleRuler(true);
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
		// line.addEventListener("contextmenu", handleLineRightClick);

		document.body.appendChild(line);
		lines.push(line);

		if (position === undefined) {
			saveLines(); // Save immediately if it's a new line created manually
		}

		return line;
	}

	// Event Handlers
	function handleLineMouseDown(e) {
		if (e.button !== 0) return; // Only left click
		e.preventDefault();
		e.stopPropagation(); // Prevent selecting text or other elements

		// Shift + Click to delete
		if (e.shiftKey) {
			removeLine(e.target);
			return;
		}

		activeLine = e.target;
		isDragging = true;

		selectLine(activeLine);
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

	// Ruler Functions
	function toggleRuler(forceState) {
		const newState =
			forceState !== undefined ? forceState : !isRulerVisible;

		if (newState === isRulerVisible && forceState === undefined) return;

		isRulerVisible = newState;
		chrome.storage.local.set({ rulerVisible: isRulerVisible });

		if (isRulerVisible) {
			createRuler();
		} else {
			removeRuler();
		}
	}

	function createRuler() {
		if (rulerElements.top) return; // Already exists

		// Corner
		const corner = document.createElement("div");
		corner.className = "layout-grid-ruler-corner";
		document.body.appendChild(corner);
		rulerElements.corner = corner;

		// Top Ruler
		const topRuler = document.createElement("canvas");
		topRuler.className = "layout-grid-ruler layout-grid-ruler-top";
		document.body.appendChild(topRuler);
		rulerElements.top = topRuler;

		// Left Ruler
		const leftRuler = document.createElement("canvas");
		leftRuler.className = "layout-grid-ruler layout-grid-ruler-left";
		document.body.appendChild(leftRuler);
		rulerElements.left = leftRuler;

		drawRulers();
		window.addEventListener("resize", drawRulers);
		// window.addEventListener('scroll', drawRulers); // Not needed for fixed position
	}

	// Element Picker Functions
	function toggleElementPicker() {
		isPickingElement = !isPickingElement;

		if (isPickingElement) {
			document.body.style.cursor = "crosshair";
			document.addEventListener("mouseover", handlePickerHover, true);
			document.addEventListener("click", handlePickerClick, true);
			document.addEventListener("mouseout", handlePickerOut, true);
		} else {
			disableElementPicker();
		}
	}

	function disableElementPicker() {
		isPickingElement = false;
		document.body.style.cursor = "";
		document.removeEventListener("mouseover", handlePickerHover, true);
		document.removeEventListener("click", handlePickerClick, true);
		document.removeEventListener("mouseout", handlePickerOut, true);

		if (hoveredElement) {
			hoveredElement.style.outline = "";
			hoveredElement = null;
		}
	}

	function handlePickerHover(e) {
		if (!isPickingElement) return;
		e.preventDefault();
		e.stopPropagation();

		if (hoveredElement) {
			hoveredElement.style.outline = "";
		}

		hoveredElement = e.target;
		// Don't highlight our own lines or ruler
		if (
			hoveredElement.classList.contains("layout-grid-line") ||
			hoveredElement.classList.contains("layout-grid-ruler") ||
			hoveredElement.classList.contains("layout-grid-ruler-corner")
		) {
			hoveredElement = null;
			return;
		}

		hoveredElement.style.outline = `2px dashed ${defaultColor}`;
	}

	function handlePickerOut(e) {
		if (!isPickingElement) return;
		if (e.target === hoveredElement) {
			e.target.style.outline = "";
			hoveredElement = null;
		}
	}

	function handlePickerClick(e) {
		if (!isPickingElement) return;
		e.preventDefault();
		e.stopPropagation();

		if (hoveredElement) {
			const rect = hoveredElement.getBoundingClientRect();

			// Create 4 lines
			createLine("vertical", rect.left);
			createLine("vertical", rect.right);
			createLine("horizontal", rect.top);
			createLine("horizontal", rect.bottom);

			saveLines(); // Explicitly save after creating multiple lines

			disableElementPicker();
		}
	}

	function removeRuler() {
		if (rulerElements.top) {
			rulerElements.top.remove();
			rulerElements.left.remove();
			rulerElements.corner.remove();
			rulerElements.top = null;
			rulerElements.left = null;
			rulerElements.corner = null;
			window.removeEventListener("resize", drawRulers);
		}
	}

	function drawRulers() {
		if (!rulerElements.top) return;

		const topCanvas = rulerElements.top;
		const leftCanvas = rulerElements.left;

		// Adjust canvas size to match display size
		const width = window.innerWidth - 20;
		const height = window.innerHeight - 20;

		// Set canvas dimensions (accounting for device pixel ratio for sharpness)
		const dpr = window.devicePixelRatio || 1;

		topCanvas.width = width * dpr;
		topCanvas.height = 20 * dpr;
		topCanvas.style.width = `${width}px`;
		topCanvas.style.height = "20px";

		leftCanvas.width = 20 * dpr;
		leftCanvas.height = height * dpr;
		leftCanvas.style.width = "20px";
		leftCanvas.style.height = `${height}px`;

		const ctxTop = topCanvas.getContext("2d");
		const ctxLeft = leftCanvas.getContext("2d");

		ctxTop.scale(dpr, dpr);
		ctxLeft.scale(dpr, dpr);

		ctxTop.clearRect(0, 0, width, 20);
		ctxLeft.clearRect(0, 0, 20, height);

		ctxTop.fillStyle = "#333";
		ctxLeft.fillStyle = "#333";

		ctxTop.font = "10px sans-serif";
		ctxLeft.font = "10px sans-serif";

		// Draw Top Ruler
		for (let i = 0; i < width; i += 10) {
			const isLarge = i % 100 === 0;
			const isMedium = i % 50 === 0;
			const tickHeight = isLarge ? 15 : isMedium ? 10 : 5;

			ctxTop.fillRect(i, 0, 1, tickHeight);

			if (isLarge && i > 0) {
				ctxTop.fillText(i.toString(), i + 2, 12);
			}
		}

		// Draw Left Ruler
		for (let i = 0; i < height; i += 10) {
			const isLarge = i % 100 === 0;
			const isMedium = i % 50 === 0;
			const tickWidth = isLarge ? 15 : isMedium ? 10 : 5;

			ctxLeft.fillRect(0, i, tickWidth, 1);

			if (isLarge && i > 0) {
				// Rotate text for vertical ruler
				ctxLeft.save();
				ctxLeft.translate(12, i + 2);
				ctxLeft.rotate(-Math.PI / 2);
				ctxLeft.fillText(i.toString(), 0, 0);
				ctxLeft.restore();
			}
		}
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
					case "toggle-ruler":
						toggleRuler();
						break;
					case "toggle-picker":
						toggleElementPicker();
						break;
				}
			}
		);
	}

	// Run init
	init();
})();

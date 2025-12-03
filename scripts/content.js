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
	let isFrozen = true; // Default to frozen (absolute position)
	let scrollTicking = false;
	let isMeasuring = false;
	let measureStart = null;
	let measureLine = null;
	let measureLabel = null;
	let pickerLabel = null;

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

	function getContrastColor(hexColor) {
		// Handle short hex #f00
		let hex = hexColor.replace("#", "");
		if (hex.length === 3) {
			hex = hex
				.split("")
				.map((c) => c + c)
				.join("");
		}

		const r = parseInt(hex.substr(0, 2), 16);
		const g = parseInt(hex.substr(2, 2), 16);
		const b = parseInt(hex.substr(4, 2), 16);

		const yiq = (r * 299 + g * 587 + b * 114) / 1000;

		return yiq >= 128 ? "black" : "white";
	}

	// Initialize
	function init() {
		// Load settings first, then lines
		chrome.storage.local.get(
			["lineColor", "rulerVisible", "freezeLines"],
			(result) => {
				if (result.lineColor) {
					defaultColor = result.lineColor;
				}
				if (result.rulerVisible) {
					toggleRuler(true);
				}
				if (result.freezeLines !== undefined) {
					isFrozen = result.freezeLines;
				}

				loadLines();
				setupEventListeners();

				// Watch for page resize to update line dimensions
				const resizeObserver = new ResizeObserver(() => {
					lines.forEach((line) => updateLineDimensions(line));
				});
				if (document.body) {
					resizeObserver.observe(document.body);
				}
				if (document.documentElement) {
					resizeObserver.observe(document.documentElement);
				}
			}
		);
	}

	// Helper to update line dimensions based on freeze state
	function updateLineDimensions(line, docHeight, docWidth) {
		const type = line.dataset.type;
		if (isFrozen) {
			const height =
				docHeight ||
				Math.max(
					document.documentElement.scrollHeight,
					document.body.scrollHeight
				);
			const width =
				docWidth ||
				Math.max(
					document.documentElement.scrollWidth,
					document.body.scrollWidth
				);

			// Absolute positioning: span full document
			if (type === "vertical") {
				line.style.top = "0";
				line.style.bottom = "auto";
				line.style.height = `${height}px`;
				line.style.width = "";
			} else {
				line.style.left = "0";
				line.style.right = "auto";
				line.style.width = `${width}px`;
				line.style.height = "";
			}
		} else {
			// Fixed positioning: span viewport
			if (type === "vertical") {
				line.style.top = "0";
				line.style.bottom = "0";
				line.style.height = "auto";
				line.style.width = "";
			} else {
				line.style.left = "0";
				line.style.right = "0";
				line.style.width = "auto";
				line.style.height = "";
			}
		}
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
		line.style.position = isFrozen ? "absolute" : "fixed";

		// Store metadata on the element
		line.dataset.type = type;

		updateLineDimensions(line);

		if (type === "vertical") {
			// Default to center if no position provided
			let left;
			if (position !== undefined) {
				left = position;
			} else {
				// If creating new line, center in viewport
				// If frozen, add scrollX to make it center of visible area on page
				left = window.innerWidth / 2 + (isFrozen ? window.scrollX : 0);
			}
			line.style.left = `${left}px`;
		} else {
			// Default to center if no position provided
			let top;
			if (position !== undefined) {
				top = position;
			} else {
				// If creating new line, center in viewport
				// If frozen, add scrollY to make it center of visible area on page
				top = window.innerHeight / 2 + (isFrozen ? window.scrollY : 0);
			}
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

	// Measure Tool Functions
	function toggleMeasureTool() {
		isMeasuring = !isMeasuring;
		if (isMeasuring) {
			// Disable other tools
			if (isPickingElement) {
				disableElementPicker();
			}
			document.body.style.cursor = "crosshair";
			document.addEventListener("mousedown", handleMeasureMouseDown);
		} else {
			disableMeasureTool();
		}
	}

	function disableMeasureTool() {
		isMeasuring = false;
		document.body.style.cursor = "";
		document.removeEventListener("mousedown", handleMeasureMouseDown);
		if (measureLine) {
			measureLine.remove();
			measureLine = null;
		}
		if (measureLabel) {
			measureLabel.remove();
			measureLabel = null;
		}
		measureStart = null;
	}

	function handleMeasureMouseDown(e) {
		if (!isMeasuring || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		let startX = e.clientX;
		let startY = e.clientY;

		// Snap start point to lines
		const snapThreshold = 10;
		let closestDist = Infinity;
		let snapPos = null;

		lines.forEach((line) => {
			const type = line.dataset.type;
			const pos =
				type === "vertical"
					? parseFloat(line.style.left)
					: parseFloat(line.style.top);

			// Convert line pos to client coordinates if frozen (absolute)
			// If frozen, pos is pageX/Y. We need clientX/Y for comparison with e.clientX/Y
			// Actually, let's work in client coordinates for snapping
			let clientPos = pos;
			if (isFrozen) {
				if (type === "vertical") {
					clientPos -= window.scrollX;
				} else {
					clientPos -= window.scrollY;
				}
			}

			const mousePos = type === "vertical" ? e.clientX : e.clientY;
			const dist = Math.abs(clientPos - mousePos);

			if (dist < snapThreshold && dist < closestDist) {
				closestDist = dist;
				if (type === "vertical") {
					startX = clientPos;
				} else {
					startY = clientPos;
				}
			}
		});

		// If frozen, convert back to page coordinates for storage if we were storing page coords
		// But updateMeasureVisuals takes client coordinates.
		// So we keep startX/Y as client coordinates.
		// Wait, updateMeasureVisuals uses measureStart.x/y as base.
		// If we scroll while measuring, does it break?
		// Yes, if measureStart is client coords.
		// Let's store measureStart in Page coordinates if frozen?
		// For simplicity, let's stick to client coordinates for the interaction, assuming no scroll while dragging.
		// Or better, use page coordinates for everything if frozen.

		// Let's use client coordinates for the measure tool interaction to be consistent with mouse events.
		measureStart = { x: startX, y: startY };

		// Create line and label if not exist
		if (!measureLine) {
			measureLine = document.createElement("div");
			measureLine.className = "layout-grid-measure-line";
			document.body.appendChild(measureLine);
		}
		if (!measureLabel) {
			measureLabel = document.createElement("div");
			measureLabel.className = "layout-grid-measure-label";
			document.body.appendChild(measureLabel);
		}

		// Set position type based on freeze state
		const positionType = isFrozen ? "absolute" : "fixed";
		measureLine.style.position = positionType;
		measureLabel.style.position = positionType;

		updateMeasureVisuals(e.clientX, e.clientY, e.shiftKey);
	}

	function updateMeasureVisuals(currentX, currentY, isShiftPressed) {
		if (!measureStart || !measureLine || !measureLabel) return;

		let targetX = currentX;
		let targetY = currentY;

		// Snap end point to lines
		const snapThreshold = 10;
		let closestDist = Infinity;

		lines.forEach((line) => {
			const type = line.dataset.type;
			const pos =
				type === "vertical"
					? parseFloat(line.style.left)
					: parseFloat(line.style.top);

			let clientPos = pos;
			if (isFrozen) {
				if (type === "vertical") {
					clientPos -= window.scrollX;
				} else {
					clientPos -= window.scrollY;
				}
			}

			const mousePos = type === "vertical" ? currentX : currentY;
			const dist = Math.abs(clientPos - mousePos);

			if (dist < snapThreshold && dist < closestDist) {
				closestDist = dist;
				if (type === "vertical") {
					targetX = clientPos;
				} else {
					targetY = clientPos;
				}
			}
		});

		let dx = targetX - measureStart.x;
		let dy = targetY - measureStart.y;

		// Shift key constraint (straight lines)
		if (isShiftPressed) {
			if (Math.abs(dx) > Math.abs(dy)) {
				targetY = measureStart.y;
				dy = 0;
			} else {
				targetX = measureStart.x;
				dx = 0;
			}
		}

		const length = Math.sqrt(dx * dx + dy * dy);
		const angle = Math.atan2(dy, dx) * (180 / Math.PI);

		// Calculate display coordinates
		// If frozen, add scroll offset to both start and current positions
		const scrollX = isFrozen ? window.scrollX : 0;
		const scrollY = isFrozen ? window.scrollY : 0;

		measureLine.style.left = `${measureStart.x + scrollX}px`;
		measureLine.style.top = `${measureStart.y + scrollY}px`;
		measureLine.style.width = `${length}px`;
		measureLine.style.transform = `rotate(${angle}deg)`;

		measureLabel.textContent = `${Math.round(length)}px`;
		measureLabel.style.left = `${targetX + scrollX}px`;
		measureLabel.style.top = `${targetY + scrollY}px`;
	}

	// Event Handlers
	function handleLineMouseDown(e) {
		if (isMeasuring) return; // Let the event bubble to document for measuring
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
	}

	function handleMouseMove(e) {
		if (isMeasuring && measureStart) {
			updateMeasureVisuals(e.clientX, e.clientY, e.shiftKey);
			return;
		}

		if (!isDragging || !activeLine) return;

		e.preventDefault();

		const type = activeLine.dataset.type;
		// If frozen (absolute), use page coordinates. If fixed, use client coordinates.
		let newPos =
			type === "vertical"
				? isFrozen
					? e.pageX
					: e.clientX
				: isFrozen
				? e.pageY
				: e.clientY;

		// Snapping logic (hold Alt to disable, or enable by default and hold Alt to disable?)
		// Let's make it snap by default, hold Alt to disable
		if (!e.altKey) {
			const snapThreshold = 10;
			let closestDist = Infinity;
			let snapPos = null;

			// Snap to other lines
			lines.forEach((line) => {
				if (line === activeLine || line.dataset.type !== type) return;
				const pos =
					type === "vertical"
						? parseFloat(line.style.left)
						: parseFloat(line.style.top);
				const dist = Math.abs(pos - newPos);
				if (dist < snapThreshold && dist < closestDist) {
					closestDist = dist;
					snapPos = pos;
				}
			});

			// Snap to element edges under cursor
			// We can't easily check ALL elements, but we can check the one under the cursor
			// Temporarily hide the line to get the element below it
			activeLine.style.display = "none";
			const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
			activeLine.style.display = "";

			if (elemBelow) {
				const rect = elemBelow.getBoundingClientRect();
				// rect is always viewport relative.
				// If isFrozen, we need to convert rect edges to page coordinates for comparison with newPos
				const scrollX = isFrozen ? window.scrollX : 0;
				const scrollY = isFrozen ? window.scrollY : 0;

				const edges =
					type === "vertical"
						? [rect.left + scrollX, rect.right + scrollX]
						: [rect.top + scrollY, rect.bottom + scrollY];

				edges.forEach((edge) => {
					const dist = Math.abs(edge - newPos);
					if (dist < snapThreshold && dist < closestDist) {
						closestDist = dist;
						snapPos = edge;
					}
				});
			}

			// Snap to ruler ticks (every 10px)
			if (isRulerVisible) {
				// Ruler ticks are fixed to viewport at 0, 10, 20...
				// We need to check if current position aligns with a tick
				// If frozen, newPos is page coordinate. Convert to client coordinate for check.
				let clientPos = newPos;
				if (isFrozen) {
					if (type === "vertical") {
						clientPos -= window.scrollX;
					} else {
						clientPos -= window.scrollY;
					}
				}

				// Find nearest multiple of 10
				const remainder = clientPos % 10;
				let nearestTick = clientPos - remainder;
				if (remainder > 5) {
					nearestTick += 10;
				}

				const dist = Math.abs(clientPos - nearestTick);
				if (dist < snapThreshold && dist < closestDist) {
					closestDist = dist;
					// Convert back to page coordinate if needed
					snapPos = nearestTick;
					if (isFrozen) {
						if (type === "vertical") {
							snapPos += window.scrollX;
						} else {
							snapPos += window.scrollY;
						}
					}
				}
			}

			if (snapPos !== null) {
				newPos = snapPos;
			}
		}

		if (type === "vertical") {
			activeLine.style.left = `${newPos}px`;
		} else {
			activeLine.style.top = `${newPos}px`;
		}

		updateMeasurements();
	}

	function handleScroll() {
		if (!isFrozen) return;
		if (!scrollTicking) {
			window.requestAnimationFrame(() => {
				const h = Math.max(
					document.documentElement.scrollHeight,
					document.body.scrollHeight
				);
				const w = Math.max(
					document.documentElement.scrollWidth,
					document.body.scrollWidth
				);
				lines.forEach((line) => updateLineDimensions(line, h, w));
				scrollTicking = false;
			});
			scrollTicking = true;
		}
	}

	function handleMouseUp(e) {
		if (isMeasuring && measureStart) {
			measureStart = null;
			// Keep the line visible until next click or tool disable?
			// Or clear it? Let's keep it for now so user can read it.
			// But if they click again, it restarts.
			return;
		}

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
		} else if (e.shiftKey && e.key.toLowerCase() === "b") {
			toggleElementPicker();
		} else if (e.shiftKey && e.key.toLowerCase() === "m") {
			toggleMeasureTool();
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

	function updateMeasurements() {
		// Placeholder
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
			// Disable other tools
			if (isMeasuring) {
				disableMeasureTool();
			}

			// Create label if not exists
			if (!pickerLabel) {
				pickerLabel = document.createElement("div");
				pickerLabel.className = "layout-grid-measure-label";
				pickerLabel.style.display = "none";
				pickerLabel.style.zIndex = "2147483647";
				pickerLabel.style.pointerEvents = "none";
				document.body.appendChild(pickerLabel);
			}

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
		if (pickerLabel) {
			pickerLabel.remove();
			pickerLabel = null;
		}
	}

	function handlePickerOut(e) {
		if (!isPickingElement) return;
		if (hoveredElement && e.relatedTarget === null) {
			hoveredElement.style.outline = "";
			hoveredElement = null;
			if (pickerLabel) pickerLabel.style.display = "none";
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
			hoveredElement.classList.contains("layout-grid-ruler-corner") ||
			hoveredElement.classList.contains("layout-grid-measure-label")
		) {
			hoveredElement = null;
			if (pickerLabel) pickerLabel.style.display = "none";
			return;
		}

		hoveredElement.style.outline = `2px dashed ${defaultColor}`;
		hoveredElement.style.outlineOffset = "2px";

		if (pickerLabel) {
			const rect = hoveredElement.getBoundingClientRect();
			const width = Math.round(rect.width);
			const height = Math.round(rect.height);

			pickerLabel.textContent = `${width}px x ${height}px`;
			pickerLabel.style.backgroundColor = defaultColor;
			pickerLabel.style.color = getContrastColor(defaultColor);

			const scrollX = isFrozen ? window.scrollX : 0;
			const scrollY = isFrozen ? window.scrollY : 0;

			const positionType = isFrozen ? "absolute" : "fixed";
			pickerLabel.style.position = positionType;

			const outlineOffset = 4; // 2px outline + 2px offset
			const gap = 5; // A few pixels gap

			// Position at top-left of element, aligned with outline
			let left = rect.left + scrollX - outlineOffset;
			let top;
			let transform;

			// Check if enough space on top (approx 30px for label height + gap)
			if (rect.top >= 30) {
				// Position above
				top = rect.top + scrollY - outlineOffset - gap;
				transform = "translateY(-100%)";
			} else {
				// Position below
				top = rect.bottom + scrollY + outlineOffset + gap;
				transform = "none";
			}

			pickerLabel.style.top = `${top}px`;
			pickerLabel.style.left = `${left}px`;
			pickerLabel.style.transform = transform;
			pickerLabel.style.marginTop = "0";
			pickerLabel.style.display = "block";
		}
	}

	function handlePickerClick(e) {
		if (!isPickingElement) return;
		e.preventDefault();
		e.stopPropagation();

		if (hoveredElement) {
			const rect = hoveredElement.getBoundingClientRect();

			// rect is viewport relative.
			// If isFrozen, we need to convert to page coordinates.
			const scrollX = isFrozen ? window.scrollX : 0;
			const scrollY = isFrozen ? window.scrollY : 0;

			// Create 4 lines
			// Shift left and top lines by -2px (line width) so they sit outside the element, matching right and bottom behavior
			createLine("vertical", rect.left + scrollX);
			createLine("vertical", rect.right + scrollX);
			createLine("horizontal", rect.top + scrollY);
			createLine("horizontal", rect.bottom + scrollY);

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

		topCanvas.width = Math.round(width * dpr);
		topCanvas.height = Math.round(20 * dpr);
		topCanvas.style.width = `${width}px`;
		topCanvas.style.height = "20px";

		leftCanvas.width = Math.round(20 * dpr);
		leftCanvas.height = Math.round(height * dpr);
		leftCanvas.style.width = "20px";
		leftCanvas.style.height = `${height}px`;

		const ctxTop = topCanvas.getContext("2d");
		const ctxLeft = leftCanvas.getContext("2d");

		// Reset transforms to ensure we work in device pixels
		ctxTop.resetTransform();
		ctxLeft.resetTransform();

		ctxTop.clearRect(0, 0, topCanvas.width, topCanvas.height);
		ctxLeft.clearRect(0, 0, leftCanvas.width, leftCanvas.height);

		// Styles
		const tickColor = "#d1d5db"; // Light gray
		const tickColorLarge = "#9ca3af"; // Medium gray
		const textColor = "#6b7280"; // Darker gray
		const font = `500 ${
			9 * dpr
		}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

		ctxTop.font = font;
		ctxTop.textBaseline = "top";

		ctxLeft.font = font;
		ctxLeft.textBaseline = "top";

		// Draw Top Ruler
		for (let i = 0; i < width; i += 10) {
			if (i === 0) continue;
			const isLarge = i % 100 === 0;
			const isMedium = i % 50 === 0;
			const tickHeight = isLarge ? 20 : isMedium ? 8 : 5;

			ctxTop.fillStyle = isLarge ? tickColorLarge : tickColor;

			// Draw sharp line aligned to device pixels
			const x = Math.round(i * dpr);
			const y = Math.round((20 - tickHeight) * dpr);
			const w = Math.max(1, Math.round(1 * dpr));
			const h = Math.round(tickHeight * dpr);

			ctxTop.fillRect(x, y, w, h);

			if (isLarge) {
				ctxTop.fillStyle = textColor;
				ctxTop.fillText(i.toString(), (i + 4) * dpr, 3 * dpr);
			}
		}

		// Draw Left Ruler
		for (let i = 0; i < height; i += 10) {
			if (i === 0) continue;
			const isLarge = i % 100 === 0;
			const isMedium = i % 50 === 0;
			const tickWidth = isLarge ? 20 : isMedium ? 8 : 5;

			ctxLeft.fillStyle = isLarge ? tickColorLarge : tickColor;

			// Draw sharp line aligned to device pixels
			const x = Math.round((20 - tickWidth) * dpr);
			const y = Math.round(i * dpr);
			const w = Math.round(tickWidth * dpr);
			const h = Math.max(1, Math.round(1 * dpr));

			ctxLeft.fillRect(x, y, w, h);

			if (isLarge) {
				ctxLeft.fillStyle = textColor;
				ctxLeft.save();
				ctxLeft.translate(12 * dpr, (i + 4) * dpr);
				ctxLeft.rotate(-Math.PI / 2);
				ctxLeft.fillText(i.toString(), 0, 0);
				ctxLeft.restore();
			}
		}
	}

	function updateFreezeState(newIsFrozen) {
		if (isFrozen === newIsFrozen) return;

		isFrozen = newIsFrozen;

		// Update measure line and label if they exist
		if (measureLine && measureLabel) {
			const positionType = isFrozen ? "absolute" : "fixed";
			measureLine.style.position = positionType;
			measureLabel.style.position = positionType;

			let lineLeft = parseFloat(measureLine.style.left);
			let lineTop = parseFloat(measureLine.style.top);
			let labelLeft = parseFloat(measureLabel.style.left);
			let labelTop = parseFloat(measureLabel.style.top);

			if (isFrozen) {
				// Fixed -> Absolute: Add scroll
				lineLeft += window.scrollX;
				lineTop += window.scrollY;
				labelLeft += window.scrollX;
				labelTop += window.scrollY;
			} else {
				// Absolute -> Fixed: Subtract scroll
				lineLeft -= window.scrollX;
				lineTop -= window.scrollY;
				labelLeft -= window.scrollX;
				labelTop -= window.scrollY;
			}

			measureLine.style.left = `${lineLeft}px`;
			measureLine.style.top = `${lineTop}px`;
			measureLabel.style.left = `${labelLeft}px`;
			measureLabel.style.top = `${labelTop}px`;
		}

		lines.forEach((line) => {
			const type = line.dataset.type;
			let currentPos =
				type === "vertical"
					? parseFloat(line.style.left)
					: parseFloat(line.style.top);

			// Convert position
			if (isFrozen) {
				// Switching from Fixed to Absolute (Frozen)
				// Add scroll offset
				if (type === "vertical") {
					currentPos += window.scrollX;
				} else {
					currentPos += window.scrollY;
				}
				line.style.position = "absolute";
			} else {
				// Switching from Absolute to Fixed
				// Subtract scroll offset
				if (type === "vertical") {
					currentPos -= window.scrollX;
				} else {
					currentPos -= window.scrollY;
				}
				line.style.position = "fixed";
			}

			if (type === "vertical") {
				line.style.left = `${currentPos}px`;
			} else {
				line.style.top = `${currentPos}px`;
			}

			updateLineDimensions(line);
		});

		saveLines();
	}

	// Global Listeners
	function setupEventListeners() {
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("keydown", handleKeyDown);
		window.addEventListener("scroll", handleScroll, { passive: true });

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
					case "update-freeze":
						updateFreezeState(request.isFrozen);
						break;
					case "toggle-measure":
						toggleMeasureTool();
						break;
				}
			}
		);
	}

	// Run init
	init();
})();

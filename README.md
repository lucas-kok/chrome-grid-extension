# Layout Grid Overlay

A powerful Chrome extension for web developers and designers to check alignment and layout on any webpage. Create draggable vertical and horizontal lines, measure distances, and snap to elements with ease.

## Features

-   **Draggable Guides:** Easily add vertical and horizontal lines to check alignment.
-   **Smart Snapping:** Lines automatically snap to other lines and page elements for precise positioning. Hold `Alt` to disable snapping.
-   **Element Boxing:** Quickly create guides around any DOM element on the page.
-   **Ruler:** Toggle an on-screen ruler to measure pixel distances.
-   **Measurements:** See the distance between lines and elements as you drag.
-   **Customization:** Change line colors to ensure visibility on any background.
-   **Dark/Light Mode:** Automatically matches your system preference, with a manual toggle included.
-   **Persistence:** Guides are saved per-page, so they'll be there when you come back.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the folder containing this extension.

## Usage

Click the extension icon in your browser toolbar to open the control panel.

### Controls

-   **Add Vertical Line:** Adds a vertical guide to the center of the viewport.
-   **Add Horizontal Line:** Adds a horizontal guide to the center of the viewport.
-   **Toggle Ruler:** Shows/hides the pixel ruler overlay.
-   **Box Element:** Activates a picker tool. Click any element on the page to surround it with guides.
-   **Line Color:** Choose a custom color for your guides.
-   **Clear All Lines:** Removes all guides from the current page.

### Shortcuts

-   `Shift` + `V`: Add Vertical Line
-   `Shift` + `H`: Add Horizontal Line
-   `Shift` + `Click` (on a line): Remove Line
-   `Alt` + `Drag`: Disable Snapping

## Development

### Project Structure

-   `manifest.json`: Extension configuration.
-   `popup/`: Contains the popup UI (`popup.html`, `popup.js`).
-   `scripts/`: Content scripts injected into webpages (`content.js`).
-   `styles/`: CSS for the popup and the overlay elements (`popup.css`, `overlay.css`).

### Technologies

-   HTML/CSS/JavaScript
-   Chrome Extension Manifest V3

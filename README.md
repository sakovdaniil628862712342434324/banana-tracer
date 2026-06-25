# 🍌 Banana Trace SDK (AGI Mode)

**Banana Trace** (also known as *CodeWeb*) is a single-file, 100% local, zero-dependency, and execution-tracing visualizer for web applications. Dropped in as a client-side SDK (`bananatracer.js`), it turns your application runtime into an interactive, physics-based architectural playground.

## 🚀 Key AGI Features
1. **Zero-UI Error Interception**: Automatically monkey-patches the browser's `fetch`, `XMLHttpRequest`, global `window.onerror`, and promise rejection boundaries to capture caught, uncaught, and network errors.
2. **Interactive Trace Switching**: Click on any intercepted crash card to dynamically update the execution path and watch the camera zoom in on the highlighted code line.
3. **Static Dependency Parsing**: Scans local directory files on the client side to map out directed function-to-function and file-to-function call linkages, showing exactly how modules connect.
4. **Crash Blast Radius (Impact Zone)**: Uses reverse-dependency graph traversal to calculate the transitively affected files and functions, highlighting the "impact zone" in warning amber so you know the blast radius of any bug.
5. **Contextual Diagnostics**: Displays tailormade troubleshooting steps (CORS local execution warnings, offline endpoint checklists, DOM loading tips) inside the Code Inspector depending on the error message.

## 🚀 How to Use the SDK

1. Drop the script into your HTML file:
```html
<script src="bananatracer.js"></script>
```
2. Open your web app in Chrome/Edge/Safari.
3. You will see the **🍌 floating widget** in the bottom right corner.
4. When an error occurs, the widget will pulse red and capture the crash!
5. Click the widget to open the visualizer overlay, click "Ingest Project Folder" (or use fallback), and watch it draw your architecture.

---

## 🧪 How to Test with the Simulation App

We have provided a sample multi-file ecosystem inside the `/test-app` directory.

1. Open `test-app/index.html` in your browser.
2. Click **Fetch Users List** or **Mock Auth Request** to trigger the API calls (both will fail locally under `file://`, generating rejections caught by the SDK).
3. Click the pulsing banana widget to open the panel.
4. Ingest the `test-app/assets/` folder.
5. Click the different error cards under **Intercepted Crashes** to switch the graph path dynamically and inspect the amber **Impact Blast Radius** and context-aware **Diagnostic Suggestions**!

/**
 * 🍌 Nano Banana Trace SDK (bananatracer.js)
 * Drop-in, zero-dependency AGI Code Visualizer and Error Tracker.
 */
(function() {
    // Prevent double injection
    if (window.BananaTracerSDK) return;
    window.BananaTracerSDK = true;

    // State
    const state = {
        isOpen: false,
        interceptedErrors: [],
        selectedErrorIndex: null,
        visLoaded: false,
        fileMap: {},
        allFunctions: [],
        allRoutes: [],
        network: null,
        nodesDataset: null,
        edgesDataset: null,
        pulseInterval: null,
        originalNodeOptions: {},
        originalEdgeOptions: {},
        traceEdgesIds: []
    };

    // ---------------------------------------------------------
    // 1. ERROR INTERCEPTION ENGINE (Runs Immediately)
    // ---------------------------------------------------------
    let fab = null;
    let badge = null;
    let errorsList = null;

    function renderErrorsList() {
        if (!errorsList) return;
        errorsList.innerHTML = '';
        if (state.interceptedErrors.length > 0) {
            errorsList.style.display = 'block';
            badge.innerText = state.interceptedErrors.length;
            badge.style.display = 'flex';
            fab.classList.add('bt-has-error');
            
            state.interceptedErrors.forEach((errData, index) => {
                const div = document.createElement('div');
                div.className = 'bt-error-card';
                if (index === state.selectedErrorIndex) {
                    div.classList.add('bt-error-card-active');
                }
                div.innerText = errData.msg || errData.stack || JSON.stringify(errData);
                div.onclick = () => {
                    state.selectedErrorIndex = index;
                    renderErrorsList();
                    autoTraceError(errData);
                };
                errorsList.appendChild(div);
            });
        }
    }

    function registerError(errData) {
        state.interceptedErrors.push(errData);
        if (state.selectedErrorIndex === null) {
            state.selectedErrorIndex = state.interceptedErrors.length - 1;
        }
        
        renderErrorsList();

        // If graph is already parsed, auto-trace the selected one!
        if (state.network) {
            autoTraceError(state.interceptedErrors[state.selectedErrorIndex]);
        }
    }

    // Intercept console.error
    const originalConsoleError = console.error;
    console.error = function(...args) {
        let stack = '';
        try { throw new Error(); } catch(e) { stack = e.stack; }
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        
        // Skip vis-network internal errors to prevent loops
        if (!msg.includes('vis-network')) {
            registerError({ type: 'console', msg, stack: stack });
        }
        originalConsoleError.apply(console, args);
    };

    // Intercept exceptions
    window.addEventListener('error', (e) => {
        const msg = e.message || 'Unknown Exception';
        const stack = (e.error && e.error.stack) ? e.error.stack : '';
        const filename = e.filename || '';
        if (!filename.includes('vis-network')) {
            registerError({ type: 'exception', msg, stack });
        }
    });

    // Intercept promise rejections (like Fetch failures)
    window.addEventListener('unhandledrejection', (e) => {
        if (e.reason) {
            const reason = e.reason;
            const msg = `Unhandled Promise: ${reason.message || reason}`;
            const stack = reason.stack || '';
            registerError({ type: 'promise', msg, stack });
        } else {
            registerError({ type: 'promise', msg: 'Unhandled Promise Rejection', stack: '' });
        }
    });

    // Intercept Fetch calls
    if (window.fetch) {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            let stack = '';
            try { throw new Error(); } catch(e) { stack = e.stack; }
            
            return originalFetch.apply(this, args)
                .then(response => {
                    if (!response.ok) {
                        const msg = `Fetch failed: ${response.status} ${response.statusText} for ${args[0]}`;
                        registerError({ type: 'network', msg, stack });
                    }
                    return response;
                })
                .catch(err => {
                    const msg = `Fetch error: ${err.message || err} for ${args[0]}`;
                    registerError({ type: 'network', msg, stack });
                    throw err;
                });
        };
    }

    // Intercept XMLHttpRequest calls
    if (window.XMLHttpRequest) {
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._btMethod = method;
            this._btUrl = url;
            try { throw new Error(); } catch(e) { this._btStack = e.stack; }
            return originalXHROpen.apply(this, [method, url, ...args]);
        };

        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('error', () => {
                const msg = `XHR error: ${this._btMethod} ${this._btUrl}`;
                registerError({ type: 'network', msg, stack: this._btStack || '' });
            });
            this.addEventListener('abort', () => {
                const msg = `XHR aborted: ${this._btMethod} ${this._btUrl}`;
                registerError({ type: 'network', msg, stack: this._btStack || '' });
            });
            this.addEventListener('load', () => {
                if (this.status >= 400) {
                    const msg = `XHR failed: ${this.status} ${this.statusText} for ${this._btMethod} ${this._btUrl}`;
                    registerError({ type: 'network', msg, stack: this._btStack || '' });
                }
            });
            return originalXHRSend.apply(this, args);
        };
    }

    // ---------------------------------------------------------
    // 2. INJECT FONTS & ISOLATED CSS (Runs Immediately)
    // ---------------------------------------------------------
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    const style = document.createElement('style');
    style.innerHTML = `
        /* Namespace everything under #bt-root to prevent host pollution */
        #bt-root {
            --bg-color: #060b14;
            --sidebar-bg: rgba(10, 15, 30, 0.65);
            --panel-border: rgba(255, 255, 255, 0.06);
            --text-main: #f8fafc;
            --text-muted: #64748b;
            --color-html: #10b981;
            --color-js: #eab308;
            --color-py: #3b82f6;
            --color-css: #ec4899;
            --color-route: #a855f7;
            --color-func: #f97316;
            --color-crash: #ef4444;
            
            font-family: 'Outfit', sans-serif;
            color: var(--text-main);
        }

        /* Floating Action Button (Widget) */
        #bt-fab {
            position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
            background: linear-gradient(135deg, #2563eb, #7c3aed); border-radius: 50%;
            cursor: pointer; box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
            z-index: 9999998; display: flex; align-items: center; justify-content: center;
            font-size: 24px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 2px solid rgba(255,255,255,0.1);
        }
        #bt-fab:hover { transform: scale(1.08); box-shadow: 0 6px 25px rgba(124, 58, 237, 0.6); }
        #bt-fab.bt-has-error {
            background: linear-gradient(135deg, #ef4444, #b91c1c);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
            animation: bt-pulse-red 2s infinite;
        }
        @keyframes bt-pulse-red {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        #bt-badge {
            position: absolute; top: -5px; right: -5px; background: #ffffff; color: #ef4444;
            font-size: 11px; font-weight: 700; width: 22px; height: 22px; border-radius: 50%;
            display: none; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }

        /* Overlay Fullscreen */
        #bt-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: var(--bg-color); z-index: 9999999; display: none;
            opacity: 0; transition: opacity 0.3s ease; text-align: left;
        }
        #bt-overlay.bt-open { display: flex; opacity: 1; }

        /* Close Button */
        #bt-close {
            position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.1); border: none;
            color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
            z-index: 100; font-size: 20px; display: flex; align-items: center; justify-content: center; transition: background 0.2s;
        }
        #bt-close:hover { background: rgba(239, 68, 68, 0.8); }

        /* Scoped UI Layout */
        .bt-sidebar {
            width: 26%; min-width: 360px; height: 100%; background: var(--sidebar-bg);
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border-right: 1px solid var(--panel-border);
            padding: 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; z-index: 10; box-shadow: 15px 0 40px rgba(0, 0, 0, 0.5);
        }

        .bt-header h1 {
            font-size: 22px; font-weight: 700; margin: 0;
            background: linear-gradient(135deg, #fbbf24, #f97316, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        .bt-btn-primary {
            background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; border: 1px solid rgba(255,255,255,0.1);
            padding: 14px 18px; font-family: inherit; font-size: 14px; font-weight: 600; border-radius: 10px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3); transition: all 0.2s; width: 100%;
        }
        .bt-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(124, 58, 237, 0.4); }

        .bt-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; margin-top:0; letter-spacing:1px; }
        .bt-panel { background: rgba(15, 23, 42, 0.3); border: 1px solid var(--panel-border); border-radius: 12px; padding: 16px; }

        /* Auto-Caught Errors List */
        .bt-error-card {
            background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; padding: 10px; margin-bottom: 8px;
            font-size: 11px; font-family: 'JetBrains Mono', monospace; color: #fca5a5; max-height: 80px; overflow-y: auto; white-space: pre-wrap;
            cursor: pointer; transition: all 0.2s;
        }
        .bt-error-card:hover {
            background: rgba(239, 68, 68, 0.18); border-color: rgba(239, 68, 68, 0.4);
        }
        .bt-error-card-active {
            background: rgba(239, 68, 68, 0.25) !important; border-color: #ef4444 !important;
            box-shadow: 0 0 10px rgba(239, 68, 68, 0.2);
        }

        .bt-trace-step {
            background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;
        }
        .bt-trace-step:hover { background: rgba(255, 255, 255, 0.1); transform: translateX(4px); }
        .bt-trace-step-header { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #fca5a5; font-weight: 600; }
        .bt-trace-step-loc { font-size: 10px; color: #94a3b8; margin-top: 4px;}

        /* Code Inspector */
        .bt-inspector-panel { flex-grow: 1; display: flex; flex-direction: column; max-height: 35%; }
        .bt-code-block {
            background: #030712; border: 1px solid var(--panel-border); border-radius: 8px; padding: 12px; font-family: 'JetBrains Mono', monospace;
            font-size: 11px; color: #e2e8f0; overflow: auto; white-space: pre; margin-top: 8px;
        }
        .syn-keyword { color: #c678dd; } .syn-string { color: #98c379; } .syn-func { color: #61afef; } .syn-comment { color: #5c6370; font-style: italic; }
        .syn-crashed-line { display: block; background: rgba(239, 68, 68, 0.3); border-left: 3px solid #ef4444; margin-left: -12px; padding-left: 9px; }

        /* Canvas */
        .bt-graph-container {
            flex-grow: 1; position: relative; background-color: var(--bg-color);
            background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 40px 40px;
        }
        #bt-canvas { width: 100%; height: 100%; position: relative; z-index: 1; }

        /* Vis Tooltip */
        div.vis-tooltip {
            position: absolute; padding: 12px; background-color: rgba(15, 23, 42, 0.95) !important; backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.15); color: #f8fafc !important; font-family: 'Outfit', sans-serif !important; font-size: 12px; border-radius: 8px; z-index: 99999999 !important;
        }

        #bt-loading { position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(6, 11, 20, 0.9); display: none; align-items: center; justify-content: center; z-index: 10; }
        .bt-spinner { width: 50px; height: 50px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: bt-spin 1s linear infinite; }
        @keyframes bt-spin { 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    // ---------------------------------------------------------
    // 3. INJECT HTML DOM (Waits for Body)
    // ---------------------------------------------------------
    function initBananaTracerDOM() {
        const root = document.createElement('div');
        root.id = 'bt-root';
        root.innerHTML = `
            <!-- Floating Button Widget -->
            <div id="bt-fab" title="Nano Banana Trace">
                🍌
                <div id="bt-badge">0</div>
            </div>

            <!-- Fullscreen Overlay -->
            <div id="bt-overlay">
                <button id="bt-close">&times;</button>
                
                <div class="bt-sidebar">
                    <div class="bt-header">
                        <h1>BananaTrace SDK</h1>
                        <div style="font-size:10px; color:#fbbf24; margin-top:2px;">AUTOMATIC TRACER ACTIVE</div>
                    </div>

                    <button class="bt-btn-primary" id="bt-btn-open">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                        Ingest Project Folder
                    </button>
                    <input type="file" id="bt-dir-fallback" webkitdirectory directory style="display: none;">

                    <div>
                        <h2 class="bt-section-title">Intercepted Crashes</h2>
                        <div class="bt-panel" id="bt-auto-errors" style="max-height: 150px; overflow-y:auto; display:none;"></div>
                        <div id="bt-trace-steps-container" style="display:none; margin-top:10px;">
                            <h3 style="font-size: 10px; color: var(--text-muted);">EXECUTION PATH:</h3>
                            <div id="bt-trace-steps-list"></div>
                        </div>
                        <div id="bt-blast-radius-container" style="display:none; margin-top:15px;">
                            <h3 style="font-size: 10px; color: #fbbf24; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px; margin-bottom: 8px;">
                                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Impact Blast Radius:
                            </h3>
                            <div id="bt-blast-radius-list"></div>
                        </div>
                    </div>

                    <div class="bt-inspector-panel">
                        <h2 class="bt-section-title">Code Inspector</h2>
                        <div class="bt-panel" style="height:100%; overflow-y:auto;">
                            <div id="bt-inspector-title" style="font-weight:700; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">No Node Selected</div>
                            <div id="bt-inspector-content" style="margin-top:8px; font-size:12px;">Select a node or trace step to inspect code.</div>
                        </div>
                    </div>
                </div>

                <div class="bt-graph-container">
                    <div id="bt-canvas"></div>
                    <div id="bt-loading">
                        <div style="text-align: center;">
                            <div class="bt-spinner"></div>
                            <div style="margin-top:20px; font-weight:600; font-size:15px;">Ingesting Architecture...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        // Bind DOM elements to global variables
        fab = document.getElementById('bt-fab');
        badge = document.getElementById('bt-badge');
        errorsList = document.getElementById('bt-auto-errors');
        const overlay = document.getElementById('bt-overlay');

        // Flush any errors that were caught before DOM load
        renderErrorsList();
        
        fab.addEventListener('click', () => {
            overlay.classList.add('bt-open');
            fab.style.display = 'none';
            
            if (!state.visLoaded) {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';
                script.onload = () => { state.visLoaded = true; };
                document.head.appendChild(script);
            }
        });

        document.getElementById('bt-close').addEventListener('click', () => {
            overlay.classList.remove('bt-open');
            fab.style.display = 'flex';
        });

        document.getElementById('bt-btn-open').addEventListener('click', async () => {
            if (!state.visLoaded) return alert("Vis-Network is still loading, please wait a second.");
            
            if (typeof window.showDirectoryPicker !== 'function') {
                // Fallback for Safari / Firefox / file:// protocol
                document.getElementById('bt-dir-fallback').click();
                return;
            }

            try {
                const dirHandle = await window.showDirectoryPicker();
                state.fileMap = {};
                document.getElementById('bt-loading').style.display = 'flex';
                await scanDirectory(dirHandle, "");
                document.getElementById('bt-loading').style.display = 'none';
                analyzeProject();
            } catch(e) {
                console.warn(e);
                document.getElementById('bt-loading').style.display = 'none';
            }
        });

        document.getElementById('bt-dir-fallback').addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            state.fileMap = {};
            document.getElementById('bt-loading').style.display = 'flex';
            
            const skipDirs = ['node_modules', '.git', '__pycache__', 'env', 'venv', 'dist', 'build'];
            const allowedExtensions = ['.py', '.js', '.ts', '.html', '.css'];

            try {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const fullPath = file.webkitRelativePath;
                    const parts = fullPath.split('/');
                    if (parts.some(part => skipDirs.includes(part))) continue;
                    
                    const ext = file.name.substring(file.name.lastIndexOf('.'));
                    if (allowedExtensions.includes(ext)) {
                        parts.shift(); // remove root directory name for relative mapping
                        const relativePath = parts.join('/');
                        state.fileMap[relativePath] = await file.text();
                    }
                }
                document.getElementById('bt-loading').style.display = 'none';
                analyzeProject();
            } catch (err) {
                console.error(err);
                alert("Failed to read fallback files: " + err.message);
                document.getElementById('bt-loading').style.display = 'none';
            }
        });
    }

    // Wait for body to exist before injecting HTML
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBananaTracerDOM);
    } else {
        initBananaTracerDOM();
    }

    // ---------------------------------------------------------
    // 4. GRAPH ENGINE & TRACER LOGIC
    // ---------------------------------------------------------
    async function scanDirectory(dirHandle, currentPath) {
        const skipDirs = ['node_modules', '.git', '__pycache__', 'env', 'venv', 'dist', 'build'];
        const allowedExtensions = ['.py', '.js', '.ts', '.html', '.css'];

        for await (const entry of dirHandle.values()) {
            const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            if (entry.kind === 'directory') {
                if (!skipDirs.includes(entry.name)) await scanDirectory(entry, relativePath);
            } else if (entry.kind === 'file') {
                const ext = entry.name.substring(entry.name.lastIndexOf('.'));
                if (allowedExtensions.includes(ext)) {
                    const file = await entry.getFile();
                    state.fileMap[relativePath] = await file.text();
                }
            }
        }
    }

    function getCallerNode(filePath, lineNum) {
        const parentFunc = state.allFunctions.find(f => f.filePath === filePath && lineNum >= f.startLine && lineNum <= f.endLine);
        return parentFunc ? `${filePath}::${parentFunc.name}` : filePath;
    }

    function analyzeProject() {
        state.allFunctions = []; state.allRoutes = [];
        const filePaths = Object.keys(state.fileMap);
        
        filePaths.forEach(filePath => {
            const lines = state.fileMap[filePath].split('\n');
            const ext = filePath.substring(filePath.lastIndexOf('.'));
            
            if (ext === '.py') {
                for (let i = 0; i < lines.length; i++) {
                    const defMatch = lines[i].match(/^(\s*)def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
                    if (defMatch) {
                        const indent = defMatch[1].length;
                        let endLine = lines.length;
                        for (let j = i + 1; j < lines.length; j++) {
                            if (lines[j].trim() === '' || lines[j].trim().startsWith('#')) continue;
                            const nextIndentMatch = lines[j].match(/^(\s*)/);
                            if (nextIndentMatch && nextIndentMatch[1].length <= indent) { endLine = j; break; }
                        }
                        state.allFunctions.push({ name: defMatch[2], filePath, startLine: i + 1, endLine, type: 'python' });
                    }
                }
            } else if (ext === '.js' || ext === '.ts') {
                for (let i = 0; i < lines.length; i++) {
                    const funcMatch = lines[i].match(/(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
                    const arrowMatch = lines[i].match(/(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_][a-zA-Z0-9_]*)\s*=>/);
                    let funcName = funcMatch ? funcMatch[1] : (arrowMatch ? arrowMatch[1] : null);
                    if (funcName) {
                        let endLine = Math.min(lines.length, i + 20); // rough estimate for AST-less parse
                        state.allFunctions.push({ name: funcName, filePath, startLine: i + 1, endLine, type: 'javascript' });
                    }
                }
            }
        });

        const nodes = []; const edges = [];
        filePaths.forEach(filePath => {
            const ext = filePath.substring(filePath.lastIndexOf('.'));
            let color = ext === '.html' ? '#10b981' : (ext === '.py' ? '#3b82f6' : (ext === '.css' ? '#ec4899' : '#eab308'));
            nodes.push({ id: filePath, label: filePath.split('/').pop(), color: { background: color }, borderWidth: 2, size: 24, shadow: { enabled:true, color:color, size:10 } });
        });

        state.allFunctions.forEach(f => {
            const nodeID = `${f.filePath}::${f.name}`;
            nodes.push({ id: nodeID, label: `${f.name}()`, color: { background: '#f97316' }, size: 14, borderWidth: 2, shadow: { enabled:true, color:'#f97316', size:8 } });
            edges.push({ from: f.filePath, to: nodeID, color: { color: 'rgba(255,255,255,0.1)' }, dashes: true });
        });

        // Build static dependencies (cross-file calls)
        state.allFunctions.forEach(f1 => {
            const fileContent = state.fileMap[f1.filePath];
            if (!fileContent) return;
            const lines = fileContent.split('\n');
            const bodyLines = lines.slice(f1.startLine - 1, f1.endLine);
            const bodyText = bodyLines.join('\n');
            
            state.allFunctions.forEach(f2 => {
                if (f1.filePath === f2.filePath && f1.name === f2.name) return; // skip self
                
                const wordRegex = new RegExp('\\\\b' + f2.name + '\\\\b');
                if (wordRegex.test(bodyText)) {
                    const edgeId = `static_dep::${f1.filePath}::${f1.name}->${f2.filePath}::${f2.name}`;
                    edges.push({
                        id: edgeId,
                        from: `${f1.filePath}::${f1.name}`,
                        to: `${f2.filePath}::${f2.name}`,
                        color: { color: 'rgba(255,255,255,0.12)' },
                        width: 1.5,
                        arrows: 'to'
                    });
                }
            });
        });
        
        // Build file-to-function dependencies (calls from global scope)
        filePaths.forEach(filePath => {
            const fileContent = state.fileMap[filePath];
            if (!fileContent) return;
            
            const lines = fileContent.split('\n');
            const funcRanges = state.allFunctions.filter(f => f.filePath === filePath);
            const globalLines = lines.map((line, idx) => {
                const lineNum = idx + 1;
                const isInsideFunc = funcRanges.some(f => lineNum >= f.startLine && lineNum <= f.endLine);
                return isInsideFunc ? '' : line;
            });
            const globalText = globalLines.join('\n');
            
            state.allFunctions.forEach(f2 => {
                if (f2.filePath === filePath) return; // skip functions inside same file
                
                const wordRegex = new RegExp('\\\\b' + f2.name + '\\\\b');
                if (wordRegex.test(globalText)) {
                    const edgeId = `static_dep::${filePath}->${f2.filePath}::${f2.name}`;
                    edges.push({
                        id: edgeId,
                        from: filePath,
                        to: `${f2.filePath}::${f2.name}`,
                        color: { color: 'rgba(255,255,255,0.12)' },
                        width: 1.5,
                        arrows: 'to'
                    });
                }
            });
        });

        state.nodesDataset = new vis.DataSet(nodes);
        state.edgesDataset = new vis.DataSet(edges);

        const container = document.getElementById('bt-canvas');
        state.network = new vis.Network(container, { nodes: state.nodesDataset, edges: state.edgesDataset }, {
            physics: { barnesHut: { gravitationalConstant: -3000, centralGravity: 0.3, springLength: 100 } },
            nodes: { font: { color: '#fff', face: 'Outfit', size: 12 } },
            edges: { smooth: { type: 'continuous' } }
        });

        state.originalNodeOptions = {}; state.originalEdgeOptions = {};
        state.nodesDataset.forEach(n => state.originalNodeOptions[n.id] = { color: Object.assign({}, n.color), size: n.size, shadow: Object.assign({}, n.shadow) });
        state.edgesDataset.forEach(e => state.originalEdgeOptions[e.id] = { color: Object.assign({}, e.color), width: e.width, dashes: e.dashes });

        state.network.on("selectNode", params => {
            showNodeInspection(params.nodes[0]);
        });

        // Trigger auto trace if errors exist!
        if (state.interceptedErrors.length > 0) {
            if (state.selectedErrorIndex === null) {
                state.selectedErrorIndex = 0;
            }
            setTimeout(() => {
                autoTraceError(state.interceptedErrors[state.selectedErrorIndex]);
            }, 1000);
        }
    }

    // --- EXECUTION PATH TRACER ---
    function cleanJsUrl(url) {
        try { return new URL(url).pathname.replace(/^\//, ''); } 
        catch(e) { return url.replace(/^\//, ''); }
    }

    function resetNetworkHighlights() {
        if (!state.network || !state.nodesDataset || !state.edgesDataset) return;
        
        // Remove trace edges
        state.traceEdgesIds.forEach(id => {
            try { state.edgesDataset.remove(id); } catch(e) {}
        });
        state.traceEdgesIds = [];
        
        // Restore nodes to original colors and sizes
        state.nodesDataset.forEach(n => {
            const orig = state.originalNodeOptions[n.id];
            if (orig) {
                state.nodesDataset.update({
                    id: n.id,
                    color: Object.assign({}, orig.color),
                    size: orig.size,
                    shadow: Object.assign({}, orig.shadow)
                });
            }
        });
        
        // Restore edges to original options
        state.edgesDataset.forEach(e => {
            const orig = state.originalEdgeOptions[e.id];
            if (orig) {
                state.edgesDataset.update({
                    id: e.id,
                    color: Object.assign({}, orig.color),
                    width: orig.width,
                    dashes: orig.hasOwnProperty('dashes') ? orig.dashes : false
                });
            }
        });
    }

    function findBlastRadius(startNodeId) {
        const visited = new Set();
        const queue = [startNodeId];
        
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            if (current !== startNodeId) {
                visited.add(current);
            }
            
            // Find all nodes that depend on `current`
            state.edgesDataset.forEach(edge => {
                if (edge.to === current) {
                    const fromNode = edge.from;
                    if (!visited.has(fromNode) && fromNode !== startNodeId) {
                        queue.push(fromNode);
                    }
                }
            });
        }
        
        return Array.from(visited);
    }

    function autoTraceError(errData) {
        resetNetworkHighlights();

        if (!errData || !errData.stack) {
            // Clear steps
            document.getElementById('bt-trace-steps-container').style.display = 'none';
            document.getElementById('bt-blast-radius-container').style.display = 'none';
            const listDiv = document.getElementById('bt-trace-steps-list');
            listDiv.innerHTML = '';
            
            // Show suggestions in code inspector
            const title = document.getElementById('bt-inspector-title');
            const content = document.getElementById('bt-inspector-content');
            if (title && content && errData) {
                title.innerText = "Error Diagnostic";
                content.innerHTML = `
                    <div style="color:#ef4444; font-weight:700;">${errData.msg || 'Exception'}</div>
                    ${getSuggestions(errData.msg)}
                `;
            }
            return;
        }
        
        let stackFrames = [];

        const processFrame = (funcName, rawFile, rawLine) => {
            const cleanPath = cleanJsUrl(rawFile).replace(/\\/g, '/');
            const filePath = Object.keys(state.fileMap).find(fp => cleanPath.endsWith(fp) || fp.endsWith(cleanPath));
            
            if (filePath) {
                // Ignore frames inside bananatracer.js itself
                if (filePath.endsWith('bananatracer.js')) return;

                const lineNum = parseInt(rawLine);
                let nodeID = getCallerNode(filePath, lineNum);
                let cleanFunc = (funcName || 'anonymous').trim();
                
                if (cleanFunc !== 'anonymous' && cleanFunc !== '(anonymous function)' && state.nodesDataset.get(`${filePath}::${cleanFunc}`)) {
                    nodeID = `${filePath}::${cleanFunc}`;
                }
                
                // Avoid adjacent duplicates
                if (stackFrames.length === 0 || stackFrames[stackFrames.length-1].nodeID !== nodeID) {
                    stackFrames.push({ nodeID, file: filePath, lineNum, func: cleanFunc });
                }
            }
        };

        const lines = errData.stack.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.includes('[native code]')) continue;
            
            let funcName = '';
            let fileAndLine = '';
            
            // Chrome format: "at FunctionName (url:line:col)" or "at url:line:col"
            if (line.startsWith('at ')) {
                const parts = line.substring(3).trim();
                const openParen = parts.lastIndexOf('(');
                const closeParen = parts.lastIndexOf(')');
                if (openParen !== -1 && closeParen !== -1) {
                    funcName = parts.substring(0, openParen).trim();
                    fileAndLine = parts.substring(openParen + 1, closeParen).trim();
                } else {
                    fileAndLine = parts;
                }
            } 
            // Firefox/Safari format: "FunctionName@url:line:col" or "@url:line:col"
            else if (line.includes('@')) {
                const parts = line.split('@');
                funcName = parts[0].trim();
                fileAndLine = parts[1].trim();
            }
            // Safari format with parentheses: "(anonymous function) (url:line:col)"
            else {
                const openParen = line.lastIndexOf('(');
                const closeParen = line.lastIndexOf(')');
                if (openParen !== -1 && closeParen !== -1) {
                    funcName = line.substring(0, openParen).trim();
                    fileAndLine = line.substring(openParen + 1, closeParen).trim();
                } else {
                    fileAndLine = line;
                }
            }
            
            const colParts = fileAndLine.split(':');
            if (colParts.length >= 2) {
                let last = colParts.pop();
                let secondLast = colParts.pop();
                
                let lineNum = NaN;
                let filePath = '';
                
                if (!isNaN(last) && !isNaN(secondLast)) {
                    lineNum = parseInt(secondLast);
                    filePath = colParts.join(':');
                } else if (!isNaN(last)) {
                    lineNum = parseInt(last);
                    filePath = [...colParts, secondLast].join(':');
                } else {
                    continue;
                }
                
                processFrame(funcName, filePath, lineNum);
            }
        }

        if (stackFrames.length > 0) {
            state.network.setOptions({ physics: { enabled: false } });
            
            // Dim network
            state.nodesDataset.forEach(n => state.nodesDataset.update({ id: n.id, color: { background: 'rgba(50,50,50,0.2)' }, shadow:{enabled:false} }));
            state.edgesDataset.forEach(e => {
                if (!e.id.toString().startsWith('trace_')) state.edgesDataset.update({ id: e.id, color: { color: 'rgba(50,50,50,0.1)' } });
            });

            // Highlight Path
            const nodesToPulse = [...new Set(stackFrames.map(f => f.nodeID))];
            nodesToPulse.forEach(id => state.nodesDataset.update({ id, color: { background: '#ef4444' } }));

            for (let i = 0; i < stackFrames.length - 1; i++) {
                const edgeId = `trace_${i}`;
                state.traceEdgesIds.push(edgeId);
                state.edgesDataset.add({ id: edgeId, from: stackFrames[i+1].nodeID, to: stackFrames[i].nodeID, color: { color: '#ef4444' }, width: 4, dashes: true, arrows: 'to' });
            }

            // Calculate & Highlight Blast Radius
            const crashSiteId = stackFrames[0].nodeID;
            const blastRadius = findBlastRadius(crashSiteId);
            
            if (blastRadius.length > 0) {
                // Highlight blast radius nodes in warning amber
                blastRadius.forEach(id => {
                    if (!nodesToPulse.includes(id)) {
                        state.nodesDataset.update({
                            id,
                            color: { background: '#f59e0b', border: '#d97706' },
                            shadow: { enabled: true, color: '#f59e0b', size: 8 }
                        });
                    }
                });
                
                // Highlight blast radius edges
                state.edgesDataset.forEach(edge => {
                    if (blastRadius.includes(edge.from) && (blastRadius.includes(edge.to) || nodesToPulse.includes(edge.to))) {
                        state.edgesDataset.update({
                            id: edge.id,
                            color: { color: '#f59e0b' },
                            width: 2,
                            dashes: true
                        });
                    }
                });

                // Render Blast Radius UI
                document.getElementById('bt-blast-radius-container').style.display = 'block';
                const blastList = document.getElementById('bt-blast-radius-list');
                blastList.innerHTML = '';
                blastRadius.forEach(nodeId => {
                    const nodeObj = state.nodesDataset.get(nodeId);
                    if (!nodeObj) return;
                    
                    const div = document.createElement('div');
                    div.className = 'bt-trace-step';
                    div.style.border = '1px solid rgba(245, 158, 11, 0.25)';
                    div.style.background = 'rgba(245, 158, 11, 0.08)';
                    div.style.margin = '4px 0';
                    
                    let typeLabel = 'Affected File';
                    if (nodeId.includes('::')) {
                        typeLabel = 'Affected Function';
                    }
                    
                    div.innerHTML = `
                        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #fef3c7; font-weight: 600;">⚠️ ${nodeObj.label}</div>
                        <div style="font-size: 9px; color: #f59e0b; margin-top: 4px; font-weight: 700; text-transform: uppercase;">${typeLabel}</div>
                    `;
                    div.onclick = () => {
                        state.network.fit({ nodes: [nodeId], animation: true });
                        state.network.selectNodes([nodeId]);
                        showNodeInspection(nodeId);
                    };
                    blastList.appendChild(div);
                });
            } else {
                document.getElementById('bt-blast-radius-container').style.display = 'none';
            }

            // Build Steps UI
            document.getElementById('bt-trace-steps-container').style.display = 'block';
            const listDiv = document.getElementById('bt-trace-steps-list');
            listDiv.innerHTML = '';
            
            stackFrames.reverse().forEach((frame, index) => {
                const div = document.createElement('div');
                div.className = 'bt-trace-step';
                div.innerHTML = `<div class="bt-trace-step-header">${index === stackFrames.length - 1 ? '💥 CRASH:' : 'CALL:'} ${frame.func}()</div>
                                 <div class="bt-trace-step-loc">${frame.file} : Line ${frame.lineNum}</div>`;
                div.onclick = () => {
                    state.network.fit({ nodes: [frame.nodeID], animation: true });
                    state.network.selectNodes([frame.nodeID]);
                    showNodeInspection(frame.nodeID, frame.lineNum);
                };
                listDiv.appendChild(div);
            });

            state.network.fit({ nodes: nodesToPulse, animation: true });
        }
    }

    function getSuggestions(msg) {
        if (!msg) return '';
        const lowercaseMsg = msg.toLowerCase();
        let suggestions = [];

        if (lowercaseMsg.includes('fetch') || lowercaseMsg.includes('load failed') || lowercaseMsg.includes('networkerror') || lowercaseMsg.includes('cors') || lowercaseMsg.includes('cross origin')) {
            suggestions.push(
                "<strong>CORS / Sandbox Policy Blocked:</strong> You are likely running this page via the <code>file://</code> protocol. Browsers restrict network requests on local files. Use a local HTTP server (e.g., run <code>npx serve</code>, <code>python3 -m http.server</code>, or <code>python app.py</code>) to run the application.",
                "<strong>Backend Server Offline:</strong> Check if your API backend (e.g., Flask server) is active and running on the expected port.",
                "<strong>Incorrect API Endpoint:</strong> Ensure the request path/URL matches your API routes."
            );
        } else if (lowercaseMsg.includes('null is not an object') || lowercaseMsg.includes('cannot read properties of null') || lowercaseMsg.includes('undefined')) {
            suggestions.push(
                "<strong>DOM Access Before Load:</strong> If accessing the DOM (e.g., <code>document.body</code>, <code>getElementById</code>), ensure your script is executed after the elements are created. Wrap your initialization code in a <code>DOMContentLoaded</code> listener or place the script tag at the end of the <code>&lt;body&gt;</code>.",
                "<strong>Missing Object Properties:</strong> You are attempting to read properties of a variable that is currently <code>null</code> or <code>undefined</code>. Add a check (e.g., <code>if (myVar) ...</code>) or use optional chaining (<code>myVar?.property</code>)."
            );
        } else if (lowercaseMsg.includes('is not a function')) {
            suggestions.push(
                "<strong>Unimplemented API:</strong> The API or library function is not supported in the current environment (e.g., <code>showDirectoryPicker</code> on Safari). Add a feature fallback check.",
                "<strong>Variable Type Mismatch:</strong> You are calling a function on a variable that is not actually a function (e.g., it is undefined, string, or null)."
            );
        } else {
            suggestions.push(
                "<strong>Unhandled Exception:</strong> Review the traceback flow to check the parameters passed to the function.",
                "<strong>Syntax/Runtime Issue:</strong> Check for spelling errors, missing declarations, or type mismatches in the highlighted code line."
            );
        }

        return `
            <div class="bt-suggestions-box" style="margin-top: 12px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 12px; font-size: 11px; line-height: 1.4; text-align: left;">
                <div style="font-weight: 700; color: #60a5fa; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                    Diagnostic Suggestions
                </div>
                <ul style="margin: 0; padding-left: 14px; color: #94a3b8;">
                    ${suggestions.map(s => `<li style="margin-bottom: 6px;">${s}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    function showNodeInspection(nodeId, crashedLineNum = null) {
        const title = document.getElementById('bt-inspector-title');
        const content = document.getElementById('bt-inspector-content');
        const nodeObj = state.nodesDataset.get(nodeId);
        
        if (!nodeObj) return;
        title.innerText = nodeObj.label;

        let snippet = "";
        let displayStart = 1;
        
        if (nodeObj.group === 'function' || nodeId.includes('::')) {
            const [filePath, funcName] = nodeId.split('::');
            const funcData = state.allFunctions.find(f => f.filePath === filePath && f.name === funcName);
            if (funcData && state.fileMap[filePath]) {
                displayStart = funcData.startLine;
                snippet = state.fileMap[filePath].split('\n').slice(funcData.startLine - 1, funcData.endLine).join('\n');
            }
        } else {
            snippet = (state.fileMap[nodeId] || "").split('\n').slice(0, 40).join('\n');
        }

        let hlSnippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const keywords = ['function', 'const', 'let', 'var', 'if', 'return', 'async', 'await'];
        hlSnippet = hlSnippet.replace(new RegExp(`\\b(${keywords.join('|')})\\b`, 'g'), '<span class="syn-keyword">$1</span>');

        if (crashedLineNum) {
            const lines = hlSnippet.split('\n');
            const idx = crashedLineNum - displayStart;
            if (lines[idx] !== undefined) {
                lines[idx] = `<span class="syn-crashed-line">${lines[idx]}</span>`;
                hlSnippet = lines.join('\n');
            }
        }

        let suggestionsHtml = '';
        if (crashedLineNum && state.selectedErrorIndex !== null) {
            const activeErr = state.interceptedErrors[state.selectedErrorIndex];
            if (activeErr) {
                suggestionsHtml = getSuggestions(activeErr.msg);
            }
        }

        content.innerHTML = `
            <div style="color:var(--text-muted); font-size:10px;">Source File: ${nodeId.split('::')[0]}</div>
            <pre class="bt-code-block"><code>${hlSnippet}</code></pre>
            ${suggestionsHtml}
        `;
    }
})();

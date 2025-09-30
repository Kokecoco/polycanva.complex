document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const fileManagerOverlay = document.getElementById('file-manager-overlay'); const fileList = document.getElementById('file-list'); const createNewFileBtn = document.getElementById('create-new-file-btn'); const mainApp = document.getElementById('main-app'); const backToFilesBtn = document.getElementById('back-to-files-btn'); const board = document.getElementById('board'); let svgLayer = document.getElementById('connector-svg-layer'); const addNoteBtn = document.getElementById('add-note-btn'); const addSectionBtn = document.getElementById('add-section-btn'); const addTextBtn = document.getElementById('add-text-btn'); const addShapeSquareBtn = document.getElementById('add-shape-square-btn'); const addShapeCircleBtn = document.getElementById('add-shape-circle-btn'); const addShapeDiamondBtn = document.getElementById('add-shape-diamond-btn'); const addConnectorBtn = document.getElementById('add-connector-btn'); const penToolBtn = document.getElementById('pen-tool-btn'); const eraserToolBtn = document.getElementById('eraser-tool-btn'); const exportBtn = document.getElementById('export-btn'); const imageExportBtn = document.getElementById('image-export-btn'); const importBtn = document.getElementById('import-btn'); const importFileInput = document.getElementById('import-file-input'); const cleanupBtn = document.getElementById('cleanup-btn'); const zoomDisplay = document.getElementById('zoom-display'); const zoomResetBtn = document.getElementById('zoom-reset-btn'); const undoBtn = document.getElementById('undo-btn'); const redoBtn = document.getElementById('redo-btn'); const darkModeBtn = document.getElementById('dark-mode-btn'); const minimap = document.getElementById('minimap'); const guideContainer = document.getElementById('guide-container');
    // 共有ボタンをツールバーに追加
    let shareBtn = document.getElementById('share-btn');
    if (!shareBtn) {
        shareBtn = document.createElement('button');
        shareBtn.id = 'share-btn';
        shareBtn.title = '共有モードを有効化(オンライン同期)';
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> 共有';
        const toolbar = document.getElementById('toolbar');
        if (toolbar) {
            // ダークモードボタンの直前に挿入
            const darkModeBtn = document.getElementById('dark-mode-btn');
            if (darkModeBtn) {
                toolbar.insertBefore(shareBtn, darkModeBtn);
            } else {
                toolbar.appendChild(shareBtn);
            }
        }
    }

    // オンライン共有モードの管理
    let isOnlineMode = false;
    let channel = null;
    function enableOnlineMode() {
        if (isOnlineMode) return;
        isOnlineMode = true;
        channel = new BroadcastChannel('plottia_sync_channel');
        channel.onmessage = (event) => {
            const { type, fileId, state } = event.data;
            // もし他のタブで更新されたファイルが、このタブで開いているファイルと同じなら
            if (type === 'update' && fileId === currentFileId) {
                if (state) {
                    loadStateFromObject(state);
                }
            }
        };
        // ボタンの見た目を変える
        if (shareBtn) {
            shareBtn.classList.add('active');
            shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> 共有中';
            shareBtn.disabled = true;
        }
    }
    // 共有ボタンでオンラインモード有効化
    if (shareBtn) {
        shareBtn.addEventListener('click', enableOnlineMode);
    }
    const strokeWidthSlider = document.getElementById('stroke-width-slider'); const strokeWidthDisplay = document.getElementById('stroke-width-display');
    
    const drawingLayer = document.getElementById('drawing-layer');
    const objectContainer = document.getElementById('object-container');
    const ctx = drawingLayer.getContext('2d');
    drawingLayer.width = 5000;
    drawingLayer.height = 5000;

    // --- グローバル変数 ---
    let currentFileId = null; 
    let notes = [], sections = [], textBoxes = [], shapes = [], connectors = [];
    let paths = [];
    let selectedElement = null; let boardState = {}; let isConnectorMode = false, connectorStartId = null; let isPenMode = false, isEraserMode = false; let historyStack = [], redoStack = []; const HISTORY_LIMIT = 50; let initialPinchDistance = null;
    let currentStrokeWidth = 5;

    const db = {
        _db: null,
        _dbName: 'PlottiaDB',
        _storeName: 'boards',

        async _getDB() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this._dbName, 1);
                request.onerror = e => reject('IndexedDBのオープンに失敗しました:', e.target.error);
                request.onsuccess = e => {
                    this._db = e.target.result;
                    resolve(this._db);
                };
                request.onupgradeneeded = e => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this._storeName)) {
                        db.createObjectStore(this._storeName);
                    }
                };
            });
        },

        async set(key, value) {
            const db = await this._getDB();
            return new Promise((resolve, reject) => {
                // データをJSON文字列に変換し、pakoで圧縮
                const compressed = pako.deflate(JSON.stringify(value));
                
                const transaction = db.transaction(this._storeName, 'readwrite');
                const store = transaction.objectStore(this._storeName);
                const request = store.put(compressed, key);
            
                transaction.oncomplete = () => resolve();
                transaction.onerror = e => reject('データの保存に失敗しました:', e.target.error);
            });
        },

        async get(key) {
            const db = await this._getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this._storeName, 'readonly');
                const store = transaction.objectStore(this._storeName);
                const request = store.get(key);
            
                request.onsuccess = e => {
                    if (e.target.result) {
                        try {
                            // 取得した圧縮データをpakoで解凍し、JSONにパース
                            const decompressed = pako.inflate(e.target.result, { to: 'string' });
                            resolve(JSON.parse(decompressed));
                        } catch (err) {
                            console.error('データの解凍またはパースに失敗しました:', err);
                            resolve(null); // 破損データの場合はnullを返す
                        }
                    } else {
                        resolve(null); // データが存在しない
                    }
                };
                request.onerror = e => reject('データの取得に失敗しました:', e.target.error);
            });
        },
    
        async remove(key) {
            const db = await this._getDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this._storeName, 'readwrite');
                const store = transaction.objectStore(this._storeName);
                store.delete(key);
                transaction.oncomplete = () => resolve();
                transaction.onerror = e => reject('データの削除に失敗しました:', e.target.error);
            });
        }
    };


// (BroadcastChannelはオンラインモード時のみ初期化)

    const noteColors = ['#ffc', '#cfc', '#ccf', '#fcc', '#cff', '#fff']; const sectionColors = ['rgba(255, 0, 0, 0.1)', 'rgba(0, 0, 255, 0.1)', 'rgba(0, 128, 0, 0.1)', 'rgba(128, 0, 128, 0.1)', 'rgba(255, 165, 0, 0.1)', 'rgba(220, 220, 220, 0.5)']; const shapeColors = ['#ffffff', '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];

    function getEventCoordinates(e) { if (e.touches && e.touches.length > 0) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; } return { x: e.clientX, y: e.clientY }; }
    function selectElement(element) { clearSelection(); selectedElement = element; if(element?.id) { document.getElementById(element.id)?.classList.add('selected'); } }
    function clearSelection() { if (selectedElement) { if(selectedElement.id){ document.getElementById(selectedElement.id)?.classList.remove('selected'); } } selectedElement = null; document.querySelectorAll('.connector-line.selected').forEach(l => l.classList.remove('selected')); }
    function getFileMetadata() { return JSON.parse(localStorage.getItem('plottia_files_metadata')) || []; }
    function saveFileMetadata(metadata) { localStorage.setItem('plottia_files_metadata', JSON.stringify(metadata)); }
    function showFileManager() { currentFileId = null; fileManagerOverlay.classList.remove('hidden'); mainApp.classList.add('hidden'); const metadata = getFileMetadata(); metadata.sort((a, b) => b.lastModified - a.lastModified); fileList.innerHTML = ''; if (metadata.length === 0) { fileList.innerHTML = '<li>ファイルがありません。新しいファイルを作成してください。</li>'; } metadata.forEach(file => { const li = document.createElement('li'); const lastModified = new Date(file.lastModified).toLocaleString(); li.innerHTML = `<span class="file-name">${file.name}</span><span class="file-meta">最終更新: ${lastModified}</span><div class="file-actions"><button class="rename-btn" title="名前を変更"><i class="fas fa-pen"></i></button><button class="delete-btn" title="削除"><i class="fas fa-trash"></i></button></div>`; fileList.appendChild(li); li.querySelector('.file-name').addEventListener('click', () => openFile(file.id)); li.querySelector('.rename-btn').addEventListener('click', () => renameFile(file.id, file.name)); li.querySelector('.delete-btn').addEventListener('click', () => deleteFile(file.id, file.name)); }); }
    function createNewFile() { const name = prompt('新しいファイルの名前を入力してください:', '無題のボード'); if (!name) return; const metadata = getFileMetadata(); const newFile = { id: `plottia_board_${Date.now()}`, name: name, lastModified: Date.now() }; metadata.push(newFile); saveFileMetadata(metadata); const emptyBoardData = { notes: [], sections: [], textBoxes: [], shapes: [], paths: [], connectors: [], board: { panX: 0, panY: 0, scale: 1.0, noteZIndexCounter: 1000, sectionZIndexCounter: 1 } }; localStorage.setItem(newFile.id, JSON.stringify(emptyBoardData)); openFile(newFile.id); }
    function openFile(fileId) { currentFileId = fileId; fileManagerOverlay.classList.add('hidden'); mainApp.classList.remove('hidden'); loadState(); }
    function renameFile(fileId, oldName) { const newName = prompt('新しいファイル名を入力してください:', oldName); if (!newName || newName === oldName) return; let metadata = getFileMetadata(); const fileIndex = metadata.findIndex(f => f.id === fileId); if (fileIndex > -1) { metadata[fileIndex].name = newName; metadata[fileIndex].lastModified = Date.now(); saveFileMetadata(metadata); showFileManager(); } }
    async function deleteFile(fileId, fileName) {
        if (!confirm(`「${fileName}」を完全に削除します。よろしいですか？`)) return;
        try {
            let metadata = getFileMetadata();
            metadata = metadata.filter(f => f.id !== fileId);
            saveFileMetadata(metadata);
            await db.remove(fileId);
            showFileManager();
        } catch (err) {
            alert(`ファイルの削除中にエラーが発生しました:\n${err.message}`);
            console.error(err); // コンソールが使える環境のために残しておく
        }
    }
    // ★★★ 修正箇所 ★★★
    // 操作「前」の状態を履歴に記録する
    function recordHistory() {
        const currentState = getCurrentState();
        historyStack.push(currentState);
        if (historyStack.length > HISTORY_LIMIT) {
            historyStack.shift();
        }
        redoStack = []; // 新しい操作が行われたらRedoスタックはクリア
        updateUndoRedoButtons();
    }
    
    function undo() {
        if (historyStack.length === 0) return;
        redoStack.push(getCurrentState());
        const prevState = historyStack.pop();
        loadStateFromObject(prevState);
        saveState();
        updateUndoRedoButtons();
    }

    function redo() {
        if (redoStack.length === 0) return;
        historyStack.push(getCurrentState());
        const nextState = redoStack.pop();
        loadStateFromObject(nextState);
        saveState();
        updateUndoRedoButtons();
    }

    function updateUndoRedoButtons() {
        undoBtn.disabled = historyStack.length === 0;
        redoBtn.disabled = redoStack.length === 0;
    }
    
    function getCurrentState() {
        return {
            notes: notes.map(el => ({ id: el.id, x: el.style.left, y: el.style.top, width: el.style.width, height: el.style.height, zIndex: el.style.zIndex, content: el.querySelector('.note-content').value, color: el.dataset.color, isLocked: el.classList.contains('locked') })),
            sections: sections.map(el => ({ id: el.id, x: el.style.left, y: el.style.top, width: el.style.width, height: el.style.height, zIndex: el.style.zIndex, title: el.querySelector('.section-title').textContent, color: el.style.backgroundColor, isLocked: el.classList.contains('locked') })),
            textBoxes: textBoxes.map(el => ({ id: el.id, x: el.style.left, y: el.style.top, zIndex: el.style.zIndex, content: el.querySelector('.text-content').innerHTML, width: el.style.width, isLocked: el.classList.contains('locked') })),
            shapes: shapes.map(el => ({ id: el.id, type: el.dataset.shapeType, x: el.style.left, y: el.style.top, width: el.style.width, height: el.style.height, zIndex: el.style.zIndex, label: el.querySelector('.shape-label').innerHTML, color: el.querySelector('.shape-visual').style.backgroundColor, isLocked: el.classList.contains('locked') })),
            paths: paths.map(path => ({
                ...path,
                points: [...path.points]
            })),
            connectors: connectors.map(c => ({ id: c.id, startId: c.startId, endId: c.endId })),
            board: { ...boardState }
        };
    }

    function loadStateFromObject(state) { 
        boardState = { panX: 0, panY: 0, scale: 1.0, noteZIndexCounter: 1000, sectionZIndexCounter: 1, ...state.board }; 
        objectContainer.innerHTML = '';
        svgLayer.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`; 
        notes = []; sections = []; textBoxes = []; shapes = []; connectors = [];
        paths = state.paths || [];
        redrawCanvas();

        clearSelection(); 
        if (state.sections) state.sections.forEach(data => createSection(data)); 
        if (state.notes) state.notes.forEach(data => createNote(data)); 
        if (state.textBoxes) state.textBoxes.forEach(data => createTextBox(data)); 
        if (state.shapes) state.shapes.forEach(data => createShape(data)); 
        if (state.connectors) { connectors = state.connectors; } 
        applyTransform(); 
    }
    
    // ★★★ 修正箇所 ★★★
    // commitChange関数を削除。代わりにsaveStateを直接呼び出す。
    async function saveState() {
        if (!currentFileId) return;
        try {
            let metadata = getFileMetadata();
            const fileIndex = metadata.findIndex(f => f.id === currentFileId);
            if (fileIndex > -1) {
                metadata[fileIndex].lastModified = Date.now();
                saveFileMetadata(metadata);
            }
            const currentState = getCurrentState();
            await db.set(currentFileId, currentState);
            // オンラインモード時のみ同期
            if (isOnlineMode && channel) {
                channel.postMessage({
                    type: 'update',
                    fileId: currentFileId,
                    state: currentState
                });
            }
        } catch (err) {
            alert(`データの保存中にエラーが発生しました:\n${err.message}`);
            console.error(err);
        }
    }
    async function loadState() {
        if (!currentFileId) return;
        try {
            const state = await db.get(currentFileId);
            if (!state) {
                // 新規ファイルなどの場合、空の状態で初期化
                const emptyBoardData = { notes: [], sections: [], textBoxes: [], shapes: [], paths: [], connectors: [], board: { panX: 0, panY: 0, scale: 1.0, noteZIndexCounter: 1000, sectionZIndexCounter: 1 } };
                loadStateFromObject(emptyBoardData);
            } else {
                loadStateFromObject(state);
            }
            historyStack = [];
            redoStack = [];
            updateUndoRedoButtons();
        } catch (err) {
            alert(`データの読み込み中にエラーが発生しました:\n${err.message}`);
            console.error(err);
            showFileManager(); // エラー時はファイルマネージャーに戻る
        }
    }

    function redrawCanvas() {
        ctx.clearRect(0, 0, drawingLayer.width, drawingLayer.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        paths.forEach(path => {
            ctx.globalCompositeOperation = path.mode === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.strokeWidth;
            ctx.beginPath();
            if (path.points.length > 0) {
                ctx.moveTo(path.points[0].x, path.points[0].y);
                path.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
                ctx.stroke();
            }
        });
        ctx.globalCompositeOperation = 'source-over';
    }

    function getElementCenter(elementId) { const el = document.getElementById(elementId); if (!el) return null; const x = parseFloat(el.style.left) + el.offsetWidth / 2; const y = parseFloat(el.style.top) + el.offsetHeight / 2; return { x, y }; }
    function drawAllConnectors() { 
        if(!svgLayer) return; 
        svgLayer.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`; 
        connectors.forEach(conn => { 
            const startPoint = getElementCenter(conn.startId); 
            const endPoint = getElementCenter(conn.endId); 
            if (startPoint && endPoint) { 
                // Create a group to contain both the visible line and invisible hit area
                const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
                group.dataset.id = conn.id;
                
                // Create the invisible thick line for easier clicking (hit area)
                const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "line");
                hitArea.setAttribute("x1", startPoint.x);
                hitArea.setAttribute("y1", startPoint.y);
                hitArea.setAttribute("x2", endPoint.x);
                hitArea.setAttribute("y2", endPoint.y);
                hitArea.setAttribute("stroke", "transparent");
                hitArea.setAttribute("stroke-width", "12"); // Much thicker for easy clicking
                hitArea.setAttribute("stroke-linecap", "round");
                hitArea.style.pointerEvents = "all";
                hitArea.style.cursor = "pointer";
                
                // Create the visible line
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", startPoint.x);
                line.setAttribute("y1", startPoint.y);
                line.setAttribute("x2", endPoint.x);
                line.setAttribute("y2", endPoint.y);
                line.setAttribute("class", "connector-line");
                line.style.pointerEvents = "none"; // Only hit area handles clicks
                
                // Add both to the group
                group.appendChild(hitArea);
                group.appendChild(line);
                svgLayer.appendChild(group);
                
                // Add event listeners to the hit area
                hitArea.addEventListener('mousedown', e => { 
                    e.stopPropagation(); 
                    clearSelection(); 
                    selectedElement = { type: 'connector', id: conn.id }; 
                    document.querySelectorAll('.connector-line').forEach(l=>l.classList.remove('selected')); 
                    line.classList.add('selected'); 
                }); 
            } 
        }); 
    }
    function applyTransform() { board.style.transform = `translate(${boardState.panX}px, ${boardState.panY}px) scale(${boardState.scale})`; updateZoomDisplay(); drawAllConnectors(); updateMinimap(); }
    function updateZoomDisplay() { zoomDisplay.textContent = `${Math.round(boardState.scale * 100)}%`; }
    function parseLinks(text) {
        // Convert URLs to clickable links
        return text.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (match) => {
            const url = match.startsWith('www.') ? `http://${match}` : match;
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
        });
    }

    function parseMarkdown(text) { 
        let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/-(.*?)-/g, '<del>$1</del>'); 
        
        // Apply link parsing
        html = parseLinks(html);
        
        html = html.split('\n').map(line => line.startsWith('* ') ? `<li>${line.substring(2)}</li>` : line).join('\n'); 
        html = html.replace(/<li>(.*?)<\/li>/g, '<ul><li>$1</li></ul>').replace(/<\/ul>\n<ul>/g, ''); 
        return html.replace(/\n/g, '<br>'); 
    }
    
    function handleConnectorClick(elementId) { if (!connectorStartId) { connectorStartId = elementId; selectElement(document.getElementById(elementId)); } else { if (connectorStartId !== elementId) { recordHistory(); const newConnector = { id: `conn-${Date.now()}`, startId: connectorStartId, endId: elementId }; connectors.push(newConnector); drawAllConnectors(); saveState(); } toggleConnectorMode(true); } }
    
    function toggleConnectorMode(forceOff = false) { isConnectorMode = forceOff ? false : !isConnectorMode; connectorStartId = null; if (isConnectorMode) { addConnectorBtn.classList.add('active'); document.body.classList.add('connector-mode'); togglePenMode(true); toggleEraserMode(true); clearSelection(); } else { addConnectorBtn.classList.remove('active'); document.body.classList.remove('connector-mode'); } }
    function togglePenMode(forceOff = false) { isPenMode = forceOff ? false : !isPenMode; if (isPenMode) { penToolBtn.classList.add('active'); document.body.classList.add('pen-mode'); drawingLayer.style.pointerEvents = 'auto'; toggleConnectorMode(true); toggleEraserMode(true); clearSelection(); } else { penToolBtn.classList.remove('active'); document.body.classList.remove('pen-mode'); if (!isEraserMode) drawingLayer.style.pointerEvents = 'none'; } }
    function toggleEraserMode(forceOff = false) { isEraserMode = forceOff ? false : !isEraserMode; if (isEraserMode) { eraserToolBtn.classList.add('active'); document.body.classList.add('eraser-mode'); drawingLayer.style.pointerEvents = 'auto'; toggleConnectorMode(true); togglePenMode(true); clearSelection(); } else { eraserToolBtn.classList.remove('active'); document.body.classList.remove('eraser-mode'); if (!isPenMode) drawingLayer.style.pointerEvents = 'none'; } }

    function createNote(data = {}) {
        // ★★★ 修正箇所 ★★★
        // 新規作成の場合、要素を追加する「前」に履歴を記録
        if (!data.id) recordHistory();
        const note = document.createElement('div');
        note.classList.add('note');
        note.id = data.id || `note-${Date.now()}`;
        if (!data.id) {
            note.style.left = `${((window.innerWidth/2)-110-boardState.panX)/boardState.scale}px`;
            note.style.top = `${((window.innerHeight/2)-110-boardState.panY)/boardState.scale}px`;
        } else {
            note.style.left = data.x;
            note.style.top = data.y;
        }
        note.style.width = data.width || '220px';
        note.style.height = data.height || '220px';
        note.style.zIndex = data.zIndex || boardState.noteZIndexCounter++;
        const noteColor = data.color || noteColors[Math.floor(Math.random()*noteColors.length)];
        note.dataset.color = noteColor;
        const rawContent = data.content || '';
        note.innerHTML = `<div class="note-header"><div class="color-picker">${noteColors.map(c => `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div><div class="note-body"><div class="note-view">${parseMarkdown(rawContent)}</div><textarea class="note-content" style="display: none;">${rawContent}</textarea></div><div class="resizer"></div>`;
        updateNoteColor(note, noteColor);
        objectContainer.appendChild(note);
        notes.push(note);
        // ★★★ 修正箇所 ★★★
        // 新規作成の場合、要素を追加した「後」で状態を保存
        if (!data.id) saveState();
        if (data.isLocked) { note.classList.add('locked'); note.querySelector('.lock-btn i').className = 'fas fa-lock'; }
    
        const onMouseDown = (e) => { e.stopPropagation(); if (isConnectorMode) { handleConnectorClick(note.id); return; } selectElement(note); if(!note.classList.contains('locked')) { recordHistory(); note.style.zIndex = boardState.noteZIndexCounter++; saveState(); } }; note.addEventListener('mousedown', onMouseDown); note.addEventListener('touchstart', onMouseDown, {passive: false});
        const header = note.querySelector('.note-header'); const onHeaderDown = e => { if (note.classList.contains('locked') || isConnectorMode) return; e.stopPropagation(); document.body.classList.add('is-dragging'); recordHistory(); note.style.zIndex = boardState.noteZIndexCounter++; let lastPos = getEventCoordinates(e); const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); const dx = currentPos.x - lastPos.x; const dy = currentPos.y - lastPos.y; lastPos = currentPos; handleDrag(note, {movementX: dx, movementY: dy}); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); clearGuides(); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); }; header.addEventListener('mousedown', onHeaderDown); header.addEventListener('touchstart', onHeaderDown, {passive: false});
        const resizer = note.querySelector('.resizer'); const onResizeDown = e => { if (note.classList.contains('locked')) return; e.stopPropagation(); document.body.classList.add('is-dragging'); recordHistory(); const startW = note.offsetWidth, startH = note.offsetHeight; const startPos = getEventCoordinates(e); const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); note.style.width = `${startW + (currentPos.x - startPos.x) / boardState.scale}px`; note.style.height = `${startH + (currentPos.y - startPos.y) / boardState.scale}px`; drawAllConnectors(); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); }; resizer.addEventListener('mousedown', onResizeDown); resizer.addEventListener('touchstart', onResizeDown, {passive: false});
        const noteBody = note.querySelector('.note-body'); const view = note.querySelector('.note-view'); const content = note.querySelector('.note-content'); const deleteBtn = note.querySelector('.delete-btn'); const colorDots = note.querySelectorAll('.color-dot'); const lockBtn = note.querySelector('.lock-btn');
        noteBody.addEventListener('dblclick', (e) => { if (note.classList.contains('locked')) return; e.stopPropagation(); recordHistory(); view.style.display = 'none'; content.style.display = 'block'; content.focus(); });
        // ★★★ 修正箇所 ★★★
        // 編集完了時にsaveStateのみ呼び出す
        content.addEventListener('blur', () => { if (note.classList.contains('locked')) return; view.innerHTML = parseMarkdown(content.value); view.style.display = 'block'; content.style.display = 'none'; saveState(); });
        deleteBtn.addEventListener('click', (e) => { if (note.classList.contains('locked')) return; e.stopPropagation(); if (selectedElement === note) clearSelection(); recordHistory(); notes = notes.filter(n => n.id !== note.id); connectors = connectors.filter(c => c.startId !== note.id && c.endId !== note.id); drawAllConnectors(); note.remove(); saveState(); });
        colorDots.forEach(dot => { dot.addEventListener('click', e => { if (note.classList.contains('locked')) return; e.stopPropagation(); recordHistory(); updateNoteColor(note, dot.dataset.color); saveState(); }); });
        lockBtn.addEventListener('click', e => { e.stopPropagation(); recordHistory(); const isLocked = note.classList.toggle('locked'); lockBtn.querySelector('i').className = isLocked ? 'fas fa-lock' : 'fas fa-unlock'; if(isLocked) clearSelection(); saveState(); });
    }
    function updateNoteColor(note, color) { note.dataset.color = color; note.querySelector('.note-header').style.backgroundColor = color; note.querySelector('.note-body').style.backgroundColor = color; }

    function createSection(data = {}) {
        // ★★★ 修正箇所 ★★★
        if (!data.id) recordHistory();
        const section = document.createElement('div'); section.classList.add('section'); section.id = data.id || `section-${Date.now()}`; if (!data.id) { section.style.left = `${((window.innerWidth/2)-200-boardState.panX)/boardState.scale}px`; section.style.top = `${((window.innerHeight/2)-200-boardState.panY)/boardState.scale}px`; } else { section.style.left = data.x; section.style.top = data.y; } section.style.width = data.width || '400px'; section.style.height = data.height || '400px'; section.style.zIndex = data.zIndex || boardState.sectionZIndexCounter++; section.style.backgroundColor = data.color || sectionColors[Math.floor(Math.random()*sectionColors.length)]; const title = data.title || '新しいセクション'; section.innerHTML = `<div class="section-header"><div class="section-title">${title}</div><div class="section-controls"><div class="color-picker">${sectionColors.map(c=>`<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div></div><div class="resizer"></div>`; objectContainer.appendChild(section); sections.push(section);
        // ★★★ 修正箇所 ★★★
        if (!data.id) saveState();
        if (data.isLocked) { section.classList.add('locked'); section.querySelector('.lock-btn i').className = 'fas fa-lock'; }
        const startSectionDrag = (e) => { if (section.classList.contains('locked')) return; recordHistory(); document.body.classList.add('is-dragging'); section.style.zIndex = boardState.sectionZIndexCounter++; let attachedElements = []; const startLeft = parseFloat(section.style.left), startTop = parseFloat(section.style.top); [...notes, ...shapes, ...textBoxes].forEach(el => { const elLeft=parseFloat(el.style.left), elTop=parseFloat(el.style.top); if (elLeft > startLeft && elLeft + el.offsetWidth < startLeft + section.offsetWidth && elTop > startTop && elTop + el.offsetHeight < startTop + section.offsetHeight) { attachedElements.push({element: el, offsetX: elLeft - startLeft, offsetY: elTop - startTop}); } }); let lastPos = getEventCoordinates(e); const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); const dx = currentPos.x - lastPos.x; const dy = currentPos.y - lastPos.y; lastPos = currentPos; handleDrag(section, {movementX: dx, movementY: dy}, attachedElements); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); clearGuides(); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); };
        const header = section.querySelector('.section-header'); const onHeaderDown = e => { e.stopPropagation(); if (isConnectorMode) { handleConnectorClick(section.id); return; } selectElement(section); startSectionDrag(e); }; header.addEventListener('mousedown', onHeaderDown); header.addEventListener('touchstart', onHeaderDown, {passive: false});
        const onSectionDown = e => { if (e.target === section) { e.stopPropagation(); if (isConnectorMode) { handleConnectorClick(section.id); return; } selectElement(section); startSectionDrag(e); }}; section.addEventListener('mousedown', onSectionDown); section.addEventListener('touchstart', onSectionDown, {passive: false});
        const resizer = section.querySelector('.resizer'); const onResizeDown = e => { if (section.classList.contains('locked')) return; e.stopPropagation(); document.body.classList.add('is-dragging'); recordHistory(); const startW=section.offsetWidth, startH=section.offsetHeight; const startPos = getEventCoordinates(e); const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); section.style.width=`${startW+(currentPos.x-startPos.x)/boardState.scale}px`; section.style.height=`${startH+(currentPos.y-startPos.y)/boardState.scale}px`; drawAllConnectors(); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); }; resizer.addEventListener('mousedown', onResizeDown); resizer.addEventListener('touchstart', onResizeDown, {passive: false});
        const titleEl = section.querySelector('.section-title'); titleEl.addEventListener('dblclick', e => { if (section.classList.contains('locked')) return; e.stopPropagation(); recordHistory(); const i=document.createElement('input'); i.type='text'; i.value=titleEl.textContent; i.className='section-title-input'; titleEl.replaceWith(i); i.focus(); i.select(); i.addEventListener('blur',()=>{titleEl.textContent=i.value||"無題";i.replaceWith(titleEl);saveState();}); i.addEventListener('keydown',(ev)=>{if(ev.key==='Enter')i.blur();}); });
        const deleteBtn = section.querySelector('.delete-btn'); deleteBtn.addEventListener('click', e => { if (section.classList.contains('locked')) return; e.stopPropagation(); if (selectedElement === section) clearSelection(); recordHistory(); sections = sections.filter(s => s.id !== section.id); connectors = connectors.filter(c => c.startId !== section.id && c.endId !== section.id); drawAllConnectors(); section.remove(); saveState(); });
        const colorDots = section.querySelectorAll('.color-dot'); colorDots.forEach(dot => { dot.addEventListener('click', e => { if (section.classList.contains('locked')) return; e.stopPropagation(); recordHistory(); section.style.backgroundColor = dot.dataset.color; saveState(); }); });
        const lockBtn = section.querySelector('.lock-btn'); lockBtn.addEventListener('click', e => { e.stopPropagation(); recordHistory(); const isLocked = section.classList.toggle('locked'); lockBtn.querySelector('i').className = isLocked ? 'fas fa-lock' : 'fas fa-unlock'; if(isLocked) clearSelection(); saveState(); });
    }

    function createTextBox(data = {}) {
        // ★★★ 修正箇所 ★★★
        if (!data.id) recordHistory();
        const textBox = document.createElement('div'); textBox.classList.add('text-box'); textBox.id = data.id || `text-${Date.now()}`; if (!data.id) { textBox.style.left = `${((window.innerWidth/2)-100-boardState.panX)/boardState.scale}px`; textBox.style.top = `${((window.innerHeight/2)-50-boardState.panY)/boardState.scale}px`; } else { textBox.style.left = data.x; textBox.style.top = data.y; } textBox.style.zIndex = data.zIndex || boardState.noteZIndexCounter++; textBox.style.width = data.width || 'auto'; textBox.innerHTML = `<div class="text-content" contenteditable="false">${data.content || 'テキストを入力'}</div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div>`; objectContainer.appendChild(textBox); textBoxes.push(textBox);
        // ★★★ 修正箇所 ★★★
        if (!data.id) saveState();
        if (data.isLocked) { textBox.classList.add('locked'); textBox.querySelector('.lock-btn i').className = 'fas fa-lock'; textBox.querySelector('.text-content').contentEditable = 'false'; } else { textBox.querySelector('.text-content').contentEditable = 'true'; }
        const content = textBox.querySelector('.text-content'); const onTextBoxDown = e => { e.stopPropagation(); if (isConnectorMode) { handleConnectorClick(textBox.id); return; } selectElement(textBox); if (textBox.classList.contains('locked')) return; if (e.target !== content) { document.body.classList.add('is-dragging'); recordHistory(); textBox.style.zIndex = boardState.noteZIndexCounter++; let lastPos = getEventCoordinates(e); const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); const dx = currentPos.x - lastPos.x; const dy = currentPos.y - lastPos.y; lastPos = currentPos; handleDrag(textBox, {movementX: dx, movementY: dy}); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); clearGuides(); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); } }; textBox.addEventListener('mousedown', onTextBoxDown); textBox.addEventListener('touchstart', onTextBoxDown, {passive: false});
        
        // ★★★ 修正箇所 ★★★
        // inputイベントでの履歴作成をやめ、focus/blurで管理する
        let originalContentOnFocus;
        content.addEventListener('focus', () => {
            if (textBox.classList.contains('locked')) return;
            originalContentOnFocus = content.innerHTML;
            recordHistory();
        });
        content.addEventListener('blur', () => {
            if (textBox.classList.contains('locked')) return;
            
            // Apply link parsing to text box content
            const parsedContent = parseLinks(content.innerHTML);
            if (parsedContent !== content.innerHTML) {
                content.innerHTML = parsedContent;
            }
            
            if (originalContentOnFocus !== content.innerHTML) {
                saveState();
            } else {
                // 変更がなければ履歴をキャンセル
                if(historyStack.length > 0) historyStack.pop();
                updateUndoRedoButtons();
            }
        });
        content.addEventListener('input', () => { if (textBox.classList.contains('locked')) return; textBox.style.width = 'auto'; });
        content.addEventListener('mousedown', e => e.stopPropagation());
        
        const deleteBtn = textBox.querySelector('.delete-btn'); deleteBtn.addEventListener('click', e => { if (textBox.classList.contains('locked')) return; e.stopPropagation(); if (selectedElement === textBox) clearSelection(); recordHistory(); textBoxes = textBoxes.filter(t => t.id !== textBox.id); connectors = connectors.filter(c => c.startId !== textBox.id && c.endId !== textBox.id); drawAllConnectors(); textBox.remove(); saveState(); });
        const lockBtn = textBox.querySelector('.lock-btn'); lockBtn.addEventListener('click', e => { e.stopPropagation(); recordHistory(); const isLocked = textBox.classList.toggle('locked'); lockBtn.querySelector('i').className = isLocked ? 'fas fa-lock' : 'fas fa-unlock'; content.contentEditable = !isLocked; if(isLocked) clearSelection(); saveState(); });
    }

    function createShape(data = {}) {
        // ★★★ 修正箇所 ★★★
        if (!data.id) recordHistory();
        const shape = document.createElement('div'); shape.classList.add('shape', data.type); shape.dataset.shapeType = data.type; shape.id = data.id || `shape-${Date.now()}`; if (!data.id) { shape.style.left = `${((window.innerWidth/2)-75-boardState.panX)/boardState.scale}px`; shape.style.top = `${((window.innerHeight/2)-75-boardState.panY)/boardState.scale}px`; } else { shape.style.left = data.x; shape.style.top = data.y; } shape.style.width = data.width || '150px'; shape.style.height = data.height || '150px'; shape.style.zIndex = data.zIndex || boardState.noteZIndexCounter++; shape.innerHTML = `<div class="shape-visual"></div><div class="shape-label" contenteditable="false">${data.label || ''}</div><div class="resizer"></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="color-picker">${shapeColors.map(c => `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div>`; objectContainer.appendChild(shape); shapes.push(shape); const visual = shape.querySelector('.shape-visual'); visual.style.backgroundColor = data.color || shapeColors[0];
        // ★★★ 修正箇所 ★★★
        if (!data.id) saveState();
        if (data.isLocked) { shape.classList.add('locked'); shape.querySelector('.lock-btn i').className = 'fas fa-lock'; }
        const onShapeDown = e => { e.stopPropagation(); if (isConnectorMode) { handleConnectorClick(shape.id); return; } selectElement(shape); if (shape.classList.contains('locked')) return; if (e.target.classList.contains('shape-visual') || e.target.classList.contains('shape')) { document.body.classList.add('is-dragging'); recordHistory(); shape.style.zIndex = boardState.noteZIndexCounter++; let lastPos = getEventCoordinates(e); const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); const dx = currentPos.x - lastPos.x; const dy = currentPos.y - lastPos.y; lastPos = currentPos; handleDrag(shape, {movementX: dx, movementY: dy}); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); clearGuides(); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); } }; shape.addEventListener('mousedown', onShapeDown); shape.addEventListener('touchstart', onShapeDown, {passive: false});
        const resizer = shape.querySelector('.resizer'); const onResizeDown = e => { if (shape.classList.contains('locked')) return; e.stopPropagation(); document.body.classList.add('is-dragging'); recordHistory(); const startW=shape.offsetWidth, startH=shape.offsetHeight; const startPos = getEventCoordinates(e); const aspectRatio = startW / startH; const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); if (ev.shiftKey) { const deltaX = currentPos.x - startPos.x; const newWidth = startW + deltaX / boardState.scale; shape.style.width=`${newWidth}px`; shape.style.height=`${newWidth / aspectRatio}px`; } else { shape.style.width=`${startW+(currentPos.x-startPos.x)/boardState.scale}px`; shape.style.height=`${startH+(currentPos.y-startPos.y)/boardState.scale}px`; } drawAllConnectors(); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); }; resizer.addEventListener('mousedown', onResizeDown); resizer.addEventListener('touchstart', onResizeDown, {passive: false});
        const label = shape.querySelector('.shape-label'); label.addEventListener('dblclick', e => { if (shape.classList.contains('locked')) return; e.stopPropagation(); recordHistory(); label.contentEditable = 'true'; label.focus(); });
        // ★★★ 修正箇所 ★★★
        label.addEventListener('blur', () => { label.contentEditable = 'false'; saveState(); });
        label.addEventListener('mousedown', e => e.stopPropagation());
        const deleteBtn = shape.querySelector('.delete-btn'); deleteBtn.addEventListener('click', e => { if (shape.classList.contains('locked')) return; e.stopPropagation(); if (selectedElement === shape) clearSelection(); recordHistory(); shapes = shapes.filter(s => s.id !== shape.id); connectors = connectors.filter(c => c.startId !== shape.id && c.endId !== shape.id); drawAllConnectors(); shape.remove(); saveState(); });
        const colorDots = shape.querySelectorAll('.color-dot'); colorDots.forEach(dot => { dot.addEventListener('click', e => { if (shape.classList.contains('locked')) return; e.stopPropagation(); recordHistory(); shape.querySelector('.shape-visual').style.backgroundColor = dot.dataset.color; saveState(); }); });
        const lockBtn = shape.querySelector('.lock-btn'); lockBtn.addEventListener('click', e => { e.stopPropagation(); recordHistory(); const isLocked = shape.classList.toggle('locked'); lockBtn.querySelector('i').className = isLocked ? 'fas fa-lock' : 'fas fa-unlock'; if(isLocked) clearSelection(); saveState(); });
    }

    function handleDrag(element, event, attachedElements = []) { const currentLeft = parseFloat(element.style.left); const currentTop = parseFloat(element.style.top); const snapped = snapAndGuide(element, currentLeft + event.movementX/boardState.scale, currentTop + event.movementY/boardState.scale); const dx = snapped.x - currentLeft; const dy = snapped.y - currentTop; element.style.left = `${snapped.x}px`; element.style.top = `${snapped.y}px`; attachedElements.forEach(item => { const el = item.element; el.style.left = `${parseFloat(el.style.left) + dx}px`; el.style.top = `${parseFloat(el.style.top) + dy}px`; }); drawAllConnectors(); }
    const SNAP_THRESHOLD = 5;
    function snapAndGuide(draggedEl, newX, newY) { clearGuides(); const draggedRect = { left: newX, top: newY, width: draggedEl.offsetWidth, height: draggedEl.offsetHeight }; const draggedPoints = { v: [draggedRect.left, draggedRect.left + draggedRect.width / 2, draggedRect.left + draggedRect.width], h: [draggedRect.top, draggedRect.top + draggedRect.height / 2, draggedRect.top + draggedRect.height] }; let finalX = newX, finalY = newY; let snappedX = false, snappedY = false; const allElements = [...notes, ...sections, ...textBoxes, ...shapes]; allElements.forEach(targetEl => { if (targetEl === draggedEl) return; const targetRect = { left: parseFloat(targetEl.style.left), top: parseFloat(targetEl.style.top), width: targetEl.offsetWidth, height: targetEl.offsetHeight }; const targetPoints = { v: [targetRect.left, targetRect.left + targetRect.width / 2, targetRect.left + targetRect.width], h: [targetRect.top, targetRect.top + targetRect.height / 2, targetRect.top + targetRect.height] }; for (let i = 0; i < 3; i++) { if (!snappedX) { for (let j = 0; j < 3; j++) { const diff = draggedPoints.v[i] - targetPoints.v[j]; if (Math.abs(diff) < SNAP_THRESHOLD / boardState.scale) { finalX -= diff; createGuide(targetPoints.v[j], 'vertical'); snappedX = true; break; } } } if (!snappedY) { for (let j = 0; j < 3; j++) { const diff = draggedPoints.h[i] - targetPoints.h[j]; if (Math.abs(diff) < SNAP_THRESHOLD / boardState.scale) { finalY -= diff; createGuide(targetPoints.h[j], 'horizontal'); snappedY = true; break; } } } } }); return { x: finalX, y: finalY }; }
    function createGuide(pos, orientation) { const guide = document.createElement('div'); guide.className = `guide-line ${orientation}`; if (orientation === 'vertical') guide.style.left = `${pos}px`; else guide.style.top = `${pos}px`; document.getElementById('guide-container').appendChild(guide); }
    function clearGuides() { const container = document.getElementById('guide-container'); if(container) container.innerHTML = ''; }
    
    function updateMinimap() { minimap.innerHTML = ''; const minimapScale = minimap.offsetWidth / board.offsetWidth; [...notes, ...sections, ...textBoxes, ...shapes].forEach(el => { const elRect = { left: parseFloat(el.style.left) * minimapScale, top: parseFloat(el.style.top) * minimapScale, width: el.offsetWidth * minimapScale, height: el.offsetHeight * minimapScale }; const mapEl = document.createElement('div'); mapEl.className = 'minimap-element'; mapEl.style.cssText = `left:${elRect.left}px; top:${elRect.top}px; width:${elRect.width}px; height:${elRect.height}px;`; minimap.appendChild(mapEl); }); const viewport = document.createElement('div'); viewport.id = 'minimap-viewport'; minimap.appendChild(viewport); const viewRect = { width: window.innerWidth / boardState.scale * minimapScale, height: window.innerHeight / boardState.scale * minimapScale, left: -boardState.panX * minimapScale, top: -boardState.panY * minimapScale }; viewport.style.cssText = `width:${viewRect.width}px; height:${viewRect.height}px; left:${viewRect.left}px; top:${viewRect.top}px;`; const onMinimapDown = e => { e.stopPropagation(); document.body.classList.add('is-dragging'); recordHistory(); let lastPos = getEventCoordinates(e); const onPointerMove = ev => { ev.preventDefault(); const currentPos = getEventCoordinates(ev); const dx = currentPos.x - lastPos.x; const dy = currentPos.y - lastPos.y; lastPos = currentPos; boardState.panX -= dx / minimapScale; boardState.panY -= dy / minimapScale; applyTransform(); }; const onPointerUp = () => { document.body.classList.remove('is-dragging'); document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('touchend', onPointerUp); saveState(); }; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchmove', onPointerMove, {passive: false}); document.addEventListener('touchend', onPointerUp); }; viewport.addEventListener('mousedown', onMinimapDown); viewport.addEventListener('touchstart', onMinimapDown, {passive: false}); }
    
    window.addEventListener('keydown', e => { if (mainApp.classList.contains('hidden')) return; if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } if (e.ctrlKey && e.key.toLowerCase() === 'y' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); redo(); } if (!selectedElement) return; if (document.activeElement.isContentEditable || /TEXTAREA|INPUT/.test(document.activeElement.tagName)) return; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (selectedElement.type === 'connector') { recordHistory(); connectors = connectors.filter(c => c.id !== selectedElement.id); drawAllConnectors(); saveState(); clearSelection(); return; } if (selectedElement.classList.contains('locked')) return; selectedElement.querySelector('.delete-btn')?.click(); } if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); if (selectedElement.classList.contains('locked') || selectedElement.type === 'connector') return; let originalData, createFn; const fileData = JSON.parse(localStorage.getItem(currentFileId)); if (selectedElement.classList.contains('note')) { originalData = fileData.notes.find(n => n.id === selectedElement.id); createFn = createNote; } else if (selectedElement.classList.contains('section')) { originalData = fileData.sections.find(s => s.id === selectedElement.id); createFn = createSection; } else if (selectedElement.classList.contains('text-box')) { originalData = fileData.textBoxes.find(t => t.id === selectedElement.id); createFn = createTextBox; } else if (selectedElement.classList.contains('shape')) { originalData = fileData.shapes.find(s => s.id === selectedElement.id); createFn = createShape; } if (createFn) { recordHistory(); const dataToClone = { ...originalData }; delete dataToClone.id; delete dataToClone.zIndex; dataToClone.x = `${parseFloat(dataToClone.x) + 20 / boardState.scale}px`; dataToClone.y = `${parseFloat(dataToClone.y) + 20 / boardState.scale}px`; createFn(dataToClone); } } });
    
    // ★★★ 修正箇所 ★★★
    // ズーム操作で履歴が作成されないように recordHistory() を削除
    window.addEventListener('wheel', e => {
        e.preventDefault();
        if (mainApp.classList.contains('hidden')) return;
        if (e.shiftKey) {
            boardState.panX -= e.deltaY;
        } else {
            const z = 1.1, o = boardState.scale;
            let n=e.deltaY<0?o*z:o/z;
            n=Math.max(0.2,Math.min(n,3.0));
            boardState.scale=n;
            boardState.panX=e.clientX-((e.clientX-boardState.panX)/o*n);
            boardState.panY=e.clientY-((e.clientY-boardState.panY)/o*n);
        }
        applyTransform();
        saveState(); // 状態の保存は行う
    }, { passive: false });
    
    function getCanvasCoordinates(e) {
        const coords = getEventCoordinates(e);
        return {
            x: (coords.x - boardState.panX) / boardState.scale,
            y: (coords.y - boardState.panY) / boardState.scale
        };
    }

    const onBoardDown = e => {
        if (isPenMode || isEraserMode || e.target !== board) return;
        clearSelection();
        toggleConnectorMode(true);
        
        document.body.classList.add('is-dragging');
        board.classList.add('grabbing');
        recordHistory();
        let lastPos = getEventCoordinates(e);
        const onPointerMove = ev => {
            ev.preventDefault();
            const currentPos = getEventCoordinates(ev);
            boardState.panX += currentPos.x - lastPos.x;
            boardState.panY += currentPos.y - lastPos.y;
            lastPos = currentPos;
            applyTransform();
        };
        const onPointerUp = () => {
            document.body.classList.remove('is-dragging');
            board.classList.remove('grabbing');
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);
            saveState();
        };
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, {passive: false});
        document.addEventListener('touchend', onPointerUp);
    };
    board.addEventListener('mousedown', onBoardDown);
    board.addEventListener('touchstart', onBoardDown, { passive: false });
    
    const onDrawingLayerDown = e => {
        if (!isPenMode && !isEraserMode) return;
        e.preventDefault();
        e.stopPropagation();
        
        // ★★★ 修正箇所 ★★★
        // 描画を開始する「前」に履歴を記録
        recordHistory();

        const startCoords = getCanvasCoordinates(e);

        const newPath = {
            points: [startCoords],
            color: '#000000',
            strokeWidth: currentStrokeWidth,
            mode: isEraserMode ? 'eraser' : 'pen'
        };
        paths.push(newPath);

        const onPointerMove = ev => {
            ev.preventDefault();
            const moveCoords = getCanvasCoordinates(ev);
            newPath.points.push(moveCoords);
            redrawCanvas();
        };

        const onPointerUp = () => {
            // ★★★ 修正箇所 ★★★
            // 描画が完了したら状態を保存
            if (newPath.points.length > 1) {
                saveState();
            } else {
                // 描画されなかった場合（クリックのみ）、パスと履歴をキャンセル
                paths.pop();
                if(historyStack.length > 0) historyStack.pop();
                updateUndoRedoButtons();
            }
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);
        };
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, {passive: false});
        document.addEventListener('touchend', onPointerUp);
    };
    drawingLayer.addEventListener('mousedown', onDrawingLayerDown);
    drawingLayer.addEventListener('touchstart', onDrawingLayerDown, { passive: false });

    window.addEventListener('touchmove', e => { if (e.touches.length === 2 && mainApp.classList.contains('hidden') === false) { e.preventDefault(); const getDist = () => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (initialPinchDistance === null) { initialPinchDistance = { dist: getDist(), scale: boardState.scale, center: {x:(e.touches[0].clientX+e.touches[1].clientX)/2, y:(e.touches[0].clientY+e.touches[1].clientY)/2}, panX: boardState.panX, panY: boardState.panY }; recordHistory(); } const scaleRatio = getDist() / initialPinchDistance.dist; let newScale = initialPinchDistance.scale * scaleRatio; newScale = Math.max(0.2, Math.min(newScale, 3.0)); boardState.panX = initialPinchDistance.center.x - ((initialPinchDistance.center.x - initialPinchDistance.panX) / initialPinchDistance.scale * newScale); boardState.panY = initialPinchDistance.center.y - ((initialPinchDistance.center.y - initialPinchDistance.panY) / initialPinchDistance.scale * newScale); boardState.scale = newScale; applyTransform(); } }, { passive: false });
    window.addEventListener('touchend', e => { if (e.touches.length < 2 && initialPinchDistance !== null) { initialPinchDistance = null; saveState(); } });
    zoomResetBtn.addEventListener('click', () => { recordHistory(); const oldScale = boardState.scale; const newScale = 1.0; const centerX = window.innerWidth / 2; const centerY = window.innerHeight / 2; boardState.panX = centerX - ((centerX - boardState.panX) / oldScale * newScale); boardState.panY = centerY - ((centerY - boardState.panY) / oldScale * newScale); boardState.scale = newScale; applyTransform(); saveState(); });
    addNoteBtn.addEventListener('click', () => { toggleConnectorMode(true); togglePenMode(true); toggleEraserMode(true); createNote(); }); addSectionBtn.addEventListener('click', () => { toggleConnectorMode(true); togglePenMode(true); toggleEraserMode(true); createSection(); }); addTextBtn.addEventListener('click', () => { toggleConnectorMode(true); togglePenMode(true); toggleEraserMode(true); createTextBox(); }); addShapeSquareBtn.addEventListener('click', () => { toggleConnectorMode(true); togglePenMode(true); toggleEraserMode(true); createShape({type: 'square'}); }); addShapeCircleBtn.addEventListener('click', () => { toggleConnectorMode(true); togglePenMode(true); toggleEraserMode(true); createShape({type: 'circle'}); }); addShapeDiamondBtn.addEventListener('click', () => { toggleConnectorMode(true); togglePenMode(true); toggleEraserMode(true); createShape({type: 'diamond'}); }); addConnectorBtn.addEventListener('click', () => toggleConnectorMode()); penToolBtn.addEventListener('click', () => togglePenMode()); eraserToolBtn.addEventListener('click', () => toggleEraserMode());
    backToFilesBtn.addEventListener('click', showFileManager); createNewFileBtn.addEventListener('click', createNewFile);
    darkModeBtn.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('plottia-dark-mode', document.body.classList.contains('dark-mode') ? '1' : '0' ); });
    exportBtn.addEventListener('click', () => { saveState(); const d = localStorage.getItem(currentFileId); if (!d) { alert('エクスポートするデータがありません。'); return; } const b = new Blob([d],{type:'application/json'}); const a = document.createElement('a'); a.download=`${getFileMetadata().find(f=>f.id===currentFileId)?.name || 'board'}.plottia`; a.href=URL.createObjectURL(b); a.click(); URL.revokeObjectURL(a.href); });
function validateBoardData(data) {
    if (typeof data !== 'object' || data === null) return false;

    const requiredArrays = ['notes', 'sections', 'textBoxes', 'shapes', 'paths', 'connectors'];
    for (const key of requiredArrays) {
        if (!Array.isArray(data[key])) {
            console.error(`検証エラー: '${key}' は配列である必要があります。`);
            return false;
        }
    }
    
    if (typeof data.board !== 'object' || data.board === null) {
        console.error(`検証エラー: 'board' はオブジェクトである必要があります。`);
        return false;
    }

    // ここでさらに詳細なチェックも可能（例: notesの各要素がid, x, yを持つかなど）
    // 今回は基本的な構造チェックのみとします。

    return true;
}
    importBtn.addEventListener('click', () => importFileInput.click()); 
    importFileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async (ev) => {
            try {
                const importedState = JSON.parse(ev.target.result);

                if (!validateBoardData(importedState)) {
                    alert('ファイルの形式が無効です。Plottiaの正しいファイルを選択してください。');
                    return;
                }

                if (confirm('現在のボードをインポートした内容で上書きします。よろしいですか？')) {
                    recordHistory();
                    await db.set(currentFileId, importedState); 
                    await loadState();
                }
            } catch (err) {
                // エラーオブジェクトのメッセージをアラートに含める
                alert(`ファイルの読み込みに失敗しました。\n\n詳細: ${err.message}`);
                console.error(err);
            } finally {
                e.target.value = '';
            }
        };
        r.readAsText(f);
    });
    cleanupBtn.addEventListener('click', () => { if (confirm('すべてのファイルとデータを消去して完全にリセットします。この操作は元に戻せません。よろしいですか？')) { localStorage.clear(); location.reload(); } });
    undoBtn.addEventListener('click', undo); redoBtn.addEventListener('click', redo);
    
    async function exportAsImage() {
        const PADDING = 50;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        paths.forEach(path => {
            path.points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        });

        [...notes, ...sections, ...textBoxes, ...shapes].forEach(el => {
            const left = parseFloat(el.style.left);
            const top = parseFloat(el.style.top);
            const width = el.offsetWidth;
            const height = el.offsetHeight;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + width);
            maxY = Math.max(maxY, top + height);
        });

        if (!isFinite(minX)) {
            alert('エクスポートするコンテンツがありません。');
            return;
        }
        
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const exportWidth = contentWidth + PADDING * 2;
        const exportHeight = contentHeight + PADDING * 2;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = exportWidth;
        tempCanvas.height = exportHeight;
        const tempCtx = tempCanvas.getContext('2d');

        const isDarkMode = document.body.classList.contains('dark-mode');
        tempCtx.fillStyle = isDarkMode ? '#2c2c2c' : '#e9e9e9';
        tempCtx.fillRect(0, 0, exportWidth, exportHeight);

        tempCtx.drawImage(
            drawingLayer,
            minX, minY, contentWidth, contentHeight,
            PADDING, PADDING, contentWidth, contentHeight
        );

        try {
            const objectCanvas = await html2canvas(objectContainer, {
                backgroundColor: null,
                width: contentWidth,
                height: contentHeight,
                x: minX,
                y: minY,
                scale: 1
            });
            
            tempCtx.drawImage(objectCanvas, PADDING, PADDING);

        } catch (error) {
            console.error('画像のエクスポートに失敗しました:', error);
            alert('画像のエクスポートに失敗しました。コンソールを確認してください。');
            return;
        }

        const a = document.createElement('a');
        a.href = tempCanvas.toDataURL('image/png');
        a.download = `plottia-board-${Date.now()}.png`;
        a.click();
    }
    imageExportBtn.addEventListener('click', exportAsImage);

    strokeWidthSlider.addEventListener('input', e => { const newWidth = e.target.value; currentStrokeWidth = parseInt(newWidth, 10); strokeWidthDisplay.textContent = newWidth; localStorage.setItem('plottia_stroke_width', newWidth); });
    const savedWidth = localStorage.getItem('plottia_stroke_width'); if (savedWidth) { currentStrokeWidth = parseInt(savedWidth, 10); strokeWidthSlider.value = savedWidth; strokeWidthDisplay.textContent = savedWidth; }
    
    if (localStorage.getItem('plottia-dark-mode') === '1') { document.body.classList.add('dark-mode'); }
    showFileManager();
});

window.onerror = function(message, source, lineno, colno, error) {
    let errorMessage = "予期せぬJavaScriptエラーが発生しました。\n\n";
    errorMessage += "メッセージ: " + message + "\n";
    errorMessage += "ファイル: " + (source || '不明') + "\n";
    errorMessage += "行番号: " + (lineno || '不明') + "\n";
    errorMessage += "列番号: " + (colno || '不明') + "\n";
    if (error && error.stack) {
        errorMessage += "\nスタックトレース:\n" + error.stack;
    }
    
    // エラー内容をアラートで表示
    alert(errorMessage);
    
    // デフォルトのエラー処理（コンソールへの出力など）を抑制する場合はtrueを返す
    return true; 
};

// Promiseで捕捉されなかったエラーを捕捉
window.addEventListener('unhandledrejection', function(event) {
    alert('捕捉されなかったPromiseのエラーが発生しました:\n' + event.reason);
});
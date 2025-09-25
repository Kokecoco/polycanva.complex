document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const fileManagerOverlay = document.getElementById('file-manager-overlay');
    const fileList = document.getElementById('file-list');
    const createNewFileBtn = document.getElementById('create-new-file-btn');
    const mainApp = document.getElementById('main-app');
    const backToFilesBtn = document.getElementById('back-to-files-btn');
    const board = document.getElementById('board');
    let svgLayer = document.getElementById('connector-svg-layer');
    const addNoteBtn = document.getElementById('add-note-btn');
    const addSectionBtn = document.getElementById('add-section-btn');
    const addTextBtn = document.getElementById('add-text-btn');
    const addShapeSquareBtn = document.getElementById('add-shape-square-btn');
    const addShapeCircleBtn = document.getElementById('add-shape-circle-btn');
    const addShapeDiamondBtn = document.getElementById('add-shape-diamond-btn');
    const addConnectorBtn = document.getElementById('add-connector-btn');
    const penToolBtn = document.getElementById('pen-tool-btn');
    const eraserToolBtn = document.getElementById('eraser-tool-btn');
    const exportBtn = document.getElementById('export-btn');
    const imageExportBtn = document.getElementById('image-export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file-input');
    const cleanupBtn = document.getElementById('cleanup-btn');
    const zoomDisplay = document.getElementById('zoom-display');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const darkModeBtn = document.getElementById('dark-mode-btn');
    const minimap = document.getElementById('minimap');
    const guideContainer = document.getElementById('guide-container');
    const strokeWidthSlider = document.getElementById('stroke-width-slider');
    const strokeWidthDisplay = document.getElementById('stroke-width-display');
    const drawingLayer = document.getElementById('drawing-layer');
    const objectContainer = document.getElementById('object-container');
    const ctx = drawingLayer.getContext('2d');
    drawingLayer.width = 5000;
    drawingLayer.height = 5000;
    const shareRoomBtn = document.getElementById('share-room-btn');
    const userList = document.getElementById('user-list');
    const conflictOverlay = document.getElementById('conflict-overlay');
    const conflictOverwriteBtn = document.getElementById('conflict-resolve-overwrite');
    const conflictForkBtn = document.getElementById('conflict-resolve-fork');
    const conflictForceBtn = document.getElementById('conflict-resolve-force');
    const errorOverlay = document.getElementById('error-overlay');
    const errorDetails = document.getElementById('error-details');
    const copyErrorBtn = document.getElementById('copy-error-btn');
    const closeErrorBtn = document.getElementById('close-error-btn');


    // --- グローバル変数 ---
    let currentFileId = null;
    // boardData is the single source of truth for the board state.
    let boardData = createEmptyBoard();
    let selectedElement = null;
    let isConnectorMode = false, connectorStartId = null;
    let isPenMode = false, isEraserMode = false;
    let initialPinchDistance = null;
    let currentStrokeWidth = 5;

    // Collaboration & Sync variables
    let myUndoStack = [];
    let myRedoStack = [];
    let peer = null;
    let myPeerId = null;
    let hostPeerId = null;
    let isHost = false;
    let connections = {};
    let connectedUsers = {};
    let drawingBuffer = [];
    const DRAWING_CHUNK_INTERVAL = 100;
    let drawingInterval = null;

    // Constants
    const noteColors = ['#ffc', '#cfc', '#ccf', '#fcc', '#cff', '#fff'];
    const sectionColors = ['rgba(255, 0, 0, 0.1)', 'rgba(0, 0, 255, 0.1)', 'rgba(0, 128, 0, 0.1)', 'rgba(128, 0, 128, 0.1)', 'rgba(255, 165, 0, 0.1)', 'rgba(220, 220, 220, 0.5)'];
    const shapeColors = ['#ffffff', '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];

    // =================================================================
    // 1. PeerJS & コラボレーション管理
    // =================================================================

    function initializePeer() {
        if (peer && !peer.destroyed) {
            peer.destroy();
        }
        try {
            peer = new Peer();
        } catch (e) {
             showErrorModal("PeerJSの初期化に失敗しました。ページをリロードしてください。\n" + e.message);
             return;
        }


        peer.on('open', id => {
            myPeerId = id;
            console.log('My Peer ID is:', myPeerId);
            joinRoom();
        });

        peer.on('connection', conn => {
            console.log('Incoming connection from', conn.peer);
            setupConnection(conn);
        });

        peer.on('error', err => {
            console.error('PeerJS error:', err);
            // Don't show modal for common 'peer-unavailable' error.
            if (err.type !== 'peer-unavailable') {
                showErrorModal(`接続エラーが発生しました: ${err.type}。ページをリロードしてみてください。`);
            } else {
                alert("ホストに接続できませんでした。URLが正しいか確認してください。");
                showFileManager();
            }
        });
    }

    function joinRoom() {
        const urlHash = window.location.hash.substring(1);
        const [fileIdFromUrl, hostIdInUrl] = urlHash.split('/');

        // Ensure we are on the correct file
        if (currentFileId !== fileIdFromUrl) {
            console.warn("URL fileId does not match currentFileId. Re-opening file.");
            openFile(fileIdFromUrl);
            return;
        }

        if (hostIdInUrl && hostIdInUrl !== myPeerId) {
            hostPeerId = hostIdInUrl;
            isHost = false;
            console.log('Attempting to connect to host:', hostPeerId);
            const conn = peer.connect(hostIdInUrl, { reliable: true });
            setupConnection(conn);
        } else {
            hostPeerId = myPeerId;
            isHost = true;
            console.log('I am the host.');
            const newUrl = `#${currentFileId}/${myPeerId}`;
            window.history.replaceState(null, null, newUrl);
            connectedUsers = { [myPeerId]: { id: myPeerId } };
            updateUserListUI();
        }
    }

    function setupConnection(conn) {
        conn.on('open', () => {
            console.log('Connection established with', conn.peer);
            connections[conn.peer] = conn;

            if (isHost) {
                conn.send({
                    type: 'initial-state',
                    payload: {
                        boardData: getCurrentState(),
                        users: connectedUsers,
                        hostId: hostPeerId
                    }
                });
                connectedUsers[conn.peer] = { id: conn.peer };
                broadcast({ type: 'user-joined', payload: { id: conn.peer, users: connectedUsers } });
                updateUserListUI();
            }
        });
        
        conn.on('data', data => handleReceivedData(data, conn.peer));
        conn.on('close', () => handleDisconnect(conn.peer));
        conn.on('error', err => {
            console.error('Connection error with ' + conn.peer + ':', err);
            handleDisconnect(conn.peer);
        });
    }
    
    function handleDisconnect(peerId) {
        console.log('Connection closed with', peerId);
        delete connections[peerId];
        delete connectedUsers[peerId];

        if (peerId === hostPeerId) {
            alert('ホストとの接続が切れました。ファイルマネージャーに戻ります。');
            showFileManager();
            return;
        }
        
        if (isHost) {
             broadcast({ type: 'user-left', payload: { id: peerId, users: connectedUsers } });
        }
        updateUserListUI();
    }
    
    function broadcast(data, excludePeerId = null) {
        if (!isHost) return;
        for (const peerId in connections) {
            if (peerId !== excludePeerId && connections[peerId] && connections[peerId].open) {
                 connections[peerId].send(data);
            }
        }
    }

    function sendOperationToHost(operation) {
        const data = { type: 'operation', payload: operation };
        if (isHost) {
            // Host applies locally and broadcasts to all clients
            applyOperation(operation);
            broadcast(data);
        } else if (connections[hostPeerId] && connections[hostPeerId].open) {
            // Client sends to host
            connections[hostPeerId].send(data);
        } else {
            console.error("Host connection not available. Operation might be lost.");
            alert("ホストとの接続が切断されました。操作を同期できません。");
        }
    }
    
    function handleReceivedData(data, fromPeerId) {
        switch (data.type) {
            case 'initial-state':
                hostPeerId = data.payload.hostId;
                connectedUsers = data.payload.users;
                connectedUsers[myPeerId] = { id: myPeerId };
                updateUserListUI();
                handleOfflineConflict(data.payload.boardData);
                break;
            case 'operation':
                if (isHost) {
                    // Host received an operation from a client
                    applyOperation(data.payload);
                    broadcast(data, fromPeerId); // Relay to other clients
                } else {
                    // Client received an operation from the host
                    applyOperation(data.payload);
                }
                break;
            case 'user-joined':
            case 'user-left':
                connectedUsers = data.payload.users;
                updateUserListUI();
                break;
        }
    }
    
    function updateUserListUI() {
        userList.innerHTML = '';
        Object.keys(connectedUsers).sort().forEach(id => {
            const li = document.createElement('li');
            li.textContent = id.substring(0, 4);
            li.title = id;
            if (id === myPeerId) li.classList.add('is-me');
            if (id === hostPeerId) li.classList.add('is-host');
            userList.appendChild(li);
        });
    }

    shareRoomBtn.addEventListener('click', () => {
        if (!currentFileId || !myPeerId) {
            alert("共有の準備ができていません。");
            return;
        }
        const url = `${window.location.origin}${window.location.pathname}#${currentFileId}/${hostPeerId || myPeerId}`;
        navigator.clipboard.writeText(url)
            .then(() => alert('招待リンクをクリップボードにコピーしました。'))
            .catch(() => alert('コピーに失敗しました。'));
    });
    
    // =================================================================
    // 2. 状態管理 & 操作ベース同期
    // =================================================================

    function generateOperation(type, payload, undoData = null) {
        const operation = { type, payload, sender: myPeerId, timestamp: Date.now() };
        // Apply locally immediately for responsiveness
        applyOperation(operation);
        // Send to host/clients for synchronization
        sendOperationToHost(operation);
        
        if (undoData) {
            myUndoStack.push(undoData);
            myRedoStack = [];
            updateUndoRedoButtons();
        }
        // Save the new state to the database
        saveState();
    }

    function findElementData(id) {
        const collections = ['notes', 'sections', 'textBoxes', 'shapes', 'paths', 'connectors'];
        for (const key of collections) {
            if (boardData[key]) {
                const item = boardData[key].find(i => i.id === id);
                if (item) return { item, collection: key };
            }
        }
        return null;
    }

    const creationFunctions = {
        NOTE: createNote,
        SECTION: createSection,
        TEXTBOX: createTextBox,
        SHAPE: createShape
    };

    function applyOperation(op) {
        if (!op || !op.type || !op.payload) return;

        let findResult = op.payload.id ? findElementData(op.payload.id) : null;
        let itemData = findResult ? findResult.item : null;
        let element = op.payload.id ? document.getElementById(op.payload.id) : null;
        
        switch (op.type) {
            case 'CREATE_NOTE':
            case 'CREATE_SECTION':
            case 'CREATE_TEXTBOX':
            case 'CREATE_SHAPE':
                // --- FIXED: Correct pluralization for textBoxes ---
                let collectionName = `${op.type.split('_')[1].toLowerCase()}s`;
                if (collectionName === 'textboxs') {
                    collectionName = 'textBoxes';
                }
                // --- END FIX ---
                if (boardData[collectionName] && !boardData[collectionName].some(item => item.id === op.payload.id)) {
                    boardData[collectionName].push(op.payload);
                    const itemType = op.type.split('_')[1]; // "NOTE", "SECTION" などを取得
                    const createFn = creationFunctions[itemType];                    
                    if (createFn) {
                        createFn(op.payload, true);
                    }
                }
                break;

            case 'MOVE_ELEMENTS':
                op.payload.elements.forEach(movedEl => {
                    const res = findElementData(movedEl.id);
                    const el = document.getElementById(movedEl.id);
                    if (res && el) {
                        res.item.x = movedEl.x;
                        res.item.y = movedEl.y;
                        el.style.left = movedEl.x;
                        el.style.top = movedEl.y;
                        if (movedEl.zIndex) {
                            res.item.zIndex = movedEl.zIndex;
                            el.style.zIndex = movedEl.zIndex;
                        }
                    }
                });
                drawAllConnectors();
                break;
                
            case 'RESIZE_ELEMENT':
                if (itemData && element) {
                    itemData.width = op.payload.width;
                    itemData.height = op.payload.height;
                    element.style.width = op.payload.width;
                    element.style.height = op.payload.height;
                    drawAllConnectors();
                }
                break;

            case 'UPDATE_CONTENT':
                if (itemData && element) {
                    itemData.content = op.payload.content;
                    if (findResult.collection === 'notes') {
                        element.querySelector('.note-view').innerHTML = op.payload.content.replace(/\n/g, '<br>'); // Simple markdown-like
                        element.querySelector('.note-content').value = op.payload.content;
                    } else if (findResult.collection === 'textBoxes') {
                        element.querySelector('.text-content').innerHTML = op.payload.content;
                    } else if (findResult.collection === 'shapes') {
                        element.querySelector('.shape-label').innerHTML = op.payload.content;
                    } else if (findResult.collection === 'sections') {
                        element.querySelector('.section-title').textContent = op.payload.content;
                    }
                }
                break;

            case 'CHANGE_COLOR':
                 if(itemData && element) {
                    itemData.color = op.payload.color;
                    if(findResult.collection === 'notes') {
                        element.querySelector('.note-header').style.backgroundColor = op.payload.color;
                        element.querySelector('.note-body').style.backgroundColor = op.payload.color;
                    } else if (findResult.collection === 'sections') {
                        element.style.backgroundColor = op.payload.color;
                    } else if (findResult.collection === 'shapes') {
                        element.querySelector('.shape-visual').style.backgroundColor = op.payload.color;
                    }
                }
                break;

            case 'DELETE_ELEMENTS':
                 op.payload.elementIds.forEach(id => {
                    const elToRemove = document.getElementById(id);
                    if (elToRemove) elToRemove.remove();
                    
                    const res = findElementData(id);
                    if (res) {
                        boardData[res.collection] = boardData[res.collection].filter(item => item.id !== id);
                    }
                });
                // Also remove related connectors
                boardData.connectors = boardData.connectors.filter(c => 
                    !op.payload.elementIds.includes(c.startId) && !op.payload.elementIds.includes(c.endId)
                );
                drawAllConnectors();
                break;
                
            case 'START_DRAW':
                if (!boardData.paths.some(p => p.id === op.payload.id)) {
                    boardData.paths.push({ ...op.payload, points: [] });
                }
                break;
            case 'APPEND_POINTS':
                const path = boardData.paths.find(p => p.id === op.payload.pathId);
                if (path) {
                    path.points.push(...op.payload.points);
                    redrawCanvas();
                }
                break;
            case 'END_DRAW':
                 // No specific action needed, the path is complete.
                break;

            case 'TOGGLE_LOCK':
                 if (itemData && element) {
                    itemData.isLocked = op.payload.isLocked;
                    element.classList.toggle('locked', op.payload.isLocked);
                    const icon = element.querySelector('.lock-btn i');
                    if (icon) icon.className = op.payload.isLocked ? 'fas fa-lock' : 'fas fa-unlock';
                }
                break;

            case 'CREATE_CONNECTOR':
                if (!boardData.connectors.some(c => c.id === op.payload.id)) {
                    boardData.connectors.push(op.payload);
                    drawAllConnectors();
                }
                break;
            case 'DELETE_CONNECTOR':
                boardData.connectors = boardData.connectors.filter(c => c.id !== op.payload.id);
                drawAllConnectors();
                break;
        }
        updateMinimap();
    }
    
    // =================================================================
    // 3. Undo/Redo
    // =================================================================
    function undo() {
        if (myUndoStack.length === 0) return;
        const lastAction = myUndoStack.pop();
        myRedoStack.push(lastAction);
        generateOperation(lastAction.inverse.type, lastAction.inverse.payload);
        // Clear local undo stack for this action as it's now handled by the inverse op
        myUndoStack.pop();
    }

    function redo() {
        if (myRedoStack.length === 0) return;
        const lastAction = myRedoStack.pop();
        myUndoStack.push(lastAction);
        generateOperation(lastAction.original.type, lastAction.original.payload);
        // Clear local undo stack for this action
        myUndoStack.pop();
    }

    function updateUndoRedoButtons() {
        undoBtn.disabled = myUndoStack.length === 0;
        redoBtn.disabled = myRedoStack.length === 0;
    }

    // =================================================================
    // 4. データ永続化 & オフライン競合解決
    // =================================================================
    const db = {
        _db: null, _dbName: 'PlottiaDB', _storeName: 'boards',
        async _getDB() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this._dbName, 1);
                request.onerror = e => reject('IndexedDB Error:', e.target.error);
                request.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
                request.onupgradeneeded = e => {
                    if (!e.target.result.objectStoreNames.contains(this._storeName)) {
                        e.target.result.createObjectStore(this._storeName);
                    }
                };
            });
        },
        async set(key, value) {
            const db = await this._getDB();
            return new Promise(async (resolve, reject) => {
                try {
                    const compressed = pako.deflate(JSON.stringify(value));
                    const transaction = db.transaction(this._storeName, 'readwrite');
                    transaction.objectStore(this._storeName).put(compressed, key);
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = e => reject('DB Set Error:', e.target.error);
                } catch(err) {
                    reject(err);
                }
            });
        },
        async get(key) {
            const db = await this._getDB();
            return new Promise((resolve, reject) => {
                const request = db.transaction(this._storeName, 'readonly').objectStore(this._storeName).get(key);
                request.onsuccess = e => {
                    if (e.target.result) {
                        try {
                            const decompressed = pako.inflate(e.target.result, { to: 'string' });
                            resolve(JSON.parse(decompressed));
                        } catch (err) {
                            console.error(`[IndexedDB] Failed to parse data for key "${key}". Data might be corrupted.`, err);
                            resolve(null);
                        }
                    } else { resolve(null); }
                };
                request.onerror = e => reject('DB Get Error:', e.target.error);
            });
        },
        async remove(key) {
             const db = await this._getDB();
             return new Promise((resolve, reject) => {
                 const transaction = db.transaction(this._storeName, 'readwrite');
                 transaction.objectStore(this._storeName).delete(key);
                 transaction.oncomplete = () => resolve();
                 transaction.onerror = e => reject('DB Remove Error:', e.target.error);
             });
        }
    };

    async function saveState() {
        if (!currentFileId || !boardData) return;
        boardData.version = Date.now();
        let metadata = getFileMetadata();
        const fileIndex = metadata.findIndex(f => f.id === currentFileId);
        if (fileIndex > -1) {
            metadata[fileIndex].lastModified = boardData.version;
            saveFileMetadata(metadata);
        }
        await db.set(currentFileId, getCurrentState());
    }

    async function handleOfflineConflict(remoteState) {
        const localState = await db.get(currentFileId);
        
        if (!localState || !localState.version) {
            console.log("No local state. Applying remote state.");
            loadStateFromObject(remoteState);
            await db.set(currentFileId, remoteState);
            return;
        }
        
        if (localState && remoteState && localState.version < remoteState.version) {
            console.log("Conflict detected. Local:", localState.version, "Remote:", remoteState.version);
            conflictOverlay.classList.remove('hidden');
            const handleResolution = (choice) => async () => {
                conflictOverlay.classList.add('hidden');
                if (choice === 'overwrite') {
                    loadStateFromObject(remoteState);
                    await db.set(currentFileId, remoteState);
                } else if (choice === 'fork') {
                    const metadata = getFileMetadata();
                    const currentFile = metadata.find(f => f.id === currentFileId) || { name: "無題" };
                    const newName = `${currentFile.name} (オフラインコピー)`;
                    const newFile = { id: `plottia_board_${Date.now()}`, name: newName, lastModified: Date.now() };
                    metadata.push(newFile);
                    saveFileMetadata(metadata);
                    await db.set(newFile.id, localState);
                    loadStateFromObject(remoteState);
                    await db.set(currentFileId, remoteState);
                    alert(`「${newName}」としてオフラインの変更を保存しました。`);
                } else if (choice === 'force') {
                    boardData = localState;
                    await saveState(); // This updates version number
                    if (isHost) {
                         broadcast({ type: 'initial-state', payload: { boardData: getCurrentState(), users: connectedUsers, hostId: hostPeerId } });
                    }
                    loadStateFromObject(localState);
                }
            };
            conflictOverwriteBtn.onclick = handleResolution('overwrite');
            conflictForkBtn.onclick = handleResolution('fork');
            conflictForceBtn.onclick = handleResolution('force');
        } else {
            console.log("No conflict or local is newer.");
            // If we are host and our version is newer, send it to the new comer
            if(isHost) {
                loadStateFromObject(localState);
            }
        }
    }
    
    function createEmptyBoard() {
        return {
            notes: [], sections: [], textBoxes: [], shapes: [], paths: [], connectors: [],
            board: { panX: 0, panY: 0, scale: 1.0, noteZIndexCounter: 1000, sectionZIndexCounter: 1 },
            version: Date.now()
        };
    }

    function getCurrentState() {
        return JSON.parse(JSON.stringify(boardData));
    }

    function loadStateFromObject(state) {
        boardData = state || createEmptyBoard();
        
        objectContainer.innerHTML = '';
        svgLayer.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`;
        
        boardData.sections?.forEach(data => createSection(data, true));
        boardData.notes?.forEach(data => createNote(data, true));
        boardData.textBoxes?.forEach(data => createTextBox(data, true));
        boardData.shapes?.forEach(data => createShape(data, true));

        myUndoStack = [];
        myRedoStack = [];
        updateUndoRedoButtons();
        redrawCanvas();
        applyTransform();
    }
    
    // =================================================================
    // 5. 各オブジェクトの作成とイベント処理
    // =================================================================
    
    function getNewElementPosition() {
        return {
            x: `${((window.innerWidth / 2) - 100 - (boardData.board?.panX || 0)) / (boardData.board?.scale || 1)}px`,
            y: `${((window.innerHeight / 2) - 100 - (boardData.board?.panY || 0)) / (boardData.board?.scale || 1)}px`
        }
    }
    
    function createNote(data, fromOperation = false) {
        if (!fromOperation) {
            const pos = getNewElementPosition();
            const payload = {
                id: `note-${myPeerId}-${Date.now()}`,
                x: pos.x, y: pos.y, width: '220px', height: '220px',
                zIndex: boardData.board.noteZIndexCounter++,
                content: '新しい付箋',
                color: noteColors[0], // --- FIXED: Assign single color ---
                isLocked: false,
            };
            generateOperation('CREATE_NOTE', payload, {
                original: { type: 'CREATE_NOTE', payload },
                inverse: { type: 'DELETE_ELEMENTS', payload: { elementIds: [payload.id] } }
            });
            return;
        }
        
        if (document.getElementById(data.id)) return;

        const note = document.createElement('div');
        note.className = 'note';
        note.id = data.id;
        note.style.left = data.x;
        note.style.top = data.y;
        note.style.width = data.width;
        note.style.height = data.height;
        note.style.zIndex = data.zIndex;
        note.classList.toggle('locked', data.isLocked);
        
        note.innerHTML = `<div class="note-header"><div class="color-picker">${noteColors.map(c => `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div><div class="lock-btn" title="ロック"><i class="fas ${data.isLocked ? 'fa-lock' : 'fa-unlock'}"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div><div class="note-body"><div class="note-view">${data.content}</div><textarea class="note-content" style="display: none;">${data.content}</textarea></div><div class="resizer"></div>`;
        note.querySelector('.note-header').style.backgroundColor = data.color;
        note.querySelector('.note-body').style.backgroundColor = data.color;
        objectContainer.appendChild(note);
        addCommonEventListeners(note, data);
    }
    
    function createSection(data, fromOperation = false) {
        if (!fromOperation) {
            const pos = getNewElementPosition();
            const payload = {
                id: `section-${myPeerId}-${Date.now()}`,
                x: pos.x, y: pos.y, width: '400px', height: '400px',
                zIndex: boardData.board.sectionZIndexCounter++,
                content: '新しいセクション',
                color: sectionColors[0], // --- FIXED: Assign single color ---
                isLocked: false,
            };
            generateOperation('CREATE_SECTION', payload);
            return;
        }
        if (document.getElementById(data.id)) return;
        
        const section = document.createElement('div');
        section.className = 'section';
        section.id = data.id;
        section.style.cssText = `left:${data.x}; top:${data.y}; width:${data.width}; height:${data.height}; z-index:${data.zIndex}; background-color:${data.color};`;
        section.classList.toggle('locked', data.isLocked);

        section.innerHTML = `<div class="section-header"><div class="section-title">${data.content}</div><div class="section-controls"><div class="color-picker">${sectionColors.map(c=>`<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div><div class="lock-btn" title="ロック"><i class="fas ${data.isLocked ? 'fa-lock' : 'fa-unlock'}"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div></div><div class="resizer"></div>`;
        objectContainer.appendChild(section);
        addCommonEventListeners(section, data);
    }

    function createTextBox(data, fromOperation = false) {
        if (!fromOperation) {
            const pos = getNewElementPosition();
            const payload = {
                id: `text-${myPeerId}-${Date.now()}`,
                x: pos.x, y: pos.y, zIndex: boardData.board.noteZIndexCounter++,
                content: 'テキストを入力', isLocked: false, width: 'auto'
            };
            generateOperation('CREATE_TEXTBOX', payload);
            return;
        }
        if (document.getElementById(data.id)) return;

        const textBox = document.createElement('div');
        textBox.className = 'text-box';
        textBox.id = data.id;
        textBox.style.cssText = `left:${data.x}; top:${data.y}; z-index:${data.zIndex}; width:${data.width};`;
        textBox.classList.toggle('locked', data.isLocked);
        
        textBox.innerHTML = `<div class="text-content" contenteditable="${!data.isLocked}">${data.content}</div><div class="lock-btn" title="ロック"><i class="fas ${data.isLocked ? 'fa-lock' : 'fa-unlock'}"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div>`;
        objectContainer.appendChild(textBox);
        addCommonEventListeners(textBox, data);
    }
    
    function createShape(data, fromOperation = false) {
        if (!fromOperation) {
            // This is a special case since multiple buttons call it
            const payload = {
                id: `shape-${myPeerId}-${Date.now()}`,
                ...getNewElementPosition(),
                width: '150px', height: '150px',
                zIndex: boardData.board.noteZIndexCounter++,
                content: '',
                color: shapeColors[0], // --- FIXED: Assign single color ---
                isLocked: false,
                shapeType: data.type
            };
            generateOperation('CREATE_SHAPE', payload);
            return;
        }
        if (document.getElementById(data.id)) return;

        const shape = document.createElement('div');
        shape.className = `shape ${data.shapeType}`;
        shape.id = data.id;
        shape.style.cssText = `left:${data.x}; top:${data.y}; width:${data.width}; height:${data.height}; z-index:${data.zIndex};`;
        shape.classList.toggle('locked', data.isLocked);

        shape.innerHTML = `<div class="shape-visual"></div><div class="shape-label" contenteditable="${!data.isLocked}">${data.content}</div><div class="resizer"></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div><div class="lock-btn" title="ロック"><i class="fas ${data.isLocked ? 'fa-lock' : 'fa-unlock'}"></i></div><div class="color-picker">${shapeColors.map(c => `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div>`;
        shape.querySelector('.shape-visual').style.backgroundColor = data.color;
        objectContainer.appendChild(shape);
        addCommonEventListeners(shape, data);
    }
    
    function addCommonEventListeners(element, data) {
        // Dragging
        const header = element.querySelector('.note-header') || element.querySelector('.section-header') || element;
        header.addEventListener('mousedown', e => {
            if (element.classList.contains('locked') || e.target.closest('.resizer, [contenteditable="true"], .color-picker')) return;
            e.stopPropagation();
            
            const startZIndex = boardData.board.noteZIndexCounter++;
            let attachedElements = [];

            // --- FIXED: LOGIC FOR SECTION DRAGGING ---
            if (element.classList.contains('section')) {
                const sectionX = parseFloat(element.style.left);
                const sectionY = parseFloat(element.style.top);
                const sectionW = element.offsetWidth;
                const sectionH = element.offsetHeight;

                const allDraggableItems = [
                    ...boardData.notes,
                    ...boardData.textBoxes,
                    ...boardData.shapes
                ];
                allDraggableItems.forEach(item => {
                    const itemEl = document.getElementById(item.id);
                    if (!itemEl || item.isLocked) return;
                    const itemX = parseFloat(item.x);
                    const itemY = parseFloat(item.y);
                    const itemW = itemEl.offsetWidth;
                    const itemH = itemEl.offsetHeight;

                    if (itemX >= sectionX && (itemX + itemW) <= (sectionX + sectionW) &&
                        itemY >= sectionY && (itemY + itemH) <= (sectionY + sectionH)) {
                        attachedElements.push({
                            id: item.id,
                            element: itemEl,
                            offsetX: itemX - sectionX,
                            offsetY: itemY - sectionY
                        });
                    }
                });
            }
            // --- END FIX ---

            let lastPos = getEventCoordinates(e);
            const onPointerMove = ev => {
                ev.preventDefault();
                const currentPos = getEventCoordinates(ev);
                const dx = (currentPos.x - lastPos.x) / boardData.board.scale;
                const dy = (currentPos.y - lastPos.y) / boardData.board.scale;
                lastPos = currentPos;

                element.style.left = `${parseFloat(element.style.left) + dx}px`;
                element.style.top = `${parseFloat(element.style.top) + dy}px`;
                element.style.zIndex = startZIndex;

                // --- FIXED: MOVE ATTACHED ELEMENTS ---
                const newSectionX = parseFloat(element.style.left);
                const newSectionY = parseFloat(element.style.top);
                attachedElements.forEach(att => {
                    att.element.style.left = `${newSectionX + att.offsetX}px`;
                    att.element.style.top = `${newSectionY + att.offsetY}px`;
                });
                // --- END FIX ---

                drawAllConnectors();
            };
            const onPointerUp = () => {
                document.body.classList.remove('is-dragging');
                document.removeEventListener('mousemove', onPointerMove);
                document.removeEventListener('mouseup', onPointerUp);

                // --- FIXED: GENERATE PAYLOAD FOR ALL MOVED ELEMENTS ---
                const elementsToMove = [{
                    id: element.id,
                    x: element.style.left,
                    y: element.style.top,
                    zIndex: startZIndex
                }];

                attachedElements.forEach(att => {
                    elementsToMove.push({
                        id: att.id,
                        x: att.element.style.left,
                        y: att.element.style.top,
                        zIndex: att.element.style.zIndex
                    });
                });

                generateOperation('MOVE_ELEMENTS', { elements: elementsToMove });
                // --- END FIX ---
            };
            document.body.classList.add('is-dragging');
            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', onPointerUp);
        });

        // Deleting
        element.querySelector('.delete-btn')?.addEventListener('click', e => {
            if (element.classList.contains('locked')) return;
            e.stopPropagation();
            generateOperation('DELETE_ELEMENTS', { elementIds: [element.id] });
        });

        // Locking
        element.querySelector('.lock-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            const isLocked = !element.classList.contains('locked');
            generateOperation('TOGGLE_LOCK', { id: element.id, isLocked });
        });
        
        // Color changing
        element.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', e => {
                if (element.classList.contains('locked')) return;
                e.stopPropagation();
                generateOperation('CHANGE_COLOR', { id: element.id, color: dot.dataset.color });
            });
        });

        // Content Editing
        const contentEl = element.querySelector('.note-content, .section-title, .text-content, .shape-label');
        if (contentEl) {
            const editTarget = (contentEl.tagName === 'DIV' || contentEl.tagName === 'SPAN') ? contentEl 
                : element.querySelector('.note-view');
            const inputTarget = (contentEl.tagName === 'TEXTAREA' || contentEl.tagName === 'INPUT') ? contentEl
                : contentEl;
                
            const finishEditing = () => {
                const newValue = (inputTarget.isContentEditable ? inputTarget.innerHTML : inputTarget.value);
                if (newValue !== data.content) {
                    generateOperation('UPDATE_CONTENT', { id: element.id, content: newValue });
                }
                if (editTarget && editTarget !== inputTarget) { // for note view/edit toggle
                    editTarget.style.display = 'block';
                    inputTarget.style.display = 'none';
                }
            };

            editTarget?.addEventListener('dblclick', () => {
                if(element.classList.contains('locked')) return;
                if (editTarget !== inputTarget) {
                    editTarget.style.display = 'none';
                    inputTarget.style.display = 'block';
                }
                inputTarget.focus();
            });
            inputTarget.addEventListener('blur', finishEditing);
            inputTarget.addEventListener('keydown', e => { if (e.key === 'Enter' && inputTarget.tagName !== 'TEXTAREA') inputTarget.blur(); });
        }
    }
    
    // =================================================================
    // 6. 手描き機能
    // =================================================================

    const onDrawingLayerDown = e => {
        if (!isPenMode && !isEraserMode) return;
        e.preventDefault(); e.stopPropagation();

        const pathId = `path-${myPeerId}-${Date.now()}`;
        const newPathData = {
            id: pathId,
            color: isDarkMode() ? '#FFFFFF' : '#000000',
            strokeWidth: currentStrokeWidth,
            mode: isEraserMode ? 'eraser' : 'pen'
        };

        generateOperation('START_DRAW', newPathData);
        drawingBuffer.push(getCanvasCoordinates(e));
        
        const onPointerMove = ev => {
            ev.preventDefault();
            drawingBuffer.push(getCanvasCoordinates(ev));
        };
        const onPointerUp = () => {
            clearInterval(drawingInterval);
            drawingInterval = null;
            if (drawingBuffer.length > 0) {
                 generateOperation('APPEND_POINTS', { pathId: pathId, points: [...drawingBuffer] });
                 drawingBuffer = [];
            }
            generateOperation('END_DRAW', { pathId: pathId });

            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);
        };

        drawingInterval = setInterval(() => {
            if (drawingBuffer.length > 0) {
                generateOperation('APPEND_POINTS', { pathId: pathId, points: [...drawingBuffer] });
                drawingBuffer = [];
            }
        }, DRAWING_CHUNK_INTERVAL);
        
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerUp);
    };
    drawingLayer.addEventListener('mousedown', onDrawingLayerDown);
    drawingLayer.addEventListener('touchstart', onDrawingLayerDown, { passive: false });

    // =================================================================
    // 7. ファイル管理とアプリケーション初期化
    // =================================================================

    function getFileMetadata() { return JSON.parse(localStorage.getItem('plottia_files_metadata')) || []; }
    function saveFileMetadata(metadata) { localStorage.setItem('plottia_files_metadata', JSON.stringify(metadata)); }
    
    function showFileManager() {
        if (peer && !peer.destroyed) peer.destroy();
        peer = null;
        currentFileId = null;
        fileManagerOverlay.classList.remove('hidden');
        mainApp.classList.add('hidden');
        window.history.replaceState(null, null, window.location.pathname);
        
        const metadata = getFileMetadata();
        metadata.sort((a, b) => b.lastModified - a.lastModified);
        fileList.innerHTML = '';
        if (metadata.length === 0) {
            fileList.innerHTML = '<li>ファイルがありません。新しいファイルを作成してください。</li>';
        }
        metadata.forEach(file => {
            const li = document.createElement('li');
            const lastModified = new Date(file.lastModified).toLocaleString();
            li.innerHTML = `<span class="file-name">${file.name}</span><span class="file-meta">最終更新: ${lastModified}</span><div class="file-actions"><button class="rename-btn" title="名前を変更"><i class="fas fa-pen"></i></button><button class="delete-btn" title="削除"><i class="fas fa-trash"></i></button></div>`;
            fileList.appendChild(li);

            li.querySelector('.file-name').addEventListener('click', () => openFile(file.id));
            li.querySelector('.rename-btn').addEventListener('click', () => renameFile(file.id, file.name));
            li.querySelector('.delete-btn').addEventListener('click', () => deleteFile(file.id, file.name));
        });
    }
    
    async function createNewFile() {
        const name = prompt('新しいファイルの名前を入力してください:', '無題のボード');
        if (!name) return;

        const metadata = getFileMetadata();
        const newFile = {
            id: `plottia_board_${Date.now()}`,
            name: name,
            lastModified: Date.now()
        };
        metadata.push(newFile);
        saveFileMetadata(metadata);

        await db.set(newFile.id, createEmptyBoard());
        
        openFile(newFile.id);
    }

    function renameFile(fileId, oldName) {
        const newName = prompt('新しいファイル名を入力してください:', oldName);
        if (!newName || newName === oldName) return;
        let metadata = getFileMetadata();
        const fileIndex = metadata.findIndex(f => f.id === fileId);
        if (fileIndex > -1) {
            metadata[fileIndex].name = newName;
            metadata[fileIndex].lastModified = Date.now();
            saveFileMetadata(metadata);
            showFileManager();
        }
    }

    async function deleteFile(fileId, fileName) {
        if (!confirm(`「${fileName}」を完全に削除します。よろしいですか？`)) return;
        try {
            let metadata = getFileMetadata();
            metadata = metadata.filter(f => f.id !== fileId);
            saveFileMetadata(metadata);
            await db.remove(fileId);
            showFileManager();
        } catch (err) {
            showErrorModal(`ファイルの削除中にエラーが発生しました:\n${err.message}`);
        }
    }
    
    async function openFile(fileId) {
        currentFileId = fileId;
        fileManagerOverlay.classList.add('hidden');
        mainApp.classList.remove('hidden');

        const urlHash = window.location.hash.substring(1);
        const [fileIdFromUrl, hostIdInUrl] = urlHash.split('/');

        // If we are joining a room from a link, we start with an empty board and wait for host data.
        if (hostIdInUrl) {
            console.log("Joining as a guest. Waiting for host data.");
            loadStateFromObject(createEmptyBoard());
        } else {
            // Otherwise, we are the host or working solo. Load our local data.
            console.log("Opening as host/solo. Loading from local DB.");
            const localData = await db.get(currentFileId);
            loadStateFromObject(localData);
        }

        initializePeer();
    }
    
    // =================================================================
    // 8. 描画とUIヘルパー関数
    // =================================================================
    function redrawCanvas() {
        if (!boardData.paths) return;
        ctx.clearRect(0, 0, drawingLayer.width, drawingLayer.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        boardData.paths.forEach(path => {
            ctx.globalCompositeOperation = path.mode === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.strokeWidth;
            ctx.beginPath();
            if (path.points && path.points.length > 0) {
                // --- FIXED: Correctly access first point's coordinates ---
                ctx.moveTo(path.points[0].x, path.points[0].y);
                // --- END FIX ---
                path.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
                ctx.stroke();
            }
        });
        ctx.globalCompositeOperation = 'source-over';
    }

    function applyTransform() {
        if (boardData.board) {
            board.style.transform = `translate(${boardData.board.panX}px, ${boardData.board.panY}px) scale(${boardData.board.scale})`;
            updateZoomDisplay();
            drawAllConnectors();
            updateMinimap();
        }
    }
    
    function updateZoomDisplay() {
        if (boardData.board) {
            zoomDisplay.textContent = `${Math.round(boardData.board.scale * 100)}%`;
        }
    }
    
    function getCanvasCoordinates(e) {
        const coords = getEventCoordinates(e);
        const scale = boardData.board?.scale || 1;
        const panX = boardData.board?.panX || 0;
        const panY = boardData.board?.panY || 0;
        return {
            x: (coords.x - panX) / scale,
            y: (coords.y - panY) / scale
        };
    }
    
    function getElementCenter(elementId) { const el = document.getElementById(elementId); if (!el) return null; const x = parseFloat(el.style.left) + el.offsetWidth / 2; const y = parseFloat(el.style.top) + el.offsetHeight / 2; return { x, y }; }
    
    function drawAllConnectors() {
        if(!svgLayer) return;
        svgLayer.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`;
        boardData.connectors?.forEach(conn => {
            const startPoint = getElementCenter(conn.startId);
            const endPoint = getElementCenter(conn.endId);
            if (startPoint && endPoint) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', startPoint.x);
                line.setAttribute('y1', startPoint.y);
                line.setAttribute('x2', endPoint.x);
                line.setAttribute('y2', endPoint.y);
                line.setAttribute('class', 'connector-line');
                line.dataset.id = conn.id;
                svgLayer.appendChild(line);
                line.addEventListener('mousedown', e => {
                    e.stopPropagation();
                    clearSelection();
                    selectedElement = { type: 'connector', id: conn.id };
                    document.querySelectorAll('.connector-line').forEach(l => l.classList.remove('selected'));
                    line.classList.add('selected');
                });
            }
        });
    }

    function updateMinimap() {
        minimap.innerHTML = '';
        const minimapScale = minimap.offsetWidth / board.offsetWidth;
        const allElements = [...(boardData.notes || []), ...(boardData.sections || []), ...(boardData.textBoxes || []), ...(boardData.shapes || [])];
        
        allElements.forEach(item => {
            const el = document.getElementById(item.id);
            if (!el) return;
            const elRect = {
                left: parseFloat(item.x) * minimapScale,
                top: parseFloat(item.y) * minimapScale,
                width: el.offsetWidth * minimapScale,
                height: el.offsetHeight * minimapScale
            };
            const mapEl = document.createElement('div');
            mapEl.className = 'minimap-element';
            mapEl.style.cssText = `left:${elRect.left}px; top:${elRect.top}px; width:${elRect.width}px; height:${elRect.height}px;`;
            minimap.appendChild(mapEl);
        });
        
        const viewport = document.createElement('div');
        viewport.id = 'minimap-viewport';
        minimap.appendChild(viewport);
        const viewRect = {
            width: window.innerWidth / boardData.board.scale * minimapScale,
            height: window.innerHeight / boardData.board.scale * minimapScale,
            left: -boardData.board.panX * minimapScale,
            top: -boardData.board.panY * minimapScale
        };
        viewport.style.cssText = `width:${viewRect.width}px; height:${viewRect.height}px; left:${viewRect.left}px; top:${viewRect.top}px;`;
    }

    function getEventCoordinates(e) { if (e.touches && e.touches.length > 0) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; } return { x: e.clientX, y: e.clientY }; }
    function clearSelection() { /* ... */ }
    function isDarkMode() { return document.body.classList.contains('dark-mode'); }

    // =================================================================
    // 9. イベントリスナーと初期化
    // =================================================================

    // Tool toggles
    function togglePenMode(forceOff = false) { isPenMode = forceOff ? false : !isPenMode; penToolBtn.classList.toggle('active', isPenMode); document.body.classList.toggle('pen-mode', isPenMode); drawingLayer.style.pointerEvents = (isPenMode || isEraserMode) ? 'auto' : 'none'; if(isPenMode) { toggleEraserMode(true); toggleConnectorMode(true); } }
    function toggleEraserMode(forceOff = false) { isEraserMode = forceOff ? false : !isEraserMode; eraserToolBtn.classList.toggle('active', isEraserMode); document.body.classList.toggle('eraser-mode', isEraserMode); drawingLayer.style.pointerEvents = (isPenMode || isEraserMode) ? 'auto' : 'none'; if(isEraserMode) { togglePenMode(true); toggleConnectorMode(true); } }
    function toggleConnectorMode(forceOff = false) { isConnectorMode = forceOff ? false : !isConnectorMode; addConnectorBtn.classList.toggle('active', isConnectorMode); document.body.classList.toggle('connector-mode', isConnectorMode); if(isConnectorMode) { togglePenMode(true); toggleEraserMode(true); } connectorStartId = null; }
    
    penToolBtn.addEventListener('click', () => togglePenMode());
    eraserToolBtn.addEventListener('click', () => toggleEraserMode());
    addConnectorBtn.addEventListener('click', () => toggleConnectorMode());
    
    // Board panning
    board.addEventListener('mousedown', e => {
        if (e.target !== board || isPenMode || isEraserMode) return;
        board.classList.add('grabbing');
        let lastPos = getEventCoordinates(e);
        const onPointerMove = ev => {
            ev.preventDefault();
            const currentPos = getEventCoordinates(ev);
            boardData.board.panX += currentPos.x - lastPos.x;
            boardData.board.panY += currentPos.y - lastPos.y;
            lastPos = currentPos;
            applyTransform();
        };
        const onPointerUp = () => {
            board.classList.remove('grabbing');
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            saveState(); // Save pan/zoom state
        };
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
    });

    // Board zooming
    window.addEventListener('wheel', e => {
        if (mainApp.classList.contains('hidden')) return;
        e.preventDefault();
        const z = 1.1, oldScale = boardData.board.scale;
        let newScale = e.deltaY < 0 ? oldScale * z : oldScale / z;
        newScale = Math.max(0.2, Math.min(newScale, 3.0));
        boardData.board.scale = newScale;
        boardData.board.panX = e.clientX - ((e.clientX - boardData.board.panX) / oldScale * newScale);
        boardData.board.panY = e.clientY - ((e.clientY - boardData.board.panY) / oldScale * newScale);
        applyTransform();
    }, { passive: false });

    // Button event listeners
    addNoteBtn.addEventListener('click', () => createNote());
    addSectionBtn.addEventListener('click', () => createSection());
    addTextBtn.addEventListener('click', () => createTextBox());
    addShapeSquareBtn.addEventListener('click', () => createShape({ type: 'square' }));
    addShapeCircleBtn.addEventListener('click', () => createShape({ type: 'circle' }));
    addShapeDiamondBtn.addEventListener('click', () => createShape({ type: 'diamond' }));
    backToFilesBtn.addEventListener('click', showFileManager);
    createNewFileBtn.addEventListener('click', createNewFile);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    darkModeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('plottia-dark-mode', document.body.classList.contains('dark-mode') ? '1' : '0');
        redrawCanvas(); // Redraw with new pen color if needed
    });

    // --- FIXED: ADD STROKE WIDTH EVENT LISTENER ---
    strokeWidthSlider.addEventListener('input', e => {
        const newWidth = e.target.value;
        currentStrokeWidth = parseInt(newWidth, 10);
        strokeWidthDisplay.textContent = newWidth;
        localStorage.setItem('plottia_stroke_width', newWidth);
    });
    // --- END FIX ---

    async function initializeApp() {
        if (localStorage.getItem('plottia-dark-mode') === '1') { document.body.classList.add('dark-mode'); }
        
        // --- FIXED: LOAD SAVED STROKE WIDTH ---
        const savedWidth = localStorage.getItem('plottia_stroke_width');
        if (savedWidth) {
            currentStrokeWidth = parseInt(savedWidth, 10);
            strokeWidthSlider.value = savedWidth;
            strokeWidthDisplay.textContent = savedWidth;
        }
        // --- END FIX ---

        const urlHash = window.location.hash.substring(1);
        const [fileIdFromUrl, hostIdInUrl] = urlHash.split('/');
        
        if (fileIdFromUrl && getFileMetadata().some(f => f.id === fileIdFromUrl)) {
            openFile(fileIdFromUrl);
        } else {
            showFileManager();
        }
    }
    
    initializeApp();

    // =================================================================
    // グローバルエラーハンドリング
    // =================================================================
    function showErrorModal(errorMessage) {
        if (errorOverlay && errorDetails) {
            errorDetails.value = errorMessage;
            errorOverlay.classList.remove('hidden');
        } else {
            console.error("CRITICAL ERROR (modal not found):\n", errorMessage);
            prompt("エラーが発生しました。詳細をコピーしてください:", errorMessage);
        }
    }
    copyErrorBtn.addEventListener('click', () => {
        errorDetails.select();
        navigator.clipboard.writeText(errorDetails.value).then(() => {
            copyErrorBtn.innerHTML = '<i class="fas fa-check"></i> コピーしました';
            setTimeout(() => { copyErrorBtn.innerHTML = '<i class="fas fa-copy"></i> クリップボードにコピー'; }, 2000);
        }).catch(err => { alert('コピーに失敗しました。'); });
    });
    closeErrorBtn.addEventListener('click', () => {
        errorOverlay.classList.add('hidden');
    });

    window.onerror = function(message, source, lineno, colno, error) {
        let formattedMessage = "予期せぬJavaScriptエラーが発生しました。\n\n" +
            "メッセージ: " + message + "\n" +
            "ファイル: " + (source || '不明') + "\n" +
            "行番号: " + (lineno || '不明') + "\n" +
            "列番号: " + (colno || '不明') + "\n";
        if (error && error.stack) {
            formattedMessage += "\nスタックトレース:\n" + error.stack;
        }
        showErrorModal(formattedMessage);
        return true; 
    };
    window.addEventListener('unhandledrejection', function(event) {
        let formattedMessage = '捕捉されなかったPromiseのエラーが発生しました。\n\n';
        if (event.reason instanceof Error) {
            formattedMessage += "エラー名: " + event.reason.name + "\n" +
                "メッセージ: " + event.reason.message + "\n";
            if (event.reason.stack) {
                formattedMessage += "\nスタックトレース:\n" + event.reason.stack;
            }
        } else {
            formattedMessage += "理由: " + String(event.reason);
        }
        showErrorModal(formattedMessage);
    });
});

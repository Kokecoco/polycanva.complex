document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    const fileManagerOverlay = document.getElementById('file-manager-overlay');
    const fileList = document.getElementById('file-list');
    const createNewFileBtn = document.getElementById('create-new-file-btn');
    const mainApp = document.getElementById('main-app');
    const backToFilesBtn = document.getElementById('back-to-files-btn');
    const board = document.getElementById('board');
    const svgLayer = document.getElementById('connector-svg-layer');
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
    let boardData = createEmptyBoard();
    let selectedElement = null;
    let isConnectorMode = false, connectorStartId = null;
    let isPenMode = false, isEraserMode = false;
    let initialPinchDistance = null;
    let currentStrokeWidth = 5;
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
            showErrorModal("PeerJSの初期化に失敗しました。アドブロッカーなどが原因である可能性があります。\n" + e.message);
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
            showErrorModal(`接続エラーが発生しました: ${err.type}。ページをリロードしてみてください。`);
        });
    }

    function joinRoom() {
        const urlHash = window.location.hash.substring(1);
        const [fileIdFromUrl, hostIdInUrl] = urlHash.split('/');

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
            alert('ホストとの接続が切れました。新しいホストを選出します。');
            const remainingPeers = Object.keys(connectedUsers).filter(id => id !== myPeerId);
            if (remainingPeers.length > 0) {
                remainingPeers.sort();
                const newHostId = remainingPeers[0];
                if (myPeerId < newHostId) { // 自分の方がID的に若い場合、自分がホストになる
                     becomeHost();
                } else { // 他の誰かが新しいホストになる
                     changeHost(newHostId);
                     broadcast({ type: 'host-changed', payload: { newHostId: newHostId } });
                }
            } else {
                becomeHost();
            }
        }
        
        if (isHost) {
             broadcast({ type: 'user-left', payload: { id: peerId, users: connectedUsers } });
        }
        updateUserListUI();
    }
    
    function becomeHost() {
        isHost = true;
        hostPeerId = myPeerId;
        const newUrl = `#${currentFileId}/${myPeerId}`;
        window.history.replaceState(null, null, newUrl);
        console.log('I am the new host.');
        alert('あなたが新しいホストになりました。');
        updateUserListUI();
    }
    
    function changeHost(newHostId) {
        isHost = false;
        hostPeerId = newHostId;
        console.log('New host is', hostPeerId, 'Reconnecting...');
        alert(`新しいホスト (${hostPeerId.substring(0,4)}) に再接続します。`);
        setTimeout(() => {
            if (peer.connections[hostPeerId]) {
                console.log('Already connected to new host.');
                return;
            }
            const conn = peer.connect(hostPeerId, { reliable: true });
            setupConnection(conn);
        }, 500);
        updateUserListUI();
    }


    function broadcast(data, excludePeerId = null) {
        if (!isHost) return;
        Object.values(connections).forEach(conn => {
            if (conn && conn.peer !== excludePeerId && conn.open) {
                conn.send(data);
            }
        });
    }

    function sendOperationToHost(operation) {
        const data = { type: 'operation', payload: operation };
        if (isHost) {
            applyOperation(operation);
            broadcast(data);
        } else if (connections[hostPeerId] && connections[hostPeerId].open) {
            connections[hostPeerId].send(data);
        } else {
             console.error("Host connection not available. Operation queued.");
             // TODO: Add offline queue logic if needed
        }
    }
    
    function handleReceivedData(data, fromPeerId) {
        switch (data.type) {
            case 'initial-state':
                hostPeerId = data.payload.hostId;
                isHost = false;
                connectedUsers = data.payload.users || {};
                connectedUsers[myPeerId] = { id: myPeerId };
                updateUserListUI();
                handleOfflineConflict(data.payload.boardData);
                break;
            case 'operation':
                if (isHost) {
                    applyOperation(data.payload);
                    broadcast(data, fromPeerId);
                } else {
                    applyOperation(data.payload);
                }
                break;
            case 'user-joined':
            case 'user-left':
                connectedUsers = data.payload.users;
                updateUserListUI();
                break;
            case 'host-changed':
                if (myPeerId === data.payload.newHostId) {
                    becomeHost();
                } else {
                    changeHost(data.payload.newHostId);
                }
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
        navigator.clipboard.writeText(window.location.href)
            .then(() => alert('招待リンクをクリップボードにコピーしました。'))
            .catch(() => alert('コピーに失敗しました。'));
    });
    
    // =================================================================
    // 2. 状態管理 & 操作ベース同期
    // =================================================================

    function generateOperation(type, payload, addToUndo = false) {
        const operation = { type, payload, sender: myPeerId, timestamp: Date.now() };
        if (addToUndo) {
            myUndoStack.push(addToUndo);
            myRedoStack = [];
            updateUndoRedoButtons();
        }
        sendOperationToHost(operation);
        // DBへの保存は、操作が頻繁に発生しないように少し遅延させるか、特定の操作後に限定する
        // requestAnimationFrame(saveState);
    }
    
    function findElementData(id) {
        for (const key of ['notes', 'sections', 'textBoxes', 'shapes', 'connectors']) {
            if (Array.isArray(boardData[key])) {
                const item = boardData[key].find(i => i.id === id);
                if (item) return { item, type: key };
            }
        }
        return null;
    }

    function applyOperation(op) {
        if (!op || !op.type) return;
        let itemData, element;
        
        const findResult = op.payload.id ? findElementData(op.payload.id) : null;
        if(findResult) {
            itemData = findResult.item;
            element = document.getElementById(op.payload.id);
        }

        switch(op.type) {
            case 'CREATE_NOTE':
                if (!boardData.notes.some(n => n.id === op.payload.id)) {
                    boardData.notes.push(op.payload);
                    createNote(op.payload, true);
                }
                break;
            case 'CREATE_SECTION':
                if (!boardData.sections.some(s => s.id === op.payload.id)) {
                    boardData.sections.push(op.payload);
                    createSection(op.payload, true);
                }
                break;
            case 'CREATE_TEXTBOX':
                if (!boardData.textBoxes.some(t => t.id === op.payload.id)) {
                    boardData.textBoxes.push(op.payload);
                    createTextBox(op.payload, true);
                }
                break;
            case 'CREATE_SHAPE':
                 if (!boardData.shapes.some(s => s.id === op.payload.id)) {
                    boardData.shapes.push(op.payload);
                    createShape(op.payload, true);
                }
                break;
            case 'MOVE_ELEMENTS':
                op.payload.elements.forEach(movedEl => {
                    const el = document.getElementById(movedEl.id);
                    const data = findElementData(movedEl.id);
                    if (el && data) {
                        data.item.x = movedEl.x;
                        data.item.y = movedEl.y;
                        el.style.left = movedEl.x;
                        el.style.top = movedEl.y;
                        if (movedEl.zIndex) {
                            data.item.zIndex = movedEl.zIndex;
                            el.style.zIndex = movedEl.zIndex;
                        }
                    }
                });
                drawAllConnectors();
                break;
            case 'RESIZE_ELEMENT':
                 if (element && itemData) {
                    itemData.width = op.payload.width;
                    itemData.height = op.payload.height;
                    element.style.width = op.payload.width;
                    element.style.height = op.payload.height;
                    drawAllConnectors();
                }
                break;
            case 'UPDATE_CONTENT':
                if (element && itemData) {
                    itemData.content = op.payload.content;
                    if(findResult.type === 'notes') {
                        element.querySelector('.note-view').innerHTML = parseMarkdown(op.payload.content);
                        element.querySelector('.note-content').value = op.payload.content;
                    } else if (findResult.type === 'textBoxes') {
                        element.querySelector('.text-content').innerHTML = op.payload.content;
                    } else if (findResult.type === 'shapes') {
                        element.querySelector('.shape-label').innerHTML = op.payload.content;
                    } else if (findResult.type === 'sections') {
                         element.querySelector('.section-title').textContent = op.payload.content;
                    }
                }
                break;
            case 'CHANGE_COLOR':
                if(element && itemData) {
                    itemData.color = op.payload.color;
                     if(findResult.type === 'notes') {
                        updateNoteColor(element, op.payload.color);
                    } else if (findResult.type === 'sections') {
                        element.style.backgroundColor = op.payload.color;
                    } else if (findResult.type === 'shapes') {
                        element.querySelector('.shape-visual').style.backgroundColor = op.payload.color;
                    }
                }
                break;
            case 'TOGGLE_LOCK':
                if (element && itemData) {
                    itemData.isLocked = op.payload.isLocked;
                    element.classList.toggle('locked', op.payload.isLocked);
                    element.querySelector('.lock-btn i').className = op.payload.isLocked ? 'fas fa-lock' : 'fas fa-unlock';
                    if (findResult.type === 'textBoxes' || findResult.type === 'shapes') {
                        element.querySelector('[contenteditable]').contentEditable = !op.payload.isLocked;
                    }
                }
                break;
            case 'DELETE_ELEMENTS':
                op.payload.ids.forEach(id => {
                    const elToRemove = document.getElementById(id);
                    if (elToRemove) elToRemove.remove();
                    
                    for (const key of ['notes', 'sections', 'textBoxes', 'shapes']) {
                        const index = boardData[key].findIndex(i => i.id === id);
                        if (index > -1) {
                            boardData[key].splice(index, 1);
                            break;
                        }
                    }
                    boardData.connectors = boardData.connectors.filter(c => c.startId !== id && c.endId !== id);
                });
                drawAllConnectors();
                break;
            case 'START_DRAW':
                if (!boardData.paths.some(p => p.id === op.payload.id)) {
                    boardData.paths.push(op.payload);
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
                const finalPath = boardData.paths.find(p => p.id === op.payload.pathId);
                if (finalPath && finalPath.points.length < 2) {
                     boardData.paths = boardData.paths.filter(p => p.id !== op.payload.pathId);
                }
                redrawCanvas();
                saveState(); //描画の完了時に保存
                break;
            case 'UPDATE_BOARD_STATE':
                boardData.board = { ...boardData.board, ...op.payload };
                applyTransform();
                saveState(); //ボード操作の完了時に保存
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
            case 'FORCE_OVERWRITE':
                if (!isHost) {
                    loadStateFromObject(op.payload);
                    saveState();
                }
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
        const inverseOp = { type: lastAction.inverse.type, payload: lastAction.inverse.payload };
        sendOperationToHost(inverseOp);
        saveState();
        updateUndoRedoButtons();
    }

    function redo() {
        if (myRedoStack.length === 0) return;
        const lastAction = myRedoStack.pop();
        myUndoStack.push(lastAction);
        const originalOp = { type: lastAction.original.type, payload: lastAction.original.payload };
        sendOperationToHost(originalOp);
        saveState();
        updateUndoRedoButtons();
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
                const compressed = pako.deflate(JSON.stringify(value), { to: 'string' });
                const transaction = db.transaction(this._storeName, 'readwrite');
                transaction.objectStore(this._storeName).put(compressed, key);
                transaction.oncomplete = () => resolve();
                transaction.onerror = e => reject('DB Set Error:', e.target.error);
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

        if (!localState || (remoteState && (!localState.version || localState.version < remoteState.version))) {
             console.log("Applying remote state (no local or local is older).");
             loadStateFromObject(remoteState);
             await db.set(currentFileId, remoteState);
             return;
        }

        if (localState && remoteState && localState.version > remoteState.version) {
            console.log("Conflict detected. Local:", localState.version, "Remote:", remoteState.version);
            conflictOverlay.classList.remove('hidden');
            const handleResolution = (choice) => async () => {
                conflictOverlay.classList.add('hidden');
                if (choice === 'overwrite') { // オンライン版を使う
                    loadStateFromObject(remoteState);
                    await db.set(currentFileId, remoteState);
                } else if (choice === 'fork') { // 別ファイルとして保存
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
                } else if (choice === 'force') { // 自分の変更で上書き
                    boardData = localState;
                    await saveState(); // This will update version and save
                    if (isHost) {
                        broadcast({ type: 'operation', payload: { type: 'FORCE_OVERWRITE', payload: getCurrentState() } });
                    }
                    loadStateFromObject(localState);
                }
            };
            conflictOverwriteBtn.onclick = handleResolution('overwrite');
            conflictForkBtn.onclick = handleResolution('fork');
            conflictForceBtn.onclick = handleResolution('force');
        } else {
            console.log("No conflict or local is up-to-date.");
            loadStateFromObject(localState || remoteState);
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
    // 5. 各オブジェクトの操作
    // =================================================================
    
    function getNewElementPosition() {
        const boardState = boardData.board;
        return {
            x: `${((window.innerWidth/2)-110-boardState.panX)/boardState.scale}px`,
            y: `${((window.innerHeight/2)-110-boardState.panY)/boardState.scale}px`
        }
    }
    
    function createNote(data, fromRemote = false) {
        if (!fromRemote) {
            const pos = getNewElementPosition();
            const payload = {
                id: `note-${myPeerId}-${Date.now()}`,
                x: pos.x, y: pos.y,
                width: '220px', height: '220px',
                zIndex: boardData.board.noteZIndexCounter++,
                content: '', color: noteColors[0],
                isLocked: false,
            };
            generateOperation('CREATE_NOTE', payload, {
                original: { type: 'CREATE_NOTE', payload },
                inverse: { type: 'DELETE_ELEMENTS', payload: { ids: [payload.id] } }
            });
            saveState();
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
        
        const rawContent = data.content || '';
        note.innerHTML = `<div class="note-header"><div class="color-picker">${noteColors.map(c => `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div><div class="note-body"><div class="note-view">${parseMarkdown(rawContent)}</div><textarea class="note-content" style="display: none;">${rawContent}</textarea></div><div class="resizer"></div>`;
        updateNoteColor(note, data.color);
        if (data.isLocked) { note.classList.add('locked'); note.querySelector('.lock-btn i').className = 'fas fa-lock'; }
        
        objectContainer.appendChild(note);
        addDragAndResize(note);
        
        note.addEventListener('mousedown', (e) => { e.stopPropagation(); selectElement(note); });

        note.querySelector('.delete-btn').addEventListener('click', () => {
             generateOperation('DELETE_ELEMENTS', { ids: [note.id] });
             saveState();
        });
        const view = note.querySelector('.note-view');
        const content = note.querySelector('.note-content');
        note.querySelector('.note-body').addEventListener('dblclick', () => {
             if (note.classList.contains('locked')) return;
             view.style.display = 'none';
             content.style.display = 'block';
             content.focus();
        });
        content.addEventListener('blur', () => {
             view.innerHTML = parseMarkdown(content.value);
             view.style.display = 'block';
             content.style.display = 'none';
             const currentData = findElementData(note.id)?.item;
             if (currentData && content.value !== currentData.content) {
                 generateOperation('UPDATE_CONTENT', { id: note.id, content: content.value });
                 saveState();
             }
        });
        note.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                if (note.classList.contains('locked')) return;
                generateOperation('CHANGE_COLOR', { id: note.id, color: dot.dataset.color });
                saveState();
            });
        });
        note.querySelector('.lock-btn').addEventListener('click', () => {
            const isLocked = !note.classList.contains('locked');
            generateOperation('TOGGLE_LOCK', { id: note.id, isLocked: isLocked });
            saveState();
        });
    }
    
    function createSection(data, fromRemote = false) {
        if (!fromRemote) {
            const pos = getNewElementPosition();
            const payload = {
                id: `section-${myPeerId}-${Date.now()}`,
                x: pos.x, y: pos.y, width: '400px', height: '400px',
                zIndex: boardData.board.sectionZIndexCounter++,
                content: '新しいセクション', color: sectionColors[0], isLocked: false,
            };
            generateOperation('CREATE_SECTION', payload);
            saveState();
            return;
        }

        if (document.getElementById(data.id)) return;
        const section = document.createElement('div');
        section.className = 'section';
        section.id = data.id;
        section.style.cssText = `left: ${data.x}; top: ${data.y}; width: ${data.width}; height: ${data.height}; z-index: ${data.zIndex}; background-color: ${data.color};`;
        section.innerHTML = `<div class="section-header"><div class="section-title">${data.content}</div><div class="section-controls"><div class="color-picker">${sectionColors.map(c=>`<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div></div><div class="resizer"></div>`;
        if (data.isLocked) { section.classList.add('locked'); section.querySelector('.lock-btn i').className = 'fas fa-lock'; }

        objectContainer.appendChild(section);
        addDragAndResize(section, true);
        
        section.addEventListener('mousedown', (e) => { e.stopPropagation(); selectElement(section); });

        section.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); generateOperation('DELETE_ELEMENTS', { ids: [section.id] }); saveState(); });
        section.querySelectorAll('.color-dot').forEach(dot => { dot.addEventListener('click', e => { e.stopPropagation(); if (section.classList.contains('locked')) return; generateOperation('CHANGE_COLOR', {id: section.id, color: dot.dataset.color}); saveState(); }); });
        section.querySelector('.lock-btn').addEventListener('click', e => { e.stopPropagation(); const isLocked = !section.classList.contains('locked'); generateOperation('TOGGLE_LOCK', {id: section.id, isLocked: isLocked}); saveState(); });
        
        const titleEl = section.querySelector('.section-title');
        titleEl.addEventListener('dblclick', e => {
            if (section.classList.contains('locked')) return;
            e.stopPropagation();
            const i = document.createElement('input');
            i.type = 'text'; i.value = titleEl.textContent; i.className = 'section-title-input';
            titleEl.replaceWith(i); i.focus(); i.select();
            const saveTitle = () => {
                const newTitle = i.value || "無題";
                i.replaceWith(titleEl);
                if (titleEl.textContent !== newTitle) {
                    generateOperation('UPDATE_CONTENT', {id: section.id, content: newTitle});
                    saveState();
                }
            };
            i.addEventListener('blur', saveTitle);
            i.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') i.blur(); });
        });
    }

    function createTextBox(data, fromRemote = false) {
        if (!fromRemote) {
            const pos = getNewElementPosition();
            const payload = {
                id: `text-${myPeerId}-${Date.now()}`,
                x: pos.x, y: pos.y, width: 'auto',
                zIndex: boardData.board.noteZIndexCounter++,
                content: 'テキストを入力', isLocked: false,
            };
            generateOperation('CREATE_TEXTBOX', payload);
            saveState();
            return;
        }

        if (document.getElementById(data.id)) return;
        const textBox = document.createElement('div');
        textBox.className = 'text-box';
        textBox.id = data.id;
        textBox.style.cssText = `left: ${data.x}; top: ${data.y}; width: ${data.width || 'auto'}; z-index: ${data.zIndex};`;
        textBox.innerHTML = `<div class="text-content" contenteditable="true">${data.content}</div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div>`;
        
        objectContainer.appendChild(textBox);
        addDragAndResize(textBox);

        textBox.addEventListener('mousedown', (e) => { e.stopPropagation(); selectElement(textBox); });
        
        const content = textBox.querySelector('.text-content');
        if (data.isLocked) { 
            textBox.classList.add('locked'); 
            textBox.querySelector('.lock-btn i').className = 'fas fa-lock';
            content.contentEditable = 'false';
        }
        
        textBox.querySelector('.delete-btn').addEventListener('click', () => { generateOperation('DELETE_ELEMENTS', { ids: [textBox.id] }); saveState(); });
        textBox.querySelector('.lock-btn').addEventListener('click', () => { const isLocked = !textBox.classList.contains('locked'); generateOperation('TOGGLE_LOCK', {id: textBox.id, isLocked: isLocked}); saveState(); });
        
        content.addEventListener('blur', () => {
             const currentData = findElementData(textBox.id)?.item;
             if (currentData && content.innerHTML !== currentData.content) {
                 generateOperation('UPDATE_CONTENT', { id: textBox.id, content: content.innerHTML });
                 saveState();
             }
        });
        content.addEventListener('mousedown', e => e.stopPropagation()); // テキスト編集中にドラッグが始まらないように
    }

    function createShape(data, fromRemote = false) {
        if (!fromRemote) {
            const pos = getNewElementPosition();
            const payload = {
                id: `shape-${myPeerId}-${Date.now()}`,
                shapeType: data.type, x: pos.x, y: pos.y, width: '150px', height: '150px',
                zIndex: boardData.board.noteZIndexCounter++,
                content: '', color: shapeColors[0], isLocked: false,
            };
            generateOperation('CREATE_SHAPE', payload);
            saveState();
            return;
        }

        if (document.getElementById(data.id)) return;
        const shape = document.createElement('div');
        shape.className = `shape ${data.shapeType}`;
        shape.id = data.id;
        shape.style.cssText = `left: ${data.x}; top: ${data.y}; width: ${data.width}; height: ${data.height}; z-index: ${data.zIndex};`;
        shape.innerHTML = `<div class="shape-visual"></div><div class="shape-label" contenteditable="true">${data.content || ''}</div><div class="resizer"></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div><div class="lock-btn" title="ロック"><i class="fas fa-unlock"></i></div><div class="color-picker">${shapeColors.map(c => `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`).join('')}</div>`;
        shape.querySelector('.shape-visual').style.backgroundColor = data.color;
        
        objectContainer.appendChild(shape);
        addDragAndResize(shape);

        shape.addEventListener('mousedown', e => { e.stopPropagation(); selectElement(shape); });
        
        const label = shape.querySelector('.shape-label');
        if (data.isLocked) { 
            shape.classList.add('locked'); 
            shape.querySelector('.lock-btn i').className = 'fas fa-lock';
            label.contentEditable = 'false';
        }

        shape.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); generateOperation('DELETE_ELEMENTS', { ids: [shape.id] }); saveState(); });
        shape.querySelectorAll('.color-dot').forEach(dot => { dot.addEventListener('click', e => { e.stopPropagation(); if (shape.classList.contains('locked')) return; generateOperation('CHANGE_COLOR', { id: shape.id, color: dot.dataset.color }); saveState(); }); });
        shape.querySelector('.lock-btn').addEventListener('click', e => { e.stopPropagation(); const isLocked = !shape.classList.contains('locked'); generateOperation('TOGGLE_LOCK', { id: shape.id, isLocked: isLocked }); saveState(); });
        
        label.addEventListener('blur', () => {
            const currentData = findElementData(shape.id)?.item;
            if(currentData && label.innerHTML !== currentData.content) {
                generateOperation('UPDATE_CONTENT', {id: shape.id, content: label.innerHTML});
                saveState();
            }
        });
        label.addEventListener('mousedown', e => e.stopPropagation());
    }

    // =================================================================
    // 6. ユーティリティ & UIイベント
    // =================================================================
    function selectElement(element) {
        clearSelection();
        selectedElement = element;
        if(element) {
            element.classList.add('selected');
        }
    }
    
    function clearSelection() {
        if(selectedElement) {
            selectedElement.classList.remove('selected');
        }
        selectedElement = null;
    }
    
    function addDragAndResize(element, isSection = false) {
        const dragHandle = element.querySelector('.note-header') || element.querySelector('.section-header') || element;
        const onHeaderDown = e => {
            if (element.classList.contains('locked')) return;
            // ドラッグ対象がテキスト入力エリアの場合は何もしない
            if(e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            e.stopPropagation();
            selectElement(element);
            document.body.classList.add('is-dragging');

            let lastPos = getEventCoordinates(e);
            const startPositions = new Map();
            const elementsToMove = new Set([element]);

            if (isSection) {
                 [...boardData.notes, ...boardData.shapes, ...boardData.textBoxes].forEach(item => {
                    const domEl = document.getElementById(item.id);
                    if (!domEl) return;
                    const elRect = domEl.getBoundingClientRect();
                    const sectionRect = element.getBoundingClientRect();
                    if (elRect.left >= sectionRect.left && elRect.right <= sectionRect.right &&
                        elRect.top >= sectionRect.top && elRect.bottom <= sectionRect.bottom) {
                        elementsToMove.add(domEl);
                    }
                });
            }
            
            elementsToMove.forEach(el => startPositions.set(el, {x: parseFloat(el.style.left), y: parseFloat(el.style.top)}));

            const onPointerMove = ev => {
                ev.preventDefault();
                const currentPos = getEventCoordinates(ev);
                const dx = (currentPos.x - lastPos.x) / boardData.board.scale;
                const dy = (currentPos.y - lastPos.y) / boardData.board.scale;
                
                elementsToMove.forEach(el => {
                    const startPos = startPositions.get(el);
                    el.style.left = `${startPos.x + dx}px`;
                    el.style.top = `${startPos.y + dy}px`;
                });
                
                drawAllConnectors();
            };
            const onPointerUp = () => {
                document.body.classList.remove('is-dragging');
                document.removeEventListener('mousemove', onPointerMove);
                document.removeEventListener('mouseup', onPointerUp);
                document.removeEventListener('touchmove', onPointerMove);
                document.removeEventListener('touchend', onPointerUp);

                const movedElementsPayload = [];
                elementsToMove.forEach(el => {
                    movedElementsPayload.push({ id: el.id, x: el.style.left, y: el.style.top });
                });
                // Z-indexも更新
                const mainElPayload = movedElementsPayload.find(p => p.id === element.id);
                if(mainElPayload) mainElPayload.zIndex = isSection ? boardData.board.sectionZIndexCounter++ : boardData.board.noteZIndexCounter++;
                
                generateOperation('MOVE_ELEMENTS', { elements: movedElementsPayload });
                saveState();
            };
            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', onPointerUp);
            document.addEventListener('touchmove', onPointerMove, {passive: false});
            document.addEventListener('touchend', onPointerUp);
        };
        dragHandle.addEventListener('mousedown', onHeaderDown);
        dragHandle.addEventListener('touchstart', onHeaderDown, {passive: false});

        const resizer = element.querySelector('.resizer');
        if (resizer) {
            const onResizeDown = e => {
                 if (element.classList.contains('locked')) return;
                 e.stopPropagation();
                 document.body.classList.add('is-dragging');
                 const startW = element.offsetWidth, startH = element.offsetHeight;
                 const startPos = getEventCoordinates(e);

                 const onPointerMove = ev => {
                     ev.preventDefault();
                     const currentPos = getEventCoordinates(ev);
                     element.style.width = `${Math.max(100, startW + (currentPos.x - startPos.x) / boardData.board.scale)}px`;
                     element.style.height = `${Math.max(100, startH + (currentPos.y - startPos.y) / boardData.board.scale)}px`;
                     drawAllConnectors();
                 };
                 const onPointerUp = () => {
                     document.body.classList.remove('is-dragging');
                     document.removeEventListener('mousemove', onPointerMove);
                     document.removeEventListener('mouseup', onPointerUp);
                     document.removeEventListener('touchmove', onPointerMove);
                     document.removeEventListener('touchend', onPointerUp);
                     generateOperation('RESIZE_ELEMENT', { id: element.id, width: element.style.width, height: element.style.height });
                     saveState();
                 };
                 document.addEventListener('mousemove', onPointerMove);
                 document.addEventListener('mouseup', onPointerUp);
                 document.addEventListener('touchmove', onPointerMove, {passive: false});
                 document.addEventListener('touchend', onPointerUp);
            };
            resizer.addEventListener('mousedown', onResizeDown);
            resizer.addEventListener('touchstart', onResizeDown, {passive: false});
        }
    }
    
    const onDrawingLayerDown = e => {
        if (!isPenMode && !isEraserMode) return;
        e.preventDefault(); e.stopPropagation();

        const pathId = `path-${myPeerId}-${Date.now()}`;
        const newPathData = {
            id: pathId,
            points: [],
            color: isDarkModeBtn.classList.contains('active') ? '#FFFFFF' : '#000000',
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
    
    const onBoardDown = e => {
        if (e.target !== board && e.target !== objectContainer && e.target !== drawingLayer) return;
        if(isPenMode || isEraserMode) return;

        clearSelection();
        document.body.classList.add('is-dragging');
        board.classList.add('grabbing');
        let lastPos = getEventCoordinates(e);

        const onPointerMove = ev => {
            ev.preventDefault();
            const currentPos = getEventCoordinates(ev);
            const panX = boardData.board.panX + (currentPos.x - lastPos.x);
            const panY = boardData.board.panY + (currentPos.y - lastPos.y);
            lastPos = currentPos;
            boardData.board.panX = panX;
            boardData.board.panY = panY;
            applyTransform();
        };

        const onPointerUp = () => {
            document.body.classList.remove('is-dragging');
            board.classList.remove('grabbing');
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);
            generateOperation('UPDATE_BOARD_STATE', {panX: boardData.board.panX, panY: boardData.board.panY});
        };
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, {passive: false});
        document.addEventListener('touchend', onPointerUp);
    };
    board.addEventListener('mousedown', onBoardDown);
    board.addEventListener('touchstart', onBoardDown, {passive: false});

    // =================================================================
    // 7. ファイル管理とアプリケーション初期化
    // =================================================================

    function getFileMetadata() { return JSON.parse(localStorage.getItem('plottia_files_metadata')) || []; }
    function saveFileMetadata(metadata) { localStorage.setItem('plottia_files_metadata', JSON.stringify(metadata)); }
    
    async function showFileManager() {
        if (peer && !peer.destroyed) peer.destroy();
        peer = null;
        currentFileId = null;
        fileManagerOverlay.classList.remove('hidden');
        mainApp.classList.add('hidden');
        window.history.replaceState(null, null, ' ');
        
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

        if (hostIdInUrl && fileIdFromUrl === fileId) {
            console.log("Joining as a guest. Waiting for host data.");
            loadStateFromObject(createEmptyBoard());
        } else {
            console.log("Opening as host/solo. Loading from local DB.");
            const localData = await db.get(currentFileId);
            loadStateFromObject(localData);
        }

        initializePeer();
    }
    
    function parseMarkdown(text) { let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/-(.*?)-/g, '<del>$1</del>'); html = html.split('\n').map(line => line.startsWith('* ') ? `<li>${line.substring(2)}</li>` : line).join('\n'); html = html.replace(/<li>(.*?)<\/li>/g, '<ul><li>$1</li></ul>').replace(/<\/ul>\n<ul>/g, ''); return html.replace(/\n/g, '<br>'); }
    function updateNoteColor(note, color) { note.dataset.color = color; note.querySelector('.note-header').style.backgroundColor = color; note.querySelector('.note-body').style.backgroundColor = color; }

    addNoteBtn.addEventListener('click', () => createNote({}));
    addSectionBtn.addEventListener('click', () => createSection({}));
    addTextBtn.addEventListener('click', () => createTextBox({}));
    addShapeSquareBtn.addEventListener('click', () => createShape({ type: 'square' }));
    addShapeCircleBtn.addEventListener('click', () => createShape({ type: 'circle' }));
    addShapeDiamondBtn.addEventListener('click', () => createShape({ type: 'diamond' }));

    backToFilesBtn.addEventListener('click', showFileManager);
    createNewFileBtn.addEventListener('click', createNewFile);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    
    penToolBtn.addEventListener('click', () => { isPenMode = !isPenMode; isEraserMode = false; penToolBtn.classList.toggle('active', isPenMode); eraserToolBtn.classList.remove('active'); drawingLayer.style.pointerEvents = (isPenMode || isEraserMode) ? 'auto' : 'none'; document.body.classList.toggle('pen-mode', isPenMode); });
    eraserToolBtn.addEventListener('click', () => { isEraserMode = !isEraserMode; isPenMode = false; eraserToolBtn.classList.toggle('active', isEraserMode); penToolBtn.classList.remove('active'); drawingLayer.style.pointerEvents = (isPenMode || isEraserMode) ? 'auto' : 'none'; document.body.classList.toggle('eraser-mode', isEraserMode); });

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
                ctx.moveTo(path.points[0].x, path.points[0].y);
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

    function getEventCoordinates(e) { if (e.touches && e.touches.length > 0) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; } return { x: e.clientX, y: e.clientY }; }
    function drawAllConnectors() { 
        if(!svgLayer || !boardData.connectors) return; 
        svgLayer.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`; 
        boardData.connectors.forEach(conn => { 
            const startEl = document.getElementById(conn.startId);
            const endEl = document.getElementById(conn.endId);
            if(startEl && endEl) {
                const startPoint = { x: parseFloat(startEl.style.left) + startEl.offsetWidth / 2, y: parseFloat(startEl.style.top) + startEl.offsetHeight / 2 };
                const endPoint = { x: parseFloat(endEl.style.left) + endEl.offsetWidth / 2, y: parseFloat(endEl.style.top) + endEl.offsetHeight / 2 };
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); 
                line.setAttribute('x1', startPoint.x); line.setAttribute('y1', startPoint.y); 
                line.setAttribute('x2', endPoint.x); line.setAttribute('y2', endPoint.y); 
                line.setAttribute('class', 'connector-line'); 
                line.dataset.id = conn.id; 
                svgLayer.appendChild(line);
            }
        }); 
    }
    function updateMinimap() {
        minimap.innerHTML = '';
        const boardWidth = 5000, boardHeight = 5000;
        const minimapScale = minimap.offsetWidth / boardWidth;
        const allElements = [...boardData.notes, ...boardData.sections, ...boardData.textBoxes, ...boardData.shapes];
        
        allElements.forEach(item => {
            const domEl = document.getElementById(item.id);
            if (!domEl) return;
            const elRect = {
                left: parseFloat(item.x) * minimapScale,
                top: parseFloat(item.y) * minimapScale,
                width: domEl.offsetWidth * minimapScale,
                height: domEl.offsetHeight * minimapScale,
            };
            const mapEl = document.createElement('div');
            mapEl.className = 'minimap-element';
            mapEl.style.cssText = `left:${elRect.left}px; top:${elRect.top}px; width:${elRect.width}px; height:${elRect.height}px;`;
            minimap.appendChild(mapEl);
        });
        const viewport = document.createElement('div');
        viewport.id = 'minimap-viewport';
        minimap.appendChild(viewport);
        const { panX, panY, scale } = boardData.board;
        const viewRect = {
            width: window.innerWidth / scale * minimapScale,
            height: window.innerHeight / scale * minimapScale,
            left: -panX * minimapScale,
            top: -panY * minimapScale
        };
        viewport.style.cssText = `width:${viewRect.width}px; height:${viewRect.height}px; left:${viewRect.left}px; top:${viewRect.top}px;`;
    }

    async function initializeApp() {
        if (localStorage.getItem('plottia-dark-mode') === '1') { document.body.classList.add('dark-mode'); }
        
        const urlHash = window.location.hash.substring(1);
        const [fileIdFromUrl] = urlHash.split('/');
        
        const metadata = getFileMetadata();
        if (fileIdFromUrl && metadata.some(f => f.id === fileIdFromUrl)) {
            await openFile(fileIdFromUrl);
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

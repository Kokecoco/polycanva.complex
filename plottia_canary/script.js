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
        peer = new Peer();

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
            const remainingPeers = Object.keys(connectedUsers);
            if (remainingPeers.length > 0) {
                remainingPeers.sort();
                const newHostId = remainingPeers[0];
                broadcast({ type: 'host-changed', payload: { newHostId: newHostId } }); // Tell everyone to reconnect to the new host
                if (myPeerId === newHostId) { // If I am the new host
                    isHost = true;
                    hostPeerId = myPeerId;
                    const newUrl = `#${currentFileId}/${myPeerId}`;
                    window.history.replaceState(null, null, newUrl);
                    console.log('I am the new host.');
                    alert('あなたが新しいホストになりました。');
                }
            } else { // I was the last one
                isHost = true; hostPeerId = myPeerId;
            }
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
            applyOperation(operation);
            broadcast(data);
        } else if (connections[hostPeerId] && connections[hostPeerId].open) {
            connections[hostPeerId].send(data);
        } else {
            console.error("Host connection not available.");
            // showErrorModal("ホストとの接続が切れています。操作を送信できません。");
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
                if (myPeerId !== data.payload.newHostId) {
                    isHost = false;
                    hostPeerId = data.payload.newHostId;
                    console.log('New host is', hostPeerId, 'Reconnecting...');
                    alert(`新しいホスト (${hostPeerId.substring(0,4)}) に再接続します。`);
                    const conn = peer.connect(hostPeerId, { reliable: true });
                    setupConnection(conn);
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
        applyOperation(operation);
        sendOperationToHost(operation);
        if (addToUndo) {
            myUndoStack.push(addToUndo);
            myRedoStack = [];
            updateUndoRedoButtons();
        }
        saveState();
    }
    
    function findElementData(id) {
        for (const key in boardData) {
            if (Array.isArray(boardData[key])) {
                const item = boardData[key].find(i => i.id === id);
                if (item) return item;
            }
        }
        return null;
    }

    function applyOperation(op) {
        if (!op || !op.type) return;
        let item;

        switch(op.type) {
            case 'CREATE_NOTE':
                if (!boardData.notes.some(n => n.id === op.payload.id)) {
                    boardData.notes.push(op.payload);
                    createNote(op.payload, true);
                }
                break;
            case 'MOVE_ELEMENT':
                const el = document.getElementById(op.payload.id);
                item = findElementData(op.payload.id);
                if (el && item) {
                    el.style.left = item.x = op.payload.x;
                    el.style.top = item.y = op.payload.y;
                    if (op.payload.zIndex) {
                        el.style.zIndex = item.zIndex = op.payload.zIndex;
                    }
                    drawAllConnectors();
                }
                break;
            case 'MARK_AS_DELETED':
                op.payload.elementIds.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = 'none';
                    item = findElementData(id);
                    if (item) {
                        item.isDeleted = true;
                        item.deletedAt = op.payload.deletedAt;
                    }
                });
                drawAllConnectors();
                break;
            case 'RESTORE_DELETED':
                op.payload.elementIds.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = '';
                    item = findElementData(id);
                    if (item) {
                        item.isDeleted = false;
                        item.deletedAt = null;
                    }
                });
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
            case 'END_DRAW': break;
        }
        updateMinimap();
    }

    // =================================================================
    // 3. Undo/Redo (自分の削除操作のみ)
    // =================================================================
    
    function undo() {
        if (myUndoStack.length === 0) return;
        const lastAction = myUndoStack.pop();
        myRedoStack.push(lastAction);
        const inverseOp = { type: lastAction.inverse.type, payload: lastAction.inverse.payload };
        applyOperation(inverseOp);
        sendOperationToHost(inverseOp);
        saveState();
        updateUndoRedoButtons();
    }

    function redo() {
        if (myRedoStack.length === 0) return;
        const lastAction = myRedoStack.pop();
        myUndoStack.push(lastAction);
        const originalOp = { type: lastAction.original.type, payload: lastAction.original.payload };
        applyOperation(originalOp);
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
                const compressed = pako.deflate(JSON.stringify(value));
                const transaction = db.transaction(this._storeName, 'readwrite');
                const request = transaction.objectStore(this._storeName).put(compressed, key);
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

        if (!localState && remoteState) {
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
                    await saveState();
                    broadcast({ type: 'initial-state', payload: { boardData: getCurrentState(), users: connectedUsers, hostId: hostPeerId } });
                    loadStateFromObject(localState);
                }
            };
            conflictOverwriteBtn.onclick = handleResolution('overwrite');
            conflictForkBtn.onclick = handleResolution('fork');
            conflictForceBtn.onclick = handleResolution('force');
        } else {
            console.log("No conflict or local is newer.");
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
        
        boardData.sections?.filter(s => !s.isDeleted).forEach(data => createSection(data, true));
        boardData.notes?.filter(n => !n.isDeleted).forEach(data => createNote(data, true));
        // ... Other elements ...

        myUndoStack = [];
        myRedoStack = [];
        updateUndoRedoButtons();
        redrawCanvas();
        applyTransform();
    }

    // =================================================================
    // 5. 各オブジェクトの操作 (実装は省略、構造のみ)
    // =================================================================
    
    function createNote(data = {}, fromRemote = false) {
        if (!fromRemote) {
            const payload = {
                id: `note-${myPeerId}-${Date.now()}`,
                x: `${((window.innerWidth/2)-110-(boardData.board?.panX || 0))/(boardData.board?.scale || 1)}px`,
                y: `${((window.innerHeight/2)-110-(boardData.board?.panY || 0))/(boardData.board?.scale || 1)}px`,
                width: '220px', height: '220px',
                zIndex: boardData.board.noteZIndexCounter++,
                content: '', color: noteColors[Math.floor(Math.random()*noteColors.length)],
                isLocked: false, isDeleted: false, deletedAt: null
            };
            generateOperation('CREATE_NOTE', payload);
            return;
        }

        if (document.getElementById(data.id) || data.isDeleted) return;

        const note = document.createElement('div');
        // ... (DOM生成ロジック, 元のコードを参照)
        // ... (イベントリスナも同様に、generateOperationを呼ぶように)
        const deleteBtn = note.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            const payload = { elementIds: [note.id], deletedAt: Date.now() };
            generateOperation('MARK_AS_DELETED', payload, {
                original: { type: 'MARK_AS_DELETED', payload: payload },
                inverse: { type: 'RESTORE_DELETED', payload: { elementIds: [note.id] } }
            });
        });
        objectContainer.appendChild(note);
    }
    
    addNoteBtn.addEventListener('click', () => createNote());
    function createSection(data, fromRemote) { /* ... */ } // 他の要素も同様に実装

    // =================================================================
    // 6. 手描き機能 (チャンク分割同期に対応)
    // =================================================================

    const onDrawingLayerDown = e => {
        if (!isPenMode && !isEraserMode) return;
        e.preventDefault(); e.stopPropagation();

        const pathId = `path-${myPeerId}-${Date.now()}`;
        const newPathData = {
            id: pathId,
            color: '#000000',
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
        window.history.replaceState(null, null, ' ');
        // ... (ファイルリスト表示ロジックは元のコードから)
    }
    
    function createNewFile() {
        // ... (元のロジック)
    }
    
    async function openFile(fileId) {
        currentFileId = fileId;
        fileManagerOverlay.classList.add('hidden');
        mainApp.classList.remove('hidden');

        const urlHash = window.location.hash.substring(1);
        const hostIdInUrl = urlHash.split('/')[1];

        if (hostIdInUrl) {
            console.log("Joining as a guest. Waiting for host data.");
            loadStateFromObject(createEmptyBoard());
        } else {
            console.log("Opening as host/solo. Loading from local DB.");
            const localData = await db.get(currentFileId);
            loadStateFromObject(localData);
        }

        initializePeer();
    }
    
    backToFilesBtn.addEventListener('click', showFileManager);
    createNewFileBtn.addEventListener('click', createNewFile);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    
    function redrawCanvas() { /* ... */ }
    function applyTransform() { /* ... */ }
    function updateZoomDisplay() { /* ... */ }
    function getCanvasCoordinates(e) { /* ... */ }
    function getEventCoordinates(e) { /* ... */ }
    function drawAllConnectors() { /* ... */ }
    function updateMinimap() { /* ... */ }

    // --- 初期化処理 ---
    if (localStorage.getItem('plottia-dark-mode') === '1') { document.body.classList.add('dark-mode'); }
    showFileManager();

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

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
            alert(`接続エラーが発生しました: ${err.type}。ページをリロードしてみてください。`);
        });
    }

    function joinRoom() {
        const urlHash = window.location.hash.substring(1);
        const hostIdInUrl = urlHash.split('/')[1]; // roomId/hostId

        if (hostIdInUrl) {
            hostPeerId = hostIdInUrl;
            isHost = false;
            console.log('Attempting to connect to host:', hostPeerId);
            const conn = peer.connect(hostPeerId, { reliable: true });
            setupConnection(conn);
        } else {
            hostPeerId = myPeerId;
            isHost = true;
            console.log('I am the host.');
            const newUrl = `#${currentFileId}/${myPeerId}`;
            window.history.replaceState(null, null, newUrl);
            connectedUsers[myPeerId] = { id: myPeerId };
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
            console.error('Connection error:', err);
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
                if (myPeerId === newHostId) {
                    isHost = true;
                    hostPeerId = myPeerId;
                    const newUrl = `#${currentFileId}/${myPeerId}`;
                    window.history.replaceState(null, null, newUrl);
                    console.log('I am the new host.');
                    alert('あなたが新しいホストになりました。');
                    broadcast({ type: 'host-changed', payload: { newHostId: myPeerId } });
                }
                 // 他のクライアントはhost-changedメッセージを受け取って再接続する
            } else {
                isHost = true;
                hostPeerId = myPeerId;
            }
        }
        
        if (isHost) {
             broadcast({ type: 'user-left', payload: { id: peerId, users: connectedUsers } });
        }
        updateUserListUI();
    }

    function broadcast(data) {
        if (!isHost) return;
        console.log('Broadcasting:', data.type);
        for (const peerId in connections) {
            if (connections[peerId] && connections[peerId].open) {
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
            alert("ホストとの接続が切れています。操作を送信できません。");
        }
    }
    
    function handleReceivedData(data, fromPeerId) {
        // console.log('Data received:', data.type, 'from', fromPeerId);
        switch (data.type) {
            case 'initial-state':
                hostPeerId = data.payload.hostId;
                connectedUsers = data.payload.users;
                connectedUsers[myPeerId] = { id: myPeerId }; // 自分を追加
                updateUserListUI();
                handleOfflineConflict(data.payload.boardData);
                break;
            case 'operation':
                if (isHost) {
                    applyOperation(data.payload);
                    broadcast(data, fromPeerId); // 自分以外の全員に転送
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
                isHost = false;
                hostPeerId = data.payload.newHostId;
                console.log('New host is', hostPeerId, 'Reconnecting...');
                alert(`新しいホスト (${hostPeerId.substring(0,4)}) に再接続します。`);
                const conn = peer.connect(hostPeerId, { reliable: true });
                setupConnection(conn);
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
        const operation = { type, payload };
        
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
            
            // ... 他の CREATE_* 操作も同様に ...

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
            
            case 'END_DRAW':
                // Do nothing
                break;
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
                        } catch (err) { resolve(null); }
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
        if (!currentFileId) return;
        boardData.version = Date.now(); // 保存のたびにバージョンを更新
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
        if (localState && localState.version < remoteState.version) {
            conflictOverlay.classList.remove('hidden');

            const handleResolution = (choice) => async () => {
                conflictOverlay.classList.add('hidden');
                if (choice === 'overwrite') {
                    loadStateFromObject(remoteState);
                    await db.set(currentFileId, remoteState);
                } else if (choice === 'fork') {
                    const newName = `${getFileMetadata().find(f=>f.id===currentFileId).name} (オフラインコピー)`;
                    const newFile = { id: `plottia_board_${Date.now()}`, name: newName, lastModified: Date.now() };
                    let metadata = getFileMetadata();
                    metadata.push(newFile);
                    saveFileMetadata(metadata);
                    await db.set(newFile.id, localState);
                    loadStateFromObject(remoteState);
                    await db.set(currentFileId, remoteState);
                    alert(`「${newName}」としてオフラインの変更を保存しました。`);
                } else if (choice === 'force') {
                    broadcast({ type: 'initial-state', payload: { boardData: localState, users: connectedUsers, hostId: hostPeerId } });
                    loadStateFromObject(localState);
                    await db.set(currentFileId, localState);
                }
            };
            
            conflictOverwriteBtn.onclick = handleResolution('overwrite');
            conflictForkBtn.onclick = handleResolution('fork');
            conflictForceBtn.onclick = handleResolution('force');

        } else {
            loadStateFromObject(remoteState);
            await db.set(currentFileId, remoteState);
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
        // ... Other elements ...

        myUndoStack = [];
        myRedoStack = [];
        updateUndoRedoButtons();
        redrawCanvas();
        applyTransform();
    }


    // =================================================================
    // 5. 各オブジェクトの操作 (操作ベース同期に対応)
    // =================================================================
    
    function createNote(data = {}, fromRemote = false) {
        if (!fromRemote) {
            const payload = {
                id: `note-${myPeerId}-${Date.now()}`,
                x: `${((window.innerWidth/2)-110-boardData.board.panX)/boardData.board.scale}px`,
                y: `${((window.innerHeight/2)-110-boardData.board.panY)/boardData.board.scale}px`,
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
        note.className = 'note';
        note.id = data.id;
        // ... (DOM生成ロジックは元のコードとほぼ同じ)
        note.style.left = data.x;
        note.style.top = data.y;
        note.innerHTML = `...`; // 省略
        
        const deleteBtn = note.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            const payload = { elementIds: [note.id], deletedAt: Date.now() };
            generateOperation('MARK_AS_DELETED', payload, {
                original: { type: 'MARK_AS_DELETED', payload: payload },
                inverse: { type: 'RESTORE_DELETED', payload: { elementIds: [note.id] } }
            });
        });

        // ... 他のイベントリスナ (移動、リサイズ、テキスト編集) も
        // `generateOperation` を呼ぶように変更する ...

        objectContainer.appendChild(note);
    }
    
    addNoteBtn.addEventListener('click', () => createNote());

    // =================================================================
    // 6. 手描き機能 (チャンク分割同期に対応)
    // =================================================================

    const onDrawingLayerDown = e => {
        if (!isPenMode && !isEraserMode) return;
        e.preventDefault(); e.stopPropagation();

        const pathId = `path-${myPeerId}-${Date.now()}`;
        const newPathData = {
            id: pathId,
            color: isEraserMode ? '#000000' : '#000000', // 色は後で変更可能に
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
        // ... (元のshowFileManagerのリスト表示ロジック)
    }
    
    function createNewFile() {
        // ... (元のcreateNewFileロジック)
        const newFile = { id: `plottia_board_${Date.now()}`, name: "新規", lastModified: Date.now() };
        // ...
        db.set(newFile.id, createEmptyBoard());
        openFile(newFile.id);
    }
    
    async function openFile(fileId) {
        currentFileId = fileId;
        fileManagerOverlay.classList.add('hidden');
        mainApp.classList.remove('hidden');

        const localData = await db.get(currentFileId);
        loadStateFromObject(localData);

        initializePeer();
    }
    
    backToFilesBtn.addEventListener('click', showFileManager);
    createNewFileBtn.addEventListener('click', createNewFile);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    
    // ... 他の既存関数 (redrawCanvas, applyTransform etc.)
    // これらは boardData を参照するように適宜修正が必要です。
    // 以下に主要なものを記載。
    
    function redrawCanvas() {
        ctx.clearRect(0, 0, drawingLayer.width, drawingLayer.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        boardData.paths?.forEach(path => {
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

    function applyTransform() {
        if (boardData.board) {
            board.style.transform = `translate(${boardData.board.panX}px, ${boardData.board.panY}px) scale(${boardData.board.scale})`;
            updateZoomDisplay();
            drawAllConnectors();
            updateMinimap();
        }
    }
    
    function updateZoomDisplay() {
        zoomDisplay.textContent = `${Math.round(boardData.board.scale * 100)}%`;
    }
    
    function getCanvasCoordinates(e) {
        const coords = getEventCoordinates(e);
        return {
            x: (coords.x - boardData.board.panX) / boardData.board.scale,
            y: (coords.y - boardData.board.panY) / boardData.board.scale
        };
    }
    function getEventCoordinates(e) { if (e.touches && e.touches.length > 0) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; } return { x: e.clientX, y: e.clientY }; }
    function drawAllConnectors() { /* 元のコードのままでOK */ }
    function updateMinimap() { /* 元のコードのままでOK */ }


    // --- 初期化処理 ---
    if (localStorage.getItem('plottia-dark-mode') === '1') { document.body.classList.add('dark-mode'); }
    showFileManager();
});

const errorOverlay = document.getElementById('error-overlay');
const errorDetails = document.getElementById('error-details');
const copyErrorBtn = document.getElementById('copy-error-btn');
const closeErrorBtn = document.getElementById('close-error-btn');

/**
 * エラーモーダルを表示する関数
 * @param {string} errorMessage - 表示するエラーメッセージ
 */
function showErrorModal(errorMessage) {
    if (errorOverlay && errorDetails) {
        errorDetails.value = errorMessage;
        errorOverlay.classList.remove('hidden');
    } else {
        // モーダルが何らかの理由で存在しない場合のフォールバック
        console.error("CRITICAL ERROR (modal not found):\n", errorMessage);
        prompt("エラーが発生しました。詳細をコピーしてください:", errorMessage);
    }
}

copyErrorBtn.addEventListener('click', () => {
    errorDetails.select();
    navigator.clipboard.writeText(errorDetails.value)
        .then(() => {
            const originalText = copyErrorBtn.innerHTML;
            copyErrorBtn.innerHTML = '<i class="fas fa-check"></i> コピーしました';
            setTimeout(() => {
                copyErrorBtn.innerHTML = originalText;
            }, 2000);
        })
        .catch(err => {
            alert('コピーに失敗しました。');
            console.error('Failed to copy error details:', err);
        });
});

closeErrorBtn.addEventListener('click', () => {
    errorOverlay.classList.add('hidden');
});


// 捕捉されなかった通常のJavaScriptエラーを捕捉
window.onerror = function(message, source, lineno, colno, error) {
    let formattedMessage = "予期せぬJavaScriptエラーが発生しました。\n\n";
    formattedMessage += "メッセージ: " + message + "\n";
    formattedMessage += "ファイル: " + (source || '不明') + "\n";
    formattedMessage += "行番号: " + (lineno || '不明') + "\n";
    formattedMessage += "列番号: " + (colno || '不明') + "\n";
    if (error && error.stack) {
        formattedMessage += "\nスタックトレース:\n" + error.stack;
    }

    showErrorModal(formattedMessage);
    
    // デフォルトのエラー処理（コンソールへの出力など）を抑制する場合はtrueを返す
    return true; 
};

// Promiseで捕捉されなかったエラーを捕捉
window.addEventListener('unhandledrejection', function(event) {
    let formattedMessage = '捕捉されなかったPromiseのエラーが発生しました。\n\n';
    if (event.reason instanceof Error) {
        formattedMessage += "エラー名: " + event.reason.name + "\n";
        formattedMessage += "メッセージ: " + event.reason.message + "\n";
        if (event.reason.stack) {
            formattedMessage += "\nスタックトレース:\n" + event.reason.stack;
        }
    } else {
        formattedMessage += "理由: " + String(event.reason);
    }
    
    showErrorModal(formattedMessage);
});
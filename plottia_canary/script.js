document.addEventListener("DOMContentLoaded", () => {
  // --- 要素取得 ---
  const fileManagerOverlay = document.getElementById("file-manager-overlay");
  const fileList = document.getElementById("file-list");
  const createNewFileBtn = document.getElementById("create-new-file-btn");
  const createFromTemplateBtn = document.getElementById(
    "create-from-template-btn",
  );
  const templateOverlay = document.getElementById("template-overlay");
  const templateModal = document.getElementById("template-modal");
  const builtinTemplatesTab = document.getElementById("builtin-templates-tab");
  const customTemplatesTab = document.getElementById("custom-templates-tab");
  const builtinTemplatesGrid = document.getElementById("builtin-templates");
  const customTemplatesGrid = document.getElementById("custom-templates");
  const closeTemplateBtn = document.getElementById("close-template-btn");
  const saveTemplateBtn = document.getElementById("save-template-btn");
  const mainApp = document.getElementById("main-app");
  const backToFilesBtn = document.getElementById("back-to-files-btn");
  const board = document.getElementById("board");
  let svgLayer = document.getElementById("connector-svg-layer");
  const addNoteBtn = document.getElementById("add-note-btn");
  const addSectionBtn = document.getElementById("add-section-btn");
  const addTextBtn = document.getElementById("add-text-btn");
  const addShapeSquareBtn = document.getElementById("add-shape-square-btn");
  const addShapeCircleBtn = document.getElementById("add-shape-circle-btn");
  const addShapeDiamondBtn = document.getElementById("add-shape-diamond-btn");
  const addConnectorBtn = document.getElementById("add-connector-btn");
  const addImageBtn = document.getElementById("add-image-btn");
  const imageFileInput = document.getElementById("image-file-input");
  const penToolBtn = document.getElementById("pen-tool-btn");
  const eraserToolBtn = document.getElementById("eraser-tool-btn");
  const exportBtn = document.getElementById("export-btn");
  const imageExportBtn = document.getElementById("image-export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFileInput = document.getElementById("import-file-input");
  const cleanupBtn = document.getElementById("cleanup-btn");
  const zoomDisplay = document.getElementById("zoom-display");
  const zoomResetBtn = document.getElementById("zoom-reset-btn");
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  const darkModeBtn = document.getElementById("dark-mode-btn");
  const minimap = document.getElementById("minimap");
  const guideContainer = document.getElementById("guide-container");
  const strokeWidthSlider = document.getElementById("stroke-width-slider");
  const strokeWidthDisplay = document.getElementById("stroke-width-display");
  const drawingLayer = document.getElementById("drawing-layer");
  const objectContainer = document.getElementById("object-container");
  const sectionContainer = document.getElementById("section-container");
  const ctx = drawingLayer.getContext("2d");
  drawingLayer.width = 5000;
  drawingLayer.height = 5000;
  const shareRoomBtn = document.getElementById("share-room-btn");
  const qrCodeBtn = document.getElementById("qr-code-btn");
  const userList = document.getElementById("user-list");
  const conflictOverlay = document.getElementById("conflict-overlay");
  const conflictOverwriteBtn = document.getElementById(
    "conflict-resolve-overwrite",
  );
  const conflictForkBtn = document.getElementById("conflict-resolve-fork");
  const conflictForceBtn = document.getElementById("conflict-resolve-force");
  const errorOverlay = document.getElementById("error-overlay");
  const errorDetails = document.getElementById("error-details");
  const copyErrorBtn = document.getElementById("copy-error-btn");
  const closeErrorBtn = document.getElementById("close-error-btn");
  // QR Code modal elements
  const qrCodeOverlay = document.getElementById("qr-code-overlay");
  const qrCodeCanvas = document.getElementById("qr-code-canvas");
  const copyQrLinkBtn = document.getElementById("copy-qr-link-btn");
  const downloadQrBtn = document.getElementById("download-qr-btn");
  const closeQrBtn = document.getElementById("close-qr-btn");

  // --- グローバル変数 ---
  let currentFileId = null;
  // boardData is the single source of truth for the board state.
  let boardData = createEmptyBoard();
  let selectedElement = null;
  let isConnectorMode = false,
    connectorStartId = null;
  let isPenMode = false,
    isEraserMode = false;
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
  const noteColors = ["#ffc", "#cfc", "#ccf", "#fcc", "#cff", "#fff"];
  const sectionColors = [
    "rgba(255, 0, 0, 0.1)",
    "rgba(0, 0, 255, 0.1)",
    "rgba(0, 128, 0, 0.1)",
    "rgba(128, 0, 128, 0.1)",
    "rgba(255, 165, 0, 0.1)",
    "rgba(220, 220, 220, 0.5)",
  ];
  const shapeColors = [
    "#ffffff",
    "#ffadad",
    "#ffd6a5",
    "#fdffb6",
    "#caffbf",
    "#9bf6ff",
    "#a0c4ff",
    "#bdb2ff",
    "#ffc6ff",
  ];

  // =================================================================
  // Hyperlink parsing utility
  // =================================================================
  function parseLinks(text) {
    // Convert URLs to clickable links
    return text.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (match) => {
      const url = match.startsWith("www.") ? `http://${match}` : match;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
  }

  // =================================================================
  // 画像圧縮ユーティリティ
  // =================================================================
  function compressImage(file, maxWidth = 800, maxHeight = 600, quality = 0.8) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = function () {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;
          if (width > height) {
            width = maxWidth;
            height = maxWidth / aspectRatio;
          } else {
            height = maxHeight;
            width = maxHeight * aspectRatio;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw compressed image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to compressed data URL
        const isPng = file.type === "image/png";
        const outputType = isPng ? "image/png" : "image/jpeg";
        const outputQuality = isPng ? 1 : quality;
        const compressedDataUrl = canvas.toDataURL(outputType, outputQuality);

        console.log(
          `Image compressed: ${file.size} bytes -> ${
            Math.round(
              compressedDataUrl.length * 0.75,
            )
          } bytes`,
        );
        resolve(compressedDataUrl);
      };

      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      reader.readAsDataURL(file);
    });
  }

  function compressDrawingData(paths) {
    // Remove redundant points in drawing paths to reduce data size
    return paths.map((path) => ({
      ...path,
      points: path.points.filter((point, index) => {
        if (index === 0 || index === path.points.length - 1) return true;
        const prev = path.points[index - 1];
        const next = path.points[index + 1];

        // Remove points that are very close to the line between prev and next
        const distance = Math.abs(
          (next.y - prev.y) * point.x -
            (next.x - prev.x) * point.y +
            next.x * prev.y -
            next.y * prev.x,
        ) / Math.sqrt((next.y - prev.y) ** 2 + (next.x - prev.x) ** 2);

        return distance > 2; // Keep points that deviate more than 2 pixels
      }),
    }));
  }

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
      showErrorModal(
        "PeerJSの初期化に失敗しました。ページをリロードしてください。\n" +
          e.message,
      );
      return;
    }

    peer.on("open", (id) => {
      myPeerId = id;
      console.log("My Peer ID is:", myPeerId);
      joinRoom();

      if (isHost) {
        copyShareLink();
      }
    });

    peer.on("connection", (conn) => {
      console.log("Incoming connection from", conn.peer);
      setupConnection(conn);
    });

    peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      // Don't show modal for common 'peer-unavailable' error.
      if (err.type !== "peer-unavailable") {
        showGuestConnectionStatus(
          `接続エラーが発生しました: ${err.type}。ページをリロードしてみてください。`,
          "error",
        );
      } else {
        showGuestConnectionStatus(
          "ホストに接続できませんでした。URLが正しいか確認してください。",
          "error",
        );
        setTimeout(() => showFileManager(), 3000);
      }
    });
  }

  function startOnlineMode() {
    // すでにオンラインの場合は、再度リンクをコピーするだけ
    if (peer && !peer.destroyed) {
      if (isHost) {
        copyShareLink();
        qrCodeBtn.classList.remove("hidden");
      } else {
        alert("すでにゲストとして接続中です。");
      }
      return;
    }

    // ソロモードからオンラインモードに切り替える場合、ホストになる
    const urlHash = window.location.hash.substring(1);
    const [fileIdFromUrl, hostIdInUrl] = urlHash.split("/");

    // URLにホストIDが含まれていない場合（ソロモード）は、ホストになる予定として設定
    if (!hostIdInUrl) {
      isHost = true;
    }

    alert("オンライン共有モードを開始します...");
    initializePeer();
    // ホスト時はQRコードボタンを表示
    qrCodeBtn.classList.remove("hidden");
  }

  function copyShareLink() {
    if (!currentFileId || !hostPeerId) return;
    const url =
      `${window.location.origin}${window.location.pathname}#${currentFileId}/${hostPeerId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => alert("招待リンクをクリップボードにコピーしました。"))
      .catch(() => alert("リンクのコピーに失敗しました。"));
  }

  function showQRCode() {
    if (!currentFileId || !hostPeerId) return;
    const url =
      `${window.location.origin}${window.location.pathname}#${currentFileId}/${hostPeerId}`;

    // qrcodejs（window.QRCode）を使って一時的なdivに生成し、canvasへ転写
    // 既存のcanvasをクリア
    const ctx = qrCodeCanvas.getContext("2d");
    ctx.clearRect(0, 0, qrCodeCanvas.width, qrCodeCanvas.height);

    const tempDiv = document.createElement("div");
    tempDiv.style.display = "none";
    document.body.appendChild(tempDiv);
    try {
      const qr = new window.QRCode(tempDiv, {
        text: url,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H,
      });
      // 画像が生成されるまで待つ
      setTimeout(() => {
        const img = tempDiv.querySelector("img") ||
          tempDiv.querySelector("canvas");
        if (img) {
          // img要素の場合はcanvasに描画
          if (img.tagName === "IMG") {
            const image = new window.Image();
            image.onload = function () {
              qrCodeCanvas.width = 256;
              qrCodeCanvas.height = 256;
              ctx.clearRect(0, 0, 256, 256);
              ctx.drawImage(image, 0, 0, 256, 256);
            };
            image.src = img.src;
          } else if (img.tagName === "CANVAS") {
            qrCodeCanvas.width = 256;
            qrCodeCanvas.height = 256;
            ctx.clearRect(0, 0, 256, 256);
            ctx.drawImage(img, 0, 0, 256, 256);
          }
        }
        document.body.removeChild(tempDiv);
      }, 100);
    } catch (e) {
      document.body.removeChild(tempDiv);
      alert("QRコードの生成に失敗しました");
    }
    // モーダルを開く
    qrCodeOverlay.classList.remove("hidden");
  }

  function downloadQRCode() {
    const link = document.createElement("a");
    link.download = `plottia-invitation-${currentFileId}.png`;
    link.href = qrCodeCanvas.toDataURL();
    link.click();
  }

  function joinRoom() {
    const urlHash = window.location.hash.substring(1);
    const [fileIdFromUrl, hostIdInUrl] = urlHash.split("/");

    // オンライン時のみfileIdをチェック。ソロモード（URLにIDなし）は何もしない。
    if (fileIdFromUrl && currentFileId && currentFileId !== fileIdFromUrl) {
      console.warn("URL fileId does not match currentFileId. Re-opening file.");
      openFile(fileIdFromUrl);
      return;
    }

    if (hostIdInUrl && hostIdInUrl !== myPeerId) {
      hostPeerId = hostIdInUrl;
      isHost = false;
      console.log("Attempting to connect to host:", hostPeerId);
      const conn = peer.connect(hostIdInUrl, { reliable: true });
      setupConnection(conn);

      // Set a timeout for connection attempts
      const connectionTimeout = setTimeout(() => {
        if (!connections[hostIdInUrl] || !connections[hostIdInUrl].open) {
          console.log("Connection timeout - host may be offline");
          showGuestConnectionStatus(
            "ホストが見つかりません。ホストがオンラインか確認してください。",
            "error",
          );
          setTimeout(() => showFileManager(), 5000);
        }
      }, 15000); // 15 second timeout

      // Clear timeout if connection succeeds
      if (conn) {
        conn.on("open", () => {
          clearTimeout(connectionTimeout);
        });
      }
    } else {
      hostPeerId = myPeerId;
      isHost = true;
      console.log("I am the host.");
      const newUrl = `#${currentFileId}/${myPeerId}`;
      window.history.replaceState(null, null, newUrl);
      connectedUsers = { [myPeerId]: { id: myPeerId } };
      updateUserListUI();
    }
  }

  function showFileManager() {
    if (peer && !peer.destroyed) peer.destroy();
    peer = null;

    // Reset host state and hide QR UI when returning to file manager
    hostPeerId = null;
    isHost = false;
    qrCodeBtn.classList.add("hidden");
    qrCodeOverlay.classList.add("hidden");

    currentFileId = null;
    // …rest of showFileManager…
  }

  function setupConnection(conn) {
    conn.on("open", () => {
      console.log("Connection established with", conn.peer);
      connections[conn.peer] = conn;

      if (isHost) {
        conn.send({
          type: "initial-state",
          payload: {
            boardData: getCurrentState(),
            users: connectedUsers,
            hostId: hostPeerId,
          },
        });
        connectedUsers[conn.peer] = { id: conn.peer };
        broadcast({
          type: "user-joined",
          payload: { id: conn.peer, users: connectedUsers },
        });
        updateUserListUI();

        // Show success message to host
        showGuestConnectionStatus(
          `ゲスト ${conn.peer.substring(0, 8)}... が参加しました`,
          "success",
        );
      } else {
        // Show success message to guest
        showGuestConnectionStatus("ホストに接続しました！", "success");
      }
    });

    conn.on("data", (data) => handleReceivedData(data, conn.peer));
    conn.on("close", () => handleDisconnect(conn.peer));
    conn.on("error", (err) => {
      console.error("Connection error with " + conn.peer + ":", err);

      // Show error message
      if (isHost) {
        showGuestConnectionStatus(
          `ゲストとの接続でエラーが発生しました: ${err.type}`,
          "error",
        );
      } else {
        showGuestConnectionStatus(
          `ホストとの接続でエラーが発生しました: ${err.type}`,
          "error",
        );
      }

      handleDisconnect(conn.peer);
    });
  }

  function handleDisconnect(peerId) {
    console.log("Connection closed with", peerId);
    delete connections[peerId];
    delete connectedUsers[peerId];

    if (peerId === hostPeerId) {
      showGuestConnectionStatus(
        "ホストとの接続が切れました。ファイルマネージャーに戻ります。",
        "error",
      );
      setTimeout(() => showFileManager(), 2000);
      return;
    }

    if (isHost) {
      broadcast({
        type: "user-left",
        payload: { id: peerId, users: connectedUsers },
      });
      showGuestConnectionStatus(
        `ゲスト ${peerId.substring(0, 8)}... が退出しました`,
        "info",
      );
    }
    updateUserListUI();
  }

  function broadcast(data, excludePeerId = null) {
    if (!isHost) return;
    for (const peerId in connections) {
      if (
        peerId !== excludePeerId &&
        connections[peerId] &&
        connections[peerId].open
      ) {
        connections[peerId].send(data);
      }
    }
  }

  function sendOperationToHost(operation) {
    const data = { type: "operation", payload: operation };
    if (isHost) {
      // Host applies locally and broadcasts to all clients
      applyOperation(operation);
      broadcast(data);
    } else if (
      hostPeerId &&
      peer &&
      connections[hostPeerId] &&
      connections[hostPeerId].open
    ) {
      // Client sends to host
      connections[hostPeerId].send(data);
    } else if (hostPeerId && peer) {
      // オンラインモード中のみ警告
      console.error("Host connection not available. Operation might be lost.");
      alert("ホストとの接続が切断されました。操作を同期できません。");
    }
    // ソロモード時（hostPeerId/peer未設定）は何もしない
  }

  function handleReceivedData(data, fromPeerId) {
    switch (data.type) {
      case "initial-state":
        hostPeerId = data.payload.hostId;
        connectedUsers = data.payload.users;
        connectedUsers[myPeerId] = { id: myPeerId };
        updateUserListUI();
        handleOfflineConflict(data.payload.boardData);

        // Show success message for guest when receiving initial state
        if (!isHost) {
          showGuestConnectionStatus(
            "ホストから初期データを受信しました",
            "success",
          );
        }
        break;
      case "operation":
        if (isHost) {
          // Host received an operation from a client
          applyOperation(data.payload);
          broadcast(data, fromPeerId); // Relay to other clients
        } else {
          // Client received an operation from the host
          applyOperation(data.payload);
        }
        break;
      case "user-joined":
      case "user-left":
        connectedUsers = data.payload.users;
        updateUserListUI();
        break;
    }
  }

  function updateUserListUI() {
    document.getElementById("user-list-label").textContent = "接続中:";
    userList.innerHTML = "";
    Object.keys(connectedUsers)
      .sort()
      .forEach((id) => {
        const li = document.createElement("li");
        li.textContent = id.substring(0, 4);
        li.title = id;
        if (id === myPeerId) li.classList.add("is-me");
        if (id === hostPeerId) li.classList.add("is-host");
        userList.appendChild(li);
      });
  }

  shareRoomBtn.addEventListener("click", startOnlineMode);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + Q for QR code (when hosting)
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key === "q" &&
      isHost &&
      !qrCodeBtn.classList.contains("hidden")
    ) {
      e.preventDefault();
      showQRCode();
    }

    // Ctrl/Cmd + Shift + C for copy share link (when hosting)
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      e.key === "C" &&
      isHost &&
      hostPeerId
    ) {
      e.preventDefault();
      copyShareLink();
    }
  });

  // =================================================================
  // 2. 状態管理 & 操作ベース同期
  // =================================================================

  function generateOperation(type, payload, undoData = null) {
    const operation = {
      type,
      payload,
      sender: myPeerId,
      timestamp: Date.now(),
    };
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
    const collections = [
      "notes",
      "sections",
      "textBoxes",
      "shapes",
      "paths",
      "connectors",
      "images",
    ];
    for (const key of collections) {
      if (boardData[key]) {
        const item = boardData[key].find((i) => i.id === id);
        if (item) return { item, collection: key };
      }
    }
    return null;
  }

  const creationFunctions = {
    NOTE: createNote,
    SECTION: createSection,
    TEXTBOX: createTextBox,
    SHAPE: createShape,
    IMAGE: createImage,
  };

  function applyOperation(op) {
    if (!op || !op.type || !op.payload) return;

    let findResult = op.payload.id ? findElementData(op.payload.id) : null;
    let itemData = findResult ? findResult.item : null;
    let element = op.payload.id ? document.getElementById(op.payload.id) : null;

    switch (op.type) {
      case "CREATE_NOTE":
      case "CREATE_SECTION":
      case "CREATE_TEXTBOX":
      case "CREATE_SHAPE":
      case "CREATE_IMAGE":
        // --- FIXED: Correct pluralization for textBoxes ---
        let collectionName = `${op.type.split("_")[1].toLowerCase()}s`;
        if (collectionName === "textboxs") {
          collectionName = "textBoxes";
        }
        // --- END FIX ---
        if (
          boardData[collectionName] &&
          !boardData[collectionName].some((item) => item.id === op.payload.id)
        ) {
          boardData[collectionName].push(op.payload);
          const itemType = op.type.split("_")[1]; // "NOTE", "SECTION" などを取得
          const createFn = creationFunctions[itemType];
          if (createFn) {
            createFn(op.payload, true);
          }
        }
        break;

      case "MOVE_ELEMENTS":
        op.payload.elements.forEach((movedEl) => {
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

      case "RESIZE_ELEMENT":
        if (itemData && element) {
          itemData.width = op.payload.width;
          itemData.height = op.payload.height;
          element.style.width = op.payload.width;
          element.style.height = op.payload.height;
          drawAllConnectors();
        }
        break;

      case "UPDATE_CONTENT":
        if (itemData && element) {
          itemData.content = op.payload.content;
          if (findResult.collection === "notes") {
            const processedContent = parseLinks(
              op.payload.content.replace(/\n/g, "<br>"),
            );
            element.querySelector(".note-view").innerHTML = processedContent;
            element.querySelector(".note-content").value = op.payload.content;
          } else if (findResult.collection === "textBoxes") {
            const processedContent = parseLinks(op.payload.content);
            element.querySelector(".text-content").innerHTML = processedContent;
          } else if (findResult.collection === "shapes") {
            element.querySelector(".shape-label").innerHTML =
              op.payload.content;
          } else if (findResult.collection === "sections") {
            element.querySelector(".section-title").textContent =
              op.payload.content;
          }
        }
        break;

      case "CHANGE_COLOR":
        if (itemData && element) {
          itemData.color = op.payload.color;
          if (findResult.collection === "notes") {
            element.querySelector(".note-header").style.backgroundColor =
              op.payload.color;
            element.querySelector(".note-body").style.backgroundColor =
              op.payload.color;
          } else if (findResult.collection === "sections") {
            element.style.backgroundColor = op.payload.color;
          } else if (findResult.collection === "shapes") {
            element.querySelector(".shape-visual").style.backgroundColor =
              op.payload.color;
          }
        }
        break;

      case "DELETE_ELEMENTS":
        op.payload.elementIds.forEach((id) => {
          const elToRemove = document.getElementById(id);
          if (elToRemove) elToRemove.remove();

          const res = findElementData(id);
          if (res) {
            boardData[res.collection] = boardData[res.collection].filter(
              (item) => item.id !== id,
            );
          }
        });
        // Also remove related connectors
        boardData.connectors = boardData.connectors.filter(
          (c) =>
            !op.payload.elementIds.includes(c.startId) &&
            !op.payload.elementIds.includes(c.endId),
        );
        drawAllConnectors();
        break;

      case "START_DRAW":
        if (!boardData.paths.some((p) => p.id === op.payload.id)) {
          boardData.paths.push({ ...op.payload, points: [] });
        }
        break;
      case "APPEND_POINTS":
        const path = boardData.paths.find((p) => p.id === op.payload.pathId);
        if (path) {
          path.points.push(...op.payload.points);
          redrawCanvas();
        }
        break;
      case "END_DRAW":
        // No specific action needed, the path is complete.
        break;

      case "TOGGLE_LOCK":
        if (itemData && element) {
          itemData.isLocked = op.payload.isLocked;
          element.classList.toggle("locked", op.payload.isLocked);
          const icon = element.querySelector(".lock-btn i");
          if (icon) {
            icon.className = op.payload.isLocked
              ? "fas fa-lock"
              : "fas fa-unlock";
          }
        }
        break;

      case "CREATE_CONNECTOR":
        if (!boardData.connectors.some((c) => c.id === op.payload.id)) {
          boardData.connectors.push(op.payload);
          drawAllConnectors();
        }
        break;
      case "DELETE_CONNECTOR":
        boardData.connectors = boardData.connectors.filter(
          (c) => c.id !== op.payload.id,
        );
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
    _db: null,
    _dbName: "PlottiaDB",
    _storeName: "boards",
    async _getDB() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this._dbName, 1);
        request.onerror = (e) => reject("IndexedDB Error:", e.target.error);
        request.onsuccess = (e) => {
          this._db = e.target.result;
          resolve(this._db);
        };
        request.onupgradeneeded = (e) => {
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
          // Use compression if pako is available, otherwise store as JSON string
          let dataToStore;
          if (typeof pako !== "undefined") {
            dataToStore = pako.deflate(JSON.stringify(value));
          } else {
            dataToStore = JSON.stringify(value);
          }
          const transaction = db.transaction(this._storeName, "readwrite");
          transaction.objectStore(this._storeName).put(dataToStore, key);
          transaction.oncomplete = () => resolve();
          transaction.onerror = (e) => reject("DB Set Error:", e.target.error);
        } catch (err) {
          reject(err);
        }
      });
    },
    async get(key) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(this._storeName, "readonly")
          .objectStore(this._storeName)
          .get(key);
        request.onsuccess = (e) => {
          if (e.target.result) {
            try {
              // Try to decompress if pako is available and data looks compressed
              let jsonString;
              if (
                typeof pako !== "undefined" &&
                e.target.result instanceof Uint8Array
              ) {
                jsonString = pako.inflate(e.target.result, { to: "string" });
              } else {
                jsonString = e.target.result;
              }
              resolve(JSON.parse(jsonString));
            } catch (err) {
              console.error(
                `[IndexedDB] Failed to parse data for key "${key}". Data might be corrupted.`,
                err,
              );
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        request.onerror = (e) => reject("DB Get Error:", e.target.error);
      });
    },
    async remove(key) {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this._storeName, "readwrite");
        transaction.objectStore(this._storeName).delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject("DB Remove Error:", e.target.error);
      });
    },
  };

  async function saveState() {
    if (!currentFileId || !boardData) return;
    boardData.version = Date.now();
    let metadata = getFileMetadata();
    const fileIndex = metadata.findIndex((f) => f.id === currentFileId);
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
      console.log(
        "Conflict detected. Local:",
        localState.version,
        "Remote:",
        remoteState.version,
      );
      conflictOverlay.classList.remove("hidden");
      const handleResolution = (choice) => async () => {
        conflictOverlay.classList.add("hidden");
        if (choice === "overwrite") {
          loadStateFromObject(remoteState);
          await db.set(currentFileId, remoteState);
        } else if (choice === "fork") {
          const metadata = getFileMetadata();
          const currentFile = metadata.find((f) => f.id === currentFileId) || {
            name: "無題",
          };
          const newName = `${currentFile.name} (オフラインコピー)`;
          const newFile = {
            id: `plottia_board_${Date.now()}`,
            name: newName,
            lastModified: Date.now(),
          };
          metadata.push(newFile);
          saveFileMetadata(metadata);
          await db.set(newFile.id, localState);
          loadStateFromObject(remoteState);
          await db.set(currentFileId, remoteState);
          alert(`「${newName}」としてオフラインの変更を保存しました。`);
        } else if (choice === "force") {
          boardData = localState;
          await saveState(); // This updates version number
          if (isHost) {
            broadcast({
              type: "initial-state",
              payload: {
                boardData: getCurrentState(),
                users: connectedUsers,
                hostId: hostPeerId,
              },
            });
          }
          loadStateFromObject(localState);
        }
      };
      conflictOverwriteBtn.onclick = handleResolution("overwrite");
      conflictForkBtn.onclick = handleResolution("fork");
      conflictForceBtn.onclick = handleResolution("force");
    } else {
      console.log("No conflict or local is newer.");
      // If we are host and our version is newer, send it to the new comer
      if (isHost) {
        loadStateFromObject(localState);
      }
    }
  }

  function createEmptyBoard() {
    return {
      notes: [],
      sections: [],
      textBoxes: [],
      shapes: [],
      paths: [],
      connectors: [],
      images: [],
      board: {
        panX: 0,
        panY: 0,
        scale: 1.0,
        noteZIndexCounter: 1000,
        sectionZIndexCounter: 1,
      },
      version: Date.now(),
    };
  }

  // Built-in templates
  function getBuiltInTemplates() {
    return {
      mindmap: {
        name: "マインドマップ",
        description: "アイデアを分類して整理できます",
        icon: "fas fa-project-diagram",
        data: {
          notes: [
            {
              id: "central-topic",
              x: "400px",
              y: "300px",
              width: "250px",
              height: "150px",
              content: "中心となる内容",
              color: "#ffc",
              zIndex: 1001,
            },
            {
              id: "idea-1",
              x: "150px",
              y: "150px",
              width: "180px",
              height: "120px",
              content: "アイデア1",
              color: "#cfc",
              zIndex: 1002,
            },
            {
              id: "idea-2",
              x: "700px",
              y: "150px",
              width: "180px",
              height: "120px",
              content: "アイデア2",
              color: "#ccf",
              zIndex: 1003,
            },
            {
              id: "idea-3",
              x: "150px",
              y: "450px",
              width: "180px",
              height: "120px",
              content: "アイデア3",
              color: "#fcc",
              zIndex: 1004,
            },
            {
              id: "idea-4",
              x: "700px",
              y: "450px",
              width: "180px",
              height: "120px",
              content: "アイデア4",
              color: "#cff",
              zIndex: 1005,
            },
          ],
          sections: [],
          textBoxes: [],
          shapes: [],
          paths: [],
          connectors: [
            { id: "conn-1", startId: "central-topic", endId: "idea-1" },
            { id: "conn-2", startId: "central-topic", endId: "idea-2" },
            { id: "conn-3", startId: "central-topic", endId: "idea-3" },
            { id: "conn-4", startId: "central-topic", endId: "idea-4" },
          ],
          images: [],
          board: {
            panX: 0,
            panY: 0,
            scale: 1.0,
            noteZIndexCounter: 1010,
            sectionZIndexCounter: 1,
          },
          version: Date.now(),
        },
      },
      kanban: {
        name: "カンバンボード",
        description: "タスクの進捗を整理できます",
        icon: "fas fa-columns",
        data: {
          notes: [
            {
              id: "task-1",
              x: "60px",
              y: "120px",
              width: "200px",
              height: "100px",
              content: "タスク1",
              color: "#ffc",
              zIndex: 1001,
            },
            {
              id: "task-2",
              x: "60px",
              y: "280px",
              width: "200px",
              height: "100px",
              content: "タスク2",
              color: "#ffc",
              zIndex: 1002,
            },
            {
              id: "task-3",
              x: "340px",
              y: "121px",
              width: "200px",
              height: "100px",
              content: "実行中のタスク",
              color: "#cff",
              zIndex: 1003,
            },
            {
              id: "task-4",
              x: "620px",
              y: "120px",
              width: "200px",
              height: "100px",
              content: "完了したタスク",
              color: "#cfc",
              zIndex: 1004,
            },
          ],
          sections: [
            {
              id: "todo-section",
              x: "40px",
              y: "80px",
              width: "250px",
              height: "400px",
              title: "To Do",
              color: "rgba(255, 255, 0, 0.1)",
              zIndex: 1,
            },
            {
              id: "progress-section",
              x: "320px",
              y: "80px",
              width: "250px",
              height: "400px",
              title: "実行中",
              color: "rgba(0, 255, 255, 0.1)",
              zIndex: 2,
            },
            {
              id: "done-section",
              x: "600px",
              y: "80px",
              width: "250px",
              height: "400px",
              title: "完了済み",
              color: "rgba(0, 255, 0, 0.1)",
              zIndex: 3,
            },
          ],
          textBoxes: [],
          shapes: [],
          paths: [],
          connectors: [],
          images: [],
          board: {
            panX: 0,
            panY: 0,
            scale: 1.0,
            noteZIndexCounter: 1010,
            sectionZIndexCounter: 4,
          },
          version: Date.now(),
        },
      },
      standup: {
        name: "スタンドアップミーティング",
        description: "進捗をチームで共有します。",
        icon: "fas fa-users",
        data: {
          notes: [
            {
              id: "yesterday-note",
              x: "80px",
              y: "150px",
              width: "220px",
              height: "180px",
              content: "昨日したこと",
              color: "#cfc",
              zIndex: 1001,
            },
            {
              id: "today-note",
              x: "340px",
              y: "150px",
              width: "220px",
              height: "180px",
              content: "今日行うこと",
              color: "#ccf",
              zIndex: 1002,
            },
            {
              id: "blockers-note",
              x: "600px",
              y: "150px",
              width: "220px",
              height: "180px",
              content: "障害となりえること",
              color: "#fcc",
              zIndex: 1003,
            },
          ],
          sections: [],
          textBoxes: [
            {
              id: "standup-title",
              x: "400px",
              y: "60px",
              content: "スタンドアップミーティング",
              zIndex: 1001,
            },
            {
              id: "date-text",
              x: "400px",
              y: "90px",
              content: new Date().toLocaleDateString(),
              zIndex: 1002,
            },
          ],
          shapes: [],
          paths: [],
          connectors: [],
          images: [],
          board: {
            panX: 0,
            panY: 0,
            scale: 1.0,
            noteZIndexCounter: 1010,
            sectionZIndexCounter: 1,
          },
          version: Date.now(),
        },
      },
      meeting: {
        name: "会議アジェンダ",
        description: "会議の内容をまとめて整理します",
        icon: "fas fa-calendar-alt",
        data: {
          notes: [
            {
              id: "agenda-1",
              x: "100px",
              y: "180px",
              width: "250px",
              height: "120px",
              content: "1. プロジェクトの進捗",
              color: "#ffc",
              zIndex: 1001,
            },
            {
              id: "agenda-2",
              x: "100px",
              y: "320px",
              width: "250px",
              height: "120px",
              content: "2. 予算のレビュー",
              color: "#ffc",
              zIndex: 1002,
            },
            {
              id: "agenda-3",
              x: "100px",
              y: "460px",
              width: "250px",
              height: "120px",
              content: "3. 次のステップ",
              color: "#ffc",
              zIndex: 1003,
            },
            {
              id: "notes-area",
              x: "400px",
              y: "180px",
              width: "350px",
              height: "400px",
              content: "議事録:\n\n• \n• \n• ",
              color: "#cff",
              zIndex: 1004,
            },
          ],
          sections: [],
          textBoxes: [
            {
              id: "meeting-title",
              x: "300px",
              y: "60px",
              content: "会議アジェンダ - " + new Date().toLocaleDateString(),
              zIndex: 1001,
            },
            {
              id: "attendees",
              x: "100px",
              y: "120px",
              content: "出席者: ",
              zIndex: 1002,
            },
          ],
          shapes: [],
          paths: [],
          connectors: [],
          images: [],
          board: {
            panX: 0,
            panY: 0,
            scale: 1.0,
            noteZIndexCounter: 1010,
            sectionZIndexCounter: 1,
          },
          version: Date.now(),
        },
      },
    };
  }

  // Template management functions
  function getCustomTemplates() {
    const templates = localStorage.getItem("plottia_custom_templates");
    return templates ? JSON.parse(templates) : {};
  }

  function saveCustomTemplate(name, description, boardData) {
    const templates = getCustomTemplates();
    const templateId = `template_${Date.now()}`;
    templates[templateId] = {
      id: templateId,
      name: name,
      description: description,
      created: Date.now(),
      data: JSON.parse(JSON.stringify(boardData)), // Deep copy
    };
    localStorage.setItem("plottia_custom_templates", JSON.stringify(templates));
    return templateId;
  }

  function deleteCustomTemplate(templateId) {
    const templates = getCustomTemplates();
    delete templates[templateId];
    localStorage.setItem("plottia_custom_templates", JSON.stringify(templates));
  }

  function createBoardFromTemplate(templateData) {
    // Create a deep copy of the template data and update timestamps
    const boardData = JSON.parse(JSON.stringify(templateData));
    boardData.version = Date.now();

    // Generate new IDs for all elements to avoid conflicts
    const idMap = {};

    // Update note IDs
    boardData.notes?.forEach((note) => {
      const oldId = note.id;
      const newId = `note_${Date.now()}_${
        Math.random()
          .toString(36)
          .substr(2, 9)
      }`;
      idMap[oldId] = newId;
      note.id = newId;
    });

    // Update section IDs
    boardData.sections?.forEach((section) => {
      const oldId = section.id;
      const newId = `section_${Date.now()}_${
        Math.random()
          .toString(36)
          .substr(2, 9)
      }`;
      idMap[oldId] = newId;
      section.id = newId;
    });

    // Update textBox IDs
    boardData.textBoxes?.forEach((textBox) => {
      const oldId = textBox.id;
      const newId = `textbox_${Date.now()}_${
        Math.random()
          .toString(36)
          .substr(2, 9)
      }`;
      idMap[oldId] = newId;
      textBox.id = newId;
    });

    // Update shape IDs
    boardData.shapes?.forEach((shape) => {
      const oldId = shape.id;
      const newId = `shape_${Date.now()}_${
        Math.random()
          .toString(36)
          .substr(2, 9)
      }`;
      idMap[oldId] = newId;
      shape.id = newId;
    });

    // Update connector references
    boardData.connectors?.forEach((connector) => {
      if (idMap[connector.startId]) {
        connector.startId = idMap[connector.startId];
      }
      if (idMap[connector.endId]) {
        connector.endId = idMap[connector.endId];
      }
      connector.id = `connector_${Date.now()}_${
        Math.random()
          .toString(36)
          .substr(2, 9)
      }`;
    });

    return boardData;
  }

  function getCurrentState() {
    return JSON.parse(JSON.stringify(boardData));
  }

  function loadStateFromObject(state) {
    boardData = state || createEmptyBoard();

    // Ensure images array exists for backwards compatibility
    if (!boardData.images) {
      boardData.images = [];
    }

    objectContainer.innerHTML = "";
    sectionContainer.innerHTML = "";
    svgLayer.innerHTML =
      `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`;

    boardData.sections?.forEach((data) => createSection(data, true));
    boardData.notes?.forEach((data) => createNote(data, true));
    boardData.textBoxes?.forEach((data) => createTextBox(data, true));
    boardData.shapes?.forEach((data) => createShape(data, true));
    boardData.images?.forEach((data) => createImage(data, true));

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
      x: `${
        (window.innerWidth / 2 - 100 - (boardData.board?.panX || 0)) /
        (boardData.board?.scale || 1)
      }px`,
      y: `${
        (window.innerHeight / 2 - 100 - (boardData.board?.panY || 0)) /
        (boardData.board?.scale || 1)
      }px`,
    };
  }

  function createNote(data, fromOperation = false) {
    if (!fromOperation) {
      const pos = getNewElementPosition();
      const payload = {
        id: `note-${myPeerId}-${Date.now()}`,
        x: pos.x,
        y: pos.y,
        width: "220px",
        height: "220px",
        zIndex: boardData.board.noteZIndexCounter++,
        content: "新しい付箋",
        color: noteColors[0], // --- FIXED: Assign single color ---
        isLocked: false,
      };
      generateOperation("CREATE_NOTE", payload, {
        original: { type: "CREATE_NOTE", payload },
        inverse: {
          type: "DELETE_ELEMENTS",
          payload: { elementIds: [payload.id] },
        },
      });
      return;
    }

    if (document.getElementById(data.id)) return;

    const note = document.createElement("div");
    note.className = "note";
    note.id = data.id;
    note.style.left = data.x;
    note.style.top = data.y;
    note.style.width = data.width;
    note.style.height = data.height;
    note.style.zIndex = data.zIndex;
    note.classList.toggle("locked", data.isLocked);

    note.innerHTML = `<div class="note-header"><div class="color-picker">${
      noteColors
        .map(
          (c) =>
            `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`,
        )
        .join("")
    }</div><div class="lock-btn" title="ロック"><i class="fas ${
      data.isLocked ? "fa-lock" : "fa-unlock"
    }"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div><div class="note-body"><div class="note-view">${
      parseLinks(
        data.content,
      )
    }</div><textarea class="note-content" style="display: none;">${data.content}</textarea></div><div class="resizer"></div>`;
    note.querySelector(".note-header").style.backgroundColor = data.color;
    note.querySelector(".note-body").style.backgroundColor = data.color;
    objectContainer.appendChild(note);
    addCommonEventListeners(note, data);
  }

  function createSection(data, fromOperation = false) {
    if (!fromOperation) {
      const pos = getNewElementPosition();
      const payload = {
        id: `section-${myPeerId}-${Date.now()}`,
        x: pos.x,
        y: pos.y,
        width: "400px",
        height: "400px",
        zIndex: boardData.board.sectionZIndexCounter++,
        content: "新しいセクション",
        color: sectionColors[0], // --- FIXED: Assign single color ---
        isLocked: false,
      };
      generateOperation("CREATE_SECTION", payload);
      return;
    }
    if (document.getElementById(data.id)) return;

    const section = document.createElement("div");
    section.className = "section";
    section.id = data.id;
    section.style.cssText =
      `left:${data.x}; top:${data.y}; width:${data.width}; height:${data.height}; z-index:${data.zIndex}; background-color:${data.color};`;
    section.classList.toggle("locked", data.isLocked);

    section.innerHTML =
      `<div class="section-header"><div class="section-title">${data.content}</div><div class="section-controls"><div class="color-picker">${
        sectionColors
          .map(
            (c) =>
              `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`,
          )
          .join("")
      }</div><div class="lock-btn" title="ロック"><i class="fas ${
        data.isLocked ? "fa-lock" : "fa-unlock"
      }"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div></div></div><div class="resizer"></div>`;
    sectionContainer.appendChild(section);
    addCommonEventListeners(section, data);
  }

  function createTextBox(data, fromOperation = false) {
    if (!fromOperation) {
      const pos = getNewElementPosition();
      const payload = {
        id: `text-${myPeerId}-${Date.now()}`,
        x: pos.x,
        y: pos.y,
        zIndex: boardData.board.noteZIndexCounter++,
        content: "テキストを入力",
        isLocked: false,
        width: "auto",
      };
      generateOperation("CREATE_TEXTBOX", payload);
      return;
    }
    if (document.getElementById(data.id)) return;

    const textBox = document.createElement("div");
    textBox.className = "text-box";
    textBox.id = data.id;
    textBox.style.cssText =
      `left:${data.x}; top:${data.y}; z-index:${data.zIndex}; width:${data.width};`;
    textBox.classList.toggle("locked", data.isLocked);

    textBox.innerHTML = `<div class="text-content" contenteditable="${!data
      .isLocked}">${
      parseLinks(
        data.content,
      )
    }</div><div class="lock-btn" title="ロック"><i class="fas ${
      data.isLocked ? "fa-lock" : "fa-unlock"
    }"></i></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div>`;
    objectContainer.appendChild(textBox);
    addCommonEventListeners(textBox, data);
  }

  function createShape(data, fromOperation = false) {
    if (!fromOperation) {
      // This is a special case since multiple buttons call it
      const payload = {
        id: `shape-${myPeerId}-${Date.now()}`,
        ...getNewElementPosition(),
        width: "150px",
        height: "150px",
        zIndex: boardData.board.noteZIndexCounter++,
        content: "",
        color: shapeColors[0], // --- FIXED: Assign single color ---
        isLocked: false,
        shapeType: data.type,
      };
      generateOperation("CREATE_SHAPE", payload);
      return;
    }
    if (document.getElementById(data.id)) return;

    const shape = document.createElement("div");
    shape.className = `shape ${data.shapeType}`;
    shape.id = data.id;
    shape.style.cssText =
      `left:${data.x}; top:${data.y}; width:${data.width}; height:${data.height}; z-index:${data.zIndex};`;
    shape.classList.toggle("locked", data.isLocked);

    shape.innerHTML =
      `<div class="shape-visual"></div><div class="shape-label" contenteditable="${!data
        .isLocked}">${data.content}</div><div class="resizer"></div><div class="delete-btn" title="削除"><i class="fas fa-times"></i></div><div class="lock-btn" title="ロック"><i class="fas ${
        data.isLocked ? "fa-lock" : "fa-unlock"
      }"></i></div><div class="color-picker">${
        shapeColors
          .map(
            (c) =>
              `<div class="color-dot" style="background-color: ${c};" data-color="${c}"></div>`,
          )
          .join("")
      }</div>`;
    shape.querySelector(".shape-visual").style.backgroundColor = data.color;
    objectContainer.appendChild(shape);
    addCommonEventListeners(shape, data);
  }

  function createImage(data, fromOperation = false) {
    if (!fromOperation) {
      // This should not be called directly without file input
      return;
    }

    if (document.getElementById(data.id)) return;

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "image-wrapper";
    imageWrapper.id = data.id;
    // Ensure px units for position and size
    const left = typeof data.x === "number" ? `${data.x}px` : data.x || "0px";
    const top = typeof data.y === "number" ? `${data.y}px` : data.y || "0px";
    const width = typeof data.width === "number"
      ? `${data.width}px`
      : data.width || "150px";
    const height = typeof data.height === "number"
      ? `${data.height}px`
      : data.height || "150px";
    imageWrapper.style.cssText =
      `position: absolute; left: ${left}; top: ${top}; width: ${width}; height: ${height}; z-index: ${data.zIndex}; cursor: move;`;
    imageWrapper.classList.toggle("locked", data.isLocked);

    const img = document.createElement("img");
    img.src = data.src;
    img.style.cssText =
      "width: 100%; height: 100%; object-fit: contain; display: block;";
    img.draggable = false;

    imageWrapper.innerHTML = `
            <div class="delete-btn" title="削除" style="position: absolute; top: -30px; right: 0; background-color: white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: none; padding: 5px; border-radius: 5px; align-items: center; justify-content: center; width: 20px; height: 20px; cursor: pointer; color: rgba(0,0,0,.5);">
                <i class="fas fa-times"></i>
            </div>
            <div class="lock-btn" title="ロック" style="position: absolute; top: -30px; right: 35px; background-color: white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: none; padding: 5px; border-radius: 5px; align-items: center; justify-content: center; width: 20px; height: 20px; cursor: pointer; color: rgba(0,0,0,.5);">
                <i class="fas ${data.isLocked ? "fa-lock" : "fa-unlock"}"></i>
            </div>
            <div class="resizer" style="position: absolute; width: 15px; height: 15px; right: 0; bottom: 0; cursor: se-resize; background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,.3) 50%);"></div>
        `;

    imageWrapper.appendChild(img);

    // Show/hide controls on hover
    imageWrapper.addEventListener("mouseenter", () => {
      if (!imageWrapper.classList.contains("locked")) {
        imageWrapper.querySelector(".delete-btn").style.display = "flex";
        imageWrapper.querySelector(".lock-btn").style.display = "flex";
      }
    });

    imageWrapper.addEventListener("mouseleave", () => {
      imageWrapper.querySelector(".delete-btn").style.display = "none";
      imageWrapper.querySelector(".lock-btn").style.display = "none";
    });

    objectContainer.appendChild(imageWrapper);
    addCommonEventListeners(imageWrapper, data);
  }

  function initResize(e, element) {
    if (element.classList.contains("locked")) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = element.offsetWidth;
    const startHeight = element.offsetHeight;

    const onPointerMove = (ev) => {
      const newWidth = startWidth +
        (ev.clientX - startX) / boardData.board.scale;
      const newHeight = startHeight +
        (ev.clientY - startY) / boardData.board.scale;

      element.style.width = `${Math.max(100, newWidth)}px`; // 最小幅を設定
      element.style.height = `${Math.max(100, newHeight)}px`; // 最小高さを設定
      drawAllConnectors();
    };

    const onPointerUp = () => {
      document.body.classList.remove("is-resizing");
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);

      generateOperation("RESIZE_ELEMENT", {
        id: element.id,
        width: element.style.width,
        height: element.style.height,
      });
    };

    document.body.classList.add("is-resizing");
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
  }

  function addCommonEventListeners(element, data) {
    // --- Shape selection and persistent controls ---
    if (element.classList.contains("shape")) {
      element.addEventListener("mousedown", (e) => {
        // 既にロック・リサイズ・色ピッカー・テキスト編集なら無視
        if (
          element.classList.contains("locked") ||
          e.target.closest('.resizer, [contenteditable="true"], .color-picker')
        ) {
          return;
        }
        e.stopPropagation();
        // すべてのshapeの選択解除
        document
          .querySelectorAll(".shape.selected")
          .forEach((s) => s.classList.remove("selected"));
        // このshapeを選択
        element.classList.add("selected");
      });
    }

    // Dragging
    const header = element.querySelector(".note-header") ||
      element.querySelector(".section-header") ||
      element;
    header.addEventListener("mousedown", (e) => {
      if (
        element.classList.contains("locked") ||
        e.target.closest('.resizer, [contenteditable="true"], .color-picker')
      ) {
        return;
      }
      e.stopPropagation();
      // shapeなら選択状態に
      if (element.classList.contains("shape")) {
        document
          .querySelectorAll(".shape.selected")
          .forEach((s) => s.classList.remove("selected"));
        element.classList.add("selected");
      }
      const startZIndex = boardData.board.noteZIndexCounter++;
      let attachedElements = [];
      if (element.classList.contains("section")) {
        const sectionX = parseFloat(element.style.left);
        const sectionY = parseFloat(element.style.top);
        const sectionW = element.offsetWidth;
        const sectionH = element.offsetHeight;
        const allDraggableItems = [
          ...boardData.notes,
          ...boardData.textBoxes,
          ...boardData.shapes,
          ...boardData.images,
        ];
        allDraggableItems.forEach((item) => {
          const itemEl = document.getElementById(item.id);
          if (!itemEl || item.isLocked) return;
          const itemX = parseFloat(item.x);
          const itemY = parseFloat(item.y);
          const itemW = itemEl.offsetWidth;
          const itemH = itemEl.offsetHeight;
          if (
            itemX >= sectionX &&
            itemX + itemW <= sectionX + sectionW &&
            itemY >= sectionY &&
            itemY + itemH <= sectionY + sectionH
          ) {
            attachedElements.push({
              id: item.id,
              element: itemEl,
              offsetX: itemX - sectionX,
              offsetY: itemY - sectionY,
            });
          }
        });
      }
      let lastPos = getEventCoordinates(e);
      const onPointerMove = (ev) => {
        ev.preventDefault();
        const currentPos = getEventCoordinates(ev);
        const dx = (currentPos.x - lastPos.x) / boardData.board.scale;
        const dy = (currentPos.y - lastPos.y) / boardData.board.scale;
        lastPos = currentPos;
        element.style.left = `${parseFloat(element.style.left) + dx}px`;
        element.style.top = `${parseFloat(element.style.top) + dy}px`;
        element.style.zIndex = startZIndex;
        const newSectionX = parseFloat(element.style.left);
        const newSectionY = parseFloat(element.style.top);
        attachedElements.forEach((att) => {
          att.element.style.left = `${newSectionX + att.offsetX}px`;
          att.element.style.top = `${newSectionY + att.offsetY}px`;
        });
        drawAllConnectors();
      };
      const onPointerUp = () => {
        document.body.classList.remove("is-dragging");
        document.removeEventListener("mousemove", onPointerMove);
        document.removeEventListener("mouseup", onPointerUp);
        const elementsToMove = [
          {
            id: element.id,
            x: element.style.left,
            y: element.style.top,
            zIndex: startZIndex,
          },
        ];
        attachedElements.forEach((att) => {
          elementsToMove.push({
            id: att.id,
            x: att.element.style.left,
            y: att.element.style.top,
            zIndex: att.element.style.zIndex,
          });
        });
        generateOperation("MOVE_ELEMENTS", { elements: elementsToMove });
      };
      document.body.classList.add("is-dragging");
      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerUp);
    });
    // --- Deselect all shapes when clicking outside any shape ---
    if (!window._plottiaShapeDeselectorAdded) {
      document.addEventListener("mousedown", function shapeDeselector(e) {
        if (!e.target.closest(".shape")) {
          document
            .querySelectorAll(".shape.selected")
            .forEach((s) => s.classList.remove("selected"));
        }
      });
      window._plottiaShapeDeselectorAdded = true;
    }

    // Deleting
    element.querySelector(".delete-btn")?.addEventListener("click", (e) => {
      if (element.classList.contains("locked")) return;
      e.stopPropagation();
      generateOperation("DELETE_ELEMENTS", { elementIds: [element.id] });
    });

    // Locking
    element.querySelector(".lock-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isLocked = !element.classList.contains("locked");
      generateOperation("TOGGLE_LOCK", { id: element.id, isLocked });
    });

    // Color changing
    element.querySelectorAll(".color-dot").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        if (element.classList.contains("locked")) return;
        e.stopPropagation();
        generateOperation("CHANGE_COLOR", {
          id: element.id,
          color: dot.dataset.color,
        });
      });
    });

    // Content Editing
    const contentEl = element.querySelector(
      ".note-content, .section-title, .text-content, .shape-label",
    );
    if (contentEl) {
      const editTarget =
        contentEl.tagName === "DIV" || contentEl.tagName === "SPAN"
          ? contentEl
          : element.querySelector(".note-view");
      const inputTarget =
        contentEl.tagName === "TEXTAREA" || contentEl.tagName === "INPUT"
          ? contentEl
          : contentEl;

      const finishEditing = () => {
        const newValue = inputTarget.isContentEditable
          ? inputTarget.innerHTML
          : inputTarget.value;
        if (newValue !== data.content) {
          generateOperation("UPDATE_CONTENT", {
            id: element.id,
            content: newValue,
          });
        }
        if (editTarget && editTarget !== inputTarget) {
          // for note view/edit toggle
          editTarget.style.display = "block";
          inputTarget.style.display = "none";
        }
      };

      editTarget?.addEventListener("dblclick", () => {
        if (element.classList.contains("locked")) return;
        if (editTarget !== inputTarget) {
          editTarget.style.display = "none";
          inputTarget.style.display = "block";
        }
        inputTarget.focus();
      });
      inputTarget.addEventListener("blur", finishEditing);
      inputTarget.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && inputTarget.tagName !== "TEXTAREA") {
          inputTarget.blur();
        }
      });
    }
    const resizer = element.querySelector(".resizer");
    if (resizer) {
      resizer.addEventListener("mousedown", (e) => {
        initResize(e, element);
      });
    }
  }

  // =================================================================
  // 6. 手描き機能
  // =================================================================

  const onDrawingLayerDown = (e) => {
    if (!isPenMode && !isEraserMode) return;
    e.preventDefault();
    e.stopPropagation();

    const pathId = `path-${myPeerId}-${Date.now()}`;
    const newPathData = {
      id: pathId,
      color: isDarkMode() ? "#FFFFFF" : "#000000",
      strokeWidth: currentStrokeWidth,
      mode: isEraserMode ? "eraser" : "pen",
    };

    generateOperation("START_DRAW", newPathData);
    drawingBuffer.push(getCanvasCoordinates(e));

    let drawing = true;
    // 軽量化: 近い点は間引く
    function maybeAddPoint(ev) {
      const pt = getCanvasCoordinates(ev);
      const last = drawingBuffer[drawingBuffer.length - 1];
      if (!last || Math.abs(pt.x - last.x) > 1 || Math.abs(pt.y - last.y) > 1) {
        drawingBuffer.push(pt);
      }
    }

    const onPointerMove = (ev) => {
      ev.preventDefault();
      maybeAddPoint(ev);
    };
    const onPointerUp = () => {
      drawing = false;
      if (drawingBuffer.length > 0) {
        // Compress drawing data before sending
        const compressedPoints = drawingBuffer.filter((point, index) => {
          if (index === 0 || index === drawingBuffer.length - 1) return true;
          const prev = drawingBuffer[index - 1];
          const next = drawingBuffer[index + 1];
          if (!prev || !next) return true;

          // Keep points that deviate significantly from the line
          const distance = Math.abs(
            (next.y - prev.y) * point.x -
              (next.x - prev.x) * point.y +
              next.x * prev.y -
              next.y * prev.x,
          ) / Math.sqrt((next.y - prev.y) ** 2 + (next.x - prev.x) ** 2);

          return distance > 1.5; // More aggressive compression for network
        });

        generateOperation("APPEND_POINTS", {
          pathId: pathId,
          points: compressedPoints,
        });
        drawingBuffer = [];
      }
      generateOperation("END_DRAW", { pathId: pathId });
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("touchmove", onPointerMove);
      document.removeEventListener("touchend", onPointerUp);
    };

    // requestAnimationFrameで描画
    function drawLoop() {
      if (!drawing) return;
      redrawCanvas();
      requestAnimationFrame(drawLoop);
    }
    requestAnimationFrame(drawLoop);

    // バッファ送信は200msごと
    drawingInterval = setInterval(() => {
      if (!drawing) {
        clearInterval(drawingInterval);
        drawingInterval = null;
        return;
      }
      if (drawingBuffer.length > 0) {
        // Apply light compression for real-time drawing
        const compressedPoints = drawingBuffer.filter((point, index) => {
          if (index === 0 || index === drawingBuffer.length - 1) return true;
          if (index % 2 === 0) return true; // Keep every other point for real-time
          return false;
        });

        generateOperation("APPEND_POINTS", {
          pathId: pathId,
          points: compressedPoints,
        });
        drawingBuffer = [];
      }
    }, 200);

    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("touchmove", onPointerMove, { passive: false });
    document.addEventListener("touchend", onPointerUp);
  };
  drawingLayer.addEventListener("mousedown", onDrawingLayerDown);
  drawingLayer.addEventListener("touchstart", onDrawingLayerDown, {
    passive: false,
  });

  // =================================================================
  // 7. ファイル管理とアプリケーション初期化
  // =================================================================

  function getFileMetadata() {
    return JSON.parse(localStorage.getItem("plottia_files_metadata")) || [];
  }
  function saveFileMetadata(metadata) {
    localStorage.setItem("plottia_files_metadata", JSON.stringify(metadata));
  }

  function showFileManager() {
    if (peer && !peer.destroyed) peer.destroy();
    peer = null;
    currentFileId = null;
    fileManagerOverlay.classList.remove("hidden");
    mainApp.classList.add("hidden");
    window.history.replaceState(null, null, window.location.pathname);

    // Clear any existing status messages when returning to file manager
    const existingStatus = document.getElementById("guest-connection-status");
    if (existingStatus) {
      existingStatus.remove();
    }

    const metadata = getFileMetadata();
    metadata.sort((a, b) => b.lastModified - a.lastModified);
    fileList.innerHTML = "";
    if (metadata.length === 0) {
      fileList.innerHTML =
        "<li>ファイルがありません。新しいファイルを作成してください。</li>";
    }
    metadata.forEach((file) => {
      const li = document.createElement("li");
      const lastModified = new Date(file.lastModified).toLocaleString();
      li.innerHTML =
        `<span class="file-name">${file.name}</span><span class="file-meta">最終更新: ${lastModified}</span><div class="file-actions"><button class="rename-btn" title="名前を変更"><i class="fas fa-pen"></i></button><button class="delete-btn" title="削除"><i class="fas fa-trash"></i></button></div>`;
      fileList.appendChild(li);

      li.querySelector(".file-name").addEventListener(
        "click",
        () => openFile(file.id),
      );
      li.querySelector(".rename-btn").addEventListener(
        "click",
        () => renameFile(file.id, file.name),
      );
      li.querySelector(".delete-btn").addEventListener(
        "click",
        () => deleteFile(file.id, file.name),
      );
    });
  }

  async function createNewFile() {
    const name = prompt(
      "新しいファイルの名前を入力してください:",
      "無題のボード",
    );
    if (!name) return;

    const metadata = getFileMetadata();
    const newFile = {
      id: `plottia_board_${Date.now()}`,
      name: name,
      lastModified: Date.now(),
    };
    metadata.push(newFile);
    saveFileMetadata(metadata);

    await db.set(newFile.id, createEmptyBoard());

    openFile(newFile.id);
  }

  function renameFile(fileId, oldName) {
    const newName = prompt("新しいファイル名を入力してください:", oldName);
    if (!newName || newName === oldName) return;
    let metadata = getFileMetadata();
    const fileIndex = metadata.findIndex((f) => f.id === fileId);
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
      metadata = metadata.filter((f) => f.id !== fileId);
      saveFileMetadata(metadata);
      await db.remove(fileId);
      showFileManager();
    } catch (err) {
      showErrorModal(`ファイルの削除中にエラーが発生しました:\n${err.message}`);
    }
  }

  // Template UI functions
  function showTemplateModal() {
    templateOverlay.classList.remove("hidden");
    populateBuiltinTemplates();
    populateCustomTemplates();
  }

  function hideTemplateModal() {
    templateOverlay.classList.add("hidden");
  }

  function populateBuiltinTemplates() {
    const templates = getBuiltInTemplates();
    builtinTemplatesGrid.innerHTML = "";

    Object.entries(templates).forEach(([key, template]) => {
      const card = document.createElement("div");
      card.className = "template-card";
      card.innerHTML = `
        <div class="template-icon">
          <i class="${template.icon}"></i>
        </div>
        <div class="template-name">${template.name}</div>
        <div class="template-description">${template.description}</div>
      `;

      card.addEventListener("click", () => {
        createFileFromTemplate(template.name, template.data);
      });

      builtinTemplatesGrid.appendChild(card);
    });
  }

  function populateCustomTemplates() {
    const templates = getCustomTemplates();
    customTemplatesGrid.innerHTML = "";

    if (Object.keys(templates).length === 0) {
      customTemplatesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: #666; padding: 40px;">
          <i class="fas fa-clipboard-list" style="font-size: 3em; margin-bottom: 20px; opacity: 0.3;"></i>
          <p>カスタムテンプレートがありません</p>
          <p style="font-size: 14px;">現在のボードを「テンプレートとして保存」して、<br>後で再利用できます</p>
        </div>
      `;
      return;
    }

    Object.entries(templates).forEach(([key, template]) => {
      const card = document.createElement("div");
      card.className = "template-card";
      card.innerHTML = `
        <div class="template-icon">
          <i class="fas fa-user"></i>
        </div>
        <div class="template-name">${template.name}</div>
        <div class="template-description">${template.description}</div>
        <div class="template-meta">
          <span>作成日: ${
        new Date(
          template.created,
        ).toLocaleDateString()
      }</span>
          <div class="template-actions">
            <button onclick="deleteTemplateAndRefresh('${template.id}');" title="削除">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (!e.target.closest(".template-actions")) {
          createFileFromTemplate(template.name, template.data);
        }
      });

      customTemplatesGrid.appendChild(card);
    });
  }

  async function createFileFromTemplate(templateName, templateData) {
    const name = prompt(
      "新しいファイルの名前を入力してください:",
      `${templateName} - ${new Date().toLocaleDateString()}`,
    );
    if (!name) return;

    const metadata = getFileMetadata();
    const newFile = {
      id: `plottia_board_${Date.now()}`,
      name: name,
      lastModified: Date.now(),
    };
    metadata.push(newFile);
    saveFileMetadata(metadata);

    const boardData = createBoardFromTemplate(templateData);
    await db.set(newFile.id, boardData);

    hideTemplateModal();
    openFile(newFile.id);
  }

  function showSaveTemplateDialog() {
    const name = prompt(
      "テンプレート名を入力してください:",
      "新しいテンプレート",
    );
    if (!name) return;

    const description = prompt(
      "テンプレートの説明を入力してください (オプション):",
      "",
    );

    try {
      saveCustomTemplate(
        name,
        description || "カスタムテンプレート",
        getCurrentState(),
      );
      alert("テンプレートを保存しました！");
    } catch (error) {
      alert("テンプレートの保存に失敗しました: " + error.message);
    }
  }

  function deleteTemplateAndRefresh(templateId) {
    if (confirm("このテンプレートを削除しますか？")) {
      deleteCustomTemplate(templateId);
      populateCustomTemplates();
    }
  }

  // Make this function globally accessible
  window.deleteTemplateAndRefresh = deleteTemplateAndRefresh;

  async function openFile(fileId) {
    currentFileId = fileId;
    fileManagerOverlay.classList.add("hidden");
    mainApp.classList.remove("hidden");

    const urlHash = window.location.hash.substring(1);
    const [fileIdFromUrl, hostIdInUrl] = urlHash.split("/");

    // If we are joining a room from a link, we start with an empty board and wait for host data.
    if (hostIdInUrl) {
      console.log("Joining as a guest. Waiting for host data.");
      loadStateFromObject(createEmptyBoard());

      // Initialize peer connection for guest
      if (!peer || peer.destroyed) {
        console.log("Initializing PeerJS for guest connection");
        initializePeer();
      }
    } else {
      // Otherwise, we are the host or working solo. Load our local data.
      console.log("Opening as host/solo. Loading from local DB.");
      const localData = await db.get(currentFileId);
      loadStateFromObject(localData);
    }
  }

  // =================================================================
  // 8. 描画とUIヘルパー関数
  // =================================================================
  function redrawCanvas() {
    if (!boardData.paths) return;
    ctx.clearRect(0, 0, drawingLayer.width, drawingLayer.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    boardData.paths.forEach((path) => {
      ctx.globalCompositeOperation = path.mode === "eraser"
        ? "destination-out"
        : "source-over";
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.strokeWidth;
      ctx.beginPath();
      if (path.points && path.points.length > 0) {
        // --- FIXED: Correctly access first point's coordinates ---
        ctx.moveTo(path.points[0].x, path.points[0].y);
        // --- END FIX ---
        path.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function applyTransform() {
    if (boardData.board) {
      board.style.transform =
        `translate(${boardData.board.panX}px, ${boardData.board.panY}px) scale(${boardData.board.scale})`;
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
      y: (coords.y - panY) / scale,
    };
  }

  function getElementCenter(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return null;
    const x = parseFloat(el.style.left) + el.offsetWidth / 2;
    const y = parseFloat(el.style.top) + el.offsetHeight / 2;
    return { x, y };
  }

  function drawAllConnectors() {
    if (!svgLayer) return;
    svgLayer.innerHTML =
      `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`;
    boardData.connectors?.forEach((conn) => {
      const startPoint = getElementCenter(conn.startId);
      const endPoint = getElementCenter(conn.endId);
      if (startPoint && endPoint) {
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        line.setAttribute("x1", startPoint.x);
        line.setAttribute("y1", startPoint.y);
        line.setAttribute("x2", endPoint.x);
        line.setAttribute("y2", endPoint.y);
        line.setAttribute("class", "connector-line");
        line.dataset.id = conn.id;
        svgLayer.appendChild(line);
        line.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          clearSelection();
          selectedElement = { type: "connector", id: conn.id };
          document
            .querySelectorAll(".connector-line")
            .forEach((l) => l.classList.remove("selected"));
          line.classList.add("selected");
        });
      }
    });
  }

  function updateMinimap() {
    minimap.innerHTML = "";
    const minimapScale = minimap.offsetWidth / board.offsetWidth;
    const allElements = [
      ...(boardData.notes || []),
      ...(boardData.sections || []),
      ...(boardData.textBoxes || []),
      ...(boardData.shapes || []),
      ...(boardData.images || []),
    ];

    allElements.forEach((item) => {
      const el = document.getElementById(item.id);
      if (!el) return;
      const elRect = {
        left: parseFloat(item.x) * minimapScale,
        top: parseFloat(item.y) * minimapScale,
        width: el.offsetWidth * minimapScale,
        height: el.offsetHeight * minimapScale,
      };
      const mapEl = document.createElement("div");
      mapEl.className = "minimap-element";
      mapEl.style.cssText =
        `left:${elRect.left}px; top:${elRect.top}px; width:${elRect.width}px; height:${elRect.height}px;`;
      minimap.appendChild(mapEl);
    });

    const viewport = document.createElement("div");
    viewport.id = "minimap-viewport";
    minimap.appendChild(viewport);
    const viewRect = {
      width: (window.innerWidth / boardData.board.scale) * minimapScale,
      height: (window.innerHeight / boardData.board.scale) * minimapScale,
      left: -boardData.board.panX * minimapScale,
      top: -boardData.board.panY * minimapScale,
    };
    viewport.style.cssText =
      `width:${viewRect.width}px; height:${viewRect.height}px; left:${viewRect.left}px; top:${viewRect.top}px;`;

    // --- ミニマップのビューポートをドラッグで移動 ---
    viewport.onmousedown = function (e) {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = viewRect.left;
      const startTop = viewRect.top;
      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        // 新しいpanX, panYを計算
        const newLeft = startLeft + dx;
        const newTop = startTop + dy;
        boardData.board.panX = -newLeft / minimapScale;
        boardData.board.panY = -newTop / minimapScale;
        applyTransform();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveState();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
    // --- ミニマップクリックで移動 ---
    minimap.onclick = function (e) {
      if (e.target.id === "minimap-viewport") return;
      const rect = minimap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // 中心がクリック位置に来るようにpanを調整
      boardData.board.panX = -(
        x / minimapScale -
        window.innerWidth / 2 / boardData.board.scale
      );
      boardData.board.panY = -(
        y / minimapScale -
        window.innerHeight / 2 / boardData.board.scale
      );
      applyTransform();
      saveState();
    };
  }

  function getEventCoordinates(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }
  function clearSelection() {
    /* ... */
  }
  function isDarkMode() {
    return document.body.classList.contains("dark-mode");
  }

  // =================================================================
  // 9. イベントリスナーと初期化
  // =================================================================

  // Tool toggles
  function togglePenMode(forceOff = false) {
    isPenMode = forceOff ? false : !isPenMode;
    penToolBtn.classList.toggle("active", isPenMode);
    document.body.classList.toggle("pen-mode", isPenMode);
    drawingLayer.style.pointerEvents = isPenMode || isEraserMode
      ? "auto"
      : "none";
    if (isPenMode) {
      toggleEraserMode(true);
      toggleConnectorMode(true);
    }
  }
  function toggleEraserMode(forceOff = false) {
    isEraserMode = forceOff ? false : !isEraserMode;
    eraserToolBtn.classList.toggle("active", isEraserMode);
    document.body.classList.toggle("eraser-mode", isEraserMode);
    drawingLayer.style.pointerEvents = isPenMode || isEraserMode
      ? "auto"
      : "none";
    if (isEraserMode) {
      togglePenMode(true);
      toggleConnectorMode(true);
    }
  }
  function toggleConnectorMode(forceOff = false) {
    isConnectorMode = forceOff ? false : !isConnectorMode;
    addConnectorBtn.classList.toggle("active", isConnectorMode);
    document.body.classList.toggle("connector-mode", isConnectorMode);
    if (isConnectorMode) {
      togglePenMode(true);
      toggleEraserMode(true);
    }
    connectorStartId = null;
  }

  penToolBtn.addEventListener("click", () => togglePenMode());
  eraserToolBtn.addEventListener("click", () => toggleEraserMode());
  addConnectorBtn.addEventListener("click", () => toggleConnectorMode());

  // Board panning
  board.addEventListener("mousedown", (e) => {
    if (e.target !== board || isPenMode || isEraserMode) return;
    board.classList.add("grabbing");
    let lastPos = getEventCoordinates(e);
    const onPointerMove = (ev) => {
      ev.preventDefault();
      const currentPos = getEventCoordinates(ev);
      boardData.board.panX += currentPos.x - lastPos.x;
      boardData.board.panY += currentPos.y - lastPos.y;
      lastPos = currentPos;
      applyTransform();
    };
    const onPointerUp = () => {
      board.classList.remove("grabbing");
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
      saveState(); // Save pan/zoom state
    };
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
  });

  // Board zooming
  window.addEventListener(
    "wheel",
    (e) => {
      if (mainApp.classList.contains("hidden")) return;
      e.preventDefault();
      const z = 1.1,
        oldScale = boardData.board.scale;
      let newScale = e.deltaY < 0 ? oldScale * z : oldScale / z;
      newScale = Math.max(0.2, Math.min(newScale, 3.0));
      boardData.board.scale = newScale;
      boardData.board.panX = e.clientX -
        ((e.clientX - boardData.board.panX) / oldScale) * newScale;
      boardData.board.panY = e.clientY -
        ((e.clientY - boardData.board.panY) / oldScale) * newScale;
      applyTransform();
    },
    { passive: false },
  );

  // --- 拡大率リセットボタン（中心維持） ---
  zoomResetBtn.addEventListener("click", () => {
    // 現在の表示中心を維持したままズームを100%にリセット
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const oldScale = boardData.board.scale;
    const newScale = 1.0;
    // 現在の中心がボード座標でどこか
    const boardCenterX = (centerX - boardData.board.panX) / oldScale;
    const boardCenterY = (centerY - boardData.board.panY) / oldScale;
    // 新しいpanX, panYを計算
    boardData.board.scale = newScale;
    boardData.board.panX = centerX - boardCenterX * newScale;
    boardData.board.panY = centerY - boardCenterY * newScale;
    applyTransform();
    updateZoomDisplay();
    saveState();
  });

  // Button event listeners
  addNoteBtn.addEventListener("click", () => createNote());
  addSectionBtn.addEventListener("click", () => createSection());
  addTextBtn.addEventListener("click", () => createTextBox());
  addShapeSquareBtn.addEventListener(
    "click",
    () => createShape({ type: "square" }),
  );
  addShapeCircleBtn.addEventListener(
    "click",
    () => createShape({ type: "circle" }),
  );
  addShapeDiamondBtn.addEventListener(
    "click",
    () => createShape({ type: "diamond" }),
  );
  addImageBtn.addEventListener("click", () => imageFileInput.click());
  // --- 画像エクスポート（PNG保存） ---
  imageExportBtn.addEventListener("click", () => {
    // board全体をcanvasに描画し、画像として保存
    html2canvas(board, {
      backgroundColor: null,
      useCORS: true,
      allowTaint: true,
      logging: false,
      scale: 2, // 高解像度で保存
    })
      .then((canvas) => {
        const link = document.createElement("a");
        link.download = "plottia_board.png";
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((e) => {
        alert("画像のエクスポートに失敗しました: " + e.message);
      });
  });

  // --- Plottia形式でエクスポート ---
  exportBtn.addEventListener("click", async () => {
    const state = getCurrentState();
    // 画像データをbase64で埋め込む
    if (state.images && state.images.length > 0) {
      for (let img of state.images) {
        if (img.src && img.src.startsWith("blob:")) {
          try {
            const response = await fetch(img.src);
            const blob = await response.blob();
            img.src = await new Promise((res) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result);
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            img.src = "";
          }
        }
      }
    }
    const json = JSON.stringify(state);
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
    link.download = "plottia_board.plottia";
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  // --- Plottia形式でインポート ---
  importBtn.addEventListener("click", () => {
    importFileInput.value = "";
    importFileInput.click();
  });
  importFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const state = JSON.parse(text);
      // 画像srcがbase64の場合はそのまま、blob:の場合は無視
      if (state.images && state.images.length > 0) {
        for (let img of state.images) {
          if (img.src && img.src.startsWith("blob:")) {
            img.src = "";
          }
        }
      }
      loadStateFromObject(state);
      saveState();
      alert("ファイルを復元しました。");
    } catch (err) {
      alert("ファイルの読み込みに失敗しました: " + err.message);
    }
  });

  // --- ゴミ箱ボタン（全データ消去） ---
  cleanupBtn.addEventListener("click", async () => {
    if (
      !confirm("本当に全てのデータを消去しますか？この操作は元に戻せません。")
    ) {
      return;
    }
    // boardDataを初期化
    boardData = createEmptyBoard();
    // 表示もリセット
    objectContainer.innerHTML = "";
    sectionContainer.innerHTML = "";
    svgLayer.innerHTML =
      `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#333" /></marker></defs>`;
    redrawCanvas();
    applyTransform();
    myUndoStack = [];
    myRedoStack = [];
    updateUndoRedoButtons();
    await saveState();
    alert("全データを消去しました。");
  });

  // Image file input handler
  imageFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith("image/")) {
      try {
        // Show loading message for large images
        if (file.size > 500000) {
          // 500KB
          showGuestConnectionStatus("画像を圧縮しています...", "info");
        }

        // Compress image for better performance
        const compressedDataUrl = await compressImage(file);

        const img = new Image();
        img.onload = function () {
          // Create image data
          const pos = getNewElementPosition();
          const payload = {
            id: `image-${myPeerId}-${Date.now()}`,
            x: parseFloat(pos.x.replace("px", "")),
            y: parseFloat(pos.y.replace("px", "")),
            width: Math.min(img.width, 300),
            height: Math.min(img.height, 300),
            zIndex: boardData.board.noteZIndexCounter++,
            src: compressedDataUrl,
            isLocked: false,
          };
          generateOperation("CREATE_IMAGE", payload, {
            original: { type: "CREATE_IMAGE", payload },
            inverse: {
              type: "DELETE_ELEMENTS",
              payload: { elementIds: [payload.id] },
            },
          });

          // Hide loading message
          const statusDiv = document.getElementById("guest-connection-status");
          if (statusDiv) statusDiv.remove();
        };
        img.src = compressedDataUrl;
      } catch (error) {
        console.error("Image compression failed:", error);
        alert("画像の処理中にエラーが発生しました。");
      }
    }
    // Clear the input so the same file can be selected again
    e.target.value = "";
  });

  backToFilesBtn.addEventListener("click", showFileManager);
  createNewFileBtn.addEventListener("click", createNewFile);
  createFromTemplateBtn.addEventListener("click", showTemplateModal);
  closeTemplateBtn.addEventListener("click", hideTemplateModal);
  saveTemplateBtn.addEventListener("click", showSaveTemplateDialog);

  // Close template modal when clicking outside
  templateOverlay.addEventListener("click", (e) => {
    if (e.target === templateOverlay) {
      hideTemplateModal();
    }
  });

  // Template tab switching
  builtinTemplatesTab.addEventListener("click", () => {
    builtinTemplatesTab.classList.add("active");
    customTemplatesTab.classList.remove("active");
    builtinTemplatesGrid.classList.remove("hidden");
    customTemplatesGrid.classList.add("hidden");
  });

  customTemplatesTab.addEventListener("click", () => {
    customTemplatesTab.classList.add("active");
    builtinTemplatesTab.classList.remove("active");
    customTemplatesGrid.classList.remove("hidden");
    builtinTemplatesGrid.classList.add("hidden");
  });

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  darkModeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem(
      "plottia-dark-mode",
      document.body.classList.contains("dark-mode") ? "1" : "0",
    );
    redrawCanvas(); // Redraw with new pen color if needed
  });

  // --- FIXED: ADD STROKE WIDTH EVENT LISTENER ---
  strokeWidthSlider.addEventListener("input", (e) => {
    const newWidth = e.target.value;
    currentStrokeWidth = parseInt(newWidth, 10);
    strokeWidthDisplay.textContent = newWidth;
    localStorage.setItem("plottia_stroke_width", newWidth);
  });
  // --- END FIX ---

  async function initializeApp() {
    if (localStorage.getItem("plottia-dark-mode") === "1") {
      document.body.classList.add("dark-mode");
    }

    // --- FIXED: LOAD SAVED STROKE WIDTH ---
    const savedWidth = localStorage.getItem("plottia_stroke_width");
    if (savedWidth) {
      currentStrokeWidth = parseInt(savedWidth, 10);
      strokeWidthSlider.value = savedWidth;
      strokeWidthDisplay.textContent = savedWidth;
    }
    // --- END FIX ---

    const urlHash = window.location.hash.substring(1);
    const [fileIdFromUrl, hostIdInUrl] = urlHash.split("/");

    // Check if this is a guest invitation URL (has both fileId and hostId)
    if (fileIdFromUrl && hostIdInUrl) {
      console.log("Detected invitation URL - connecting as guest");
      showGuestConnectionStatus("ホストに接続中...", "connecting");

      // Open file for guest mode (will initialize peer connection)
      openFile(fileIdFromUrl);
    } // Check if file exists locally
    else if (
      fileIdFromUrl &&
      getFileMetadata().some((f) => f.id === fileIdFromUrl)
    ) {
      openFile(fileIdFromUrl);
    } // No valid file, show file manager
    else {
      // If there was a fileId but it doesn't exist locally and no hostId, show error
      if (fileIdFromUrl && !hostIdInUrl) {
        showGuestConnectionStatus(
          "指定されたファイルが見つかりません。",
          "error",
        );
        setTimeout(() => showFileManager(), 3000);
      } else {
        showFileManager();
      }
    }
  }

  initializeApp();

  // =================================================================
  // ゲスト接続状態表示
  // =================================================================
  function showGuestConnectionStatus(message, type = "info") {
    // Remove existing status messages
    const existingStatus = document.getElementById("guest-connection-status");
    if (existingStatus) {
      existingStatus.remove();
    }

    // Create status element
    const statusDiv = document.createElement("div");
    statusDiv.id = "guest-connection-status";
    statusDiv.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 50000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px;
            text-align: center;
        `;

    // Set background color based on type
    switch (type) {
      case "connecting":
        statusDiv.style.backgroundColor = "#007bff";
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' +
          message;
        break;
      case "success":
        statusDiv.style.backgroundColor = "#28a745";
        statusDiv.innerHTML = '<i class="fas fa-check"></i> ' + message;
        break;
      case "error":
        statusDiv.style.backgroundColor = "#dc3545";
        statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' +
          message;
        break;
      default:
        statusDiv.style.backgroundColor = "#6c757d";
        statusDiv.innerHTML = '<i class="fas fa-info-circle"></i> ' + message;
    }

    document.body.appendChild(statusDiv);

    // Auto-remove success messages after 3 seconds
    if (type === "success") {
      setTimeout(() => {
        if (statusDiv.parentNode) {
          statusDiv.remove();
        }
      }, 3000);
    }
  }

  // =================================================================
  // グローバルエラーハンドリング
  // =================================================================
  function showErrorModal(errorMessage) {
    if (errorOverlay && errorDetails) {
      errorDetails.value = errorMessage;
      errorOverlay.classList.remove("hidden");
    } else {
      console.error("CRITICAL ERROR (modal not found):\n", errorMessage);
      prompt("エラーが発生しました。詳細をコピーしてください:", errorMessage);
    }
  }
  copyErrorBtn.addEventListener("click", () => {
    errorDetails.select();
    navigator.clipboard
      .writeText(errorDetails.value)
      .then(() => {
        copyErrorBtn.innerHTML = '<i class="fas fa-check"></i> コピーしました';
        setTimeout(() => {
          copyErrorBtn.innerHTML =
            '<i class="fas fa-copy"></i> クリップボードにコピー';
        }, 2000);
      })
      .catch((err) => {
        alert("コピーに失敗しました。");
      });
  });
  closeErrorBtn.addEventListener("click", () => {
    errorOverlay.classList.add("hidden");
  });

  // QR Code event listeners
  qrCodeBtn.addEventListener("click", showQRCode);
  copyQrLinkBtn.addEventListener("click", () => {
    if (!currentFileId || !hostPeerId) return;
    const url =
      `${window.location.origin}${window.location.pathname}#${currentFileId}/${hostPeerId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        copyQrLinkBtn.innerHTML = '<i class="fas fa-check"></i> コピーしました';
        setTimeout(() => {
          copyQrLinkBtn.innerHTML =
            '<i class="fas fa-copy"></i> リンクをコピー';
        }, 2000);
      })
      .catch(() => alert("リンクのコピーに失敗しました。"));
  });
  downloadQrBtn.addEventListener("click", downloadQRCode);
  closeQrBtn.addEventListener("click", () => {
    qrCodeOverlay.classList.add("hidden");
  });

  window.onerror = function (message, source, lineno, colno, error) {
    let formattedMessage = "予期せぬJavaScriptエラーが発生しました。\n\n" +
      "メッセージ: " +
      message +
      "\n" +
      "ファイル: " +
      (source || "不明") +
      "\n" +
      "行番号: " +
      (lineno || "不明") +
      "\n" +
      "列番号: " +
      (colno || "不明") +
      "\n";
    if (error && error.stack) {
      formattedMessage += "\nスタックトレース:\n" + error.stack;
    }
    showErrorModal(formattedMessage);
    return true;
  };
  window.addEventListener("unhandledrejection", function (event) {
    let formattedMessage =
      "捕捉されなかったPromiseのエラーが発生しました。\n\n";
    if (event.reason instanceof Error) {
      formattedMessage += "エラー名: " + 
        event.reason.name +
        "\n" +
        "メッセージ: " +
        event.reason.message +
        "\n";
      if (event.reason.stack) {
        formattedMessage += "\nスタックトレース:\n" + event.reason.stack;
      }
    } else {
      formattedMessage += "理由: " + String(event.reason);
    }
    showErrorModal(formattedMessage);
  });
});

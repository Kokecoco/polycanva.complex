// main.js

// --- DOM Elements ---
const els = {
    inputPattern: document.getElementById('inputPattern'),
    regexHighlight: document.getElementById('regexHighlight'),
    inputReplace: document.getElementById('inputReplace'),
    textSource: document.getElementById('textSource'),
    textResult: document.getElementById('textResult'),
    btnExecute: document.getElementById('btnExecute'),
    btnOpen: document.getElementById('btnOpen'),
    btnSave: document.getElementById('btnSave'),
    btnTheme: document.getElementById('btnTheme'),
    btnHelp: document.getElementById('btnHelp'), // 追加
    btnCloseHelp: document.getElementById('btnCloseHelp'), // 追加
    helpDialog: document.getElementById('helpDialog'), // 追加
    statusMsg: document.getElementById('statusMsg'),
    statusStats: document.getElementById('statusStats'),
    flags: {
        g: document.getElementById('flagG'),
        i: document.getElementById('flagI'),
        m: document.getElementById('flagM'),
        x: document.getElementById('flagX'),
    }
};

// --- Worker Setup ---
const worker = new Worker('worker.js');
let lastRequestId = 0;

worker.onmessage = (e) => {
    const { id, result, matchCount, time, error } = e.data;
    
    if (id !== lastRequestId) return;

    if (error) {
        els.statusMsg.textContent = `エラー: ${error}`;
        els.statusMsg.style.color = '#ff6b6b';
        return;
    }

    els.textResult.value = result;
    els.statusMsg.textContent = '完了';
    els.statusMsg.style.color = 'inherit';
    els.statusStats.textContent = `マッチ数: ${matchCount}件 | 処理時間: ${time}ms`;
};

// --- Logic ---

function getFlags() {
    let f = '';
    if (els.flags.g.checked) f += 'g';
    if (els.flags.i.checked) f += 'i';
    if (els.flags.m.checked) f += 'm';
    return f;
}

function triggerExecution() {
    const text = els.textSource.value;
    const pattern = els.inputPattern.value;
    const replace = els.inputReplace.value;
    const isVerbose = els.flags.x.checked;
    const flags = getFlags();

    if (!pattern) {
        els.statusMsg.textContent = '正規表現パターンを入力してください';
        return;
    }

    els.statusMsg.textContent = '処理中...';
    lastRequestId++;
    
    worker.postMessage({
        id: lastRequestId,
        text,
        pattern,
        replace,
        flags,
        isVerbose
    });

    updateHighlight();
}

function updateHighlight() {
    let code = els.inputPattern.value;
    code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    if (els.flags.x.checked) {
        code = code.replace(/(#.*)/g, '<span class="hl-comment">$1</span>');
        code = code.replace(/(\[.*?\])/g, '<span class="hl-class">$1</span>');
    }
    
    els.regexHighlight.innerHTML = code + '<br>';
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedExec = debounce(() => {
    if (els.textSource.value.length < 50000) {
        triggerExecution();
    } else {
        els.statusMsg.textContent = 'テキストサイズが大きいため、自動更新を停止しました。「実行」ボタンを押してください。';
    }
}, 300);

// --- Event Listeners ---

// Help Modal
els.btnHelp.addEventListener('click', () => {
    els.helpDialog.showModal();
});
els.btnCloseHelp.addEventListener('click', () => {
    els.helpDialog.close();
});
els.helpDialog.addEventListener('click', (e) => {
    if (e.target === els.helpDialog) els.helpDialog.close(); // 背景クリックで閉じる
});

[els.inputPattern, els.inputReplace, els.textSource].forEach(el => {
    el.addEventListener('input', debouncedExec);
});
Object.values(els.flags).forEach(el => el.addEventListener('change', triggerExecution));

els.btnExecute.addEventListener('click', triggerExecution);

// Sync scroll
els.inputPattern.addEventListener('scroll', () => {
    els.regexHighlight.scrollTop = els.inputPattern.scrollTop;
    els.regexHighlight.scrollLeft = els.inputPattern.scrollLeft;
});

// Theme Toggle
els.btnTheme.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
});
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
}

// --- File System Access API ---

els.btnOpen.addEventListener('click', async () => {
    if (!window.showOpenFilePicker) {
        alert('このブラウザはファイルシステム操作をサポートしていません。\nChromeやEdgeなどのPC版ブラウザをご利用ください。');
        return;
    }
    try {
        const [fileHandle] = await window.showOpenFilePicker();
        const file = await fileHandle.getFile();
        const text = await file.text();
        els.textSource.value = text;
        els.statusMsg.textContent = `${file.name} を読み込みました`;
        triggerExecution();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            alert('ファイル読み込みエラーが発生しました');
        }
    }
});

els.btnSave.addEventListener('click', async () => {
    if (!window.showSaveFilePicker) {
        alert('このブラウザはファイルシステム操作をサポートしていません。');
        return;
    }
    try {
        const opts = {
            types: [{
                description: 'Text file',
                accept: {'text/plain': ['.txt', '.csv', '.log', '.json']},
            }],
        };
        const handle = await window.showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        await writable.write(els.textResult.value);
        await writable.close();
        els.statusMsg.textContent = 'ファイルを保存しました';
    } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
    }
});

// Drag & Drop
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', async e => {
    e.preventDefault();
    if (e.dataTransfer.items) {
        const item = e.dataTransfer.items[0];
        if (item.kind === 'file') {
            const file = item.getAsFile();
            els.textSource.value = await file.text();
            els.statusMsg.textContent = `${file.name} を読み込みました`;
            triggerExecution();
        }
    }
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .catch(err => console.error('SW registration failed', err));
}
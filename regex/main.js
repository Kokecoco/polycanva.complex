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
    
    // 古いリクエストの結果なら無視 (Race condition防止)
    if (id !== lastRequestId) return;

    if (error) {
        els.statusMsg.textContent = `Error: ${error}`;
        els.statusMsg.style.color = '#ff6b6b';
        return;
    }

    els.textResult.value = result;
    els.statusMsg.textContent = 'Done';
    els.statusMsg.style.color = 'inherit';
    els.statusStats.textContent = `Matches: ${matchCount} | Time: ${time}ms`;
};

// --- Logic ---

function getFlags() {
    let f = '';
    if (els.flags.g.checked) f += 'g';
    if (els.flags.i.checked) f += 'i';
    if (els.flags.m.checked) f += 'm';
    // xフラグはworkerに別途渡す
    return f;
}

function triggerExecution() {
    const text = els.textSource.value;
    const pattern = els.inputPattern.value;
    const replace = els.inputReplace.value;
    const isVerbose = els.flags.x.checked;
    const flags = getFlags();

    if (!pattern) return;

    els.statusMsg.textContent = 'Processing...';
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

// 簡易ハイライト機能
function updateHighlight() {
    let code = els.inputPattern.value;
    // 安全のためにHTMLエスケープ
    code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // 簡易的な色付け (Verboseモード前提)
    if (els.flags.x.checked) {
        // コメント
        code = code.replace(/(#.*)/g, '<span class="hl-comment">$1</span>');
        // 文字クラス
        code = code.replace(/(\[.*?\])/g, '<span class="hl-class">$1</span>');
    }
    
    els.regexHighlight.innerHTML = code + '<br>'; // 末尾改行対応
}

// debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 50KB以下ならリアルタイム、それ以上はボタン実行のみにする制御も可能だが
// 今回はWorkerを使っているので300ms debounceで常に実行させてみる
const debouncedExec = debounce(() => {
    if (els.textSource.value.length < 50000) {
        triggerExecution();
    }
}, 300);

// --- Event Listeners ---

[els.inputPattern, els.inputReplace, els.textSource].forEach(el => {
    el.addEventListener('input', debouncedExec);
});
Object.values(els.flags).forEach(el => el.addEventListener('change', triggerExecution));

els.btnExecute.addEventListener('click', triggerExecution);

// Sync scroll for highlight overlay
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
// Default Dark Mode
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
}

// --- File System Access API ---

els.btnOpen.addEventListener('click', async () => {
    if (!window.showOpenFilePicker) {
        alert('このブラウザはFile System Access APIをサポートしていません。');
        return;
    }
    try {
        const [fileHandle] = await window.showOpenFilePicker();
        const file = await fileHandle.getFile();
        const text = await file.text();
        els.textSource.value = text;
        triggerExecution();
    } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
    }
});

els.btnSave.addEventListener('click', async () => {
    if (!window.showSaveFilePicker) {
        alert('このブラウザはFile System Access APIをサポートしていません。');
        return;
    }
    try {
        const opts = {
            types: [{
                description: 'Text file',
                accept: {'text/plain': ['.txt', '.csv', '.log']},
            }],
        };
        const handle = await window.showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        await writable.write(els.textResult.value);
        await writable.close();
        alert('保存しました');
    } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
    }
});

// Drag & Drop Support
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', async e => {
    e.preventDefault();
    if (e.dataTransfer.items) {
        const item = e.dataTransfer.items[0];
        if (item.kind === 'file') {
            const file = item.getAsFile();
            els.textSource.value = await file.text();
            triggerExecution();
        }
    }
});

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log('Service Worker Registered'));
}
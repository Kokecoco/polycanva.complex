// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ ここに、GASをデプロイした時に取得したウェブアプリURLを貼り付けます ★
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyZpSg5smSserG_4WacHwKEB4c6EBaYg40DHayODQnGhC4qj1dKZiajZ7BAkT7DsfOAPQ/exec';
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

// 要素の取得
const modal = document.getElementById('profile-modal');
const saveProfileBtn = document.getElementById('save-profile-btn');
const chatWindow = document.getElementById('chat-window');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// アプリケーションの状態
let userProfile = {};
let chatHistory = [];
const CONTEXT_WINDOW_SIZE = 20;

// 新機能のための変数
let debounceTimer = null; // 連続投稿を待つためのタイマー
let messageQueue = []; // 連続投稿されたメッセージを一時的に溜めるキュー
const DEBOUNCE_DELAY = 8000; // ユーザーの入力が8秒間止まったら送信する (8000ms)

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    loadDataFromStorage();
    renderChatHistory();
    if (!userProfile.hobby) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
});

// --- ローカルストレージ関連 ---
function loadDataFromStorage() {
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
        userProfile = JSON.parse(savedProfile);
        document.getElementById('age').value = userProfile.age || '';
        document.getElementById('hobby').value = userProfile.hobby || '';
        document.getElementById('cefr-level').value = userProfile.cefr || 'A2';
    }
    const savedHistory = localStorage.getItem('chatHistory');
    if (savedHistory) {
        chatHistory = JSON.parse(savedHistory);
    }
}
function saveDataToStorage() {
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

// --- イベントリスナー ---
saveProfileBtn.addEventListener('click', () => {
    userProfile = {
        age: document.getElementById('age').value || 25,
        hobby: document.getElementById('hobby').value,
        cefr: document.getElementById('cefr-level').value
    };
    if (userProfile.hobby) {
        modal.classList.add('hidden');
        saveDataToStorage();
    } else {
        alert('Please enter your hobby!');
    }
});

sendBtn.addEventListener('click', handleSend);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all chat history?')) {
        chatHistory = [];
        localStorage.removeItem('chatHistory');
        chatWindow.innerHTML = '';
        localStorage.removeItem('userProfile');
        modal.classList.remove('hidden');
    }
});

// --- メッセージ送信処理 ---

// 送信ボタンのメイン処理 (デバウンスロジックを導入)
function handleSend() {
    const messageText = messageInput.value.trim();

    // 「話しかけて」機能は即時実行
    if (messageText === '') {
        // もしユーザーが何か入力途中だったら、それを先に送信する
        if (messageQueue.length > 0) {
            flushMessageQueue();
        }
        sendMessageToAI('[[START_CONVERSATION]]');
        return;
    }

    // ユーザーのメッセージは即座に画面に表示し、履歴にも保存
    appendMessage(messageText, 'user');
    chatHistory.push({ role: 'user', text: messageText });
    saveDataToStorage();

    // 送信キューにメッセージを追加
    messageQueue.push(messageText);
    messageInput.value = '';

    // タイマーをリセットし、新しいタイマーをセット
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushMessageQueue, DEBOUNCE_DELAY);
}

// キューに溜まったメッセージをまとめてAIに送信する関数
function flushMessageQueue() {
    if (messageQueue.length === 0) {
        return;
    }
    // キューの内容を改行で連結して1つのメッセージにする
    const combinedMessage = messageQueue.join('\n');
    
    // AIに送信
    sendMessageToAI(combinedMessage);
    
    // キューを空にする
    messageQueue = [];
}

// AIへのメッセージ送信と応答処理
async function sendMessageToAI(messageText) {
    const loadingBubble = createLoadingBubble();
    chatWindow.appendChild(loadingBubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
        const recentHistory = chatHistory.slice(-CONTEXT_WINDOW_SIZE);
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                message: messageText,
                history: recentHistory,
                profile: userProfile
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.error) throw new Error(`API Error: ${result.error}`);

        loadingBubble.remove();

        const aiReplies = result.reply.split('[---]');
        for (let i = 0; i < aiReplies.length; i++) {
            const part = aiReplies[i].trim();
            if (part) {
                appendMessage(part, 'ai');
                chatHistory.push({ role: 'model', text: part });
                saveDataToStorage();
                if (i < aiReplies.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
        }
    } catch (error)
        console.error('Error:', error);
        loadingBubble.innerHTML = `<div class="message-bubble">Sorry, an error occurred: ${error.message}</div>`;
        loadingBubble.classList.remove('loading-bubble');
    }
}

// --- UI描画関連 ---
function renderChatHistory() {
    chatWindow.innerHTML = '';
    chatHistory.forEach(turn => {
        appendMessage(turn.text, turn.role === 'user' ? 'user' : 'ai');
    });
}

function appendMessage(text, sender) {
    const messageRow = document.createElement('div');
    messageRow.classList.add('message-row', `${sender}-message`);

    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble');
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    bubble.innerHTML = text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    if (sender === 'ai') {
        const icon = document.createElement('i');
        icon.className = 'fas fa-user-circle ai-icon';
        messageRow.appendChild(icon);
    }

    messageRow.appendChild(bubble);
    chatWindow.appendChild(messageRow);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function createLoadingBubble() {
    const messageRow = document.createElement('div');
    messageRow.classList.add('message-row', 'ai-message');

    const icon = document.createElement('i');
    icon.className = 'fas fa-user-circle ai-icon';
    
    const bubble = document.createElement('div');
    bubble.classList.add('loading-bubble');
    
    const spinner1 = document.createElement('div');
    spinner1.className = 'spinner';
    const spinner2 = document.createElement('div');
    spinner2.className = 'spinner';
    const spinner3 = document.createElement('div');
    spinner3.className = 'spinner';

    bubble.appendChild(spinner1);
    bubble.appendChild(spinner2);
    bubble.appendChild(spinner3);

    messageRow.appendChild(icon);
    messageRow.appendChild(bubble);

    return messageRow;
}

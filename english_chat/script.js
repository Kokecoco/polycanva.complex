// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ ここに、GASをデプロイした時に取得したウェブアプリURLを貼り付けます ★
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby12LWuHyTJKNuqSf4yyGegy3qNl8DrpAzSgymBqHeSLpms8dJMsxr_7umol78hXHFUMA/exec';
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

// 要素の取得
const modal = document.getElementById('profile-modal');
const saveProfileBtn = document.getElementById('save-profile-btn');
const chatWindow = document.getElementById('chat-window');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const loadingIndicator = document.getElementById('loading');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// アプリケーションの状態
let userProfile = {};
let chatHistory = [];
const CONTEXT_WINDOW_SIZE = 20; // APIに送信する直近の会話履歴の数

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
        // 保存された値をフォームに反映
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

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all chat history?')) {
        chatHistory = [];
        localStorage.removeItem('chatHistory');
        chatWindow.innerHTML = '';
        // プロフィールを再設定させる
        localStorage.removeItem('userProfile');
        modal.classList.remove('hidden');
    }
});


// --- メッセージ処理 ---
async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (messageText === '' || !userProfile.hobby) return;

    appendMessage(messageText, 'user');
    chatHistory.push({ role: 'user', text: messageText });
    saveDataToStorage();

    messageInput.value = '';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    loadingIndicator.classList.remove('hidden');

    // コンテキスト長を考慮し、直近の会話履歴のみを送信
    const recentHistory = chatHistory.slice(-CONTEXT_WINDOW_SIZE);

    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                message: messageText,
                history: recentHistory,
                profile: userProfile
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
            console.error('GAS Error:', result.error, 'Stack:', result.stack);
            throw new Error(`API Error: ${result.error}`);
        }

        appendMessage(result.reply, 'ai');
        chatHistory.push({ role: 'model', text: result.reply });
        saveDataToStorage();

    } catch (error) {
        console.error('Error:', error);
        appendMessage(`Sorry, an error occurred: ${error.message}. Please try again.`, 'ai');
    } finally {
        loadingIndicator.classList.add('hidden');
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
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
    bubble.textContent = text;
    
    if (sender === 'ai') {
        const icon = document.createElement('i');
        icon.className = 'fas fa-user-circle ai-icon';
        messageRow.appendChild(icon);
    }

    messageRow.appendChild(bubble);
    chatWindow.appendChild(messageRow);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

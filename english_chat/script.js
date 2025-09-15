// ----------------------------------------------------------------
// ★ 設定項目 ★
// ----------------------------------------------------------------
// 1. GASをデプロイして取得したウェブアプリURLをここに貼り付けます
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMz0KL9m6VknDUBPDI_WUGbxLll8tC27gow7gR5XLRFps2kM8XYtNPIJ68eLuACuwhNQ/exec';

// 2. 使用するオフラインモデルを選択します
// モデル一覧: https://github.com/mlc-ai/web-llm?tab=readme-ov-file#supported-models
// おすすめ: "Qwen-1.5-1.8B-Chat-q4f16_1-MLC" (比較的高性能で軽量)
//           "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC" (さらに軽量)
const SELECTED_MODEL = "Qwen-1.5-1.8B-Chat-q4f16_1-MLC";

// ----------------------------------------------------------------
import { CreateWebWorkerMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

// DOM要素の取得
const statusElement = document.getElementById('status');
const chatbox = document.getElementById('chatbox');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const difficultySelect = document.getElementById('difficulty');
const offlineFeedbackButton = document.getElementById('offlineFeedbackButton');
const onlineFeedbackButton = document.getElementById('onlineFeedbackButton');
const feedbackResult = document.getElementById('feedbackResult');

let engine;
let lastUserMessage = "";
let chatHistory = [];

// システムプロンプトを生成
function getSystemPrompt() {
    const difficulty = difficultySelect.value;
    return `You are a friendly and helpful English conversation partner named Alex. Your goal is to help the user practice English. Converse with the user at the English level of ${difficulty}. Keep your responses natural and engaging, but avoid overly complex vocabulary or sentence structures unless the user demonstrates a high level.`;
}

// WebLLMエンジンの初期化
async function initializeLlm() {
    statusElement.textContent = "Loading AI model... This may take a few minutes for the first time. The model will be cached for future visits.";
    try {
        engine = await CreateWebWorkerMLCEngine(
            new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
            SELECTED_MODEL,
            {
                initProgressCallback: (progress) => {
                    statusElement.textContent = `Loading: ${progress.text}`;
                }
            }
        );
        statusElement.textContent = "AI Model Loaded. Ready to chat!";
        enableUI(true);
    } catch (error) {
        statusElement.textContent = "Error loading model. Make sure your browser supports WebGPU and you are not in private browsing mode.";
        console.error("Model initialization error:", error);
    }
}

// チャットメッセージを送信
async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || !engine) return;

    lastUserMessage = message;
    appendMessage('You', message, 'user-msg');
    userInput.value = '';
    feedbackResult.innerHTML = '';
    enableUI(false);

    const userMessage = { role: "user", content: message };
    
    const messages = chatHistory.length === 0 
        ? [{ role: "system", content: getSystemPrompt() }, userMessage] 
        : [...chatHistory, userMessage];

    try {
        const reply = await engine.chat.completions.create({
            stream: true,
            messages: messages,
        });

        let aiResponse = "";
        const aiMessageDiv = appendMessage('AI', '...', 'ai-msg');
        
        for await (const chunk of reply) {
            const delta = chunk.choices[0].delta.content || "";
            aiResponse += delta;
            aiMessageDiv.querySelector('p').textContent = aiResponse;
            chatbox.scrollTop = chatbox.scrollHeight;
        }

        chatHistory.push(userMessage, { role: "assistant", content: aiResponse });

    } catch (error) {
        console.error("Chat error:", error);
        appendMessage('Error', 'An error occurred during chat.', 'ai-msg');
    } finally {
        enableUI(true);
        userInput.focus();
    }
}

// オフラインフィードバックを取得
async function getOfflineFeedback() {
    if (!lastUserMessage || !engine) return;
    feedbackResult.innerText = "Generating quick feedback (Offline)...";
    enableUI(false);

    const feedbackPrompt = `You are an English grammar checker. Correct the following sentence and provide a very simple, one-sentence explanation. Respond ONLY in this format:

Sentence: "${lastUserMessage}"

Corrected: [Your corrected version]
Explanation: [Your simple explanation]`;

    try {
        const reply = await engine.chat.completions.create({
            messages: [{ role: "user", content: feedbackPrompt }],
        });
        feedbackResult.innerText = reply.choices[0].message.content;
    } catch (error) {
        feedbackResult.innerText = "Error generating offline feedback.";
        console.error("Offline feedback error:", error);
    } finally {
        enableUI(true);
    }
}

// オンラインフィードバックを取得
async function getOnlineFeedback() {
    if (!lastUserMessage) return;
    if (GAS_URL.includes('YOUR_GAS_WEB_APP_URL_HERE')) {
        feedbackResult.innerText = "Please set up the GAS_URL in script.js first.";
        return;
    }

    feedbackResult.innerText = "Getting detailed feedback (Online)...";
    enableUI(false);

    const feedbackPromptForGemini = `Please act as a professional English teacher for a Japanese learner. Analyze the following sentence and provide feedback in Japanese.

Sentence: "${lastUserMessage}"

Format your response as follows:
1. **自然な修正案:** (Corrected, natural version)
2. **文法解説:** (Simple explanation of the grammar mistake in Japanese)
3. **語彙の提案:** (Suggest better vocabulary if applicable, with nuance explanation)`;

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ prompt: feedbackPromptForGemini })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        feedbackResult.innerText = data.reply || data.error || "No reply from API.";
    } catch (error) {
        feedbackResult.innerText = "Error: Could not fetch online feedback. Check console for details.";
        console.error("Online feedback error:", error);
    } finally {
        enableUI(true);
    }
}

// UIの有効/無効を切り替え
function enableUI(isEnabled) {
    userInput.disabled = !isEnabled;
    sendButton.disabled = !isEnabled;
    offlineFeedbackButton.disabled = !isEnabled || !lastUserMessage;
    onlineFeedbackButton.disabled = !isEnabled || !lastUserMessage;
}

// メッセージをチャットボックスに追加
function appendMessage(sender, text, className) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${className}`;
    msgDiv.innerHTML = `<strong>${sender}</strong><p>${text}</p>`;
    chatbox.appendChild(msgDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
    return msgDiv;
}

// イベントリスナーの設定
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
offlineFeedbackButton.addEventListener('click', getOfflineFeedback);
onlineFeedbackButton.addEventListener('click', getOnlineFeedback);
difficultySelect.addEventListener('change', () => {
    chatHistory = []; // 難易度を変えたら会話履歴をリセット
    appendMessage('System', `Conversation level set to ${difficultySelect.value}. History cleared.`, 'ai-msg');
});

// アプリケーションの開始
initializeLlm();

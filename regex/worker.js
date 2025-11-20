// worker.js

self.addEventListener('message', (e) => {
    const { id, text, pattern, replace, flags, isVerbose } = e.data;

    const startTime = performance.now();
    let resultText = text;
    let matchCount = 0;
    let error = null;

    try {
        if (!pattern) {
            throw new Error("Empty pattern");
        }

        // 1. Verboseモードの処理 (xフラグ)
        let finalPattern = pattern;
        if (isVerbose) {
            finalPattern = cleanVerbosePattern(pattern);
        }

        // 2. 正規表現オブジェクトの生成
        // フラグ文字列を整理 (xはJS標準ではないので除去)
        const jsFlags = flags.replace('x', ''); 
        const regex = new RegExp(finalPattern, jsFlags);

        // 3. 置換実行とカウント
        // replaceAllはES2021対応ブラウザで動作
        // カウントのためにmatchを使用するか、replaceのコールバックを使う
        if (text.length > 0) {
            // マッチ数計測 (Globalフラグがある場合)
            if (jsFlags.includes('g')) {
                const matches = text.match(regex);
                matchCount = matches ? matches.length : 0;
            } else {
                matchCount = regex.test(text) ? 1 : 0;
            }
            
            resultText = text.replace(regex, replace);
        }

    } catch (err) {
        error = err.message;
    }

    const endTime = performance.now();

    // 結果をメインスレッドへ返送
    self.postMessage({
        id,
        result: resultText,
        matchCount,
        time: (endTime - startTime).toFixed(2),
        error
    });
});

/**
 * Verboseモード(x)のエミュレーション
 * - 文字クラス [...] 内の空白と#は保持
 * - エスケープされた \# や \s は保持
 * - それ以外の空白と #以降のコメントを除去
 */
function cleanVerbosePattern(pattern) {
    // トークナイズ用の正規表現
    // Group 1: 文字クラス [...] (中のエスケープも考慮)
    // Group 2: エスケープシーケンス \.
    // Group 3: コメント #...
    // Group 4: 空白 \s+
    const tokenRegex = /((?:\[(?:\\.|[^\]])*\]))|(\\.)|(#.*)|(\s+)/g;

    return pattern.replace(tokenRegex, (match, charClass, escapeSeq, comment, whitespace) => {
        if (charClass) return charClass; // 文字クラスはそのまま
        if (escapeSeq) return escapeSeq; // エスケープ文字はそのまま (\# や \  など)
        if (comment) return '';          // コメントは削除
        if (whitespace) return '';       // 空白は削除
        return match; // それ以外（通常文字）はそのまま
    });
}
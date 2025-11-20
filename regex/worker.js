// worker.js

self.addEventListener('message', (e) => {
    const { id, text, pattern, replace, flags, isVerbose } = e.data;

    const startTime = performance.now();
    let resultText = text;
    let matchCount = 0;
    let error = null;

    try {
        if (!pattern) {
            // 空の場合はエラーとせずそのまま返す
            throw new Error("パターンが空です");
        }

        let finalPattern = pattern;
        if (isVerbose) {
            finalPattern = cleanVerbosePattern(pattern);
        }

        const jsFlags = flags.replace('x', ''); 
        
        // 正規表現の構文チェックも兼ねて生成
        let regex;
        try {
            regex = new RegExp(finalPattern, jsFlags);
        } catch (e) {
            throw new Error(`正規表現の構文エラー: ${e.message}`);
        }

        if (text.length > 0) {
            if (jsFlags.includes('g')) {
                const matches = text.match(regex);
                matchCount = matches ? matches.length : 0;
            } else {
                matchCount = regex.test(text) ? 1 : 0;
            }
            
            // 置換処理
            resultText = text.replace(regex, replace);
        }

    } catch (err) {
        // UIで見やすいようにメッセージを整形
        error = err.message;
    }

    const endTime = performance.now();

    self.postMessage({
        id,
        result: resultText,
        matchCount,
        time: (endTime - startTime).toFixed(2),
        error
    });
});

function cleanVerbosePattern(pattern) {
    // [...] (文字クラス), \\. (エスケープ), #... (コメント), \s+ (空白)
    const tokenRegex = /((?:\[(?:\\.|[^\]])*\]))|(\\.)|(#.*)|(\s+)/g;

    return pattern.replace(tokenRegex, (match, charClass, escapeSeq, comment, whitespace) => {
        if (charClass) return charClass;
        if (escapeSeq) return escapeSeq;
        if (comment) return '';
        if (whitespace) return '';
        return match;
    });
}
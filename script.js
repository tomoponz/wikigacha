document.addEventListener('DOMContentLoaded', () => {
    // === 設定 ===
    const MAX_PACKS = 10;
    const REGEN_TIME_MS = 60 * 1000; // 1分 = 60,000ミリ秒

    // === 状態管理 (localStorageから復元) ===
    let state = loadState();

    // DOM要素
    const openPackBtn = document.getElementById('gacha-pack-container');
    const packCountEl = document.getElementById('pack-count');
    const pullsLeftEl = document.getElementById('pulls-left');
    const timeUntilNextEl = document.getElementById('time-until-next');
    
    const modal = document.getElementById('result-modal');
    const closeBtn = document.getElementById('close-btn');
    const wikiLink = document.getElementById('wiki-link');
    
    // ガチャのレアリティ確率設定
    const rarities = [
        { name: 'UR', prob: 0.01, color: 'var(--rarity-ur)' },
        { name: 'SSR', prob: 0.05, color: 'var(--rarity-ssr)' },
        { name: 'SR', prob: 0.14, color: 'var(--rarity-sr)' },
        { name: 'R', prob: 0.30, color: 'var(--rarity-r)' },
        { name: 'N', prob: 0.50, color: 'var(--rarity-n)' }
    ];

    // === 初期化とループ ===
    updateUI();
    setInterval(gameLoop, 1000); // 1秒ごとに更新

    function loadState() {
        const saved = localStorage.getItem('wikiGachaState');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            packsLeft: MAX_PACKS,
            lastPullTime: 0,
            pullsToGold: 10,
            missions: { packsOpened: 0, pulledSR: false, openedWiki: false }
        };
    }

    function saveState() {
        localStorage.setItem('wikiGachaState', JSON.stringify(state));
    }

    // パック回復ロジックとUI更新のループ
    function gameLoop() {
        if (state.packsLeft < MAX_PACKS) {
            const now = Date.now();
            const timePassed = now - state.lastPullTime;
            const packsRecovered = Math.floor(timePassed / REGEN_TIME_MS);

            if (packsRecovered > 0) {
                state.packsLeft = Math.min(MAX_PACKS, state.packsLeft + packsRecovered);
                // 余った時間を次の計算用に保持
                state.lastPullTime += packsRecovered * REGEN_TIME_MS;
                saveState();
            }

            // タイマー表示の更新
            if (state.packsLeft < MAX_PACKS) {
                const timePassedSinceLast = Date.now() - state.lastPullTime;
                const msUntilNext = REGEN_TIME_MS - timePassedSinceLast;
                const secondsUntilNext = Math.ceil(msUntilNext / 1000);
                timeUntilNextEl.textContent = `次のパックまで: ${secondsUntilNext}秒`;
            } else {
                timeUntilNextEl.textContent = "パック満タン";
            }
        } else {
            timeUntilNextEl.textContent = "パック満タン";
        }
        updateUI();
    }

    function updateUI() {
        packCountEl.textContent = state.packsLeft;
        pullsLeftEl.textContent = state.pullsToGold;

        document.getElementById('ms-open-packs').textContent = `${Math.min(state.missions.packsOpened, 5)}/5`;
        document.getElementById('ms-sr').textContent = state.missions.pulledSR ? "1/1" : "0/1";
        document.getElementById('ms-wiki').textContent = state.missions.openedWiki ? "1/1" : "0/1";
        
        // パックがない場合は見た目を暗くする
        if(state.packsLeft <= 0) {
            openPackBtn.style.opacity = "0.5";
            openPackBtn.style.pointerEvents = "none";
        } else {
            openPackBtn.style.opacity = "1";
            openPackBtn.style.pointerEvents = "auto";
        }
    }

    function getRandomRarity() {
        let rand = Math.random();
        let cumulative = 0;
        for (let r of rarities) {
            cumulative += r.prob;
            if (rand <= cumulative) return r;
        }
        return rarities[rarities.length - 1];
    }

    // Wikipediaのランダム記事と概要を取得
    async function fetchRandomWiki() {
        // ランダムな記事タイトルを取得
        const randomUrl = "https://ja.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*";
        try {
            const randomRes = await fetch(randomUrl);
            const randomData = await randomRes.json();
            const title = randomData.query.random[0].title;

            // 取得したタイトルの概要(extract)を取得
            const extractUrl = `https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`;
            const extractRes = await fetch(extractUrl);
            const extractData = await extractRes.json();
            
            const pages = extractData.query.pages;
            const pageId = Object.keys(pages)[0];
            const extract = pages[pageId].extract || "概要がありません。";

            return { title: title, extract: extract };
        } catch (error) {
            console.error("Wikipedia API Error:", error);
            return { title: "エラー", extract: "記事を取得できませんでした。通信環境を確認してください。" };
        }
    }

    // ガチャを引く処理
    openPackBtn.addEventListener('click', async () => {
        if (state.packsLeft <= 0) return;

        // もしパックが満タンだったなら、回復の起点を今にする
        if (state.packsLeft === MAX_PACKS) {
            state.lastPullTime = Date.now();
        }

        // 状態更新
        state.packsLeft--;
        state.pullsToGold = state.pullsToGold === 1 ? 10 : state.pullsToGold - 1;
        state.missions.packsOpened++;
        
        // モーダルを「読み込み中」で表示
        document.getElementById('card-rarity').textContent = "???";
        document.getElementById('card-rarity').style.color = "white";
        document.getElementById('result-card').style.borderColor = "white";
        document.getElementById('card-title').textContent = "通信中...";
        document.getElementById('card-desc').textContent = "";
        modal.classList.remove('hidden');

        // ガチャ結果計算
        const rarity = getRandomRarity();
        if (['SR', 'SSR', 'UR'].includes(rarity.name)) {
            state.missions.pulledSR = true;
        }

        saveState();
        updateUI();

        // Wikipedia記事取得
        const article = await fetchRandomWiki();
        const articleUrl = `https://ja.wikipedia.org/wiki/${encodeURIComponent(article.title)}`;

        // モーダル内容更新
        document.getElementById('card-rarity').textContent = rarity.name;
        document.getElementById('card-rarity').style.color = rarity.color;
        document.getElementById('result-card').style.borderColor = rarity.color;
        document.getElementById('card-title').textContent = article.title;
        document.getElementById('card-desc').textContent = article.extract;
        wikiLink.href = articleUrl;
    });

    // モーダル閉じる
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Wikipediaリンクを開いた時のミッション進行
    wikiLink.addEventListener('click', () => {
        if (!state.missions.openedWiki) {
            state.missions.openedWiki = true;
            saveState();
            updateUI();
        }
    });
});

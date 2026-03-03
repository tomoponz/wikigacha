document.addEventListener('DOMContentLoaded', () => {
    // 状態管理
    let packsLeft = 10;
    let pullsToGold = 10;
    let missions = {
        packsOpened: 0,
        pulledSR: false,
        openedWiki: false
    };

    // DOM要素
    const openPackBtn = document.getElementById('open-pack-btn');
    const packCountEl = document.getElementById('pack-count');
    const pullsLeftEl = document.getElementById('pulls-left');
    const goldProgressEl = document.getElementById('gold-progress');
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

    function getRandomRarity() {
        let rand = Math.random();
        let cumulative = 0;
        for (let r of rarities) {
            cumulative += r.prob;
            if (rand <= cumulative) return r;
        }
        return rarities[rarities.length - 1];
    }

    // Wikipediaのランダム記事を取得
    async function fetchRandomWiki() {
        const url = "https://ja.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*";
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data.query.random[0];
        } catch (error) {
            console.error("Wikipedia API Error:", error);
            return { title: "エラー: 記事を取得できませんでした", id: 0 };
        }
    }

    // ガチャを引く処理
    openPackBtn.addEventListener('click', async () => {
        if (packsLeft <= 0) {
            alert("本日のパックは終了しました！");
            return;
        }

        // UI更新
        packsLeft--;
        pullsToGold = pullsToGold === 1 ? 10 : pullsToGold - 1;
        packCountEl.textContent = packsLeft;
        pullsLeftEl.textContent = pullsToGold;
        goldProgressEl.style.width = `${(10 - pullsToGold) * 10}%`;

        // ミッション進行
        missions.packsOpened++;
        document.getElementById('ms-open-packs').textContent = `${Math.min(missions.packsOpened, 5)}/5`;

        // ガチャ結果計算
        const rarity = getRandomRarity();
        if (['SR', 'SSR', 'UR'].includes(rarity.name)) {
            missions.pulledSR = true;
            document.getElementById('ms-sr').textContent = "1/1";
        }

        // Wikipedia記事取得
        const article = await fetchRandomWiki();
        const articleUrl = `https://ja.wikipedia.org/wiki/${encodeURIComponent(article.title)}`;

        // モーダル表示設定
        document.getElementById('card-rarity').textContent = rarity.name;
        document.getElementById('card-rarity').style.color = rarity.color;
        document.getElementById('result-card').style.borderColor = rarity.color;
        document.getElementById('card-title').textContent = article.title;
        wikiLink.href = articleUrl;
        
        modal.classList.remove('hidden');
    });

    // モーダル閉じる
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Wikipediaリンクを開いた時のミッション進行
    wikiLink.addEventListener('click', () => {
        if (!missions.openedWiki) {
            missions.openedWiki = true;
            document.getElementById('ms-wiki').textContent = "1/1";
        }
    });
});

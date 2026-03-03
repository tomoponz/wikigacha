document.addEventListener("DOMContentLoaded", () => {
    let packCount = 10;
    let pullsToGold = 10;

    const packBtn = document.getElementById("open-pack-btn");
    const packCountSpan = document.getElementById("pack-count");
    const pullsLeftSpan = document.getElementById("pulls-left");
    
    // モーダル関連
    const modal = document.getElementById("result-modal");
    const closeModalBtn = document.getElementById("close-modal-btn");
    const cardRarity = document.getElementById("card-rarity");
    const cardTitle = document.getElementById("card-title");
    const cardDesc = document.getElementById("card-desc");

    // Wikipedia APIからランダム記事を取得する関数
    async function fetchRandomWiki() {
        const url = "https://ja.wikipedia.org/w/api.php?action=query&format=json&generator=random&grnnamespace=0&prop=extracts&exintro=1&explaintext=1&origin=*";
        const response = await fetch(url);
        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        return pages[pageId];
    }

    packBtn.addEventListener("click", async () => {
        if (packCount <= 0) {
            alert("デイリーパックがありません。ミッションをクリアするか時間を置いてください。");
            return;
        }

        // ガチャを引くアニメーション（一時無効化）
        packBtn.style.pointerEvents = "none";
        packBtn.innerHTML = "<div class='tap-text'>開封中...</div>";

        try {
            const page = await fetchRandomWiki();
            
            // レアリティの疑似判定
            const rarities = ["N", "R", "SR", "SSR", "UR"];
            // ゴールドパックの場合はSSR確定、それ以外はランダム
            const rarity = pullsToGold === 1 ? "SSR" : rarities[Math.floor(Math.random() * rarities.length)];
            
            // 結果をモーダルにセット
            cardRarity.textContent = `【${rarity}】`;
            cardTitle.textContent = page.title;
            cardDesc.textContent = page.extract ? page.extract.substring(0, 80) + "..." : "詳細テキストなし";

            // 回数を減らす
            packCount--;
            pullsToGold--;
            if (pullsToGold <= 0) pullsToGold = 10;

            // 画面の数字を更新
            packCountSpan.textContent = packCount;
            pullsLeftSpan.textContent = pullsToGold;

            // モーダルを表示
            modal.classList.remove("hidden");

        } catch (error) {
            alert("通信エラーが発生しました。");
        } finally {
            // ボタンを元に戻す
            packBtn.style.pointerEvents = "auto";
            packBtn.innerHTML = `<div class="pack-title">Wiki Pack</div><div class="tap-text">▲ タップして開ける ▲</div>`;
        }
    });

    closeModalBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
    });
});

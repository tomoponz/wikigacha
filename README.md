# WikiGacha（サンプル実装）

これは **「Wikipediaのランダム記事をカード化して引ける」** という発想を、ゼロから実装した GitHub Pages 用のサンプルです。

- パック（1日10回）
- 金パック（10回ごとに排出率UP）
- デイリーミッション（達成で +2 パック）
- 図鑑（検索/レアリティ絞り込み）
- 簡易バトル（デッキ最大3枚）

## 重要（著作権）
このコードは、特定サイトの **HTML/CSS/JSや画像をコピーして「完全再現」するものではありません。**
見た目や文言はオリジナルです。既存サイトを丸ごと複製することは、権利的に問題になる可能性が高いので避けてください。

## Wikipedia API
日本語Wikipediaの REST API を利用します:

- `https://ja.wikipedia.org/api/rest_v1/page/random/summary`

取得した要約・サムネイル等の権利は各権利者に帰属します（WikipediaはCC BY-SA等）。

## 使い方（GitHub Pages）
1. このフォルダ一式を GitHub リポジトリのルートにアップロード
2. Settings → Pages → Deploy from a branch → `main` / `/ (root)` を選択
3. 公開URLにアクセス

## ローカルで動かす
ブラウザで `index.html` を開いても動きます（fetchがブロックされる環境では簡易フォールバックになります）。
確実に動かすなら簡易サーバ:

```bash
python -m http.server 8000
```


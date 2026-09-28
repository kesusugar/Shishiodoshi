# Shishiodoshi

ブラウザで動く、極限までリアルなししおどし（three.js / WebGL2 / Web Audio）。全体プランは [docs/PLAN.md](docs/PLAN.md)。

## 使い方

```sh
npm install
npm run dev        # http://localhost:5173/Shishiodoshi/ （クリックで開始）
```

URL オプション: `?view=close`（寄りのカメラ）、`?capture`（UI を隠す。検証スクリプト用）

## 検証

```sh
npm test           # 物理の単体テスト（Vitest）
npm run shot       # tools/out/ にスクリーンショット。コンソール・シェーダーのエラーで失敗
npm run perf       # fps とフレーム時間
npm run build      # 型チェック + 本番ビルド
```

`shot` / `perf` はインストール済みの Edge を Playwright で動かす（ブラウザのダウンロードは不要）。
GPU のない環境では `node tools/shot.mjs --swiftshader` を使う。

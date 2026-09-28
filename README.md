# Shishiodoshi

ブラウザで動く、極限までリアルなししおどし（three.js / WebGL2 / Web Audio）。全体プランは [docs/PLAN.md](docs/PLAN.md)。

## 使い方

```sh
npm install
npm run dev        # http://localhost:5173/Shishiodoshi/ （クリックで開始）
```

URL オプション: `?view=close`（口と水の寄り）・`?view=mouth`（竹の口の接写）・`?view=wide`（引き）、`?capture`（UI を隠す。検証スクリプト用）、`?off=dof,stream,water,shadow`（機能を切って負荷を測る）

鉢の水面をクリックすると波紋が立ちます。左上の「すぐ倒す」で待たずに一回倒せます。`G` キー（または `?debug`）で角度・水量・トルクのグラフを表示します。`?t=20.7` でシミュレーションをその時刻まで早送りして始めます。

## 検証

```sh
npm test           # 物理の単体テスト（Vitest）
npm run shot       # tools/out/ にスクリーンショット。コンソール・シェーダーのエラーで失敗
npm run perf       # fps とフレーム時間
npm run build      # 型チェック + 本番ビルド
node tools/audio.mjs --seconds=6 --start=18   # 音をオフラインで WAV に書き出し、スペクトログラムを作る
node tools/inspect.mjs --t=20.7               # その時刻のシミュレーションの状態を表示
```

`shot` / `perf` はインストール済みの Edge を Playwright で動かす（ブラウザのダウンロードは不要）。
GPU のない環境では `node tools/shot.mjs --swiftshader` を使う。

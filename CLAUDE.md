# Shishiodoshi

ブラウザで動く、極限までリアルなししおどし（three.js / WebGL2 / Web Audio）。

## 最初に読むもの
- `docs/HANDOFF.md` — **いまの状態・ファイルの地図・確認のやり方・次にやること**（別の PC から引き継いだら最初にこれ）
- `docs/PLAN.md` — 全体プラン。方針・物理モデル・水の描画・音・段階（P0〜P6）・決定事項はすべてここ
- `docs/reference/` — 参考画像（ref1: 配置、ref2: 苔・水・木漏れ日、**ref3: ユーザーが指定した理想の見た目**）

## 決定事項（詳細は PLAN.md 12〜14章）
- PC ブラウザだけ（スマホ対応しない）
- 音はすべて AudioWorklet で合成（録音素材は使わない）
- 見た目はまず「夏」だけ。季節の値は `src/scene/seasons/` にまとめ、後で春・秋・冬を足せるようにする
- 公開は GitHub Pages（GitHub Actions、`main` へのマージで公開、Vite の `base` は `/Shishiodoshi/`）
- 水面の波（iWave）・コースティクス・水の光の扱いは ScottieFox/caustic-volume（MIT）から移植する。移植したファイルには元の著作権表示を残し、`THIRD_PARTY_NOTICES.md` にライセンス全文を入れる

## 進め方
- 段階ごと（P0 → P6）に小さくコミットする。各段階の確認条件（PLAN.md 9章）を満たしてから次へ
- 物理（`src/sim/`）は描画・音から独立させ、240Hz 固定ステップ・決定論的にする。Vitest でテストする
- 竹の動きを決まった周期のアニメーションで作らない。竹と水の重さによる回転を計算して、そこから動き・見た目・音を出す

## 実機での確認（このリポジトリはユーザーの Windows PC で Claude Code を使って開発する）
- 実行環境: Windows、PowerShell、Node v24、npm 11。PC に本物の GPU がある
- Playwright は**ブラウザをダウンロードせず**、インストール済みの Edge を使う: `chromium.launch({ channel: 'msedge' })`
  - GPU を使うので fps の計測も意味がある。ソフトウェア描画のフラグ（`--use-angle=swiftshader` など）はクラウドなど GPU がない環境のときだけ付ける
- 見た目の確認: スクリーンショットを撮って自分で見て、`docs/reference/` の参考画像と比べる
- 音の確認: OfflineAudioContext で WAV に書き出し、スペクトログラム画像を作って確かめる。**聞き心地の最終判断はユーザーの耳**なので、段階の終わりに `npm run dev` で聞いてもらい、感想をもらう
- クラウドのセッション（GPU も Edge もない）では、SessionStart フックが `SHISHI_BROWSER` と `SHISHI_SWIFTSHADER=1` を設定するので、同じツールがそのまま動く（fps は測れない）
- 開発サーバー: `npm run dev` → `http://localhost:5173/Shishiodoshi/`（音はクリックしてから鳴る）

## コミット
- コミットメッセージは英語、短く、何を変えたか

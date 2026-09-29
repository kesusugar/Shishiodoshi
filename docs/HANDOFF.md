# 引き継ぎメモ（2026-09-29 時点）

別の PC の Claude Code で続きから作業するためのメモ。CLAUDE.md → このファイル → docs/PLAN.md の順に読めば始められる。

## いまの状態

- 公開ページ: https://kesusugar.github.io/Shishiodoshi/ （`main` への push で GitHub Actions が自動公開。Pages の設定は済み）
- 作業ブランチ: `claude/shishiodoshi-log-check-wuhi7x`（`main` と同じ内容。どちらから始めてもよい）
- テスト 10 件が通る（`npm test`）。`npm run build` も通る
- 目標の見た目: `docs/reference/ref3-ideal.png`（ユーザーが「これが理想」と指定した画像）。ref1 は配置、ref2 は苔と水の質感の参考

### 段階（PLAN.md 9章）

| 段階 | 状態 |
|---|---|
| P0 下準備 | 完了 |
| P1 物理 | 完了。周期は約 27 秒（流量 16 mL/s） |
| P2 音 | 一通りできている。**ユーザーの耳での確認はまだ** |
| P3 形と素材 | 大半できた（竹・鉢・苔・庭・岩・シダ・カエデ・灯籠） |
| P4 水の描画 | 大半できた（下の「水」参照） |
| P5 仕上げ | 一部（被写界深度、解像度の自動調整）。光のにじみ・反響・空間音・設定 UI は未 |
| P6 公開 | 完了 |

## ファイルの地図

```
src/
  main.ts                 全体の組み立て、URL オプション、描画ループ
  sim/                    物理（描画から独立、240Hz 固定ステップ、テストあり）
    config.ts               寸法・流量など全部の物理パラメータ（シーンもここから寸法を読む）
    tubeHydro.ts            斜めの口の筒に入る水の量・重心（角度と水面から計算）
    shishiodoshi.ts         回転・衝突・あふれ・水面の揺れ・イベント
    stream.ts               筧の水が口に入るか、竹に当たるか、鉢に落ちるか
  audio/                  AudioWorklet の合成（synth.worklet.ts）、offline.ts は WAV 書き出し用
  render/
    env.ts                  背景の森（キューブマップに一度焼く）と環境光、遠くの地面のフェード
    canopy.ts               頭上の葉（木漏れ日の影。水のコースティクスも同じ葉で遮る）
    post.ts                 被写界深度と解像度の自動調整（MSAA はなし。理由はコード内のコメント）
    quality.ts              画質の設定（PC は high、タッチだけの端末は low。?quality=high|low で指定もできる）
    simView.ts              物理 → 見た目の橋渡し（筒の角度、水流、注ぎ出し、しぶき、葉、あふれ）
    water/
      basinWater.ts           鉢の水面（caustic-volume から移植。波紋・泡・コースティクス）
      stream.ts               落ちる水の柱（筧は途中で粒に分かれる、注ぎ出しは気泡の筋）
      splash.ts / beads.ts    しぶきの粒、竹の表面の水滴
      floatingLeaves.ts       水面に浮く紅葉（波に乗って揺れ、水に押されて流れる）
      overflow.ts             鉢の縁からあふれて石を伝う水
      tubeWater.ts            筒の中の水面
  ui/settings.ts          設定パネル（水の量＝コツンの間隔、コツン・水・まわりの音量。ブラウザに保存）
  scene/
    shishiodoshi.ts         竹筒・支柱・当たり石・筧・鉢の配置
    bamboo.ts / basin.ts    竹と鉢の形
    garden.ts               砂利・苔の岩・シダ・カエデの枝・木の幹・石灯籠・地面の落ち葉
    leaves.ts               カエデの葉の形（テクスチャと反った面）
    rockMaterial.ts         苔の生えた濡れた石の材質
    seasons/summer.ts       季節ごとの値（今は夏だけ）
tools/                    Edge を Playwright で動かす確認用スクリプト（下）
THIRD_PARTY_NOTICES.md    caustic-volume（MIT）のライセンス
```

## 確認のやり方（毎回これで見てから直す）

```sh
npm install                                        # 初回。Playwright はブラウザをダウンロードしない（Edge を使う）
node tools/shot.mjs --views=main,close             # tools/out/shot-*.png を撮って Read で見る
node tools/shot.mjs --views=close --query=at=26.2 --tag=pour   # その瞬間で止めて撮る（26.2 秒は注ぎ出しの最中）
node tools/perf.mjs --seconds=8 --headed           # fps（ヘッドレスより実窓のほうが実態に近い）
node tools/perf.mjs --headed --off=garden          # 機能を切って重さを比べる（dof, stream, water, shadow, canopy, garden）
node tools/inspect.mjs --t=26                      # その時刻の物理の状態を JSON で表示
node tools/audio.mjs --seconds=6 --start=24        # 音を WAV とスペクトログラム画像に書き出す
```

- カメラ: `?view=` に `main`（標準）、`close`（口と水面）、`mouth`（竹の口）、`stream`（筧の水）、`overflow`（あふれ）、`wide`（引き）
- 倒れる時刻は流量で変わる。最初の注ぎ出しは約 25.97〜26.53 秒、コツンは 26.746 秒（流量を変えたらテストで時刻を出し直す）
- 竹は鉢の水面に届かない: 前の止め（横木）の角度は `basinClearance`（10 cm）から計算している（`src/sim/config.ts` の `frontStopFor`）。テストで保証している
- 音の大きさの順番: コツン ＞ 注ぎ出し・鉢への着水 ＞ 筧のちょろちょろ。値は `src/audio/synth.worklet.ts` の `MIX`。聴感に近い大きさで比べること（低音は耳にもノートPCのスピーカーにも小さく聞こえる）
- `npm run dev` → http://localhost:5173/Shishiodoshi/ 。画面左上の「すぐ倒す」で待たずに倒せる。`G` でグラフ

## 環境の注意

- **スマホの音**: iPhone は Web Audio を消音スイッチで消される種類の音として扱うので、開始のタップで「再生」扱いに切り替えている（Audio Session API、古い iOS は無音の <audio> をループ）。電話やアプリ切り替えで止まった音は、次のタップか画面に戻ったときに再開する（`src/audio/startGate.ts`）

- **クラウド（Claude Code on the web）でも作業できる**: `.claude/hooks/session-start.sh` がセッション開始時に `SHISHI_BROWSER`（入っている Chromium）と `SHISHI_SWIFTSHADER=1`（GPU なしの描画）を設定し、`npm ci` する。撮影・音の書き出しはそのまま動く（1 視点 50 秒ほどかかる）。fps はクラウドでは測れない

- 元の PC は Intel Iris Xe（内蔵 GPU）。fps は PC の状態に大きく左右される（バッテリー節約中は 30fps 上限、Dropbox 同期中などは 16fps 程度まで落ちた）。**遅くなったら、まず前のコミットでも同じか測って、コードのせいか PC のせいかを切り分ける**
- この PC の git には名前とメールが設定されていなかったので、`git -c user.name=Claude -c user.email=noreply@anthropic.com commit ...` でコミットしていた。新しい PC で設定済みならそのままでよい
- `gh` CLI は入っていなかった。GitHub の Actions の結果は `https://api.github.com/repos/kesusugar/Shishiodoshi/actions/runs?per_page=1` を curl で見ていた
- ユーザーは作業ブランチへの push を「どんどんしてよい」と言っている。`main` への push（＝公開）は許可の確認が出ることがある

## ユーザーの好み

- 日本語でやりとりする。説明はやさしい言葉で
- 見た目は「実在の庭をカメラで撮った写真」（ref3）に近づけたい。整いすぎず、汚れ・濡れ・不揃いがあるほうがよい
- 物理的に不自然なものは嫌う（例: 筧の水が勢いよく出すぎていたのを指摘された → 実物どおり細く、途中で粒になるように直した）
- 変えたら毎回スクリーンショットで自分で見て、確かめてから進める

## 次にやるとよいこと

これまでの残り（注ぎ出しの膜、手前のカエデ、スマホの画質、前の止めの音と庭の反響、石の質感と接地感、設定パネル）は実装済み。次は:

1. ユーザーに PC とスマホで聞いて・見てもらい、感想で直す（音の聞き心地、スマホの fps と発熱）
2. 注ぎ出しの水: 今は膜が途中でほつれて消え、粒は小さな粒子。粒の数や大きさ、白い泡の量は実物の動画と見比べて詰める余地がある
3. 竹の表面: 細かい傷や節まわりの汚れ（石はやった）
4. 季節（春・秋・冬）は `src/scene/seasons/` に値を足す設計。落ちた花びら・紅葉が水面で流れる仕組み（floatingLeaves.ts）はそのまま使える

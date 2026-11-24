# Blenderでの制作を支える補助ツール

目は皮膚マスクのフィット・転送で土台を作り、Blenderの通常編集で仕上げます。口・眉の一括転送は[転送手順](transfer.md)を使い、必要な局所を仕上げます。Blender 5.2以降とMToon用の既存VRM Add-onを使います。Computer Useはエージェントで利用できる操作手段を使います。INPUT / WORK / PROJECTは今回の実パスへ置き換えます。

## 準備

```text
node scripts/expression-lab.mjs init INPUT WORK --config CONFIG.json --project PROJECT
node scripts/expression-lab.mjs open WORK
node scripts/expression-lab.mjs serve WORK
```

CONFIGは `objects: [顔・眼・まつ毛の実際のメッシュ名]` と、必要なら `camera: {center,front,up,ortho_scale,size}` です。既存表情を修正する場合は `keys: {blink: {メッシュ名: 元キー名}}` を渡すと、元キーを保持した編集用コピーを作れます。元キーの値と作業キーを重ねて二重適用しないよう、表示状態を確認します。カメラは実画像で向きと切り取りを確認します。単独モデルは--projectを省きます。アプリのWORKは `work/expression-authoring` です。同じフォルダーへinitを繰り返しません。旧試行は比較表示で参照でき、旧workerは起動しません。

表情制作タブへ読み込んだモデルを編集する場合は、project.jsonの`expressionEditor.imported.path`と同じファイルをINPUTにします。VRMは既存VRM Add-onで読み込み、既存の表情を保持したコピーを作ります。タブの`expressionEditor.controls`に選択と強度・最小値・最大値が保存されています。プレビューの調整値と、頂点そのものの造形の変更を区別してください。ファイルを読み込んだだけで別モデルへ表情が転送されたとは扱いません。

initは準備だけ背景Blenderを使います。openは作業コピーをUIのあるBlenderで開いて補助パネルを読みます。既に同じコピーが開いていれば、下の読み込みだけで再開し、Blenderを増やしません。無関係な未保存作業は上書きしません。

## 開いているBlenderから使う

MCP等から実行する準備用コード例です。SCRIPT / WORKは実パスに置き換えます。

```python
import importlib.util, sys
spec = importlib.util.spec_from_file_location('expression_studio', SCRIPT)
studio = importlib.util.module_from_spec(spec)
sys.modules['expression_studio'] = studio
spec.loader.exec_module(studio)
helper = studio.attach(WORK)
```

再開はこのWORKのcurrent.blendを開いて行います。新規の作業状態からは `attach(WORK, objects=[...], camera={...})` が使えます。原本は上書きせず専用キーを作ります。Nパネル「表情制作」で表情・強度・撮影方向を選べます。必要な表示だけ撮り、通常のBlender編集で整えます。MToonの表示材質コピーとStandardで作業し、構造を見る時はソリッドへ切り替えられます。保存では元の材質へ戻します。

密なメッシュで頂点を狙う操作に時間がかかる場合、今回の画像と構造で特定済みの頂点番号からPythonで選択を準備できます。対象キー・表示・カメラ・プロポーショナル半径の準備も補助コードを使い、形を見て動かす操作へ時間を使います。番号の意味は今回のモデルで確認し、別モデルから流用しません。大きな移動を決める前に、選択位置と影響範囲を画面で確認します。

```python
helper.expression('blink', 1)
helper.capture('blink')                 # 未保存の形をFrontへ撮影
helper.capture('blink', .5)             # 必要な途中だけ
helper.capture('blink', 0, label='neutral')
helper.capture('blink', display='wire') # 構造が気になる時
helper.suite('blink')                   # 仕上げ時の4方向・5強度と構造
helper.capture(combination={'aa':1, 'blink':1})
helper.note('目標より目尻が鋭い', '目尻と周囲を戻す', '弧が改善', '横から厚みを確認')
```

## エージェントが指定した目印でフィットする

既に顔と部品を判断できる場合、一覧や部品撮影は省けます。必要なら以下を使います。道具は幾何学的な連結部品を示すだけで、意味を分類しません。

```python
parts = helper.list_blink_parts(['Head'])  # number / object / seed / count / bounds / color
helper.capture_blink_parts(['Head'], angles=['Front'])
helper.select_blink_part('Head', SEED)     # 該当部品をEdit Modeで選択
helper.prepare_blink('Head', skin_seed=SKIN_SEED)
helper.set_blink_followers([{'object':'Hair', 'seed':LASH_SEED}])
```

`prepare_blink`は選んだ皮膚部品の大きさとStudioカメラ方向を使い、同梱マスクとその初期8点を置きます。目の検出は行いません。エージェントが目印を画面のG操作、世界座標、固定撮影の画素で合わせます。Lはカメラ基準の右（正面画像の右）、Rは左です。入力モデルのローカルX軸とは限りません。

```python
helper.set_blink_points({'eyeInnerL':[world_x, world_y, world_z]})
# または、同じsession.cameraで撮影した画像の左上原点pxを使います。
projection = helper.set_blink_pixels({
    'eyeInnerL':[px,py], 'eyeOuterL':[px,py],
    'eyeUpperL':[px,py], 'eyeLowerL':[px,py],
    'eyeInnerR':[px,py], 'eyeOuterR':[px,py],
    'eyeUpperR':[px,py], 'eyeLowerR':[px,py],
}, angle='Front', snap_pixels=12)
helper.fit_blink()
helper.capture_fit(angles=['Front'])
```

画素は元の撮影画像の座標です。切り抜き・拡大縮小した表示の座標をそのまま渡しません。投影は指定した皮膚部品のBasisだけにraycastし、別部品の虹彩やまつ毛は参照しません。前向き面に当たらない時、snap_pixelsを明示した範囲だけ近傍の投影頂点へsnapします。返る各点のworld/method/pixel_error（snap時はvertexも）を確認します。位置が違えば再指定・再fitします。surface_rayが成功しても、開口の向こうの皮膚へ当たっている場合があります。正面の位置一致だけで採用せず、45度・横で実際の目縁の深さを確認します。曖昧ならワイヤーで目縁の実頂点を選び、inspect_meshのpointsにある世界座標をset_blink_pointsへ渡します。set_blink_pointsは一部の点だけでも更新できます。

標準のaffineは、指定8点のsourceY→targetYを最小二乗で合わせ、Yハンドルの移動もfitへ反映します。sourceYが一定ならoffsetだけを合わせ、負scaleは停止します。結果は `helper.state['mask']['fitted_depth']` のscale/offset/methodへ残ります。手動のdepth_scale/depth_offsetを保持したい時はdepth_mode='manual'を明示します。局所の奥行き補正が必要だと判断した時だけdepth_mode='handles'とし、このaffineを基準にdepth_influence（既定0.2）等を選んで再fitします。眉や影響範囲も意味推定せず、必要時にregionのbottom/top/fade/back/depth_fade（正規化座標）をエージェントが指定します。

マスクの通常顔そのものを直す場合：

```python
helper.edit_blink_mask()          # マスクのBasisを通常のBlender編集で整えます
helper.commit_mask_adjustment()  # 同じoffsetを通常顔・全眼ポーズへ保持
helper.fit_blink()               # 保持したoffsetは再fitでも残ります
# 補正を捨てる意図がある時だけ helper.reset_mask_adjustment()
```

確定前のBasis編集も、再fitの直前にoffsetへ取り込むので消えません。マスクのblinkキーだけを直接編集する手順ではありません。別の対象へ作り直す場合はprepare_blinkのreset=Trueを明示します。

```python
helper.transfer_blink(reviewed=True)  # フィットと明示選択した部品を見た後
helper.capture('blink', .5, angles=['Front'])
helper.capture('blink', display='standard', angles=['Oblique45'])
```

別オブジェクトの追従部品を撮影に含める時は、表示対象も確認します。顔だけへ絞っていた場合は `helper.state['render_objects']=[HEAD, LASHES, HAIR]` の各変数に今回の実オブジェクト名を指定して、髪付きの見た目を撮ります。転送対象と撮影で見せる対象はそれぞれ選べます。

転送では0→1→0を確認し、別部品にも専用キーを作って表情切替・撮影・GLBへ同期します。モディファイアを残しません。再転送は編集用キーの仕上げを置換するので意図的に行います。完成モデルのBasis・既存キー・UV・面・材質は保ちます。

captureは省略時Frontだけ、anglesで必要方向を指定して現在のメッシュを撮り、キー値・カメラ・材質・Edit Mode等を戻します。保存ファイルを読み直さず、未保存の編集を扱います。比較画面の「最新の撮影を読む」で、目標や修正前と重ねて見ます。standardは元材質、mtoonは表示用コピー、solid/wireは構造確認です。形の仕上げは実画像で判断し、画面操作と補助処理を適切に使います。

生成した目標を追加する時：

```text
node scripts/expression-lab.mjs target WORK blink Front IMAGE.png
```

## 仕上がった後

```python
helper.save(export=True)
```

```text
node scripts/expression-lab.mjs register WORK PROJECT
```

saveは最低限の保持確認とBlend/GLBの保存です。比較で仕上がりを判断してから返却します。ready_for_reviewはエージェントの提示判断で、ユーザー承認とは分けます。途中保存は通常のhelper.save()で行います。選択登録・NPZチェックポイント・移動量診断・review/finalizeの手続きを要求しません。返却するモデル・目標・比較・短い記録は同じ.charakitに添付し、既存VRMは変えません。別PCも比較画面から再開できます。

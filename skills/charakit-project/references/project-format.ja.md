# プロジェクトのデータ契約（v5・v6）

初回画像は頭（髪込み）・衣装込み体の4方向、計8枚のPNGを作り、実プロンプトを埋め込んで同じ正本キットへ登録します。独立した画像納品の依頼ではZIPも使えます。生成・修正に使った参照画像はユーザー側に残し、追加コピーしません。ZIP読み込みはJPEG・WebPの混在にも対応します。1枚修正は対象スロットの現在画像だけを置き換えます。

v4・v5を読み込み、部位制作を含む場合はv6、それ以外はv5で保存します。v6の`production`は[部位制作のデータ契約](production-format.md)に従います。旧表情・瞳の画像、FBX、配置は保存専用として保持します。3Dモデル画面とBlender取り込みは既存の体・髪・通常頭のロールを維持します。新規の画像画面は頭（髪込み）・体の各4方向、計8枚です。旧髪画像を含むプロジェクトは髪欄と12枚の入出力も維持します。

`threeViews`（任意）: `{version:1, visible:true, views:{front:{path,x,y,height,opacity,locked},side:{...},back:{...}}}`。登録した方向だけを含めます。`path` は `assets` の `role:reference` にあるPNG・JPEG・WebPを参照します。画像本体も `.charakit` に保存します。`x` は画面の左右方向、`y` はビューアーの高さ方向の画像中心、`height` は画像の高さで、すべてメートルです。`opacity` は0〜1、`locked` は画像の位置・大きさの操作ロックです。`side` は本人の右側で、`right` カメラに対応します。生成した三面図には任意の`autoFit:true`を付けます。モデル編集で初回だけモデルの全高・足元へ仮合わせされ、`autoFit:false`となります。`frame`（任意）は透過余白を除いた上下位置の0〜1比率`{top,bottom}`です。既存の位置・大きさ・透明度・固定・表示設定は再登録でも保持します。画像は正面・右側面・背面の固定平面に重ね、カメラ移動ではモデルとの位置関係を変えません。画像を取り替える操作以外では、この設定と画像を保持してください。

`workflow`:

```json
{"version":1,"rigging":"tripo","phase":"parts","attachHair":false,"boneMap":{}}
```

- `rigging`: `tripo`（標準）または`markers`（詳細）。
- `phase`: 標準は`parts` → `bones` → `weighted` → `springs`。`rigged`は既存リグ／詳細マーカー経路です。自己申告の工程状態であり、品質保証ではありません。
- `attachHair`: assembledと元の髪を一緒に読み込むか。返却FBXに髪が入っていればfalseです。FBX座標が元の配置と一致している必要があります。
- `boneMap`: 自動確認のHumanoidキーから実FBXボーン名への対応。
- `rigExport`: `sourceStamp`, `at`、任意の `bounds: {min:[x,y,z],max:[x,y,z]}`（ビューアーのY上向き・メートル）、`coordinateProfile`。頭・体の素材ハッシュ、正規化、配置から、書き出し後の変更を検出します。髪だけの変更は再書き出しを要求しません。
- `returnAlignment`: `version:1`, `sourceStamp`, `sourceHeight`, `returnedHeight`, `scale`。Tripo返却物のサイズ補正記録です。骨だけの経路では補正を`rigGuide`へ焼き込みます。旧assembledの修復では`placements.assembled`へ保存します。別の処理結果へ差し替えた場合は記録をクリアします。

`rigGuide`（任意）: `{version:1, sourceStamp, sourceHash, bones:[{name,parent,head,tail,rollAxis}]}`。`parent`は先行する骨の配列インデックスかnull。head/tailはBlenderのZ上向き・メートル、rollAxisは正規化された方向ベクトルです。骨名は一意です。`sourceHash`は読み戻したFBXのSHA-256で、FBX自体は保存しません。`sourceStamp`が現在の頭・体と一致する場合だけ表示・素体合わせに使います。`mode=parts`の元3部位へガイド骨を重ねる段階であり、Tripoのメッシュ／材質／ウェイトは採用しません。読み戻しFBXの形状はサイズ計算にだけ一時使用します。頭＋体の原本と保存配置は変更しません。

骨だけのCLIは`node scripts/import-bones.mjs project.charakit tripo.fbx project.charakit`です。標準UIと同じ取り込みを行います。転送準備は`avatar-weight-transfer/scripts/from_guide.py`を使います。骨だけの段階で動作確認を合格扱いしません。

`mode=assembled` は `updatedModel.path` のFBXを読みます。返却モデルへ元パーツのnormalizationを再適用しません。`attachHair=true`の髪だけは元パーツのnormalizationとplacementsを適用します。旧Tripo返却モデルの修復では、保存した頭＋体の全高・底面・水平中心へ一様倍率と位置を合わせます。旧プロジェクトは元パーツから基準を再計算できます。書き出し後に頭・体を変更した場合は補正を拒否します。姿勢・向き・体型の変更はこの補正では直さず、見た目の照合が必要です。Astraの処理済みFBXには補正を自動適用しません。Blender取り込み側は `placements.assembled` を適用した状態から作業してください。

Tripo用FBXは未リグの頭＋体の配置を頂点へ反映し、Y上向き・メートル、メッシュの位置・回転ゼロ／倍率1で出します（`baked-y-up-meters-v1`）。ビューアーの反射抑制は表示専用です。元のFBX／テクスチャは書き換えません。

モデル返却CLI:

```sh
node scripts/update-model.mjs changes.json project.charakit
```

```json
{
  "input": "project.charakit",
  "fbx": "weighted-review.fbx",
  "phase": "weighted",
  "includesHair": false,
  "boneMap": {"hips":"Hips"},
  "textures": [{"file":"body.png","path":"body.png"}],
  "documents": ["report.json"]
}
```

ファイル参照はconfigからの相対パスか絶対パス。出力には入力と同じ正本のパスを指定し、検査と競合確認後に置き換えます。入力以外の既存ファイルは上書きしません。元パーツ・過去の返却モデル・画像を保持します。テクスチャのpathはFBXが参照する相対名を使います。埋め込み済みならtexturesは省略可能です。VRMとBlendは別成果物です。

`phase: "springs"`には`blend: "work/character.blend"`も指定します。`springSetup: {version:1, blendHash, modelHash}`が保存済みBlendと確認FBXのSHA-256を対応させます。Blendは.charakitへ埋め込まず制作フォルダに保持します。`scripts/spring-setup.py`が部位別計画をリグの`charakit_spring_plan_v1`へ保存し、各部位のsourceを元のspringObjects名（髪は`hair`）へ対応させます。固定と判断した部位には理由が必要です。

アプリのrig/finish completeは成果物を直接検査し、`springVerification: {version:1, blendHash, vrmHash?, targets, runtime?}`へ結果を記録します。rigは保存済み骨列・部位別ウェイト・全対象の確認、finishはVRMの参照・末端・実際の物理ON/OFF応答を確認します。工程名・チェーン数・ウェイトの正規化・この記録の存在だけで成功と判断しません。登録モデルや前工程を更新したら検査結果を破棄し、再検査します。

画像の追加は従来の `scripts/update-images.mjs` を使います。新規制作の対象は `(head|body)/(front|left|right|back)/neutral` です。旧 `hair/*/neutral` も互換維持・指定修正のため受け付けます。旧データの表情制作手順は新規制作へ適用しません。

## 標準の揺れ物分離（v2）

Tripoへ送る前にAstraが体FBXの独立成分を目視判定し、`scripts/separate-springs.py`で`Body`と名前付き揺れ物オブジェクトへ分離します。切断できない連結部品は注釈付き画像でユーザーに確認します。`scripts/update-spring-parts.mjs`が**分離済みの体FBXそのもの**と次の判定を同じ正本キットへ保存します。元の候補はproductionに保持します。旧単体パーツ経路で復元元が必要な場合は元の体FBXだけをmodels/candidatesへ保持し、キット全体を複製しません。complete後にアプリが自動で再読み込みします。Tripo用FBXには分離済み衣装部品を含めます。この書き出し方法は実モデルで未検証です。

```json
{"version":2,"bodyHash":"分離済み体FBXのSHA-256","bodyObject":"Body","springObjects":[{"name":"BackRibbon_Left","kind":"ribbon","separated":true}]}
```

`kind`は`skirt`、`ribbon`、`strap`、`other`です。揺れ物がないことを確認した場合は`springObjects: []`を保存します。`bodyHash`が現行の体アセットと一致しない判定は古いものとして拒否します。Tripo返却から骨配置だけを取り込み、ローカル処理CLIで体のみに素体ウェイトを転送します。分離済み揺れ物は後のVRM揺れ設定に残します。

## 旧形式の除外判定（v1互換）

旧キットの`weightTransferPlan`は以下の形式でも読めます。省略と空配列は異なります。新規の標準制作では上のv2を使います。

```json
{"version":1,"sourceStamp":"頭・体の現行rigSourceStamp","excludeComponents":["body:0:123"]}
```

`excludeComponents`はAstraが確認した体の独立成分IDです。最大2048個、重複なし、形式は`body:メッシュ番号:成分番号`です。判定済みで除外なしは`[]`です。未判定・古い判定は転送を拒否します。`node scripts/set-weight-plan.mjs plan.json project.charakit`で現在のモデルへ関連付けて保存します。設定は`{"input":"project.charakit","excludeComponents":[]}`の形式です。成分の実在はBlender準備段階でも確認します。

ローカルアプリは`POST /api/transfer-weights`へ現在のキットを送り、`GET /api/transfer-weights/{id}`で完了を確認します。`/file`から新しい.charakitを取得し、検査・モデル構築が成功してから画面のモデルを切り替えます。失敗時は元データを保持します。同時ジョブは1件、入力256MB、Blender処理10分までです。

返却キットには元の全素材・画像・配置と、新しいassembled FBX、`weighted`工程、`attachHair=true`、転送レポートを保存します。除外部品は一時固定で、`springsReady=false`、`visualCheckRequired=true`です。ジョブの`/blend`と`/donor`から編集用Blend・フィット済み素体FBXも取得できますが、一時ファイルは完了後30分で削除されます。必要なら期限内に制作フォルダーへ保存します。

抽出済み高ポリ素体と骨は`assets/donor/weighted-body.blend`に同梱します。別の素体は`local/config.json`（または`CHARAKIT_CONFIG`）の`donor: {blend,armature,meshes}`で指定できます。ブラウザーから素体のローカルパスは受け取りません。任意の`samples: {parts,walk,reference}`もこのローカル設定だけで指定します。ローカルサンプルは配布物に含めません。

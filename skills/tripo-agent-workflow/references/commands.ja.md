# 入出力とCLI

Node.js 22以降とBlenderが必要です。コマンドはアプリのフォルダで実行します。Blenderは自動検出し、必要なら`BLENDER`環境変数へ実行ファイルを指定します。Pythonは`.charakit`の展開だけに使い、メッシュ処理はバックグラウンドBlenderです。

```text
node scripts/tripo-project.mjs CONFIG.json project.charakit
```

CONFIG内のパスはCONFIGのフォルダから解決します。出力には入力と同じ正本のパスを指定します。検査とハッシュで同時更新を確認し、一時ファイルから置き換えます。別名キットを量産しません。

## 候補登録

```json
{"input":"project.charakit","action":"candidates","candidates":[
 {"source":"head","name":"頭 候補1","fbx":"head-1.fbx","resources":[]},
 {"source":"body","name":"体 候補1","fbx":"body-1.fbx","resources":[]}
]}
```

実際には生成した4候補ずつを登録します。各FBXの軸・単位・寸法を読み、初期表示用normalizationを計算します。外部テクスチャがある場合`resources`にファイルパスを列挙します。ファイル名はFBXの参照名と一致させます。重複した同名ファイルは別バンドルに分けます。

## 分析・分類・書き出し

agent-session beginが保存した、採用済みの正本キットを指定します。

```json
{"input":"project.charakit","action":"analyze"}
```

返却キットを`skills/charakit-project/scripts/unpack.py`で展開し、`production.components`と`production.inventory.path`のFBXを目視で照合します。分類例（IDは実在するものに置換）:

```json
{"input":"project.charakit","action":"classify","classification":{
 "roles":{"head_00001":"head","head_00002":"hair","body_00001":"body","body_00002":"body","body_00003":"body","body_00004":"body","body_00005":"body","body_00006":"body"},
 "textureGroups":[
  {"id":"head","name":"頭","components":["head_00001"]},
  {"id":"hair","name":"髪","components":["head_00002"]},
  {"id":"upper_body","name":"上半身","components":["body_00001"]},
  {"id":"lower_body","name":"下半身（衣装・脚・靴）","components":["body_00002","body_00003","body_00004","body_00005"]},
  {"id":"accessories","name":"大きなリボン","components":["body_00006"]}
 ],
 "springGroups":[
  {"id":"skirt","name":"スカート","kind":"skirt","components":["body_00002"]},
  {"id":"ribbon","name":"大きなリボン","kind":"ribbon","components":["body_00006"]}
 ]}}
```

テクスチャIDは`hair/head/upper_body/lower_body/accessories`固定です。名前はデザインに合わせられます。例の下半身にはスカート・小さな腰飾り・脚・靴、大きなリボンはアクセサリーに含めています。存在しない髪・アクセサリーは省略します。境界と例外は[5分類の境界](retexture-images.md#テクスチャ用の5分類)を使います。

揺れ物IDは小文字英字で始まる英数字・`_`・`-`、60文字以内です。`roles`は全成分を明示します。テクスチャは全成分をちょうど1回、揺れ物は対象成分だけちょうど1回指定します。揺れ物`kind`は`hair/skirt/ribbon/strap/other`。頭由来の揺れ物は`hair`役割の部品だけです。揺れ物`skirt`の成分もテクスチャでは`lower_body`に所属します。

```json
{"input":"project.charakit","action":"prepare"}
```

各グループの`prepared.path`をTripoへ送り、`guides.front/back.path`を素材制作へ使います。`prepared.stamp`は元モデルと構成部品を特定します。採用や構成が変わった出力の使い回しは禁止です。揺れ物のグループ変更だけなら、既存テクスチャを保持して再組み立てできます。

## 素材と返却モデル

```json
{"input":"project.charakit","action":"references","references":[
 {"id":"lower_body","view":"front","png":"lower-body-front.png"},
 {"id":"lower_body","view":"back","png":"lower-body-back.png"}
]}
```

```json
{"input":"project.charakit","action":"returns","returns":[
 {"id":"lower_body","fbx":"lower-body-textured.fbx","resources":[],"rotation":[0,0,0]}
]}
```

`rotation`は読み戻したBlender座標で元へ合わせるXYZ角度です。Tripoアップロード画面のY角度と同じ値をそのまま転記せず、実際のFBX座標系で確認します。形状の上下・左右が合うと確認したときだけ指定します。各部位の1枚のBase Color画像は4096×4096でなければ組み立てできません。PNG/JPEG/WebPの外部画像、またはFBX埋め込みに対応します。

```json
{"input":"project.charakit","action":"assemble"}
```

最終FBXは従来の`body/head_neutral/hair`に入り、Bodyと各衣装揺れ物が別オブジェクトになります。テクスチャのマテリアル割り当ては維持します。髪のnormalizationは頭と共有します。`weightTransferPlan`も保存されるため、同じ体の揺れ物を再判定する必要はありません。

## リグ用書き出し

```text
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export-rig.py -- project.charakit head-body.fbx
node scripts/import-bones.mjs project.charakit tripo-rigged.fbx project.charakit
```

CLI出力の`head-body.json`も確認します。配置を変更した場合は、Tripo用FBXを書き出し直してください。

## セグメンテーションとローカル処理

```text
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export-segmentation.py -- project.charakit models/candidates
```

head.glb と body.glb をTripoへ再アップロードし、粗めのセグメンテーションを実行します。[tripo-studio-download](../../tripo-studio-download/SKILL.md)で結果をFBXとして取得・検査してから登録します。

```json
{"input":"project.charakit","action":"segmented","segmented":[{"source":"head","fbx":"models/segmented/head.fbx"},{"source":"body","fbx":"models/segmented/body.fbx"}]}
```

この後analyze→classify→prepare→references→returns→assembleを同じproject.charakitへ適用します。各CONFIGの相対パスはCONFIGの位置が基準です。

```text
node scripts/run-local-job.mjs http://127.0.0.1:8766 transfer-weights project.charakit project.charakit
```

同じ仕組みでexport-rig（出力はFBX）、production-analyze、production-prepare、production-assembleを実行できます。実際のURLは依頼文に従います。Tripoの生成や目視分類はこのCLIが行うものではありません。

# Tripoへ送る前の揺れ物判定

単独の分離依頼でAstraが担当するのは、衣装の揺れ物候補の**目視判定・独立成分の分離・命名・キット返却**までです。一括のrig依頼では分離だけで止まらず、骨配置・ウェイト転送・揺れ物設定まで続けます。[共通ルール](../../charakit-project/references/common.md)も読みます。

1. `skills/charakit-project/scripts/unpack.py INPUT.charakit NEW_DIRECTORY`で入力を検査・展開します。`mode=parts`の、Tripoへ送る前の体FBXを使います。
2. アプリのフォルダで、設定JSONを指定してBlenderを背景実行します。毎回新しい`output_dir`を使います。

   ```sh
   blender --background --factory-startup --python-exit-code 1 --python scripts/separate-springs.py -- review.json
   ```

   ```json
   {"project":"/absolute/path/to/unpacked/project.json","output_dir":"/absolute/path/to/review-001","inventory_only":true}
   ```

3. `components.json`のIDと`inventory.blend`の正面・側面・背面を照合します。スカート、ストラップ、リボンなどを意味のあるまとまりとして判断します。複数成分で1つの部品になる場合は同じ組にします。単に近いだけの塊を同一視しません。連結した面は自動切断できません。その場所は注釈付き画像を添えてユーザーに確認します。
4. 判定後、新しい`output_dir`で`inventory_only`を外し、選んだ成分IDを`groups`に指定して再実行します。対象がないと**確認した場合だけ**`groups: []`を指定します。

   ```json
   {"project":"/absolute/path/to/unpacked/project.json","output_dir":"/absolute/path/to/separated-001","groups":[{"name":"BackRibbon_Left","kind":"ribbon","components":["body:0:12","body:0:13"]}]}
   ```

   `kind`は`skirt`、`ribbon`、`strap`、`other`です。名前は一意の分かりやすい名前にし、本体は`Body`になります。出力の`body.fbx`はBodyと名前付き揺れ物を別オブジェクトとして含みます。位置は動かさず、衣装を含む見た目を維持します。
5. `node scripts/update-spring-parts.mjs separation-input.json project.charakit`で、同じ正本キットへ登録します。設定JSONは次の形式です。パスは設定ファイルからの相対パスか絶対パスです。

   ```json
   {"input":"project.charakit","report":"separated-001/separation.json","fbx":"separated-001/body.fbx"}
   ```

   スクリプトは元の体のハッシュ、出力FBXのハッシュ、`springObjects`を照合します。検査後に入力と同じ正本を更新します。一括依頼では次の工程へ続け、依頼された確認地点に到達してからcompleteを実行します。

Tripoへ揺れ物を含めるかは本人の検証待ちです。現時点では分離後も衣装を含む見た目をTripoへ渡します。ウェイト転送時にだけ揺れ物を対象から外します。

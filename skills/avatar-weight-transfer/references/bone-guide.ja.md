# 元メッシュと骨配置からの準備

アプリのTripo読み戻しは`mode=parts, workflow.phase=bones`を保存します。骨はBlenderのZ上向き・メートルでサイズ補正済みです。再正規化しません。頭・体の素材や配置を変えた場合、再書き出しと再リグが必要です。

展開済み`project.json`を指定し、工場設定のバックグラウンドBlenderで実行します。

```sh
blender --background --factory-startup --python-exit-code 1 --python skills/avatar-weight-transfer/scripts/from_guide.py -- prepare.json
```

```json
{
  "project": "/absolute/path/to/project.json",
  "output_dir": "/absolute/path/to/private-results",
  "inventory_only": true
}
```

一意な`prepare-*`へ`inventory.blend`と`components.json`を出します。各IDは元FBXのメッシュ内の独立成分です。可視化してスカート・リボン・ストラップとその装飾を判断します。重なって見えるだけで同じ部品と決めず、正面・側面・背面で照合します。連結した面しかない場合は分離できない旨を伝えます。

同じプロジェクトの設定へ以下を追加し、`inventory_only`をfalseにして再実行します。

```json
{
  "donor_blend": "/absolute/path/to/user-donor.blend",
  "donor_armature": "DonorRig",
  "donor_meshes": ["DonorBody"],
  "exclude_components": ["body:0:実際の番号"]
}
```

指定するのはユーザー提供の素体です。メッシュ名は実ファイルで確認します。`exclude_components`は確認した体の成分だけを指定します。頭には固定のHeadウェイトを付け、体だけを転送対象にします。除外部品はUV・面・材質を保持した別オブジェクトにし、確認用に腰へ仮固定します。髪はこの出力に含めず、返却キットの原本を使用します。

素体の骨階層・骨名を保って、対応する関節位置を`rigGuide`へ合わせます。手首・足首に加え肘・膝を使います。素体側のミラー編集を無効化するので、Tripoの左右非対称も保持します。提供素体の非ボーン作業用グループは転送に含めません。

`report.json`の`fit.output`にフィット済み素体のFBXがあります。正面・側面から確認後、`prepared.blend`と`fit_collection`を使って`transfer.py`のtransfer段階へ進みます。原本は上書きしません。自動フィットは試作であり、衣装が素体から離れる箇所や指は目視修正の候補です。

## 判定結果をアプリへ戻す

同じ入力キットに対して`node scripts/set-weight-plan.mjs plan.json reviewed.charakit`を実行します。既存ファイルを上書きしません。

```json
{"input":"original.charakit","excludeComponents":["body:0:123"]}
```

番号は`components.json`の実際のIDに置き換えます。入力パスは設定ファイルからの相対パスです。除外対象がないことを確認した場合は空配列`[]`を必ず指定します。スクリプトは現在の頭・体のハッシュと配置に判定を関連付けます。モデルや配置が変わったら再判定します。

ユーザーは戻したキットを開き、「リギング」→「ウェイト転送する」を押します。自動経路では素体合わせ・独立成分の分離・転送・動作確認への読み込みまで進みます。切断不能な連結面を自動で分ける機能ではありません。ユーザーの代わりに実行する場合も、判定を省略して空配列を入れてはいけません。

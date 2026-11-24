---
name: avatar-spring-setup
description: Avatar Kitのウェイト転送後のモデルへ髪を戻し、髪や衣装の揺れ骨・ウェイト・衝突を設定してVRMを出力する。標準の新規制作は固定された目と通常顔を扱う。技術的な自動検査を完了し、見た目の評価はユーザーの動作確認へ委ねる。
---

# 揺れものとVRM出力

`charakit-project`で渡されたリグ済みモデルと元の髪を復元します。形状・揺らす範囲の判断と修正はComputer Use、確定したボーン列・ウェイトの反復処理、入出力・検査はMCP／スクリプトで行います。ユーザーがBlenderを操作する前提にしません。

1. 作業用Blendを work/character.blend に保存・更新します。全身の既存リグ、体・顔のウェイト、マテリアル、UVを保全します。元モデルの骨名・固定座標を他のモデルへ流用しません。
2. 戻した髪の位置を正面・側面・背面で確認します。根元を頭へ固定し、長い髪・前髪・スカート・リボン等の必要な範囲だけを分けて揺らします。目の骨、LookAt、表情キーは追加しません。
3. モデルを観察してチェーンの根元・末端・親ボーンと対象頂点群を決めます。既存の揺れ経路があれば意図として参照しますが、必須ではありません。根元は固定し、末端へ滑らかにウェイトをつなぎます。左右で近い部品への誤転送を確認します。
4. インストール済みVRM Add-onを使い、VRM 1.0 Humanoidの骨対応、揺れ骨、頭・胸・腰・脚等の必要なコライダーを設定します。未知のAPIを推測で実行せず、インストール済み版のプロパティや公式ドキュメントで確認します。既存の全身レスト骨と体ウェイトは変更しません。
   目視して作成した骨列と対象メッシュを、下記の `scripts/spring-setup.py` で必ず登録・検査します。全対象部位を揺らす／固定するのどちらかとして記録します。固定には確認済みの理由が必要で、未設定の部位を固定扱いして検査を通しません。
5. 実VRMの物理ON/OFF頂点応答は下記スクリプトで検査します。見た目の良さ、めり込みの許容、揺れの好みはユーザーが判断します。エージェントの目視合格を完了条件にせず、検査を理由に見た目の自動修正ループを行いません。
6. ユーザーのモデル名・作者・利用条件があれば保持します。未提供でも設定済みBlendと確認FBXの登録まで進め、アプリがVRMを準備して動作確認へ自動表示します。モデル情報は正式な「VRMを書き出す」の時にアプリで確認・登録します。権利者・配布条件を勝手に決めません。
7. **rigのcompleteで完成VRMの自動検査まで行います。** アプリは保存済みBlendからVRMを生成して検査し、同じVRMを動作確認へ表示します。動作確認で停止し、ユーザーに見た目の評価を委ねます。

エージェントの登録物は編集用Blend、髪を含む確認用FBX、更新した同じ正本.charakitです。completeが検査済みVRMと検査結果を同じ正本に登録します。`scripts/update-model.mjs` に `phase: "springs", includesHair: true, blend: "work/character.blend"` を指定します。FBXはVRM設定の保管先ではありません。確認・正式保存ではFBXから設定を作り直しません。

## 再現可能な登録と部位別の検査

`scripts/spring-setup.py` は既存の揺れ骨とウェイトを登録・検査する道具です。揺らす範囲・骨位置・ウェイト・必要な衝突形状は実モデルを観察して作成します。名前や近さだけで部位を推測しません。体の骨・体ウェイトや親子関係を変更しません。

設定JSONの例（名前は実モデルに合わせます）：

```json
{
  "armature": "Rig",
  "chains": [
    {"name": "left_sleeve", "bones": ["Sleeve_L_1", "Sleeve_L_2"], "stiffness": 1, "gravityPower": 0.15, "dragForce": 0.4, "hitRadius": 0.01, "colliderGroups": []}
  ],
  "targets": [
    {"mesh": "Sleeve_Left", "source": "Spring_04_sleeve_left", "mode": "spring", "chains": ["left_sleeve"]},
    {"mesh": "ShortHair", "source": "hair", "mode": "fixed", "reason": "目視確認した短髪で、今回のデザインでは揺らさない"}
  ]
}
```

- `bones` は根元から先端の**変形骨**です。VRM 1.0では最後の関節は位置だけに使われるため、スクリプトが非変形の末端骨を補い、関節列にも登録します。既に末端を含む場合だけ `includesTerminal: true` を指定します。再実行で骨やチェーンを重複させません。
- `source` は `weightTransferPlan.springObjects[].name` の元部位名です。髪は `hair` を使います。分割した部品は複数のtargetsに同じsourceを付けます。髪・袖・ベール・スカート・リボン・ストラップ等の全対象を記録します。
- 根元を固定し、末端へ滑らかにウェイトをつなぎます。処理は有効なArmatureモディファイアと実際の揺れ骨へのウェイトを検査します。正規化済みでも全身骨への固定だけなら失敗します。
- コライダーを観察して先に設定し、必要なものだけ `colliderGroups` に登録します。既存のコライダー・他のチェーンを消しません。`gravityDir` はBlender座標（標準は `[0,0,-1]`）、`center` は根元または祖先の実骨名です。
- 髪・スカート等で親の動きによる慣性を再現する場合、`center` は既定で省略します。頭を髪のcenter、腰をスカートのcenterにすると、その骨に追従して動きを相殺し、物理ONでも揺れが弱くなることがあります。移動を相殺したい明示的な用途だけcenterを設定し、通常の歩行でも部位が応答するか確認します。動作確認の物理スイッチは新しいモデル・アプリ起動時にONです。

既存Blendの基準設定だけを直す場合は、チェーン名を明示して`update-centers`を使えます。`null`でcenterを解除します。既存の骨列、ウェイト、物理の強さ、コライダー、部位別計画を保持し、全指定の検証後に変更します。

```json
{"armature":"Rig","centers":{"left_hair":null,"skirt":null}}
```

```sh
blender --background work/character.blend --disable-autoexec --python-exit-code 1 --python KIT/scripts/spring-setup.py -- update-centers work/center-changes.json work/character.blend work/center-result.json
```

更新後はBlendのハッシュを登録し直して完成VRMを再出力・検査します。表示中のVRMだけに設定を上書きして、保存・書き出しと違う揺れにしません。

```sh
blender --background work/character.blend --disable-autoexec --python-exit-code 1 --python KIT/scripts/spring-setup.py -- setup work/spring-config.json work/character.blend work/spring-plan.json
```

rigのcompleteは保存済みBlendを別プロセスで読み、全部位の計画・実骨・ウェイト・確認用FBXとの登録を検査し、VRMも生成します。さらに、**書き出したVRMの各部位について、物理ON/OFFの実頂点位置を90フレーム比較**します。設定なし・末端不足・チェーン欠落・効かないウェイト・動かない設定は完了できません。個別実行は以下です。

```sh
node KIT/scripts/verify-springs.mjs exports/avatar.vrm work/spring-plan.json work/spring-runtime.json
```

この機械検査は有効な物理の存在を確認します。めり込み、揺れの強さ、根元の見た目はユーザーが動作確認で判断します。メタデータ未提供でもVRM検査まで完了し、そのまま動作確認へ表示します。モデル情報は正式書き出し時にアプリで登録します。内部検査用の仮作者名を正式出力に使用しません。

ローカルのrig一括依頼では、揺れ物設定後の確認用FBXを同じ正本へ登録し、completeで動作確認へ進めます。VRMメタデータが未提供でも動作確認まで完了できます。正式保存はアプリの「VRMを書き出す」でモデル情報を確認し、「登録して書き出す」で exports/avatar.vrm と exports/avatar.blend の保存まで進めます。確認用VRMの情報部分だけを確定し、形状・材質・物理は保持します。追加のfinish依頼は不要です。

## MToon表示と保存

動作確認ビューは、検査済み完成VRM自身のMToon・テクスチャ・SpringBoneを表示します。FBX自体はMToon設定の保管先ではないため、Blender側でも必要な全メッシュをMToon化します。`scripts/mtoon-export.py` の `apply_mtoon(meshes)` を確認用FBXの書き出し前に実行し、`work/character.blend` を保存します。既存のMToon材質、全身リグ、ウェイト、シェイプキー、VRM表情バインドは保持します。

明示的な単独VRM出力の依頼では、設定済みHumanoidと必要な全メッシュを明示して `save_outputs(meshes, "exports/avatar.blend", armature=rig, vrm="exports/avatar.vrm")` を使います。関数はMToon適用→VRM出力→全使用マテリアルの検査→テクスチャを格納したBlend保存を行います。モデル名・作者・利用条件は事前に本人の値で設定します。この処理でメタデータを推測しません。インストール済みVRMアドオンが必要です。

背景Blenderからは `blender --background work/character.blend --python-exit-code 1 --python KIT/scripts/mtoon-export.py -- --mesh Body --mesh Hair --armature Rig --blend exports/avatar.blend --vrm exports/avatar.vrm` を実行できます。`Body`、`Hair`、`Rig` は実モデルを観察して得た名前に置き換え、必要な全メッシュ分の `--mesh` を指定します。確認用Blendだけを保存する場合は `--vrm` を省略します。別画像の透明度や回転したUV等を黙って捨てず、変換エラーの対象を修正してから再実行します。完成通知は実VRMのMToon設定を検査し、通常PBRが残る出力を拒否します。

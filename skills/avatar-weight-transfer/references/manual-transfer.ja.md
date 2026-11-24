# 詳細モード・既存リグの手動転送

標準UIの除外判定では使いません。マーカー経路・既存リグの修復で明示された場合に参照します。スクリプトのパスはこのSkillのフォルダを基準にします。

## 1. 素体を合わせる

`mode=parts`で`rigGuide`がある旧キットの修復や明示的な手動依頼では、[骨配置からの準備](bone-guide.md)に従って`from_guide.py`を使います。標準経路の揺れ物判定はTripoより前に[事前分離](spring-review.md)で行い、アプリが転送します。以下の`transfer.py fit`は既存リグ経路です。

Blenderで `scripts/transfer.py` を読み込み、`fit(config)` を実行します。コマンドラインでは `blender WORK.blend --background --python-exit-code 1 --python transfer.py -- CONFIG.json` です。入力例:

```json
{
  "stage": "fit",
  "target_armature": "Armature",
  "target_meshes": ["Body"],
  "donor_blend": "/absolute/path/to/user-donor.blend",
  "donor_armature": "DonorRig",
  "donor_meshes": ["DonorBody"],
  "output_dir": "/absolute/path/to/new-results",
  "torso_width": 1.0,
  "torso_depth": 1.0
}
```

必要に応じて `source_landmarks` / `target_landmarks` に `hips/chest/head/leftHand/rightHand/leftFoot/rightFoot` 等と実ボーン名を指定します。自動対応できない骨は `bone_map: {"素体の骨名":"転送先の骨名"}` で明示します。曖昧なまま最近傍の骨へ割り当てません。

処理は転送先リグとメッシュのコピー・フィット済み素体を新規コレクションに作ります。胴体は腰・首・頭を通る連続した縦方向の変形と一様な厚み調整を使い、胸骨の分割数の違いによる引き伸ばしを抑えます。首がないリグでは胸を代用します。頭より上は一様倍率を保ちます。四肢は骨の長さと向きを合わせ、太さは全体倍率を基準にします。幅・奥行きの補正は0.8–1.2です。極端な体型の自動保証ではありません。

`fitted.blend` と `fitted-donor.fbx`、`report.json` が一意な出力先にできます。アプリでフィット済み素体を動かす場合は一時プロジェクトを使い、転送先の制作プロジェクトを素体で置き換えません。正面・側面・斜めから胸の位置・厚み・脇・股・手足の到達位置を見ます。必要ならAstraが作業コピーを調整します。**素体合わせの見た目を確認してから次に進みます。** 原本と作業コピーの重複表示を避けます。

## 2. 転送する

確認した `fitted.blend` 上で以下を実行します。collectionはfitのレポート値を使います。

```json
{"stage":"transfer","collection":"CharaKit_Weights_実際のID","output_dir":"/absolute/path/to/new-results"}
```

最近傍三角形の補間で対象のコピーにだけ転送し、上位4ウェイトに正規化します。5cm以上離れた頂点数・最大距離をレポートします。衣装が素体から離れる部分、指が接近する部分、股・脇は誤転送しやすいため目視します。修正後のリトライはfit保存からやり直します。

## 3. 動きで確認して返す

`weighted-review.fbx`をアプリの「Astraからの確認用FBXを読み込む」へ読み込み、骨対応を確認します。歩行と「比較画像と検査結果を保存」を使い、胸の引き上がり・潰れ、肩／股の破綻、頭や服の置き去りを見ます。頂点数やウェイト合計だけで合格にしません。退避した揺れ物は腰への仮固定であり、物理設定済みではないことを伝えます。

`scripts/update-model.mjs`で `phase: "weighted"` を指定して新しい.charakitを返します。髪を含めていない出力は `includesHair: false` とします。最終のBlendとレポートを別途保持します。表情・瞳・眼ボーン・揺れもの制作はこの工程へ追加しません。

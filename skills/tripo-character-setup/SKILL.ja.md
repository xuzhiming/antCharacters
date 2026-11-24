---
name: tripo-character-setup
description: Avatar Kitの詳細マーカーモードで、頭・体の通常顔モデルへHumanoidリグを作る。標準のTripoリグが合わない場合に、ユーザーのガイドと形状を照合してリギングする。
---

# 詳細モードのリギング

標準経路はTripoでのリグ作成です。このスキルはユーザーがマーカー経路を選んだ場合に使います。マーカーからエージェントがリギングするため追加の時間・トークンを使います。標準の新規制作は通常顔・視線固定です。表情メッシュ・瞳・眼内部の下処理は行いません。

1. `charakit-project`で検査・展開し、原本と作業コピーを分けます。体・通常頭の配置を確認します。髪は保管して、頭・体のリグを先に作ります。
2. 現行v5・v6は次項の段階セットアップで全身21点・任意の指40点を参照します。`charakit-project/scripts/import_guides.py`は旧v4専用です。正面・側面・上面で肩・肘・手・腰・膝・足を形状と照合します。ガイド位置を確定した関節中心と扱いません。
3. [Humanoid段階セットアップ](references/humanoid-setup-guide.md)を使って作業コピーに骨を配置し、必要ならレスト姿勢を整えます。形状・選択・調整はComputer Use、機械的な作業はMCP／スクリプトで行います。ユーザーの手作業は最小限にします。
4. 仮ウェイト付きのリグをFBXに書き出し、アプリの自動確認で骨対応・肩・肘・膝・首を確認します。仮ウェイトを最終品質とは扱いません。
5. `scripts/update-model.mjs`の `phase: "rigged", includesHair: false` で返します。詳細な体ウェイトは `avatar-weight-transfer`、揺れものとVRMは `avatar-spring-setup`へ引き継ぎます。

編集用Blend、リグ付きFBX、検査結果を残します。原本を上書きせず、normalization／placementsを二重適用しません。この工程から表情制作や眼内部の下処理へ進みません。

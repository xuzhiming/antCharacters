# Tripo画面の探索メモ

2026-09-25のTripo Studio日本語UIで確認した項目です。画面更新後は見えているラベル・プレビューを優先します。以下は操作契約の補助であり、実モデルでの全工程の実証ではありません。

- `https://studio.tripo3d.ai/workspace/generate`：Smart Mesh P2.0、四角面500〜25,000、生成数1/2/4。設定が自動保存されるため、作業開始時に全値を確認します。
- 立方体アイコンが4方向マルチビューです。画像を重ねたアイコンは最大30枚のバッチ入力で、別機能です。
- `https://studio.tripo3d.ai/workspace/smart-uv`：OBJ/FBX/STL/GLB、150MBまで。表示上の上限は三角面80,000／四角面40,000。既存テクスチャが消える注意があるため、出力を保存してから次へ進みます。
- `https://studio.tripo3d.ai/workspace/texture`：画像単体／マルチビュー／テキスト。正面・背面参照、2K/4K/8K、Remove Lightingの設定を確認できます。必ず4Kを選びます。
- FBX書き出しはBlender/Mixamo/3ds Max等のプロファイルがあります。Blenderを起点にし、[tripo-studio-download](../../tripo-studio-download/SKILL.md)で通常Exportと実ファイル確認を行います。向き・単位・四角面・テクスチャ埋め込みを取得後に確認します。
- `.charakit`はTripoへ直接渡しません。対象FBXと必要な参照画像だけをアップロードします。サービス上のモデル名やダウンロード名を保存したグループIDと対応させます。

公式補助資料：[P2.0](https://www.tripo3d.ai/blog/tripo-p2-0-preview)、[Smart UV](https://www.tripo3d.ai/blog/smart-uv)。説明と画面が食い違う場合は、現在の画面とダウンロードした実データを調べ、分からない値を推測して進めません。

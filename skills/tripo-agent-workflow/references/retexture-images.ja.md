# 部位の再テクスチャ素材

テクスチャ用グループの実メッシュに合う塗りを得るための、正面・背面画像です。頭・体の初期マルチビューとは別に保存します。揺れ物のメッシュ分離を画像生成の部位境界へ転用しません。

## テクスチャ用の5分類

| ID | 範囲 |
| --- | --- |
| `hair` | 髪全体。髪束の揺れ物分類とは独立。髪がないデザインでは省略 |
| `head` | 顔・耳などの頭部。髪は含めない |
| `upper_body` | 首・胴・腕・手と、それらを覆う衣装 |
| `lower_body` | 腰から下の衣装、スカート・ズボン等、脚、靴。小さな腰飾りも含む |
| `accessories` | バッグ・武器・大きなリボン等、独立して扱う意味があるまとまり。対象がなければ省略 |

頭・上半身・下半身は必須です。存在しない髪やアクセサリーのために空のグループや架空の装備を作りません。小さな飾り・留め具は所属する衣装に含めます。衣装に付く大きなリボン等は、取り付け方だけでなく大きさ・デザイン上のまとまりでアクセサリーとして判断します。肌／衣装や脚／靴で追加分割せず、元の衣装・露出範囲・配色を保ちます。

各グループから**同じ構成の統合FBXと前後ガイド**を書き出し、同じ範囲の参照画像を作ります。例えばスカート・脚・靴は一つの下半身FBXと着衣状態の前後画像、一枚の4Kテクスチャです。服を外した脚や股の部分までの脚を別画像として描きません。スカートに隠れる部分を見せるために衣装を外したり、新しい構造を描き足したりしません。

元の独立部品は保持し、返却UV・材質を各部品へ戻してから揺れ物を別メッシュに組み立てます。下半身の統合はテクスチャ作業の書き出し単位であり、スカートと脚の頂点を溶接する操作ではありません。

腰の境界を一つの連結部品がまたぐ場合は、勝手に切断したり全身を一分類に押し込まず、形状を示して分離方法を確認します。頭由来と体由来の部品は同じグループに混ぜられません。両方に独立させたいアクセサリーがある場合は、該当箇所を示し、どちらを所属部位に残すか確認します。勝手に6組へ増やしたり、頭と体の配置を崩して統合したりしません。

## 参照画像の制作

1. `guides.front/back`を表示し、実際の輪郭・衣装の境界・穴・厚み・非対称を読みます。必要ならキットのビューワーでも確認します。
2. その部位が写った採用済みマルチビュー画像を表示し、色・柄・材質・塗りの基準にします。元絵は採用画像で分からないデザインの補助です。採用した描き込みを元絵の簡素な塗りへ戻しません。
3. 利用可能なimagegenスキルとimage_genで、1部位1方向ずつ描きます。[共通の塗り](../../character-material-brushup/references/painting.md)を使い、肌の血色・毛束の色層・材質ごとの艶を保ちます。第三者の観察画像を画像入力へ混ぜません。

プロンプトの骨格:

> Create one standalone [front/back] illustration of ONLY [specified mesh group]. Image 1 is the actual mesh wire guide and defines the part boundaries and geometry. Images 2 onward are the adopted painted multiview references and define colors, patterns, material finish and illustration quality. Preserve the exact component set and garment cut, including disconnected pieces in their original relative positions. Remove wireframe, viewport UI and clay shading. Render a straight-on orthographic view, centered in a square transparent PNG with the full silhouette and margin. Match the paired view's scale and vertical baseline. Preserve painted material highlights and local color; omit cast floor shadows and external colored lighting. Do not add missing body parts, accessories or new seams. [State observed painting details.]

下半身では `[specified mesh group]` を `the complete clothed lower body, including the waist outfit, skirt or trousers, legs and footwear shown in the guides` とします。`Keep the outfit worn as designed; preserve its coverage and occlusion. Do not remove garments or depict separate uncovered legs or concealed anatomy.` を加えます。ガイド自体もスカート・脚・靴を合わせた構成にし、文面だけで衣装を補いません。

正面・背面は独立した正方形PNG、512〜8192pxで、通常は同じ寸法にします。実アルファ・全輪郭・上下位置・同じ尺度を目視確認します。スクリーンショットのUI、余白の偏り、カメラの傾きをそのまま再現しません。単なる切り抜き・アップスケール・UVシートはこの素材制作の代わりになりません。肌と衣装など別グループ間の色の連続も確認します。

実プロンプトをPNGメタデータに保存し、`scripts/tripo-project.mjs`の`references`で対象グループへ登録します。キットに入るのは**この部位用に新規制作した出力画像**です。採用マルチビューや元絵の複製、観察した第三者画像は追加しません。

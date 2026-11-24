# 生成プロンプト

これは組み立て用の型です。角括弧は確認した内容に置き換え、無関係な材質は省きます。元絵の説明と、[共通の塗り指定](../../character-material-brushup/references/prompts.md)の該当部分を組み合わせます。「VTuber」「rich」「high detail」だけで塗りを指定したことにしません。

## 頭（髪込み）の正面

> Create one standalone front-view reference PNG of this character's COMPLETE HEAD WITH ALL HAIR. Image 1 is the character design authority. Preserve the facial proportions, characteristic eye shape and iris identity, hairstyle, existing locks, full hair length, palette and head accessories. Normalize the head orientation regardless of any tilt or camera angle in the source: both eyes at a level baseline, facial centerline vertical, straight-on orthographic front view, no sideways head tilt and no looking up or down. Use a neutral resting expression: lips naturally closed, relaxed brows and eye area, eyes naturally open. Do not inherit the source's smile or open mouth. Retain the character's facial identity, natural asymmetry, makeup and fully painted finish. Include the face, ears as naturally visible, and all front, side and back hair through the longest tips. Remove the neck, shoulders, body, clothing and background. Reconstruct only the hair hidden by removed body parts; keep the original hairstyle. Fit the complete head-and-hair silhouette within a square canvas with margin. [Insert the written finish brief for face AND hair.] Genuine transparent background; no diagram, additional views, text or support stand.

長髪でも顔を隠す髪を勝手に左右へ開かず、元の前髪と顔の関係を保ちます。顔立ちの保持と姿勢・表情の補正を分けて指定し、塗りの共通文にも元絵の笑顔・開口を維持する指示を混ぜません。

## 体の正面

> Create one standalone front-view reference PNG of this character's CLOTHED BODY, including the complete neck, hands, legs, shoes and garment accessories. Preserve the body proportions, costume construction, motifs and asymmetry. Remove the entire head and all hair. Naturally complete clothing previously hidden by hair, using the established design. Keep a bare neck end that can insert into the head; no display stand. Mandatory T-pose: upper arms horizontal at shoulder height, elbows and wrists straight, matching pose in every view. Set the feet slightly apart, about hip-width, even if they touch in the source; knees and toes face forward, both feet at the same depth. Leave a visible background gap between the inner lower-leg and shoe silhouettes, with a relaxed upright stance rather than a wide straddle. Straight-on orthographic view, full silhouette with margin on a square canvas. [Insert the written finish brief for exposed skin and the actual clothing materials.] Genuine transparent background; no extra views, labels or floor shadow.

3Dのスクリーンショットからテクスチャ参照を作る依頼では「画像1＝実メッシュの形状基準、画像2以降＝採用マルチビューの配色・柄・塗り基準」と分け、ワイヤーフレーム・UIを外します。画面の陰影や無塗装の見た目を塗りの上限にしません。ユーザーが指定した単独衣装等の範囲は維持し、勝手に標準8枚へ広げません。

## 他方向

> Image 1 is the approved finished [head with all hair / clothed body], defining its identity, proportions, pose, palette, material treatment and painting density. [Image 2 is a source view used only for depth and design information.] Render the same part from [the character's left side, facing screen left / the character's right side, facing screen right / directly behind]. [For the head: include the full hair through the longest tips; retain the approved upright head posture and neutral expression with naturally closed lips and relaxed brows and eye area, changing only the viewing direction. For the body: keep the head and all hair excluded; retain the approved T-pose and hip-width foot spacing. In the back view keep the gap between the shoes; in a true side view allow their natural projected overlap without staggering the feet.] Maintain [observed landmarks and visible accessories]. Carry the same layered color, local finish and material-specific highlights around the forms. Match canvas, scale and vertical placement; do not copy frontal highlight coordinates onto the side view. Output only this one part and view.

## 局所修正

> Edit only [the observed problem] in image 1. Except for explicitly requested orientation or expression corrections, preserve its viewpoint, pose and expression. Preserve its part boundary, facial identity, hairstyle, full hair length, costume, scale and all unaffected painting. [Describe the exact color treatment or structural correction.] Keep the existing finished illustration quality.

塗り不足は「どこの色の層・境界・艶が足りないか」を指定します。形の誤りと塗り不足を一度の曖昧な「もっと詳しく」で直そうとせず、原因に応じて修正範囲を選びます。

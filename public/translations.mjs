// Source-language keys keep UI copy reviewable. Values and project metadata are not translation keys.
export const en = {
"足元の高さ（cm）":"Foot level (cm)","詳細な結果読み込み":"Advanced result import",
"画像をドラッグして移動できます。大きさと足元の高さは3方向で連動し、左右の位置は方向ごとに調整できます。目盛りは三面図の大きさ・位置に追従します。":"Drag the image to move it. Character height and foot level are shared across all three views; horizontal offsets are independent. The ruler follows image size and position.",

"きゃらくる":"Charakuru",
"画像の形式・サイズを確認してください。":"Check the image format and dimensions.",
"同じ部位・方向の画像が重複しています。":"The ZIP contains duplicate images for the same part and view.",
"対応する画像がありません。head/front.png などの構成にしてください。":"No supported images found. Use paths such as head/front.png, with PNG, JPEG or WebP files.",
"瞳":"Pupils","画像制作を依頼 ↗":"Request image work \u2197","05 Codexへ渡す":"05 Send to Codex","Codexへ渡す":"Send to Codex","素材画像を一覧で確認します。":"Review the material images.","画像をまとめて保存 ↓":"Download all images \u2193","左・右は本人基準です。画像をクリックすると拡大表示・ダウンロードできます。":"Left and right are character-relative. Click an image to enlarge or download it.","画像をダウンロード":"Download image","差し替え":"Replace","画像を読み込む":"Load image","画像を読み込んでいます…":"Loading image\u2026","画像を読み込みました。":"Images loaded.","モデル・配置・関節を保存し、依頼文と一緒にCodexへ渡します。":"Save models, placement and joints, then give the file and prompt to Codex.","セットアップの依頼文":"Setup prompt","準備したモデルをセットアップ用に渡します。":"Hand off the prepared models for setup.","3Dモデルを読み込むと依頼文をコピーできます。":"Load 3D models to copy the setup prompt.",
"元絵":"Original illustration","元絵未登録":"No original illustration",".charakit の名前":".charakit name","書き出す":"Export","ファイル名に使える名前を入力してください。":"Enter a valid file name.",
'1. .charakit を書き出す':'1. Export .charakit','2. 依頼文をコピー':'2. Copy prompt',
"ここから制作を始めます":"Start your character here",
"元になるキャラクターの1枚絵":"Original character illustration",
"まず元絵を読み込み、Codexへ渡して部位・表情の画像素材を作ります。":"Load your original illustration, then send it to Codex to create part and expression images.",
"元絵を読み込む":"Load original illustration",
"元絵入りの .charakit と依頼文をCodexへ渡します。返ってきた .charakit を開いて、下の一覧で画像を確認してください。":"Give Codex the .charakit containing your illustration and the copied prompt. Open the returned .charakit to review its images below.",
"PNG / JPEG / WebP・20MBまで。元絵を差し替えても、制作済みの素材は変わりません。":"PNG / JPEG / WebP, up to 20 MB. Replacing the original does not change existing generated images.",
"元絵の指定が不正です。":"Invalid original illustration reference.",
"制作の元絵です。画像素材で差し替えてください。":"This is the original illustration. Replace it in the image workspace.",
'日本語':'Japanese','英語':'English',
"対応するFBXファイルを選んでください（バイナリ7.1〜7.x）。":"Choose a binary FBX 7.1\u20137.x file.","FBX素材情報が不正です。":"Invalid FBX asset data.","テクスチャ情報が不正です。":"Invalid texture data.","FBX原本と配置情報を使用してください。":"Use FBX originals and placement data.","FBX座標軸が不正です。":"Invalid FBX axes.","FBXの単位が不正です。":"Invalid FBX units.","対応していないFBX座標系です。":"Unsupported FBX coordinate system.","FBXにメッシュがありません。":"The FBX has no meshes.","ZIP内にFBXがありません。":"No FBX found in the ZIP.","テクスチャを読み込めません。FBXと画像を同じZIPにまとめてください: ":"Unable to load a texture. Bundle the FBX and images in the same ZIP: ",
'AIキャラクターモデリングキット':'AI Character Modeling Kit','Tripoでモデルを作る ↗':'Create a model with Tripo ↗','招待リンク':'Referral link','FBX原本とテクスチャを保持します。四角面を保ったままBlenderへ引き継ぎます。テクスチャが別ファイルの場合はFBXと一緒にZIPにまとめてください。':'Original FBX files and textures are retained, preserving quads for Blender. Bundle separate textures and the FBX in a ZIP.',

'1枚のイラストから、AIとつくる3Dキャラクター。':'From one illustration to a 3D character, together with AI.',
'開く':'Open','新規':'New','未保存':'Not saved','未保存の変更':'Unsaved changes','未書き出しの変更':'Unsaved changes','書き出し済み':'Saved','候補履歴も保存':'Include history','保存':'Save','Codexへ渡す ↗':'Send to Codex ↗',
'00 画像':'00 Images','01 素材':'01 Models','02 配置':'02 Placement','03 関節':'03 Joints','04 揺れもの':'04 Springs','実験':'Experimental','データはブラウザ内で処理します':'Processed locally in your browser',
'素材をまとめる':'Add your models','体・髪・頭部7状態を選びます。FBX、またはFBXを含むZIPに対応。':'Add the body, hair and seven head states. Use FBX files or ZIPs containing FBX files.',
'プロジェクト名':'Project name','参考画像を追加':'Add reference images','調整済みモデルから始める':'Start with an assembled model','配置済みFBXを読み込み、マーカーだけ配置できます。':'Import an assembled FBX to place joint markers directly.','配置済みFBX':'Import assembled FBX','旧ローカルプロジェクトを取り込む':'Import a legacy local project',
'元のファイルは保持します。前処理はUV・法線を保つ重複整理のみ。接合・目元・ウェイトはBlenderで調整します。':'Original files are kept. Preprocessing only removes duplicates while preserving UVs and normals. Joins, eyes and weights are refined in Blender.',
'大きさと位置を合わせる':'Adjust size and position','正面・側面・背面を切り替えて調整してください。':'Check the front, side and back views while adjusting.','調整するパーツ':'Part to adjust','頭（全表情）':'Head · all expressions','髪':'Hair','体':'Body','体・衣装':'Body & outfit','頭':'Head','頭・瞳':'Head & irises','配置済みモデル全体':'Entire assembled model','頭を動かす際に髪も連動':'Move hair together with the head','素材を読み込むと全高を表示します。':'Import a model to see its total height.','目標の全高（m）':'Target total height (m)','モデル・マーカーを一緒に拡縮':'Scale model and markers together','髪・飾りを含む全高です。1.7mは調整例で、VRMの必須寸法ではありません。':'Total height includes hair and accessories. 1.7 m is an example, not a VRM requirement.',
'関節の位置を決める':'Place joint markers','正面で左右と高さ、側面で奥行きを合わせます。':'Set width and height from the front, then depth from the side.','揺れものの指定':'Spring paths','任意の実験機能です。未指定でもエージェントが形状から判断します。':'Optional and experimental. The agent can also infer spring parts from the geometry.','種類':'Type','スカート':'Skirt','ストラップ':'Strap','その他':'Other','揺れものの経路を追加':'Add a spring path','名前':'Name','点を追加':'Add point','点を削除':'Delete point','左右反転して複製':'Mirror a copy','経路を削除':'Delete path','根元から先端へ、揺れの中心を結びます。巻き髪の表面を細かくなぞる必要はありません。骨・ウェイトはBlender側で設定します。':'Connect the center of motion from root to tip. You do not need to trace each curl. Bones and weights are set up in Blender.',
'正面':'Front','右側面':'Right','左側面':'Left','背面':'Back','上面':'Top','ミラーモード':'Mirror','片側のマーカーを動かすと、反対側も左右対称に動きます':'Moving a marker mirrors its opposite partner.','選択中のマーカーを拡大':'Zoom to the selected marker','選択へ寄る':'Focus','全体':'Fit','モデルを準備しています':'Preparing model','調整した配置を読み込んでいます':'Loading your placement','左右 X / 高さ Z':'Width X / Height Z','前後 Y / 高さ Z':'Depth Y / Height Z','点をドラッグして移動 · ホイールで拡大 · 右ドラッグで移動':'Drag a point to move · Scroll to zoom · Right-drag to pan','元に戻す':'Undo','やり直す':'Redo','表示':'Show','モデルを透過':'X-ray','骨のガイド':'Bone guides','表情プレビュー':'Expression preview','正面だけでなく、側面からも関節の中心を確認してください。':'Check each joint center from the side as well as the front.','位置':'Position','左右':'Width','前後':'Depth','高さ':'Height','左右 X ミリメートル':'Width X in millimeters','前後 Y ミリメートル':'Depth Y in millimeters','高さ Z ミリメートル':'Height Z in millimeters','ミラーON：左右のマーカーが連動します。':'Mirror ON: left and right markers move together.','← 前の点':'← Previous','次の点 →':'Next →','この点を初期位置へ戻す':'Reset this point','Blenderからモデルを更新':'Update model from Blender','同じ原点・単位で書き出したFBXを選びます。配置とマーカーは再確認が必要です。旧モデルは残ります。':'Choose a FBX exported with the same origin and units. Review placement and markers afterward. The previous model is retained.','更新FBXを選ぶ':'Choose updated FBX','.charakit を書き出す ↓':'Export .charakit ↓','ローカルで作業 · モデルは外部へ送信しません':'Local workspace · Models stay on your device','調整したら保存してください':'Save after making adjustments','Codexに引き渡す':'Continue with Codex','閉じる':'Close','まず .charakit を書き出し、そのファイルと下の依頼文をCodexへ渡してください。採用素材のみの保存でも、生成元として参照されている旧版は保持します。':'Export a .charakit file, then give it to Codex with the prompt below. Versions referenced by generated models are retained even when saving adopted images only.','Codexへの依頼文':'Prompt for Codex','依頼文をコピー':'Copy prompt','.charakit を書き出す':'Export .charakit','取り込むFBXを選択':'Choose a FBX to import','ZIPに複数のモデルが入っています。':'This ZIP contains multiple models.','取り込む':'Import','キャンセル':'Cancel',
'画像素材':'Image library','方向を見比べ、候補を選び、修正を重ねる。':'Compare views, choose versions and refine your character.','画像セットZIPを追加':'Import image ZIP','採用PNGをまとめて保存 ↓':'Export adopted images ↓','部位の4方向':'Part views','表情7状態':'7 expressions','すべて':'All','画像の方向':'Image view','全方向':'All views','水平ガイド':'Horizontal guides','通常頭の正面・右側面は表情の通常顔と共通です。左・右は本人基準。修正メモは .charakit と一緒にCodexへ渡せます。':'The neutral front and right head views are shared with the expression set. Left and right refer to the character. Revision notes travel with your .charakit file to Codex.','画像セットの形式・制作記録':'Image format & production records','ZIP内は head/front.png、hair/left.png、body/back.png など。表情は expressions/front/happy.png または front/happy.png。既存画像は候補として残ります。プロンプトと参照履歴の受け渡しには .charakit を使用してください。':'Use paths such as head/front.png, hair/left.png and body/back.png in the ZIP. Expressions use expressions/front/happy.png or front/happy.png. Existing images remain as candidates. Use .charakit to transfer prompts and reference history.','画像を閉じる':'Close image','採用中':'Adopted','比較する候補':'Candidate','採用画像':'Adopted image','候補画像':'Candidate image','候補の履歴':'Version history','この候補を採用':'Adopt this version','修正版を候補に追加':'Add a revised version','候補PNGを保存':'Download candidate','次の修正メモ':'Notes for the next revision','例：首をもう少し短くしてください':'Example: shorten the neck a little.','この候補の生成記録':'Generation record','＋ 画像を追加':'＋ Add image','未登録':'No image yet','修正メモあり':'Revision note','生成元画像が未指定':'Source images not linked','生成元画像と一致':'Matches source images','画像の更新をモデルへ反映待ち':'Model needs updated images','生成元画像を指定':'Link source images','画像':'Image','まだ画像がありません。':'No image yet.','プロンプト記録なし（読み込み画像）':'No prompt recorded (imported image)','参照画像を開く':'Open reference image','このモデルを生成した画像':'Images used to generate this model','実際に生成へ渡した版を選択してください。画像の採用変更後も、この対応は維持されます。':'Select the versions actually used for generation. These links remain even if you adopt different images.','対応を保存':'Save links',
'通常':'Neutral','喜び':'Happy','怒り':'Angry','悲しみ':'Sad','リラックス':'Relaxed','驚き':'Surprised','瞬き':'Blink','頭 · neutral':'Head · neutral','頭 · happy':'Head · happy','頭 · angry':'Head · angry','頭 · sad':'Head · sad','頭 · relaxed':'Head · relaxed','頭 · surprised':'Head · surprised','頭 · blink':'Head · blink',
'中心':'Center','腰の中心':'Hips','背骨':'Spine','胸の中心':'Chest','首の付け根':'Neck base','頭の回転中心':'Head pivot','左腕':'Left arm','右腕':'Right arm','左脚':'Left leg','右脚':'Right leg','左肩':'Left shoulder','右肩':'Right shoulder','左肘':'Left elbow','右肘':'Right elbow','左手首':'Left wrist','右手首':'Right wrist','左手の中心':'Left hand','右手の中心':'Right hand','左股関節':'Left hip','右股関節':'Right hip','左膝':'Left knee','右膝':'Right knee','左足首':'Left ankle','右足首':'Right ankle','左つま先の付け根':'Left toe base','右つま先の付け根':'Right toe base',
'骨盤の中心。脚の付け根の高さを目安にします。':'Center of the pelvis, around the height where the legs attach.','腰と胸の間。側面から体の厚みの中心を確認します。':'Between hips and chest. Check the center of the torso depth from the side.','胸郭の中心。衣装の表面ではなく体の内部です。':'Center of the ribcage, inside the body rather than on the clothing.','首が胴体に接続する中心です。':'Center of the connection between the neck and torso.','首の上端付近。側面から位置を確認します。':'Near the top of the neck. Check its position from the side.','腕の付け根。袖の外側ではなく肩関節の中心です。':'Center of the shoulder joint, not the outer sleeve.','肘が曲がる中心。側面で前後位置も調整します。':'Center of the elbow bend. Adjust depth from the side too.','袖口の飾りではなく手首の中心です。':'Center of the wrist, not the cuff decoration.','手のひらの中央。指の骨はBlender工程で調整します。':'Center of the palm. Finger bones are refined in Blender.','骨盤内の脚の付け根。モデルを透過して位置を確認します。':'Where the leg attaches inside the pelvis. Use X-ray to check placement.','膝関節の中心です。側面で曲がる位置を確認します。':'Center of the knee joint. Check the bend location from the side.','靴の上端ではなく足首の関節中心です。':'Center of the ankle joint, not the top of the shoe.','足指が曲がる付け根。靴の最先端ではありません。':'Where the toes bend, not the tip of the shoe.','左右は中心線（X = 0）に固定されています。':'Width is locked to the center line (X = 0).','中心線に固定（X = 0）':'Locked to the center line (X = 0)',
'経路を選択':'Select a path','左の経路を選ぶか、新しく追加してください。':'Choose a path on the left or add one.','揺れものの指定は任意です。':'Spring paths are optional.','ミラーOFF：選択した点だけを動かします。':'Mirror OFF: move only the selected point.','ミラーON：左右のある関節が連動します。中心の点は単独で動きます。':'Mirror ON: paired joints move together. Center points move independently.','調整したら保存 · 側面と上面も見て合わせてください':'Save your adjustments · Check side and top views too','素材を準備':'Prepare models','立体で合わせる':'Align in 3D','通常顔を基準に、表情ごとの役割を指定して読み込みます。途中でも保存できます。':'Start with the neutral head and assign each expression to its slot. You can save at any stage.','頭の全表情は一緒に動きます。側面・背面から、髪と顔の重なりを確認してください。':'All head expressions move together. Check hair and face overlap from the side and back.','右側面（本人の右）':'Right (character’s right)','左側面（本人の左）':'Left (character’s left)','上面（画面下が顔の前）':'Top (face points down on screen)','3Dで確認':'3D inspection','回転して立体的に確認':'Orbit to inspect the volume','左右 X / 前後 Y · 高さ Z は固定':'Width X / Depth Y · Height Z locked','ドラッグで回転 · 配置は正面・側面か数値入力で調整':'Drag to orbit · Place markers in orthographic views or with numbers','未読み込み':'Not loaded','FBX / ZIP を選択':'Choose FBX / ZIP','削除':'Remove','大きさ':'Scale','左右 X':'Width X','前後 Y':'Depth Y','高さ Z':'Height Z','回転 X':'Rotation X','回転 Y':'Rotation Y','回転 Z':'Rotation Z','根元':'Root','先端':'Tip','中間':'Middle','根元から先端に向けた経路の目安です。側面・上面でも奥行きを調整してください。':'A guide from root to tip. Adjust its depth from the side and top too.','経路の点は単独で動きます。「左右反転して複製」で反対側を作れます。':'Path points move independently. Use “Mirror a copy” to create the opposite side.',
'処理に失敗しました。':'The operation failed.','配置は正面・側面に切り替えるか、右の数値で調整できます。':'Switch to a front or side view, or use the coordinate fields.','位置は-10000〜10000mmの数値で入力してください。':'Enter a position between −10000 and 10000 mm.','画像プロジェクトを書き出しました。':'Image project exported.','.charakit を書き出しました。ダウンロード先に保管してください。':'.charakit exported. Keep the downloaded file.','モデルをまとめています…':'Packaging project…','依頼文をコピーしました。':'Prompt copied.','⌘C / Ctrl+Cでコピーできます。':'Press ⌘C / Ctrl+C to copy.','素材を読み込んでいます…':'Importing model…','調整済みFBXの表情は保持します。表情切り替えの確認はBlenderで行ってください。':'Expressions in the assembled FBX are preserved. Preview their switching in Blender.','1ファイル256MB以内にしてください。':'Each file must be 256 MB or smaller.','FBXまたはZIPを選んでください。':'Choose a FBX or ZIP file.','ZIP内にFBXがありません。テクスチャ内包のFBXを書き出してください。':'No FBX found in the ZIP. Export a FBX with embedded textures.','取り込みをキャンセルしました。':'Import canceled.','配置済みモデルの表示から、個別パーツの配置へ切り替えます。更新モデルの原本は残ります。続けますか？':'Switch from the assembled model to individual parts? The original updated model will be kept.','配置済みFBXを取り込みました。関節位置を見直してください。':'Assembled FBX imported. Review the joint positions.','配置済みモデルを読み込んでいます…':'Importing assembled model…','未書き出しの変更があります。別のプロジェクトを開きますか？':'You have unsaved changes. Open another project?','プロジェクトを検査しています…':'Checking project…','1GB以内のファイルを選んでください。':'Choose a file no larger than 1 GB.','プロジェクトを復元しました。':'Project restored.','未書き出しの変更があります。新規プロジェクトに切り替えますか？':'You have unsaved changes. Start a new project?','新規プロジェクト…':'Creating project…','参考画像を保存しています…':'Adding reference images…','参考画像は20MB以内のPNG/JPEG/WebPにしてください。':'Use PNG, JPEG or WebP references no larger than 20 MB.','生成画像から参照されているため、この原本は保持します。':'This original is referenced by generated images and must be retained.','入力範囲を確認してください。':'Check the allowed input range.','モデルを先に読み込んでください。':'Import a model first.','全高は0.1〜10mで入力してください。':'Enter a total height between 0.1 and 10 m.','経路は64個までです。':'Up to 64 paths are supported.','旧プロジェクトを取り込んでいます…':'Importing legacy project…','旧モデル名が不正です。':'Invalid legacy model name.','旧モデルを取得できません。':'Could not load the legacy model.',
'画像は20MB以内にしてください。':'Images must be 20 MB or smaller.','PNG/JPEG/WebPを選んでください。':'Choose a PNG, JPEG or WebP image.','画像を候補に追加しています…':'Adding image candidate…','画像セットを読み込んでいます…':'Importing image set…','画像ZIPは512MB以内にしてください。':'Image ZIPs must be 512 MB or smaller.','対応する画像がありません。ZIP内のフォルダ構成を確認してください。':'No supported images found. Check the ZIP folder structure.','採用画像をまとめています…':'Packaging adopted images…','採用画像がありません。':'No adopted images yet.',
'ライトモードに切り替え':'Switch to light mode','ダークモードに切り替え':'Switch to dark mode',
};
Object.assign(en,{
'通常顔':'Neutral','笑顔':'Happy',
'マーカー数が一致しません。':'Marker count does not match.','画像ライブラリが不正です。':'Invalid image library.','画像の版情報が不正です。':'Invalid image version data.','採用画像の指定が不正です。':'Invalid adopted image selection.','参照画像がありません: ':'Missing reference image: ','モデルの生成元画像が不正です。':'Invalid model source images.','制作記録が不正です。':'Invalid production records.','制作記録のパスが不正です。':'Invalid production record path.','候補画像がありません。':'Image candidate not found.','不正なファイルパスです。':'Invalid file path.','ファイル数が多すぎます。':'Too many files.','プロジェクトは1GB以内にしてください。':'Projects must be 1 GB or smaller.','ZIP形式を読み取れません。':'Unable to read this ZIP.','分割ZIP / ZIP64または大きすぎるZIPは使えません。':'Split ZIPs, ZIP64 and oversized ZIPs are not supported.','ZIPの目録が不正です。':'Invalid ZIP directory.','ZIPの目録が途切れています。':'Truncated ZIP directory.','同名ファイルが重複しています。':'Duplicate filenames found.','暗号化・非対応圧縮、または展開サイズの上限を超えています。':'The ZIP is encrypted, uses unsupported compression, or exceeds the extraction limit.','ZIPデータが不正です。':'Invalid ZIP data.','ZIPが途切れています。':'Truncated ZIP data.','展開サイズが不正です。':'Invalid extracted size.','ファイルの破損を検出しました。':'File corruption detected.','FBX 2.0を選んでください。':'Choose a FBX 2.0 file.','FBXヘッダーが不正です。':'Invalid FBX header.','画像とデータを内包したFBXにしてください。':'Use a FBX with embedded images and data.','対応していない.charakitの形式・版です。':'Unsupported .charakit format or version.','プロジェクト情報が不正です。':'Invalid project information.','座標系が一致しません。':'Coordinate systems do not match.','中心マーカーはX=0にしてください。':'Center markers must use X = 0.','素材・マーカー情報が不正です。':'Invalid asset or marker data.','素材の重複またはハッシュが不正です。':'Duplicate assets or invalid hashes.','素材パスが不正です。':'Invalid asset path.','初期配置が不正です。':'Invalid initial placement.','素材の役割が不正です。':'Invalid asset role.','配置情報が不正です。':'Invalid placement data.','揺れものマーカーが不正です。':'Invalid spring markers.','素材の初期配置がありません。':'Missing initial asset placement.','更新モデルの指定がありません。':'Updated model is not specified.','更新モデルがありません。':'Updated model not found.','画像ライブラリがありません。':'Image library not found.','倍率が不正です。':'Invalid scale.','モデルを含む保存には配置済みFBXが必要です。':'Saving a model project requires an assembled FBX.','素材が欠落・変更されています: ':'Asset missing or modified: ','project.jsonがありません。':'project.json not found.','配置済みモデルが破損しています。':'Assembled model is corrupted.','素材が欠落・破損しています: ':'Asset missing or corrupted: ','モデル変換が不正です。':'Invalid model transform.','FBXシーンがありません。':'FBX scene not found.','モデルの高さを読み取れません。':'Unable to measure model height.','素材がありません。':'Asset not found.','同じ部位・方向・表情が重複しています: ':'Duplicate part / view / expression: ',
});

Object.assign(en,{
 '全身':'Full body','指モード':'Fingers','左手（本人）':'Left hand','右手（本人）':'Right hand','手全体':'Fit hand',
 '手首・手の中心を先に合わせてください。指の初期位置は仮置きです。各関節と先端をモデルに合わせます。':'Place the wrist and palm guides first. Finger positions are provisional. Align each joint and tip to the model.',
 '手のひらの中央。指モードの拡大位置の目安にもなります。':'Center of the palm. Also used to frame the hand in Fingers mode.',
 '指先の中心です。骨の向きと長さの目安にします。':'Center of the fingertip, guiding bone direction and length.',
 '指が曲がる関節の中心です。上面と側面でも奥行きを合わせてください。':'Center of the bending joint. Check depth from the top and side views too.'
});
for(const [side,label] of [['左','Left'],['右','Right']])for(const [finger,name] of [['親指','thumb'],['人差し指','index'],['中指','middle'],['薬指','ring'],['小指','little']]){
 en[side+finger]=label+' '+name;
 for(const [joint,english] of [['付け根','base'],['中間関節','middle joint'],['末端関節','distal joint'],['先端','tip']])en[side+finger+' '+joint]=label+' '+name+' '+english;
}

Object.assign(en, {
  "03 リギング": "03 Rigging",
  "04 動作確認": "04 Motion check",
  "05 Astraへ依頼": "05 Ask Astra",
  "詳細：関節": "Advanced: joints",
  "詳細：揺れ経路": "Advanced: spring paths",
  "表情なし・視線固定のMVP": "MVP: fixed face and eyes",
  "Astraへ依頼する": "Ask Astra",
  "作業を選び、保存した.charakitと依頼文をAstraへ渡します。": "Choose a task, then send the saved .charakit and prompt to Astra.",
  "頭・髪・体の3つを読み込みます。FBX、またはテクスチャ込みのZIPに対応。": "Load head, hair and body as FBX or ZIP with textures.",
  "ローカルで作業 · Tripoへのアップロードは手動です": "Local workspace · Upload to Tripo manually",
  "リグを付ける": "Add a rig",
  "頭＋体をTripoへ渡し、リグ済みFBXを読み戻します。": "Send head and body to Tripo, then import the rigged FBX.",
  "リギング方法": "Rigging method",
  "Tripo（標準）": "Tripo (standard)",
  "マーカー（詳細）": "Markers (advanced)",
  "頭＋体をFBXで書き出す": "Export head + body as FBX",
  "元のパーツ配置へ戻る": "Return to original parts",
  "Tripoでリギング ↗": "Rig in Tripo ↗",
  "書き出したFBXをアップロードしてリグを作り、FBXで書き出してください。髪はキットに保持します。": "Upload the exported FBX, generate a rig, then export FBX. Hair stays in the kit.",
  "Tripoのリグ済みFBXを読み込む": "Import rigged FBX from Tripo",
  "Tripoから骨配置を読み込む": "Import bone positions from Tripo",
  "骨配置だけを読み込みました。元のモデルに合わせて確認してください。": "Imported bone positions only. Check their alignment with the original model.",
  "頭＋体をTripoへ渡し、FBXから骨配置だけを読み戻します。": "Send head and body to Tripo, then read only the bone positions from FBX.",
  "元のメッシュ・テクスチャを保持し、骨のサイズを合わせます。ウェイトは素体から転送します。": "Keep the original geometry and textures, and align the bones to their size. Transfer weights from your donor body.",
  "マーカーを配置する": "Place markers",
  "動きを確認する": "Check motion",
  "その場で歩くモーションで、肩・腰・膝・足首の変形を確認します。": "Walk in place to inspect deformation at the shoulders, hips, knees and ankles.",
  "一時停止": "Pause",
  "再生": "Play",
  "元の姿勢": "Rest pose",
  "歩行の時点": "Walk time",
  "骨を表示": "Show skeleton",
  "比較画像と検査結果を保存": "Save contact sheet and report",
  "FBXの骨・ウェイト確認です。揺れものの物理と自然な変形の合否は別途確認します。": "This checks FBX skinning. Spring physics and visual deformation quality need separate verification.",
  "骨の対応を確認・修正": "Review bone mapping",
  "Astraへ次の作業を依頼": "Ask Astra for the next step",
  "依頼する作業": "Task to request",
  "素体合わせ・ウェイト転送": "Fit donor and transfer weights",
  "揺れもの・VRM出力": "Spring setup and VRM export",
  "マーカーからリギング（詳細）": "Rig from markers (advanced)",
  "Astraからの確認用FBXを読み込む": "Import review FBX from Astra",
  "完了した工程": "Completed step",
  "ウェイト転送": "Weight transfer",
  "揺れもの設定": "Spring setup",
  "返却FBXに髪が含まれている": "Returned FBX includes hair",
  "確認用FBX / ZIP": "Review FBX / ZIP",
  ".charakitで返ってきた場合は上部の「開く」を使います。完成VRMと編集用Blendは別に保管します。": "Use Open above for returned .charakit files. Keep the final VRM and editable Blend separately.",
  "リグ付きFBXを読み込みました。動作と髪の位置を確認してください。": "Rigged FBX imported. Check motion and hair placement."
});

Object.assign(en,{'頭（髪込み）':'Head (with hair)','ホイールで拡大 · 右ドラッグで移動':'Scroll to zoom · Right-drag to pan','体・髪・通常顔の3部位を読み込みます。途中でも保存できます。':'Load the body, hair and neutral head. You can save at any stage.','側面・背面から、頭・髪・体の位置と重なりを確認してください。':'Check head, hair and body placement from the sides and back.'});

Object.assign(en,{'リグが見つかりません。骨とウェイトを含むFBXを書き出してください。':'No rig found. Export an FBX with bones and skin weights.'});

Object.assign(en,{'元の反射を表示':'Source reflections','Tripo戻りのサイズを合わせ直す':'Restore original size after Tripo','頭・体を元のサイズと位置に合わせました。':'Head/body restored to their original size and placement.','元のサイズに合わせています…':'Restoring original size…'});
Object.assign(en,{
 '三面図を調整':'Adjust reference views','三面図':'Reference views','側面':'Side',
 '画像制作で登録した三面図が自動で表示されます。半透明のモデルを基準に、画像の位置・大きさ・透明度を合わせてください。画像の追加・差し替えもできます。':'References registered during image production appear automatically. Adjust their position, size and transparency against the translucent model. You can also add or replace images.',
 'バランス調整用の三面図':'Balance reference views',
 '部位画像の制作後に作成した全身の参考画像です。モデル編集で自動表示されます。':'Full-body references created after the part images. They appear automatically in model editing.',
 '三面図の方向':'Reference direction','画像を選ぶ':'Choose image',
 '正面・側面・背面の画像を1枚ずつ読み込みます。半透明のモデルを基準に、画像の位置・大きさ・透明度を合わせてください。':'Load one image each for the front, side and back. Match each image to the translucent model using position, size and transparency.',
 '側面には本人の右側の画像を使います。編集画面の「右側面」に重ねて表示します。':'Use an image of the character’s right side. It appears in the editor’s Right view.',
 '画像を選ぶと、モデルに重ねて表示します。':'Choose an image to overlay it on the model.',
 '画像をドラッグして移動できます。身長の目盛りはモデルの実寸（髪・飾り込み）です。':'Drag the image to move it. The height ruler shows the model’s actual size, including hair and accessories.',
 '画像の大きさ':'Image size','画像の透明度':'Image transparency','左右の位置（cm）':'Horizontal position (cm)','上下の位置（cm）':'Vertical position (cm)','高さ（cm）':'Height (cm)',
 '画像の位置・大きさを固定':'Lock image position and size','画像を外す':'Remove image','適用':'Apply',
 '三面図で使用中です。三面図のモーダルで画像を外してください。':'This image is used by a reference view. Remove it in the reference-view dialog.',
 '三面図の設定が不正です。':'Invalid reference-view settings.'
});

Object.assign(en,{
 'ウェイトを転送しています…':'Transferring weights…',
 '先にリギング済みFBXから骨配置を読み込んでください。':'Import bone placement from the rigged FBX first.',
 '元の頭・体が変わっています。骨配置を読み込み直してください。':'The original head/body has changed. Import bone placement again.',
 '揺れ物の除外対象を確認したキットが必要です。除外対象がない場合も、その確認情報を保存してください。':'This kit needs a reviewed spring exclusion list, including an explicit empty list when nothing is excluded.',
 '揺れ物の除外情報が古くなっています。現在のモデルで確認し直してください。':'The spring exclusion review is out of date. Review the current model again.',
 '揺れ物の除外情報が不正です。':'The spring exclusion data is invalid.'
});

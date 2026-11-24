// T-Pose quick start tab: upload a model (single, or body + hair) and follow the VRM steps.
import {language} from './i18n.mjs';

const LOCALES = ['ja', 'en', 'ko', 'zh-CN'];
const locale = () => {
  const value = language();
  return LOCALES.includes(value) ? value : 'en';
};
const pick = (table, lang = locale()) => table[lang] ?? table.en;

const TEXT = {
  nav: {ja: 'T-Poseクイック', en: 'T-Pose Quick', ko: 'T-Pose 빠른 시작', 'zh-CN': 'T-Pose 快速'},
  title: {ja: 'T-PoseからVRMを作る', en: 'Make a VRM from a T-Pose model', ko: 'T-Pose에서 VRM 만들기', 'zh-CN': '从 T-Pose 模型生成 VRM'},
  subtitle: {
    ja: '全身モデル1つ、または「身体＋髪」の2ファイルから始められます。',
    en: 'Start with one whole-body model, or with a separate body and hair.',
    ko: '전신 모델 하나 또는 몸+머리카락 두 파일로 시작합니다.',
    'zh-CN': '可以用一个全身模型，也可以用「身体 + 头发」两个文件开始。',
  },
  modeSingle: {ja: 'モデル1つ', en: 'Single model', ko: '단일 모델', 'zh-CN': '单模型'},
  modeBodyHair: {ja: '身体＋髪', en: 'Body + hair', ko: '몸 + 머리카락', 'zh-CN': '身体 + 头发'},
  upload: {ja: 'T-Poseモデルを選ぶ（FBX / GLB / ZIP）', en: 'Choose a T-Pose model (FBX / GLB / ZIP)', ko: 'T-Pose 모델 선택 (FBX / GLB / ZIP)', 'zh-CN': '选择 T-Pose 模型（FBX / GLB / ZIP）'},
  uploadBody: {ja: 'T-Poseの身体（FBX / GLB / ZIP）', en: 'T-Pose body (FBX / GLB / ZIP)', ko: 'T-Pose 몸 (FBX / GLB / ZIP)', 'zh-CN': 'T-Pose 身体（FBX / GLB / ZIP）'},
  uploadHair: {ja: '髪モデル（FBX / GLB / ZIP）', en: 'Hair model (FBX / GLB / ZIP)', ko: '머리카락 모델 (FBX / GLB / ZIP)', 'zh-CN': '头发模型（FBX / GLB / ZIP）'},
  drop: {ja: 'ここにドラッグ＆ドロップ、またはクリックして選択', en: 'Drag a file here, or click to choose', ko: '여기에 끌어다 놓거나 클릭해 선택', 'zh-CN': '拖放文件到此处，或点击选择'},
  noFile: {ja: 'まだファイルがありません', en: 'No file selected yet', ko: '아직 파일이 없습니다', 'zh-CN': '尚未选择文件'},
  ok: {ja: '読み込み可能な形式です', en: 'Supported format', ko: '지원되는 형식입니다', 'zh-CN': '格式可用'},
  bad: {ja: 'FBX / GLB / ZIP を選んでください', en: 'Choose an FBX, GLB or ZIP file', ko: 'FBX / GLB / ZIP을 선택하세요', 'zh-CN': '请选择 FBX / GLB / ZIP'},
  local: {
    ja: 'このタブは手順の案内です。ファイルはブラウザ内に留まり、外部へ送信されません。',
    en: 'This tab is guidance only. The file stays in your browser and is not uploaded anywhere.',
    ko: '이 탭은 안내용입니다. 파일은 브라우저에만 남고 외부로 전송되지 않습니다.',
    'zh-CN': '此标签页仅提供指引。文件只留在浏览器中，不会上传到任何地方。',
  },
  stepsTitle: {ja: '手順', en: 'Steps', ko: '단계', 'zh-CN': '步骤'},
  guide: {ja: '詳しい分担ガイドを開く', en: 'Open the full handoff guide', ko: '자세한 분담 가이드 열기', 'zh-CN': '打开详细分工指南'},
  copied: {ja: 'コピーしました', en: 'Copied', ko: '복사했습니다', 'zh-CN': '已复制'},
  close: {ja: '閉じる', en: 'Close', ko: '닫기', 'zh-CN': '关闭'},
  done: {ja: '完了', en: 'Done', ko: '완료', 'zh-CN': '已完成'},
  uploadFirst: {ja: '先にファイルを選択してください', en: 'Choose the files first', ko: '먼저 파일을 선택하세요', 'zh-CN': '请先选择文件'},
  steps: {
    ja: [
      ['T-Poseモデルを用意', 'テクスチャ付きのT-Pose全身モデルを1つ。腕は水平、足元は原点。必要ならUVと4Kテクスチャを用意します。'],
      ['頭と身体を分離', '頭（首なし）と身体（首あり）に分けます。揺らす髪はさらに独立メッシュにします。'],
      ['Tripoでアセット生成', '分離した頭と身体をTripoへ。Smart UV・4K再テクスチャ・auto-rigを実行し、FBXを書き出します。'],
      ['リグ済みFBXを戻す', '書き出したFBXをローカルエージェントへ。取り込むのは骨配置だけで、Tripoの自動ウェイトは最終ウェイトに使いません。'],
      ['ウェイトと揺れもの', '素体をフィットしてウェイトを転送し、分離した髪・衣装に揺れ骨と衝突を設定します。'],
      ['VRM書き出しと確認', 'VRMを書き出して自動検査を実行し、動作確認で物理ON/OFFと見た目を確認します。'],
      ['保存', 'モデル名・作者・利用条件を入力し、exports/avatar.vrm と avatar.blend を保存します。'],
    ],
    en: [
      ['Prepare a T-Pose model', 'One textured whole-body T-Pose model. Keep the arms horizontal and the feet at the origin. Add UVs and a 4K texture if needed.'],
      ['Separate the head and body', 'Split into head (no neck) and body (keeps the neck). Make hair a separate mesh if it should swing.'],
      ['Generate assets in Tripo', 'Send the separated head and body to Tripo. Run Smart UV, 4K retexture and auto-rig, then export FBX.'],
      ['Return the rigged FBX', 'Give the exported FBX to the local agent. Only the bone placement is imported; Tripo automatic weights are not used as final weights.'],
      ['Weights and springs', 'Fit the bundled base body and transfer weights, then set spring bones and collisions for separated hair and outfit parts.'],
      ['Export and review', 'Export the VRM, run the automated checks, and review physics ON/OFF and appearance in Motion check.'],
      ['Save', 'Fill in model name, authors and usage terms, then save exports/avatar.vrm and avatar.blend.'],
    ],
    ko: [
      ['T-Pose 모델 준비', '텍스처가 있는 T-Pose 전신 모델 하나. 팔은 수평, 발은 원점. 필요하면 UV와 4K 텍스처를 준비합니다.'],
      ['머리와 몸 분리', '머리(목 없음)와 몸(목 포함)으로 나눕니다. 흔들릴 머리카락은 별도 메시로 만듭니다.'],
      ['Tripo에서 에셋 생성', '분리한 머리와 몸을 Tripo로. Smart UV, 4K 리텍스처, auto-rig를 실행하고 FBX를 내보냅니다.'],
      ['리깅된 FBX 반환', '내보낸 FBX를 로컬 에이전트에게 전달합니다. 가져오는 것은 본 배치뿐이며 Tripo 자동 웨이트는 최종 웨이트로 사용하지 않습니다.'],
      ['웨이트와 흔들림', '기본 바디를 맞추고 웨이트를 전송한 뒤, 분리한 머리카락·의상에 흔들림 본과 충돌을 설정합니다.'],
      ['VRM 내보내기와 확인', 'VRM을 내보내고 자동 검사를 실행한 뒤, 동작 확인에서 물리 ON/OFF와 외형을 확인합니다.'],
      ['저장', '모델 이름·제작자·이용 조건을 입력하고 exports/avatar.vrm과 avatar.blend를 저장합니다.'],
    ],
    'zh-CN': [
      ['准备 T-Pose 模型', '一个带贴图的 T-Pose 全身模型。手臂水平、脚底在原点。需要时准备 UV 与 4K 贴图。'],
      ['分离头与身体', '拆成头（不含脖子）与身体（保留脖子）。需要摆动的头发再拆成独立网格。'],
      ['在 Tripo 生成资产', '把分离后的头与身体交给 Tripo，执行 Smart UV、4K 重贴图、auto-rig，然后导出 FBX。'],
      ['交回绑定后的 FBX', '把导出的 FBX 交给本地代理。只导入骨骼位置，Tripo 的自动权重不作为最终权重。'],
      ['权重与摆动', '拟合随附素体并转移权重，然后为分离的头发和服装设置摆动骨骼与碰撞。'],
      ['导出 VRM 并确认', '导出 VRM 并运行自动检查，在动作确认中查看物理 ON/OFF 与外观。'],
      ['保存', '填写模型名、作者与使用条件，保存 exports/avatar.vrm 与 avatar.blend。'],
    ],
  },
  bodyHairSteps: {
    ja: [
      ['身体と髪を用意', 'T-Poseの身体（髪なし）と、独立した髪モデルを1つずつ。腕は水平、足元は原点。'],
      ['髪を頭に合わせる', '髪を頭の大きさに合わせ、根元を頭皮へ。身体とは統合せず、hair.fbx のまま保持します。'],
      ['Tripoで身体アセット生成', 'Tripoには身体だけをアップロード。Smart UV・4K再テクスチャ・auto-rigを実行し、FBXを書き出します。'],
      ['リグ済み身体FBXを戻す', '書き出したFBXをローカルエージェントへ。骨配置だけを取り込み、髪はローカルで付けます。'],
      ['髪の取り付けと揺れもの', '髪の根元を頭の骨へ固定し、毛先に揺れ骨・ウェイト・衝突を設定します。'],
      ['VRM書き出しと確認', 'VRMを書き出して自動検査を実行し、動作確認で髪の物理ON/OFFと見た目を確認します。'],
      ['保存', 'モデル名・作者・利用条件を入力し、exports/avatar.vrm と avatar.blend を保存します。'],
    ],
    en: [
      ['Prepare the body and hair', 'A bald T-Pose body and a separate hair model. Keep the arms horizontal and the feet at the origin.'],
      ['Align the hair to the head', 'Scale the hair to the head size and put the roots on the scalp. Keep it as hair.fbx; do not merge it into the body.'],
      ['Generate body assets in Tripo', 'Upload only the body to Tripo. Run Smart UV, 4K retexture and auto-rig, then export FBX.'],
      ['Return the rigged body FBX', 'Give the exported FBX to the local agent. Only the bone placement is imported; hair is attached locally.'],
      ['Attach hair and springs', 'Fix the hair roots to the head bone, then set spring bones, weights and collisions for the strands.'],
      ['Export and review', 'Export the VRM, run the automated checks, and review hair physics ON/OFF and appearance in Motion check.'],
      ['Save', 'Fill in model name, authors and usage terms, then save exports/avatar.vrm and avatar.blend.'],
    ],
    ko: [
      ['몸과 머리카락 준비', 'T-Pose 몸(머리카락 없음)과 별도 머리카락 모델 하나씩. 팔은 수평, 발은 원점.'],
      ['머리카락을 머리에 맞추기', '머리카락을 머리 크기에 맞추고 뿌리를 두피에. 몸과 합치지 말고 hair.fbx로 유지합니다.'],
      ['Tripo에서 몸 에셋 생성', 'Tripo에는 몸만 업로드. Smart UV, 4K 리텍스처, auto-rig를 실행하고 FBX를 내보냅니다.'],
      ['리깅된 몸 FBX 반환', '내보낸 FBX를 로컬 에이전트에게. 본 배치만 가져오고 머리카락은 로컬에서 붙입니다.'],
      ['머리카락 부착과 흔들림', '머리카락 뿌리를 머리 본에 고정하고 끝부분에 흔들림 본·웨이트·충돌을 설정합니다.'],
      ['VRM 내보내기와 확인', 'VRM을 내보내고 자동 검사를 실행한 뒤, 동작 확인에서 머리카락 물리 ON/OFF와 외형을 확인합니다.'],
      ['저장', '모델 이름·제작자·이용 조건을 입력하고 exports/avatar.vrm과 avatar.blend를 저장합니다.'],
    ],
    'zh-CN': [
      ['准备身体与头发', '一个 T-Pose 光头身体和一个独立头发模型。手臂水平、脚底在原点。'],
      ['把头发对齐到头部', '按头部大小缩放头发，发根贴合头皮。保持为 hair.fbx，不要合并进身体。'],
      ['在 Tripo 生成身体资产', 'Tripo 只上传身体，执行 Smart UV、4K 重贴图、auto-rig，然后导出 FBX。'],
      ['交回绑定后的身体 FBX', '把导出的 FBX 交给本地代理。只导入骨骼位置，头发在本地附加。'],
      ['附加头发与摆动', '把发根固定到头部骨骼，再为发梢设置摆动骨骼、权重与碰撞。'],
      ['导出 VRM 并确认', '导出 VRM 并运行自动检查，在动作确认中查看头发物理 ON/OFF 与外观。'],
      ['保存', '填写模型名、作者与使用条件，保存 exports/avatar.vrm 与 avatar.blend。'],
    ],
  },
  actionSep: {ja: '頭と身体を分離', en: 'Separate head and body', ko: '머리와 몸 분리', 'zh-CN': '分离头与身体'},
  sepTitle: {ja: '頭と身体の分離', en: 'Separate the head and body', ko: '머리와 몸 분리', 'zh-CN': '分离头与身体'},
  sepReq: {
    ja: [
      '頭：顔と頭蓋だけ。首は含めません。',
      '身体：首を残し、首の上で頭を切り離します。',
      '髪：揺らす場合は独立したメッシュにします。',
      'ワールド位置・材質・UV・テクスチャを保持し、head.fbx / body.fbx / hair.fbx を書き出します。',
    ],
    en: [
      'Head: face and skull only. Do not include the neck.',
      'Body: keep the neck; cut the head above it.',
      'Hair: make it a separate mesh if it should swing.',
      'Keep world position, materials, UVs and textures; export head.fbx, body.fbx and hair.fbx.',
    ],
    ko: [
      '머리: 얼굴과 두개골만. 목은 포함하지 않습니다.',
      '몸: 목을 남기고 목 위에서 머리를 분리합니다.',
      '머리카락: 흔들릴 경우 별도 메시로 만듭니다.',
      '월드 위치·재질·UV·텍스처를 유지하고 head.fbx / body.fbx / hair.fbx를 내보냅니다.',
    ],
    'zh-CN': [
      '头：只保留脸与头骨，不包含脖子。',
      '身体：保留脖子，在脖子上方切下头。',
      '头发：需要摆动时做成独立网格。',
      '保持世界坐标、材质、UV 与贴图，导出 head.fbx / body.fbx / hair.fbx。',
    ],
  },
  copySep: {ja: '分離の依頼文をコピー', en: 'Copy separation request', ko: '분리 요청 복사', 'zh-CN': '复制分离请求'},
  markSep: {ja: '分離済みにする', en: 'Mark as separated', ko: '분리 완료로 표시', 'zh-CN': '标记为已分离'},
  actionHair: {ja: '髪の合わせ方を確認', en: 'Hair alignment requirements', ko: '머리카락 정렬 요구 사항', 'zh-CN': '头发对齐要求'},
  hairTitle: {ja: '髪を頭に合わせる', en: 'Align the hair to the head', ko: '머리카락을 머리에 맞추기', 'zh-CN': '把头发对齐到头部'},
  hairReq: {
    ja: [
      '髪を頭の大きさに合わせ、根元を頭皮の位置へ置きます。',
      '髪は独立メッシュのまま保持し、身体と統合しません。',
      '髪の材質・UV・テクスチャを保持し、hair.fbx として書き出します。',
      '長い髪は根元を頭の骨に固定し、毛先側を揺れ骨の対象にします。',
    ],
    en: [
      'Scale the hair to the head and place the roots on the scalp.',
      'Keep the hair as a separate mesh; do not merge it into the body.',
      'Keep the hair materials, UVs and textures; export it as hair.fbx.',
      'For long hair, fix the roots to the head bone and use the lower strands for spring chains.',
    ],
    ko: [
      '머리카락을 머리 크기에 맞추고 뿌리를 두피 위치에 둡니다.',
      '머리카락은 별도 메시로 유지하고 몸과 합치지 않습니다.',
      '머리카락 재질·UV·텍스처를 유지하고 hair.fbx로 내보냅니다.',
      '긴 머리카락은 뿌리를 머리 본에 고정하고 끝부분을 흔들림 본 대상으로 합니다.',
    ],
    'zh-CN': [
      '按头部大小缩放头发，把发根放到头皮位置。',
      '头发保持独立网格，不要合并进身体。',
      '保留头发的材质、UV 与贴图，导出为 hair.fbx。',
      '长发把发根固定到头部骨骼，发梢用于摆动骨骼链。',
    ],
  },
  markHair: {ja: '髪を合わせた', en: 'Mark hair as aligned', ko: '머리카락 정렬 완료', 'zh-CN': '标记头发已对齐'},
  altAction: {ja: '分離できない場合の代替案', en: 'Cannot separate? Alternatives', ko: '분리할 수 없나요? 대안', 'zh-CN': '无法分离？替代方案'},
  altTitle: {ja: 'T-Poseを分離できない場合の代替案', en: 'If the T-Pose model cannot be separated', ko: 'T-Pose 모델을 분리할 수 없을 때의 대안', 'zh-CN': 'T-Pose 模型无法分离时的替代方案'},
  altReq: {
    ja: [
      'Tripoで元絵から頭と身体を別々に生成し、head.fbx / body.fbx として続行します。',
      'Tripoの分割・コンポーネント機能で髪や身体が分かれる場合は、その分割結果を使います。',
      '髪だけを別モデルとして生成し、身体は分離せずそのまま使います。髪には揺れものを設定できます。',
      '分離を諦めて全体を1メッシュとしてリグし、髪は頭の骨に固定します（揺れなし）。',
      'Blenderで手動カットします。顔・腕の周辺に修正が必要になる場合があります。',
      '品質を優先するなら、このキット標準の8枚部位画像＋分割の工程に切り替えます。',
    ],
    en: [
      'Generate the head and body separately in Tripo from the original reference, then continue with head.fbx / body.fbx.',
      'Run Tripo segmentation/components; if hair or body separates cleanly, use that result.',
      'Generate hair as its own model and keep the body intact. Hair can still get spring physics.',
      'Skip separation: rig the whole model as one mesh and fix the hair to the head bone (no physics).',
      'Cut manually in Blender. Expect cleanup around the face and arms.',
      'For maximum quality, switch to the kit standard 8 part images + segmentation pipeline.',
    ],
    ko: [
      'Tripo에서 원본을 기준으로 머리와 몸을 따로 생성하고 head.fbx / body.fbx로 계속합니다.',
      'Tripo 분할/컴포넌트 기능으로 머리카락이나 몸이 분리되면 그 결과를 사용합니다.',
      '머리카락만 별도 모델로 생성하고 몸은 그대로 사용합니다. 머리카락에는 흔들림을 설정할 수 있습니다.',
      '분리를 포기하고 전체를 하나의 메시로 리깅하며 머리카락은 머리 본에 고정합니다(흔들림 없음).',
      'Blender에서 직접 자릅니다. 얼굴·팔 주변 수정이 필요할 수 있습니다.',
      '품질을 우선하면 이 키트의 표준 8장 부위 이미지 + 분할 공정으로 전환합니다.',
    ],
    'zh-CN': [
      '在 Tripo 中根据原图分别生成头与身体，再用 head.fbx / body.fbx 继续。',
      '使用 Tripo 的分割/组件功能；如果头发或身体能分开，就用分割结果。',
      '单独生成头发模型，身体保持完整；头发仍可设置摆动。',
      '放弃分离：把整体作为一个网格绑定，头发固定到头部骨骼（无物理）。',
      '在 Blender 中手动切割；脸部和手臂附近可能需要修整。',
      '如果优先保证质量，改用本套件标准的 8 张部位图 + 分割流程。',
    ],
  },
  actionTripo: {ja: 'Tripoの要件を見る', en: 'View Tripo requirements', ko: 'Tripo 요구 사항 보기', 'zh-CN': '查看 Tripo 要求'},
  tripoTitle: {ja: 'Tripoでのアセット生成要件', en: 'Tripo asset generation requirements', ko: 'Tripo 에셋 생성 요구 사항', 'zh-CN': 'Tripo 资产生成要求'},
  tripoReq: {
    ja: [
      'Tripo Studioは英語UIで開きます（/ja/ を付けないロケール中立URL）。',
      'body.fbx と head.fbx をアップロードします。髪はアップロードしません。',
      '作り直す場合：Smart Mesh P2.0＋四角面（25,000クアッド）を推奨。P1.0＋三角面も使えますが、品質と変形は劣ります。',
      'Smart UV と 4K 再テクスチャ：4096×4096、部位ごとに Base Color 1枚。',
      '髪を除いた頭＋身体を auto-rig。肩・肘・手首・股関節・膝・足首・首を確認します。',
      '通常ExportでFBXを書き出し、テクスチャを埋め込みます。髪は含めません。',
    ],
    en: [
      'Open Tripo Studio in the English UI (locale-neutral URL, no /ja/).',
      'Upload body.fbx and head.fbx. Do not upload hair.',
      'If regenerating: Smart Mesh P2.0 with quad topology is recommended (25,000 quads). P1.0 with triangles works but gives lower quality and rougher deformation.',
      'Smart UV and 4K retexture: 4096×4096, one Base Color per part.',
      'Auto-rig the head + body without hair. Check shoulders, elbows, wrists, hips, knees, ankles and neck.',
      'Export with the standard Export as FBX with embedded textures. Do not include hair.',
    ],
    ko: [
      'Tripo Studio는 영어 UI로 엽니다 (/ja/ 없는 로케일 중립 URL).',
      'body.fbx와 head.fbx를 업로드합니다. 머리카락은 업로드하지 않습니다.',
      '다시 만들 경우: Smart Mesh P2.0 + 사각면(25,000 쿼드)을 권장합니다. P1.0 + 삼각면도 사용할 수 있지만 품질과 변형이 떨어집니다.',
      'Smart UV와 4K 리텍스처: 4096×4096, 부위마다 Base Color 1장.',
      '머리카락을 제외한 머리+몸을 auto-rig. 어깨·팔꿈치·손목·고관절·무릎·발목·목을 확인합니다.',
      '표준 Export로 FBX를 내보내고 텍스처를 포함합니다. 머리카락은 포함하지 않습니다.',
    ],
    'zh-CN': [
      '用英文界面打开 Tripo Studio（使用不带 /ja/ 的中立 URL）。',
      '上传 body.fbx 与 head.fbx，不要上传头发。',
      '如需重新生成：推荐 Smart Mesh P2.0 + 四边面（25,000 四边面）。P1.0 + 三角面也可用，但质量与形变较差。',
      'Smart UV 与 4K 重贴图：4096×4096，每个部位一张 Base Color。',
      '对不含头发的头 + 身体执行 auto-rig。确认肩、肘、腕、胯、膝、踝、颈。',
      '用标准 Export 导出 FBX，内嵌贴图，不要包含头发。',
    ],
  },
  tripoReqBodyHair: {
    ja: [
      'Tripo Studioは英語UIで開きます（/ja/ を付けないロケール中立URL）。',
      '身体（body.fbx）だけをアップロードします。髪はアップロードしません。',
      '作り直す場合：Smart Mesh P2.0＋四角面（25,000クアッド）を推奨。P1.0＋三角面も使えますが、品質と変形は劣ります。',
      'Smart UV と 4K 再テクスチャ：4096×4096、Base Color 1枚。',
      '身体だけを auto-rig。肩・肘・手首・股関節・膝・足首・首を確認します。',
      '通常ExportでFBXを書き出し、テクスチャを埋め込みます。髪は含めません。',
    ],
    en: [
      'Open Tripo Studio in the English UI (locale-neutral URL, no /ja/).',
      'Upload only the body (body.fbx). Do not upload hair.',
      'If regenerating: Smart Mesh P2.0 with quad topology is recommended (25,000 quads). P1.0 with triangles works but gives lower quality and rougher deformation.',
      'Smart UV and 4K retexture: 4096×4096, one Base Color.',
      'Auto-rig the body only. Check shoulders, elbows, wrists, hips, knees, ankles and neck.',
      'Export with the standard Export as FBX with embedded textures. Do not include hair.',
    ],
    ko: [
      'Tripo Studio는 영어 UI로 엽니다 (/ja/ 없는 로케일 중립 URL).',
      '몸(body.fbx)만 업로드합니다. 머리카락은 업로드하지 않습니다.',
      '다시 만들 경우: Smart Mesh P2.0 + 사각면(25,000 쿼드)을 권장합니다. P1.0 + 삼각면도 사용할 수 있지만 품질과 변형이 떨어집니다.',
      'Smart UV와 4K 리텍스처: 4096×4096, Base Color 1장.',
      '몸만 auto-rig. 어깨·팔꿈치·손목·고관절·무릎·발목·목을 확인합니다.',
      '표준 Export로 FBX를 내보내고 텍스처를 포함합니다. 머리카락은 포함하지 않습니다.',
    ],
    'zh-CN': [
      '用英文界面打开 Tripo Studio（使用不带 /ja/ 的中立 URL）。',
      '只上传身体（body.fbx），不要上传头发。',
      '如需重新生成：推荐 Smart Mesh P2.0 + 四边面（25,000 四边面）。P1.0 + 三角面也可用，但质量与形变较差。',
      'Smart UV 与 4K 重贴图：4096×4096，一张 Base Color。',
      '只对身体执行 auto-rig。确认肩、肘、腕、胯、膝、踝、颈。',
      '用标准 Export 导出 FBX，内嵌贴图，不要包含头发。',
    ],
  },
  openTripo: {ja: 'Tripo Studioを開く', en: 'Open Tripo Studio', ko: 'Tripo Studio 열기', 'zh-CN': '打开 Tripo Studio'},
  copyTripo: {ja: 'Tripoの依頼文をコピー', en: 'Copy Tripo request', ko: 'Tripo 요청 복사', 'zh-CN': '复制 Tripo 请求'},
  previewTitle: {ja: 'VRMプレビュー / Rig編集', en: 'VRM preview & rig editing', ko: 'VRM 미리보기 / Rig 편집', 'zh-CN': 'VRM 预览 / Rig 编辑'},
  previewUpload: {ja: 'VRMを選ぶ（.vrm）', en: 'Choose a VRM (.vrm)', ko: 'VRM 선택 (.vrm)', 'zh-CN': '选择 VRM（.vrm）'},
  previewNoFile: {ja: 'まだVRMがありません', en: 'No VRM loaded yet', ko: '아직 VRM이 없습니다', 'zh-CN': '尚未载入 VRM'},
  previewNote: {ja: '読み込んだVRMを3Dで確認し、Humanoid骨を回転してポーズを確認できます。', en: 'Inspect the loaded VRM in 3D and rotate Humanoid bones to check poses.', ko: '불러온 VRM을 3D로 확인하고 Humanoid 본을 회전해 포즈를 확인합니다.', 'zh-CN': '在 3D 中查看载入的 VRM，并旋转 Humanoid 骨骼检查姿势。'},
  previewWalk: {ja: '歩行', en: 'Walk', ko: '걷기', 'zh-CN': '行走'},
  previewPhysics: {ja: '物理', en: 'Physics', ko: '물리', 'zh-CN': '物理'},
  previewBone: {ja: '骨', en: 'Bone', ko: '본', 'zh-CN': '骨骼'},
  previewReset: {ja: 'ポーズを戻す', en: 'Reset pose', ko: '포즈 초기화', 'zh-CN': '重置姿势'},
  previewPosition: {ja: '位置（cm）', en: 'Position (cm)', ko: '위치 (cm)', 'zh-CN': '位置（cm）'},
  previewRadius: {ja: '半径（cm）', en: 'Radius (cm)', ko: '반경 (cm)', 'zh-CN': '半径（cm）'},
  previewReweight: {ja: 'この骨の周辺を再ウェイト', en: 'Reweight around this bone', ko: '이 본 주변 재웨이트', 'zh-CN': '重新计算该骨骼周围权重'},
};

let panel;
let navButton;
let modeButtons;
let singleCard;
let bodyHairCard;
let singleDrop;
let bodyDrop;
let hairDrop;
let singleInput;
let bodyInput;
let hairInput;
let singleInfo;
let bodyInfo;
let hairInfo;
let stepsList;
let titleEl;
let subtitleEl;
let uploadLabelEl;
let singleDropText;
let bodyLabelEl;
let hairLabelEl;
let bodyDropText;
let hairDropText;
let stepsTitleEl;
let noteEl;
let guideEl;
let dialog;
let dialogTitle;
let dialogList;
let dialogCopy;
let dialogMark;
let dialogStatus;
let previewApi=null;
let previewTitleEl;
let previewNoteEl;
let previewDrop;
let previewInfo;
let previewViewer;
let previewControls;
let previewInput;
let activeStageButton = null;
const state = {mode: 'single', singleUploaded: false, separated: false, bodyUploaded: false, hairUploaded: false, hairAligned: false};
let singleFile = null;
let singleResult = null;
let bodyFile = null;
let bodyResult = null;
let hairFile = null;
let hairResult = null;

function activate() {
  if (!panel) return;
  panel.hidden = false;
  document.body.classList.add('qs-open');
  navButton?.classList.add('active');
  activeStageButton = document.querySelector('#stages .nav-list button[data-stage].active');
  document.querySelectorAll('#stages .nav-list button[data-stage]').forEach((button) => button.classList.remove('active'));
  const nextStep = document.querySelector('#nextStepButton');
  if (nextStep) nextStep.hidden = true;
  for (const el of [document.querySelector('.page-topbar'), document.querySelector('#imageWorkspace'), document.querySelector('#handoffWorkspace'), document.querySelector('main')]) {
    if (el) el.hidden = true;
  }
}

function deactivate() {
  if (!panel) return;
  panel.hidden = true;
  document.body.classList.remove('qs-open');
  navButton?.classList.remove('active');
  if (activeStageButton) activeStageButton.classList.add('active');
  activeStageButton = null;
  const nextStep = document.querySelector('#nextStepButton');
  if (nextStep) nextStep.hidden = false;
  const topbar = document.querySelector('.page-topbar');
  if (topbar) topbar.hidden = false;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function inspect(file) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const ascii = String.fromCharCode(...head.subarray(0, 32));
  const ext = file.name.split('.').pop().toLowerCase();
  const isFbx = ascii.startsWith('Kaydara FBX Binary') || ascii.startsWith('; FBX');
  const isGlb = ascii.startsWith('glTF');
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const ok = (ext === 'fbx' && isFbx) || (ext === 'glb' && isGlb) || (ext === 'zip' && isZip);
  return {ok, ext: ext.toUpperCase(), size: formatSize(file.size)};
}

function setFileText(infoEl, file, result, lang) {
  if (!file) {
    infoEl.textContent = pick(TEXT.noFile, lang);
    infoEl.dataset.state = '';
    return;
  }
  infoEl.textContent = result.ok
    ? `${file.name} · ${result.ext} · ${result.size} — ${pick(TEXT.ok, lang)}`
    : `${file.name} · ${result.size} — ${pick(TEXT.bad, lang)}`;
  infoEl.dataset.state = result.ok ? 'ok' : 'bad';
}

function separationRequest(lang) {
  const file = singleFile ? singleFile.name : '(T-Pose model)';
  const lines = {
    ja: [
      'T-PoseモデルをBlenderで頭・身体・（必要なら）髪に分離してください。',
      '- 頭：顔と頭蓋だけ。首は含めない。',
      '- 身体：首を残す。',
      '- 髪：揺らす場合は独立メッシュ。',
      '- ワールド位置・材質・UV・テクスチャを保持。',
      '- head.fbx / body.fbx / hair.fbx を書き出す。',
      `モデル: ${file}`,
    ],
    en: [
      'Separate this T-Pose model into head, body and (if needed) hair in Blender.',
      '- Head: face and skull only; no neck.',
      '- Body: keeps the neck.',
      '- Hair: separate mesh for spring physics.',
      '- Keep world position, materials, UVs and textures.',
      '- Export head.fbx, body.fbx and hair.fbx.',
      `Model: ${file}`,
    ],
    ko: [
      'T-Pose 모델을 Blender에서 머리·몸·(필요하면) 머리카락으로 분리하세요.',
      '- 머리: 얼굴과 두개골만. 목 제외.',
      '- 몸: 목 유지.',
      '- 머리카락: 흔들릴 경우 별도 메시.',
      '- 월드 위치·재질·UV·텍스처 유지.',
      '- head.fbx / body.fbx / hair.fbx 내보내기.',
      `모델: ${file}`,
    ],
    'zh-CN': [
      '请在 Blender 中把该 T-Pose 模型分离为头、身体（以及需要时的头发）。',
      '- 头：只保留脸与头骨，不含脖子。',
      '- 身体：保留脖子。',
      '- 头发：需要摆动时做成独立网格。',
      '- 保持世界坐标、材质、UV 与贴图。',
      '- 导出 head.fbx / body.fbx / hair.fbx。',
      `模型：${file}`,
    ],
  };
  return pick(lines, lang).join('\n');
}

function tripoRequest(lang) {
  const req = state.mode === 'bodyHair' ? TEXT.tripoReqBodyHair : TEXT.tripoReq;
  return pick(req, lang).map((line, index) => `${index + 1}. ${line}`).join('\n');
}

async function copyText(text, statusEl) {
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = pick(TEXT.copied);
  } catch {
    statusEl.textContent = '⌘C / Ctrl+C';
  }
}

function openDialog(kind) {
  const lang = locale();
  dialog.dataset.kind = kind;
  if (kind === 'separation') dialogTitle.textContent = pick(TEXT.sepTitle, lang);
  else if (kind === 'alternatives') dialogTitle.textContent = pick(TEXT.altTitle, lang);
  else if (kind === 'hair') dialogTitle.textContent = pick(TEXT.hairTitle, lang);
  else dialogTitle.textContent = pick(TEXT.tripoTitle, lang);
  const lines = kind === 'separation' ? pick(TEXT.sepReq, lang)
    : kind === 'alternatives' ? pick(TEXT.altReq, lang)
    : kind === 'hair' ? pick(TEXT.hairReq, lang)
    : pick(state.mode === 'bodyHair' ? TEXT.tripoReqBodyHair : TEXT.tripoReq, lang);
  dialogList.replaceChildren(
    ...lines.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }),
  );
  dialogCopy.hidden = kind === 'alternatives' || kind === 'hair';
  dialogCopy.textContent = kind === 'separation' ? pick(TEXT.copySep, lang) : pick(TEXT.copyTripo, lang);
  dialogMark.textContent = kind === 'separation' ? pick(TEXT.markSep, lang)
    : kind === 'hair' ? pick(TEXT.markHair, lang)
    : pick(TEXT.close, lang);
  dialogMark.dataset.action = kind === 'separation' || kind === 'hair' ? 'mark' : 'close';
  dialogStatus.textContent = '';
  dialog.showModal();
}

function renderSteps(lang) {
  const bodyHair = state.mode === 'bodyHair';
  const steps = pick(bodyHair ? TEXT.bodyHairSteps : TEXT.steps, lang);
  const current = bodyHair
    ? (!state.bodyUploaded ? 0 : !state.hairAligned ? 1 : 2)
    : (!state.singleUploaded ? 0 : !state.separated ? 1 : 2);
  stepsList.replaceChildren(
    ...steps.map(([heading, body], index) => {
      const item = document.createElement('li');
      if (index < current || (bodyHair ? index === 1 && state.hairAligned : index === 1 && state.separated)) item.classList.add('done');
      if (index === current) item.classList.add('active');
      const h = document.createElement('h3');
      h.textContent = heading;
      const p = document.createElement('p');
      p.textContent = body;
      item.append(h, p);
      if (index === 1) {
        const actions = document.createElement('div');
        actions.className = 'qs-actions';
        if (bodyHair) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'qs-action';
          button.textContent = state.hairAligned ? pick(TEXT.done, lang) : pick(TEXT.actionHair, lang);
          button.disabled = !(state.bodyUploaded && state.hairUploaded);
          button.title = button.disabled ? pick(TEXT.uploadFirst, lang) : '';
          button.addEventListener('click', () => {
            if (state.bodyUploaded && state.hairUploaded) openDialog('hair');
          });
          actions.append(button);
        } else {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'qs-action';
          button.textContent = state.separated ? pick(TEXT.done, lang) : pick(TEXT.actionSep, lang);
          button.disabled = !state.singleUploaded;
          button.title = state.singleUploaded ? '' : pick(TEXT.uploadFirst, lang);
          button.addEventListener('click', () => {
            if (state.singleUploaded) openDialog('separation');
          });
          const alt = document.createElement('button');
          alt.type = 'button';
          alt.className = 'qs-action';
          alt.textContent = pick(TEXT.altAction, lang);
          alt.disabled = !state.singleUploaded;
          alt.addEventListener('click', () => {
            if (state.singleUploaded) openDialog('alternatives');
          });
          actions.append(button, alt);
        }
        item.append(actions);
      }
      if (index === 2) {
        const actions = document.createElement('div');
        actions.className = 'qs-actions';
        const link = document.createElement('a');
        link.className = 'qs-action';
        link.href = 'https://studio.tripo3d.ai/';
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = pick(TEXT.openTripo, lang);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'qs-action';
        button.textContent = pick(TEXT.actionTripo, lang);
        button.disabled = bodyHair ? !state.bodyUploaded : !state.separated;
        button.title = button.disabled ? pick(TEXT.uploadFirst, lang) : '';
        button.addEventListener('click', () => {
          if (!button.disabled) openDialog('tripo');
        });
        actions.append(link, button);
        item.append(actions);
      }
      return item;
    }),
  );
}

function render() {
  const lang = locale();
  if (!panel) return;
  titleEl.textContent = pick(TEXT.title, lang);
  subtitleEl.textContent = pick(TEXT.subtitle, lang);
  singleDrop.querySelector('.qs-drop-title').textContent = pick(TEXT.upload, lang);
  bodyDrop.querySelector('.qs-drop-title').textContent = pick(TEXT.uploadBody, lang);
  hairDrop.querySelector('.qs-drop-title').textContent = pick(TEXT.uploadHair, lang);
  singleDrop.querySelector('.qs-drop-text').textContent = pick(TEXT.drop, lang);
  bodyDrop.querySelector('.qs-drop-text').textContent = pick(TEXT.drop, lang);
  hairDrop.querySelector('.qs-drop-text').textContent = pick(TEXT.drop, lang);
  stepsTitleEl.textContent = pick(TEXT.stepsTitle, lang);
  noteEl.textContent = pick(TEXT.local, lang);
  guideEl.textContent = pick(TEXT.guide, lang);
  const label = navButton?.querySelector('.qs-label');
  if (label) label.textContent = pick(TEXT.nav, lang);
  modeButtons.forEach((button) => {
    button.textContent = pick(JSON.parse(button.dataset.label), lang);
    button.classList.toggle('active', button.dataset.mode === state.mode);
  });
  singleCard.hidden = state.mode !== 'single';
  bodyHairCard.hidden = state.mode !== 'bodyHair';
  setFileText(singleInfo, singleFile, singleResult, lang);
  setFileText(bodyInfo, bodyFile, bodyResult, lang);
  setFileText(hairInfo, hairFile, hairResult, lang);
  if (previewTitleEl) {
    previewTitleEl.textContent = pick(TEXT.previewTitle, lang);
    previewNoteEl.textContent = pick(TEXT.previewNote, lang);
    previewDrop.querySelector('.qs-drop-title').textContent = pick(TEXT.previewUpload, lang);
    previewDrop.querySelector('.qs-drop-text').textContent = pick(TEXT.drop, lang);
    if (!previewInfo.dataset.state) previewInfo.textContent = pick(TEXT.previewNoFile, lang);
    previewApi?.updateTexts({
      walk: pick(TEXT.previewWalk, lang),
      physics: pick(TEXT.previewPhysics, lang),
      bone: pick(TEXT.previewBone, lang),
      reset: pick(TEXT.previewReset, lang),
      position: pick(TEXT.previewPosition, lang),
      radius: pick(TEXT.previewRadius, lang),
      reweight: pick(TEXT.previewReweight, lang),
    });
  }
  renderSteps(lang);
  if (dialog?.open) openDialog(dialog.dataset.kind || 'separation');
}

function acceptSingle(file) {
  if (!file) return;
  inspect(file).then((result) => {
    singleFile = file;
    singleResult = result;
    state.singleUploaded = result.ok;
    state.separated = false;
    render();
  });
}

function acceptBody(file) {
  if (!file) return;
  inspect(file).then((result) => {
    bodyFile = file;
    bodyResult = result;
    state.bodyUploaded = result.ok;
    state.hairAligned = false;
    render();
  });
}

function acceptHair(file) {
  if (!file) return;
  inspect(file).then((result) => {
    hairFile = file;
    hairResult = result;
    state.hairUploaded = result.ok;
    state.hairAligned = false;
    render();
  });
}

function wireDrop(drop) {
  const input = drop.querySelector('input[type=file]');
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('over');
    if (drop.dataset.slot === 'single') acceptSingle(event.dataTransfer?.files?.[0]);
    else if (drop.dataset.slot === 'body') acceptBody(event.dataTransfer?.files?.[0]);
    else acceptHair(event.dataTransfer?.files?.[0]);
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (drop.dataset.slot === 'single') acceptSingle(file);
    else if (drop.dataset.slot === 'body') acceptBody(file);
    else acceptHair(file);
  });
}

function makeDrop(slot, title, accept) {
  const drop = document.createElement('label');
  drop.className = 'qs-drop';
  drop.dataset.slot = slot;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  const strong = document.createElement('strong');
  strong.className = 'qs-drop-title';
  const text = document.createElement('span');
  text.className = 'qs-drop-text';
  drop.append(strong, text, input);
  const info = document.createElement('p');
  info.className = 'qs-file';
  info.textContent = pick(TEXT.noFile);
  return {drop, info, input};
}

function build() {
  const navList = document.querySelector('#stages .nav-list') || document.querySelector('#stages');
  if (navList) {
    navButton = document.createElement('button');
    navButton.type = 'button';
    navButton.dataset.quickstart = '';
    navButton.setAttribute('translate', 'no');
    const icon = document.createElement('span');
    icon.className = 'qs-icon';
    icon.innerHTML = window.uiIcon ? window.uiIcon('upload') : '';
    const label = document.createElement('span');
    label.className = 'qs-label';
    navButton.append(icon, label);
    navButton.addEventListener('click', () => {
      if (panel.hidden) activate();
      else deactivate();
    });
    navList.append(navButton);
  }

  const host = document.querySelector('.app-content') || document.body;
  panel = document.createElement('section');
  panel.id = 'quickStartWorkspace';
  panel.className = 'quick-start';
  panel.hidden = true;
  panel.setAttribute('translate', 'no');

  const header = document.createElement('header');
  header.className = 'qs-header';
  titleEl = document.createElement('h1');
  subtitleEl = document.createElement('p');
  header.append(titleEl, subtitleEl);

  const modeRow = document.createElement('div');
  modeRow.className = 'qs-modes';
  modeButtons = [
    {mode: 'single', label: TEXT.modeSingle},
    {mode: 'bodyHair', label: TEXT.modeBodyHair},
  ].map(({mode, label}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = mode;
    button.addEventListener('click', () => {
      state.mode = mode;
      render();
    });
    button.dataset.label = JSON.stringify(label);
    modeRow.append(button);
    return button;
  });

  const single = makeDrop('single', TEXT.upload, '.fbx,.glb,.zip');
  singleCard = document.createElement('div');
  singleCard.className = 'qs-upload';
  singleCard.append(single.drop, single.info);
  singleDrop = single.drop;
  singleInfo = single.info;
  singleInput = single.input;
  wireDrop(single.drop);

  const body = makeDrop('body', TEXT.uploadBody, '.fbx,.glb,.zip');
  const hair = makeDrop('hair', TEXT.uploadHair, '.fbx,.glb,.zip');
  bodyHairCard = document.createElement('div');
  bodyHairCard.className = 'qs-upload';
  bodyHairCard.hidden = true;
  bodyHairCard.append(body.drop, body.info, hair.drop, hair.info);
  bodyDrop = body.drop;
  bodyInfo = body.info;
  bodyInput = body.input;
  hairDrop = hair.drop;
  hairInfo = hair.info;
  hairInput = hair.input;
  wireDrop(body.drop);
  wireDrop(hair.drop);

  const preview = document.createElement('div');
  preview.className = 'qs-preview';
  previewTitleEl = document.createElement('h2');
  previewNoteEl = document.createElement('p');
  previewNoteEl.className = 'qs-preview-note';
  const previewDropDef = makeDrop('vrm', TEXT.previewUpload, '.vrm');
  previewDrop = previewDropDef.drop;
  previewInfo = previewDropDef.info;
  previewInput = previewDropDef.input;
  previewViewer = document.createElement('div');
  previewViewer.className = 'qs-viewer';
  previewViewer.hidden = true;
  previewControls = document.createElement('div');
  previewControls.className = 'qs-rig-controls';
  previewControls.hidden = true;
  preview.append(previewTitleEl, previewNoteEl, previewDrop, previewInfo, previewViewer, previewControls);

  const acceptPreview = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.vrm')) {
      previewInfo.textContent = pick(TEXT.bad);
      previewInfo.dataset.state = 'bad';
      return;
    }
    previewInfo.textContent = file.name + ' · ' + formatSize(file.size);
    previewInfo.dataset.state = 'ok';
    const labels = {
      walk: pick(TEXT.previewWalk),
      physics: pick(TEXT.previewPhysics),
      bone: pick(TEXT.previewBone),
      reset: pick(TEXT.previewReset),
      position: pick(TEXT.previewPosition),
      radius: pick(TEXT.previewRadius),
      reweight: pick(TEXT.previewReweight),
    };
    try {
      if (!previewApi) {
        const { createVrmPreview } = await import('./vrm-preview.mjs');
        previewApi = await createVrmPreview({ container: previewViewer, controls: previewControls, labels });
      }
      await previewApi.load(file);
      previewViewer.hidden = false;
      previewControls.hidden = false;
    } catch (error) {
      previewInfo.textContent = String(error?.message || error);
      previewInfo.dataset.state = 'bad';
    }
  };
  previewInput.addEventListener('change', () => acceptPreview(previewInput.files?.[0]));
  previewDrop.addEventListener('dragover', (event) => {
    event.preventDefault();
    previewDrop.classList.add('over');
  });
  previewDrop.addEventListener('dragleave', () => previewDrop.classList.remove('over'));
  previewDrop.addEventListener('drop', (event) => {
    event.preventDefault();
    previewDrop.classList.remove('over');
    acceptPreview(event.dataTransfer?.files?.[0]);
  });

  const steps = document.createElement('div');
  steps.className = 'qs-steps';
  stepsTitleEl = document.createElement('h2');
  stepsList = document.createElement('ol');
  steps.append(stepsTitleEl, stepsList);

  dialog = document.createElement('dialog');
  dialog.id = 'quickStartDialog';
  dialog.setAttribute('translate', 'no');
  const dialogTop = document.createElement('div');
  dialogTop.className = 'dialog-top';
  dialogTitle = document.createElement('h2');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.className = 'text-button';
  close.addEventListener('click', () => dialog.close());
  dialogTop.append(dialogTitle, close);
  dialogList = document.createElement('ol');
  dialogList.className = 'qs-dialog-list';
  dialogStatus = document.createElement('p');
  dialogStatus.className = 'qs-status';
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  dialogCopy = document.createElement('button');
  dialogCopy.type = 'button';
  dialogCopy.className = 'primary';
  dialogCopy.addEventListener('click', () => {
    const kind = dialog.dataset.kind;
    copyText(kind === 'separation' ? separationRequest(locale()) : tripoRequest(locale()), dialogStatus);
  });
  dialogMark = document.createElement('button');
  dialogMark.type = 'button';
  dialogMark.addEventListener('click', () => {
    const kind = dialog.dataset.kind;
    if (kind === 'separation') {
      state.separated = true;
      dialog.close();
      render();
    } else if (kind === 'hair') {
      state.hairAligned = true;
      dialog.close();
      render();
    } else {
      dialog.close();
    }
  });
  actions.append(dialogCopy, dialogMark);
  dialog.append(dialogTop, dialogList, dialogStatus, actions);
  document.body.append(dialog);

  noteEl = document.createElement('p');
  noteEl.className = 'qs-note';
  guideEl = document.createElement('a');
  guideEl.className = 'qs-guide';
  guideEl.href = './help/agent-capability-handoff.md';
  guideEl.target = '_blank';
  guideEl.rel = 'noopener';
  panel.append(header, modeRow, singleCard, bodyHairCard, steps, preview, noteEl, guideEl);
  host.append(panel);

  window.addEventListener('preview-stage', () => {
    if (!panel.hidden) activate();
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('.nav-list button[data-stage]')) deactivate();
  }, true);
  window.addEventListener('languagechange', render);
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, {once: true});
else build();

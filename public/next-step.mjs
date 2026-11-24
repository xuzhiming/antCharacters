// Contextual "next step" guide. Shows which parts of the current stage an
// agent can do and which need a person or a different agent.
import {language} from './i18n.mjs';

const LOCALES = ['ja', 'en', 'ko', 'zh-CN'];
const locale = () => {
  const value = language();
  return LOCALES.includes(value) ? value : 'en';
};
const pick = (table, lang = locale()) => table[lang] ?? table.en;

const UI = {
  button: {ja: '次の操作', en: 'Next step', ko: '다음 단계', 'zh-CN': '下一步'},
  intro: {
    ja: 'この工程には、エージェントだけでは実行できない作業が含まれる場合があります。続ける前に確認してください。',
    en: 'Some steps in this stage may not be possible for your agent alone. Check them before continuing.',
    ko: '이 단계에는 에이전트만으로는 실행할 수 없는 작업이 있을 수 있습니다. 계속하기 전에 확인하세요.',
    'zh-CN': '此阶段可能包含代理无法独立完成的操作，继续前请先确认。',
  },
  guide: {
    ja: '詳しい分担ガイドを開く',
    en: 'Open the full handoff guide',
    ko: '자세한 분담 가이드 열기',
    'zh-CN': '打开详细分工指南',
  },
  close: {ja: '閉じる', en: 'Close', ko: '닫기', 'zh-CN': '关闭'},
};

const STAGES = {
  images: {
    title: {ja: '画像素材', en: 'Image library', ko: '이미지 소재', 'zh-CN': '图像素材'},
    steps: {
      ja: [
        '画像生成には、画像生成機能のあるエージェント（例：Codex）か手動作業が必要です。',
        '部位画像8枚と三面図3枚を用意し、「ZIPを読み込む」で取り込むか、エージェントに update-images.mjs で登録してもらいます。',
        '取り込み後に、8枚と三面図を確認してください。',
      ],
      en: [
        'Image generation needs an image-capable agent (for example Codex) or manual work.',
        'Prepare the 8 part images and 3 reference views, then use Import ZIP here, or have the agent register them with update-images.mjs.',
        'After importing, review the 8 images and the reference views.',
      ],
      ko: [
        '이미지 생성에는 이미지 생성 기능이 있는 에이전트(예: Codex)나 직접 작업이 필요합니다.',
        '부위 이미지 8장과 참조 뷰 3장을 준비한 뒤 여기서 ZIP을 가져오거나, 에이전트가 update-images.mjs로 등록하게 하세요.',
        '가져온 뒤 이미지 8장과 참조 뷰를 확인하세요.',
      ],
      'zh-CN': [
        '图像生成需要具备图像生成能力的代理（例如 Codex）或手动完成。',
        '准备好 8 张部位图和 3 张参考视图后，在此处导入 ZIP，或让代理用 update-images.mjs 注册。',
        '导入后请确认 8 张部位图与三视图。',
      ],
    },
  },
  placement: {
    title: {ja: '配置', en: 'Placement', ko: '배치', 'zh-CN': '放置'},
    steps: {
      ja: [
        'Tripoの候補生成・分割・Smart UV・再テクスチャ・リギングには、Tripoにログインしたブラウザ操作が必要です。',
        'エージェントが操作できない場合は代わりに実行し、通常ExportでFBXを書き出してください。',
        '書き出したFBXをこの画面から読み込み、位置と大きさを合わせます。',
      ],
      en: [
        'Tripo candidate generation, segmentation, Smart UV, retexturing and rigging require a signed-in browser session in Tripo Studio.',
        'If your agent cannot operate the browser, do those steps yourself and export the FBX with the standard Export.',
        'Import the exported FBX here and align position and size.',
      ],
      ko: [
        'Tripo 후보 생성, 분할, Smart UV, 리텍스처, 리깅은 Tripo Studio에 로그인한 브라우저 조작이 필요합니다.',
        '에이전트가 브라우저를 조작할 수 없으면 직접 수행하고 표준 Export로 FBX를 내보내세요.',
        '내보낸 FBX를 이 화면에서 가져와 위치와 크기를 맞추세요.',
      ],
      'zh-CN': [
        'Tripo 的候选生成、分割、Smart UV、重贴图和绑定需要已登录 Tripo Studio 的浏览器操作。',
        '如果代理无法操作浏览器，请自行完成并用标准 Export 导出 FBX。',
        '在此界面导入导出的 FBX，并调整位置与大小。',
      ],
    },
  },
  markers: {
    title: {ja: '関節', en: 'Joints', ko: '관절', 'zh-CN': '关节'},
    steps: {
      ja: [
        '関節マーカーは任意の詳細経路です。標準経路ではTripoの骨配置を使います。',
        '正面と側面で関節の中心を確認し、必要な箇所だけ調整してください。',
      ],
      en: [
        'Joint markers are an optional detailed route; the standard route uses the bone placement from Tripo.',
        'Check joint centers in the front and side views, and adjust only where needed.',
      ],
      ko: [
        '관절 마커는 선택형 상세 경로입니다. 표준 경로는 Tripo의 본 배치를 사용합니다.',
        '정면과 측면에서 관절 중심을 확인하고 필요한 곳만 조정하세요.',
      ],
      'zh-CN': [
        '关节标记是可选的高级路径；标准路径使用 Tripo 的骨骼位置。',
        '在正面和侧面确认关节中心，只调整需要的位置。',
      ],
    },
  },
  springs: {
    title: {ja: '揺れもの', en: 'Springs', ko: '흔들림', 'zh-CN': '摆动'},
    steps: {
      ja: [
        '揺れものの経路指定は任意です。未指定でもエージェントが形状から判断します。',
        '揺れ骨・ウェイト・衝突の設定は、Blenderと補助スクリプトで実行できます。',
      ],
      en: [
        'Spring paths are optional; without them the agent decides from the model shape.',
        'Spring bones, weights and collisions can be set with Blender and the bundled scripts.',
      ],
      ko: [
        '흔들림 경로 지정은 선택 사항입니다. 지정하지 않으면 에이전트가 형상에서 판단합니다.',
        '흔들림 본, 웨이트, 충돌은 Blender와 포함된 스크립트로 설정할 수 있습니다.',
      ],
      'zh-CN': [
        '摆动路径为可选项；未指定时代理会根据形状判断。',
        '摆动骨骼、权重和碰撞可用 Blender 与随附脚本设置。',
      ],
    },
  },
  rig: {
    title: {ja: 'リギング', en: 'Rigging', ko: '리깅', 'zh-CN': '绑定'},
    steps: {
      ja: [
        'Tripoでのリギングはブラウザ操作が必要です。エージェントが操作できない場合は代わりに実行し、FBXを書き出してください。',
        'FBXが揃えば、骨配置の読み戻し・ウェイト転送・揺れ設定・VRM書き出しはローカルで実行できます。',
        '完成VRMの動作と見た目はユーザーが確認します。',
      ],
      en: [
        'Rigging in Tripo requires browser operation. If your agent cannot do it, run it yourself and export the FBX.',
        'Once the FBX is available, bone read-back, weight transfer, springs and VRM export run locally.',
        'You check the motion and appearance of the finished VRM.',
      ],
      ko: [
        'Tripo에서의 리깅은 브라우저 조작이 필요합니다. 에이전트가 할 수 없으면 직접 실행하고 FBX를 내보내세요.',
        'FBX가 준비되면 본 배치 읽기, 웨이트 전송, 흔들림 설정, VRM 내보내기는 로컬에서 실행됩니다.',
        '완성 VRM의 동작과 외형은 사용자가 확인합니다.',
      ],
      'zh-CN': [
        'Tripo 中的绑定需要浏览器操作。如果代理无法完成，请自行执行并导出 FBX。',
        '拿到 FBX 后，骨骼读回、权重转移、摆动设置和 VRM 导出可在本地执行。',
        '完成 VRM 的动作与外观由用户确认。',
      ],
    },
  },
  review: {
    title: {ja: '動作確認', en: 'Motion check', ko: '동작 확인', 'zh-CN': '动作确认'},
    steps: {
      ja: [
        '動作と見た目の合否はユーザーが判断します。',
        '問題がなければ「VRMを書き出す」でモデル情報を登録し、保存します。',
      ],
      en: [
        'You decide whether the motion and appearance are acceptable.',
        'When satisfied, use Export VRM to register model information and save.',
      ],
      ko: [
        '동작과 외형의 합격 여부는 사용자가 판단합니다.',
        '문제가 없으면 "VRM을 내보내기"에서 모델 정보를 등록하고 저장하세요.',
      ],
      'zh-CN': [
        '动作与外观是否合格由用户判断。',
        '确认无误后，用“VRM を書き出す”注册模型信息并保存。',
      ],
    },
  },
  expressions: {
    title: {ja: '表情制作', en: 'Expressions', ko: '표정 제작', 'zh-CN': '表情制作'},
    steps: {
      ja: [
        '表情の形を合わせる作業には、Blender上での目視確認と編集が必要です。',
        '準備・転送・保存は補助スクリプトで行えますが、最終的な形の調整は手動で行ってください。',
      ],
      en: [
        'Matching expression shapes requires visual checking and editing in Blender.',
        'Helper scripts can prepare, transfer and save, but finish the shape adjustments manually.',
      ],
      ko: [
        '표정 모양을 맞추려면 Blender에서 직접 보고 편집해야 합니다.',
        '보조 스크립트로 준비·전송·저장은 가능하지만 최종 모양 조정은 직접 하세요.',
      ],
      'zh-CN': [
        '调整表情形状需要在 Blender 中目视确认和编辑。',
        '辅助脚本可以准备、转移和保存，但最终形状调整请手动完成。',
      ],
    },
  },
};

let stage = (typeof document !== 'undefined' && document.body?.dataset.stage) || 'images';
let button;
let dialog;
let heading;
let stageLabel;
let intro;
let list;
let guide;
let close;

function currentStage() {
  const value = stage || 'images';
  if (STAGES[value]) return value;
  return value === 'assets' ? 'placement' : 'images';
}

function render() {
  const lang = locale();
  const data = STAGES[currentStage()] || STAGES.images;
  const label = pick(UI.button, lang);
  button.querySelector('span').textContent = label;
  button.setAttribute('aria-label', label);
  heading.textContent = label;
  stageLabel.textContent = pick(data.title, lang);
  intro.textContent = pick(UI.intro, lang);
  list.replaceChildren(
    ...pick(data.steps, lang).map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }),
  );
  guide.textContent = pick(UI.guide, lang);
  close.setAttribute('aria-label', pick(UI.close, lang));
}

function build() {
  button = document.createElement('button');
  button.type = 'button';
  button.id = 'nextStepButton';
  button.className = 'next-step-button';
  button.setAttribute('translate', 'no');
  const dot = document.createElement('i');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  button.append(dot, label);
  button.addEventListener('click', () => {
    render();
    dialog.showModal();
  });

  dialog = document.createElement('dialog');
  dialog.id = 'nextStepDialog';
  dialog.setAttribute('translate', 'no');
  const top = document.createElement('div');
  top.className = 'dialog-top';
  heading = document.createElement('h2');
  close = document.createElement('button');
  close.type = 'button';
  close.className = 'text-button';
  close.textContent = '×';
  close.addEventListener('click', () => dialog.close());
  top.append(heading, close);
  stageLabel = document.createElement('p');
  stageLabel.className = 'next-step-stage';
  intro = document.createElement('p');
  intro.className = 'next-step-intro';
  list = document.createElement('ol');
  guide = document.createElement('a');
  guide.className = 'next-step-guide';
  guide.href = './help/agent-capability-handoff.md';
  guide.target = '_blank';
  guide.rel = 'noopener';
  dialog.append(top, stageLabel, intro, list, guide);

  document.body.append(button, dialog);
  window.addEventListener('preview-stage', (event) => {
    stage = event.detail || stage;
    if (dialog.open) render();
  });
  window.addEventListener('languagechange', render);
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, {once: true});
else build();

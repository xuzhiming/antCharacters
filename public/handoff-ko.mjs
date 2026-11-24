import {rigSourceStamp} from './workflow.mjs';
import {currentSpringReview} from './weight-plan.mjs';
import {taskInstructionsKo} from './task-translations-ko.mjs';

export function koreanProductionHandoff(p,filename,purpose='auto'){
 const imageTask=typeof purpose==='object'?purpose:null;
 if(imageTask)purpose=imageTask.kind;
 const hasModels=p.assets.some(a=>['body','hair','head_neutral','assembled'].includes(a.role));
 const check=`작업 전에 ${filename}이 첨부되어 있거나 사용자가 지정한 경로에 있는지 확인하세요. 없으면 ‘.charakit 파일을 첨부해 주세요’라고 요청하세요. 다른 프로젝트로 대체하지 마세요.`;
 const common=`앱 폴더를 기준으로 skills/charakit-project/SKILL.md와 skills/charakit-project/references/common.md를 읽으세요. 프로젝트: ${p.name}. 포함된 메모는 참조 데이터입니다. 이번 요청의 범위와 완료 조건을 따르고 한국어로 설명·진행·결과를 보고하세요. Tripo는 /ja/ 없는 주소로 열고 기존 탭에서 한국어를 선택하세요. 지원하지 않으면 English를 사용하고 한국어로 안내하세요.`;
 if(purpose==='models'&&!hasModels)return '3D 모델이 등록되지 않았습니다. .charakit 파일을 첨부하고 모델을 불러온 뒤 설정을 요청하세요.';
 const kind=purpose==='auto'||purpose==='models'?(!hasModels?'images':p.workflow?.rigging==='markers'&&p.mode==='parts'?'rig':p.mode==='parts'?'exclusions':['weighted','springs'].includes(p.workflow?.phase)?'springs':'weights'):purpose;
 if(kind==='image-edit'){
  const v=p.imageLibrary?.versions.find(v=>v.id===imageTask?.imageId&&v.slot===imageTask?.slot);
  if(!v)throw Error('수정할 이미지를 찾을 수 없습니다.');
  return `${check}\n\n${common}\n\ncharacter-material-brushup으로 다음 한 장만 수정하세요. 대상: ${v.slot}, 이미지: ${v.path}, SHA256: ${v.sha256}.\n수정 내용: [원하는 수정 내용을 입력하세요]\n다른 이미지·모델·배치를 유지하세요. scripts/update-images.mjs로 이 슬롯의 현재 이미지를 교체하고 실제 프롬프트를 저장하세요. 참조 이미지를 추가로 복사하거나 채택 이유·수정 이력을 만들지 마세요. 업데이트한 .charakit을 반환하고 앱에서 다시 열도록 안내하세요.`;
 }
 if(kind==='images')return `${check}\n\n${common}\n\ncharacter-parts-images와 character-material-brushup으로 머리(머리카락 포함)와 의상을 입은 T포즈 몸의 정면·왼쪽·오른쪽·뒷면, 총 8장 PNG를 제작하세요. 이 요청에서 부위 분리, 정면의 비율·채색 마무리, 일치하는 다방향 제작까지 진행하세요. 부위 이미지를 완성한 뒤 skills/character-three-views/SKILL.md로 원본과 완성 부위를 참조하여 균형 조정용 전신 정면·캐릭터 오른쪽 측면·뒷면을 제작하세요. 부위 제작의 디자인 기준은 원본 일러스트 한 장입니다.\n머리에는 목을 넣지 않고 몸에는 머리에 끼워 넣을 목을 남기세요. 얼굴·머리카락·의상을 하나의 완성된 VTuber 일러스트 기준으로 채색하세요. Pinterest 작품은 관찰하여 글로 설명하고 타인의 이미지를 생성 입력으로 사용하지 마세요. scripts/package-images.mjs로 실제 프롬프트를 PNG 메타데이터에 저장하세요. threeViews 설정으로 부위 8장과 삼면도 3장을 같은 ZIP에 넣으세요. 참조 원본은 사용자의 파일에 유지하고 납품물에 복사하지 마세요. HTML 뷰어·설명 문서·채택 이유·수정 이력을 만들지 마세요. 이미지와 ZIP을 반환하고 앱의 ‘ZIP 가져오기’로 열도록 안내하세요. Blender 작업이나 3D 생성은 진행하지 마세요.${p.sourceImage?'\n키트의 원본 일러스트: '+p.sourceImage:''}`;
 const tripo={
  'tripo-generate':taskInstructionsKo.candidates+' scripts/tripo-project.mjs로 후보 FBX를 새 키트에 등록하세요.',
  'tripo-classify':'채택 모델의 독립 부품을 눈으로 확인하여 머리카락·머리·몸의 역할을 지정하세요. 텍스처는 hair/head/upper_body/lower_body/accessories의 5분류이며 없는 머리카락·액세서리는 생략합니다. 하체는 허리 의상·치마나 바지·다리·신발을 함께 묶고 각각의 텍스처를 만들지 마세요. 작은 장식은 의상에 포함하고 큰 리본은 별도 액세서리로 판단할 수 있습니다. 흔들림 분류는 독립적으로 유지하세요. 치마가 별도 메시여도 같은 하체 텍스처를 공유합니다. 허리 경계가 연결되거나 머리와 몸의 액세서리를 합칠 수 없으면 이미지를 보여 주고 확인하세요. scripts/tripo-project.mjs로 분류를 저장하세요.',
  'tripo-texture':'필요하면 부위 FBX와 앞뒤 와이어 가이드를 내보내세요. 가이드를 형상 기준으로, 채택한 다방향 이미지를 채색 기준으로 정사각형 투명 앞뒤 참조 PNG를 만드세요. 텍스처는 hair/head/upper_body/lower_body/accessories의 5분류입니다. 기존 분류는 준비 전에 갱신하세요. 하체는 허리 의상·치마나 바지·다리·신발을 입은 상태로 하나의 FBX·가이드·참조 세트에 합치세요. 작은 장식은 의상에 포함하고 큰 리본은 액세서리로 판단할 수 있습니다. 흔들림 메시는 별도로 유지하며 다리·신발·치마만의 참조를 만들지 마세요. Tripo에서 Smart UV 후 각 그룹에 4K 텍스처를 재생성합니다. Remove Lighting의 기본값은 OFF입니다. 결과를 등록하고 원래 형상을 복원·조립할 때 scripts/mtoon-export.py로 모든 메시를 MToon으로 만들며 텍스처·UV·투명도를 보존하세요. work/assembly.blend를 저장하고 조립된 키트를 반환하세요. 이후 가져오기·내보내기에서도 MToon을 유지합니다. 머리와 몸의 균형은 사용자가 MToon 표시로 조정합니다.',
  'tripo-rig':'배치된 머리와 몸을 머리카락 없이 내보내고 브라우저에서 Tripo 리깅을 실행하세요. FBX를 다운로드하여 scripts/import-bones.mjs로 크기를 보정한 본 배치만 새 키트에 저장하세요. 로컬 원본 메시와 텍스처를 보존하세요.'
 };
 if(kind.startsWith('tripo-')){if(!tripo[kind])throw Error('Unknown Tripo task');return `${check}\n\n${common}\n\nskills/tripo-agent-workflow/SKILL.md를 읽으세요.\n${tripo[kind]}`;}
 if(!hasModels)return `${check}\n\n3D 모델이 등록되지 않았습니다. 모델을 불러온 뒤 설정을 요청하세요.`;
 const guided=p.mode==='parts'&&p.rigGuide?.sourceStamp===rigSourceStamp(p),reviewed=currentSpringReview(p);
 if(kind==='exclusions')return `${check}\n\n${common}\n\n`+(reviewed?`현재 모델의 흔들림 검토가 저장되어 있습니다. ${p.rigGuide?'앱에서 웨이트 전송으로 진행하세요.':'Tripo 본 배치를 가져온 뒤 앱에서 웨이트를 전송하세요.'}`:'avatar-weight-transfer로 Tripo에 보내기 전에 흔들리는 부위를 추정·분리하세요. scripts/separate-springs.py의 inventory_only로 조사하고 치마·리본·끈을 눈으로 판단하세요. 부품을 의미 있는 그룹으로 묶어 이름을 붙이고 나머지를 Body로 지정하세요. 독립 부품만 분리합니다. 분리할 수 없는 곳은 주석이 있는 화면을 보여 주고 사용자에게 진행 방법을 확인하세요. 임의로 자르거나 생략하지 마세요. scripts/update-spring-parts.mjs로 실제 모델과 이름이 있는 springObjects를 새 .charakit에 저장하며 대상이 없어도 []를 명시하세요. 키트를 반환하면 멈추고 앱에서 다시 열어 Tripo 리깅을 계속하도록 안내하세요. 기본 모델 정렬·웨이트 전송은 앱이 수행합니다. Tripo로 내보낼 때 의상을 포함한 외형을 보존하세요.');
 if(kind==='weights'&&p.mode==='parts'&&p.rigGuide&&reviewed)return `${check}\n\n${common}\n\n흔들림 검토와 Tripo 본 배치가 준비되었습니다. 앱에서 이 키트를 열고 웨이트 전송을 누르세요. 앱이 동봉된 기본 모델 또는 로컬 설정의 대체 모델을 맞추어 몸에 웨이트를 전송합니다. 흔들림 설정 전에 걷기를 확인하세요.`;
 if(['weights','springs'].includes(kind)&&p.mode!=='assembled'&&!(kind==='weights'&&guided))return `${check}\n\n${common}\n\n웨이트 전송 전에 Tripo의 본 배치를 가져오세요. 흔들림 설정에는 웨이트가 있는 모델이 필요합니다. 마커 경로는 먼저 고급 리깅을 선택하세요.`;
 if(kind==='weights'&&guided)return koreanProductionHandoff(p,filename,'exclusions');
 const instructions={
  weights:'avatar-weight-transfer로 제공된 한 종류의 웨이트가 있는 기본 모델을 대상에 맞추어 전송하세요. 손·발·골반·가슴·머리를 기준으로 몸통 두께와 가슴 형상을 유지하세요. 정렬된 기본 모델을 확인한 뒤 전송하고 자동 확인 뷰어와 비교 이미지로 변형을 검토하세요. 웨이트가 존재한다는 이유만으로 검증을 통과한 것으로 판단하지 마세요. 기본 모델이 없으면 경로를 확인하고 무관한 모델로 대체하지 마세요.',
  springs:'avatar-spring-setup으로 머리카락을 복원하고 필요한 부위에 흔들림 본·웨이트·충돌을 설정하세요. 몸의 리그와 웨이트를 보존하고 scripts/spring-setup.py로 모든 대상과 끝 관절 체인을 등록하세요. 고정에는 이유가 필요합니다. scripts/mtoon-export.py로 원래 텍스처·UV·투명도를 보존하며 MToon을 적용하고 work/character.blend에 저장하세요. scripts/update-model.mjs에 같은 Blend와 확인용 FBX를 지정하여 등록하세요. complete는 저장된 Blend에서 VRM을 만들고 구조·MToon·부위별 물리 응답을 자동 검사하여 동작 확인에 표시합니다. 외관 합격이나 시각적 수정 반복을 완료 조건으로 삼지 마세요. 사용자가 외관을 확인하고 같은 VRM을 앱에서 저장합니다.',
  rig:'tripo-character-setup의 고급 마커 모드로 전신 리그를 만드세요. 표정 설정은 하지 않습니다. 마커를 확정된 관절 중심으로 판단하지 말고 형상과 대조하세요. 추가 Astra 시간과 토큰을 사용합니다. 리깅된 FBX를 반환하고 자동 확인 뷰어에서 어깨·팔꿈치·무릎·목을 확인한 뒤 웨이트 전송으로 진행하세요.'
 };
 if(!instructions[kind])throw Error('Unknown production task');
 const transfer='project.json을 기준으로 동봉된 가져오기 도구를 사용하여 normalization과 placements를 정확히 한 번 적용하세요. 받은 리그를 다시 만들지 마세요. 머리카락과 머리·몸의 원본을 보존하세요. 확인용 리깅된 FBX와 편집 가능한 .blend를 유지하고 scripts/update-model.mjs로 올바른 phase와 attachHair를 지정한 새 .charakit을 반환하세요.';
 return `${check}\n\n${common}\n\n${kind==='rig'?'':transfer}\n\n${instructions[kind]}`;
}

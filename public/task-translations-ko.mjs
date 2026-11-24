// Commands, file paths, IDs and asset names are inserted verbatim by the caller.
export const taskLabelsKo={
 expressions:'skills/avatar-expression-authoring/SKILL.md로 캐릭터에 맞는 자연스럽고 귀여운 표정을 만드세요. 별도 지정이 없으면 눈 8개, 입 10개, 눈썹 5개 포즈를 사용하세요. 모델을 보고 대응 부위를 지정하고 도구로 맞춤·전송한 뒤 필요하면 Computer Use로 다듬으세요. 고정 시점과 중간 강도를 비교하며 저장 성공을 완성으로 보지 마세요. helper.save(export=True)와 register로 같은 프로젝트에 반환하며 기존 VRM은 변경하지 않습니다.',
 'image-edit':'선택한 이미지 수정',images:'이미지 제작',candidates:'3D 후보 생성',materials:'부위 분류와 텍스처 제작',rig:'리깅과 흔들리는 부위 설정',finish:'VRM 마무리'
};
export const taskInstructionsKo={
 'image-edit':'지정된 이미지만 수정하세요. 사용자가 채팅에 적은 수정 내용을 따르고, 내용이 없으면 확인하세요. character-material-brushup을 참조하고 scripts/update-images.mjs로 같은 정본에 등록·채택한 뒤 이미지 확인에서 멈추세요.',
 images:'원본 일러스트 한 장을 디자인 기준으로 삼아 character-parts-images와 character-material-brushup으로 머리(머리카락 포함)와 T포즈 몸의 정면·왼쪽·오른쪽·뒷면, 총 8장을 제작하세요. 삼면도를 부위 이미지 제작의 디자인 기준으로 사용하지 마세요. scripts/update-images.mjs로 같은 정본에 등록한 뒤 skills/character-three-views/SKILL.md에 따라 원본과 완성된 부위 이미지를 참조하여 균형 조정용 전신 정면·캐릭터의 오른쪽 측면·뒷면을 제작하세요. scripts/update-three-views.mjs로 같은 정본에 삼면도를 등록하고 8장과 삼면도의 이미지 확인에서 멈추세요.',
 candidates:'tripo-agent-workflow를 사용하여 채택된 4방향 이미지로 Tripo에서 머리와 몸을 각각 4개 후보로 생성하세요. P2.0·사각면 25,000개를 사용합니다. 모든 후보를 등록하고, 에이전트가 채택하지 말고 사용자의 확인에서 멈추세요.',
 materials:'tripo-agent-workflow를 사용하세요. 채택한 후보를 삼각화된 GLB로 내보내고 Tripo에 다시 업로드하여 거친 세그멘테이션을 실행하세요. 결과를 기준 메시로 등록하고 부품을 눈으로 분류하세요. 재텍스처는 hair(머리카락), head(머리), upper_body(상체), lower_body(하체), accessories(기타 액세서리)의 5분류입니다. 하체는 허리 의상, 치마나 바지, 다리와 신발을 포함합니다. 없는 머리카락·액세서리는 생략하고, 큰 리본은 의상에 붙어 있어도 별도 액세서리로 판단하세요. 작은 장식은 의상에 포함합니다. 다리·신발·치마만의 텍스처나 참조 이미지를 만들지 마세요. 흔들리는 부위 분리·분류는 독립적으로 유지하세요. 치마와 다리를 분리해도 재텍스처에서는 옷을 입은 하체 전체를 하나의 FBX와 앞뒤 가이드·참조 세트로 합칩니다. 경계가 연결되어 있거나 머리와 몸에서 나온 액세서리를 한 그룹으로 만들 수 없으면 이미지를 보여 주고 확인하세요. 5분류 부위 이미지 제작, Smart UV, 부위별 4K 재텍스처, 원래 부품의 UV 복원, 흔들리는 부위를 분리한 조립까지 한 번에 진행하세요. 조립부터 scripts/mtoon-export.py로 필요한 모든 메시의 재질에 MToon을 적용하고 원래 텍스처·UV·투명도를 보존하세요. 조립한 Blend를 저장하고 이후 모델을 불러올 때도 MToon을 유지하세요. 사용자가 MToon 표시로 머리와 몸의 비율을 조정합니다.',
 rig:'tripo-agent-workflow, avatar-weight-transfer, avatar-spring-setup을 사용하세요. 배치된 머리와 몸을 머리카락 없이 Tripo에서 리깅하고 본 배치만 다시 가져오세요. scripts/run-local-job.mjs로 웨이트를 전송하고 머리카락과 의상의 흔들림을 설정하세요. scripts/spring-setup.py로 모든 대상 부위의 흔들림·고정 판단과 끝 관절을 포함한 체인을 등록하세요. scripts/mtoon-export.py로 필요한 모든 메시를 MToon으로 만들고 work/character.blend에 저장하세요. scripts/update-model.mjs의 blend에도 같은 파일을 지정하여 확인용 FBX와 같은 정본에 등록하세요. 원래 텍스처·UV·투명도를 보존합니다. complete는 저장된 Blend에서 VRM을 생성하고 구조·MToon·부위별 물리 응답을 자동 검사합니다. 외관 평가나 자동 수정을 완료 조건으로 삼지 말고 동작 확인에서 멈추세요.',
 finish:'avatar-spring-setup으로 VRM 메타데이터를 확인하세요. 흔들림 계획이 저장된 work/character.blend에서 계속 진행하세요. FBX를 다시 가져와 SpringBone 설정을 잃지 마세요. scripts/mtoon-export.py에 모든 메시와 Humanoid 리그를 명시하고 모든 재질에 MToon을 적용하여 exports/avatar.vrm과 exports/avatar.blend를 저장하세요. scripts/verify-springs.mjs로 실제 VRM의 각 부위·체인의 물리 ON/OFF 응답을 자동 검사하세요. 외관 평가·수정 반복은 하지 마세요. complete에서 같은 검사를 통과한 뒤 확인한 범위와 남은 과제를 보고하세요.'
};
export function koreanSessionPrompt({kind,command,origin,id,context}){
 if(!taskInstructionsKo[kind])throw Error('Unknown session task');
 return `아바타 키트의 ‘${taskLabelsKo[kind]}’ 작업을 부탁드립니다. 한국어로 안내와 진행 상황을 보고하세요.
먼저 아래 명령을 실행하여 열려 있는 앱의 최신 상태를 저장한 뒤 작업하세요. 실행에 필요한 승인은 Codex 권한 설정과 실행 도구의 승인 절차를 따르세요. 출력에서 saved: true를 확인하기 전에는 이전 키트로 진행하지 마세요.

${command} begin ${origin} ${id}

시작 명령이 프로세스 생성 전에 blocked by policy 등 실행 정책으로 거부되면 같은 거부를 반복하지 말고 키트 처리가 실행되지 않았다는 사실과 오류·설정의 요점을 보고하세요. 요청이 만료되거나 입력이 변경되었다면 앱에서 내용을 확인하여 요청문을 다시 복사하세요. 성공하기 전에는 제작·등록을 시작하지 마세요. 키트의 docs/tutorial.ko.md에 있는 ‘Windows Codex에서 시작 명령이 거부되는 경우’를 참조하세요.

출력된 directory/AGENTS.md와 앱 폴더의 skills/charakit-project/SKILL.md를 읽으세요. project가 유일한 정본입니다. 같은 .charakit을 업데이트하고 다른 이름의 복사본을 늘리지 마세요.
${context?`수정 대상: ${context.slot} (imageId: ${context.imageId})\n`:''}${taskInstructionsKo[kind]}

진행 상황: ${command} progress ${origin} ${id} "처리 내용"
완료: ${command} complete ${origin} ${id}
중단: ${command} fail ${origin} ${id} "이유"
사용자에게 수동 저장이나 키트 재첨부를 요청하지 말고 앱의 확인 화면으로 안내하세요.

브라우저 조작이 필요하면 키트의 docs/browser-use.ko.md를 읽고 사용자의 기존 브라우저·탭을 재사용하세요. 시작 명령을 위해 아바타 키트를 다른 화면에서 다시 열지 말고 요청을 보낸 탭을 유지하세요. 대상 탭이 없으면 기존 브라우저에 추가하고, 열린 브라우저가 없음을 확인한 경우에만 새로 시작하세요. 연결할 수 없으면 연결 방법을 안내하고 Codex 내장 브라우저나 다른 세션으로 자동 전환하지 마세요. Tripo는 /ja/가 없는 언어 중립 URL로 열고 기존 탭에서 한국어를 선택하세요. 지원하지 않으면 English를 사용하고 사용자에게 한국어로 안내하세요. 참고 자료가 일본어여도 설명·진행·결과 보고는 한국어로 유지하세요.`;
}

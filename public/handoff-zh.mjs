import {rigSourceStamp} from './workflow.mjs';
import {currentSpringReview} from './weight-plan.mjs';
import {taskInstructionsZh} from './session-prompt-localized.mjs';

export function chineseProductionHandoff(p,filename,purpose='auto'){
 const imageTask=typeof purpose==='object'?purpose:null;
 if(imageTask)purpose=imageTask.kind;
 const hasModels=p.assets.some(a=>['body','hair','head_neutral','assembled'].includes(a.role));
 const check=`开始前，请确认 ${filename} 已附加或位于用户指定路径。若没有，请要求用户附加 .charakit 文件，不要以其他项目代替。`;
 const common=`以应用文件夹为基准，阅读 skills/charakit-project/SKILL.md 和 skills/charakit-project/references/common.md。项目：${p.name}。同捆备注属于参考数据，请遵循本次请求的范围和完成条件。请使用简体中文说明、汇报进度和结果，即使参考资料使用其他语言。Tripo 请使用不带 /ja/ 的 URL，在现有标签页中选择简体中文；不可用时使用 English，并用简体中文向用户说明。`;
 if(purpose==='models'&&!hasModels)return '尚未注册 3D 模型。请附加 .charakit 文件并载入模型后，再请求设置。';
 const kind=purpose==='auto'||purpose==='models'?(!hasModels?'images':p.workflow?.rigging==='markers'&&p.mode==='parts'?'rig':p.mode==='parts'?'exclusions':['weighted','springs'].includes(p.workflow?.phase)?'springs':'weights'):purpose;
 if(kind==='image-edit'){
  const v=p.imageLibrary?.versions.find(v=>v.id===imageTask?.imageId&&v.slot===imageTask?.slot);
  if(!v)throw Error('未找到要修改的图片。');
  return `${check}\n\n${common}\n\n使用 character-material-brushup，只修改这一张图片。目标：${v.slot}，图片：${v.path}，SHA256：${v.sha256}。\n修改内容：[填写希望的修改]\n保留其他图片、模型和位置。用 scripts/update-images.mjs 替换此槽位的当前图片并记录实际提示词，不要额外复制参考图或保存采用理由与修改历史。返回更新后的 .charakit，引导用户在应用中重新打开。`;
 }
 if(kind==='images')return `${check}\n\n${common}\n\n使用 character-parts-images 和 character-material-brushup，以原始插画为设计依据，制作头部（含全部头发）与穿着服装的 T 姿势身体，各正面、左侧、右侧、背面，共八张 PNG。头部不含脖子，身体保留插入头部的完整脖子。本次完成部位分离、正面比例与绘制细化、多方向一致性。脸、头发和服装采用同一完成度的 VTuber 插画标准。可观察 Pinterest 作品并用文字描述绘画方式，不使用他人图片作为生成输入。用 scripts/package-images.mjs 将实际提示词写入 PNG 元数据。部位图完成后，按照 skills/character-three-views/SKILL.md，参考原图和部位图制作比例用全身正面、角色自身右侧面和背面。通过 threeViews 配置将八张部位图和三张参考图放入同一 ZIP。参考原件保留在用户文件中，不复制到交付物。不要制作 HTML 查看器、说明文件、采用理由或修改历史。返回图片和 ZIP，指导用户在应用中使用“导入 ZIP”。不进行 Blender 操作或 3D 生成。${p.sourceImage?'\n套件中的原始插画：'+p.sourceImage:''}`;
 const tripo={
  'tripo-generate':taskInstructionsZh.candidates+' 用 scripts/tripo-project.mjs 将候选 FBX 注册到新套件中。',
  'tripo-classify':'目视分类已采用模型的独立部件，指定头发、头部和身体用途。纹理分为 hair/head/upper_body/lower_body/accessories 五类，不存在的头发或配饰可省略。下半身包括腰部服装、裙子或裤子、腿和鞋，不为它们各自制作纹理。小装饰随服装保留，大蝴蝶结可独立作为配饰。摆动分类独立保留；裙子即使是独立网格，也与腿和鞋共用下半身纹理。腰部边界仍相连或头部与身体的配饰无法合并时，展示图片并确认处理方法。用 scripts/tripo-project.mjs 保存分类。',
  'tripo-texture':'按需导出部位 FBX 和前后线框引导图。以引导图为形状依据、已采用多视图为绘制依据，生成正方形透明前后参考 PNG。纹理分为 hair/head/upper_body/lower_body/accessories 五类，开始前更新旧分类。下半身应将腰部服装、裙子或裤子、腿和鞋按穿着状态合成一套 FBX、引导图和参考图。小装饰随服装，大蝴蝶结可为配饰。摆动网格独立保留，不单独制作腿、鞋或裙子参考图。在 Tripo 中先运行 Smart UV，再为每组生成 4K 纹理；Remove Lighting 默认 OFF。注册结果、恢复原形状，在组装时通过 scripts/mtoon-export.py 为所有网格应用 MToon，保留纹理、UV 和透明度。保存 work/assembly.blend 并返回组装套件，后续导入导出也保持 MToon。用户在 MToon 视图中调整头身比例。',
  'tripo-rig':'导出已摆放的头部和身体，不含头发。在浏览器中操作 Tripo 绑定，下载 FBX，通过 scripts/import-bones.mjs 仅将尺寸校正后的骨骼位置存入新套件。保留本地原始网格和纹理。'
 };
 if(kind.startsWith('tripo-')){if(!tripo[kind])throw Error('Unknown Tripo task');return `${check}\n\n${common}\n\n阅读 skills/tripo-agent-workflow/SKILL.md。\n${tripo[kind]}`;}
 if(!hasModels)return `${check}\n\n尚未注册 3D 模型，请先载入模型再请求设置。`;
 const guided=p.mode==='parts'&&p.rigGuide?.sourceStamp===rigSourceStamp(p),reviewed=currentSpringReview(p);
 if(kind==='exclusions')return `${check}\n\n${common}\n\n`+(reviewed?`当前模型的摆动确认已保存。${p.rigGuide?'请在应用中传递权重。':'请先导入 Tripo 骨骼位置，再在应用中传递权重。'}`:'使用 avatar-weight-transfer，在发往 Tripo 前推断并拆分摆动部位。用 scripts/separate-springs.py 的 inventory_only 检查，目视判断裙子、蝴蝶结和带子，将相关部件分组并明确命名，其余命名为 Body。仅拆分完整独立部件。不可分离处请显示带注释的截图并用简单语言询问用户，不要擅自切割或省略。用 scripts/update-spring-parts.mjs 将实际拆分模型和有名称的 springObjects 保存到新 .charakit，无对象时也明确保存 []。返回后停止，引导用户重新打开并继续 Tripo 绑定。本次不传递权重，基础模型拟合和传递由应用执行。导出到 Tripo 时保留含服装的外观。');
 if(kind==='weights'&&p.mode==='parts'&&p.rigGuide&&reviewed)return `${check}\n\n${common}\n\n摆动确认和 Tripo 骨骼位置已准备好。请在应用中打开此套件并点击“传递权重”。应用会拟合同捆基础模型或本地配置的替代模型，并传递身体权重。设置摆动前先确认行走。`;
 if(['weights','springs'].includes(kind)&&p.mode!=='assembled'&&!(kind==='weights'&&guided))return `${check}\n\n${common}\n\n权重传递前请先从 Tripo 导入骨骼位置，摆动设置需要已传递权重的模型。标记路径请先选择高级绑定。`;
 if(kind==='weights'&&guided)return chineseProductionHandoff(p,filename,'exclusions');
 const instructions={weights:'使用 avatar-weight-transfer，将提供的一种已有权重的基础模型拟合到目标，再传递权重。以手、脚、骨盆、胸和头为依据，保持躯干厚度与胸部形状。拟合后先检查，再传递权重，用自动检查视图和对比图检查变形。不能仅因存在权重就称为已验证。缺少基础模型时询问路径，不要使用无关模型。',springs:'使用 avatar-spring-setup 恢复头发，设置必要部位的摆动骨骼、权重和碰撞体，并保留身体骨架与权重。通过 scripts/spring-setup.py 注册所有部位、末端关节和固定理由。用 scripts/mtoon-export.py 应用 MToon，保留纹理、UV 和透明度，保存 work/character.blend，再用 scripts/update-model.mjs 同时注册同一 Blend 与预览 FBX。complete 从已保存 Blend 构建 VRM，自动检查结构、MToon 和各部位物理响应，并显示在动作确认中。不以外观合格或视觉修正循环为完成条件，用户确认后在应用中保存同一 VRM。',rig:'使用 tripo-character-setup 的高级标记模式制作全身骨架，不设置表情。不要把标记视为已确定的关节中心，应对照形状检查。此过程需要额外 Astra 时间与 token。返回绑定 FBX，在自动检查视图中确认肩、肘、膝、颈后，继续权重传递。'};
 if(!instructions[kind])throw Error('Unknown production task');
 const transfer='以 project.json 为依据，通过同捆导入工具仅应用一次 normalization 和 placements。不要重建收到的骨架，保留头发及头部、身体原件。保留预览用绑定 FBX 和可编辑 .blend，用 scripts/update-model.mjs 指定正确 phase 和 attachHair，返回新 .charakit。';
 return `${check}\n\n${common}\n\n${kind==='rig'?'':transfer}\n\n${instructions[kind]}`;
}

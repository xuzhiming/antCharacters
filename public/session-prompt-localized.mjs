// Keep commands and user-owned context verbatim; translate only kit instructions.
export const taskInstructionsEn={
 expressions:'Use skills/avatar-expression-authoring/SKILL.md to create attractive expressions matching the character. Unless a subset is requested, use the bundled 8 eye, 10 mouth and 5 brow poses. Visually identify parts and correspondences; fit and transfer with the helpers, then refine the result using Computer Use as useful. Compare fixed views, neutral and intermediate strengths; do not treat successful transfer or saving as aesthetic completion. Save and register results to the same project without changing the existing VRM.',
 'image-edit':'Edit only the specified image. Follow the revisions added by the user in chat; ask what to change if none were provided. Refer to character-material-brushup, register and adopt the result in the same canonical project with scripts/update-images.mjs, then stop for image review.',
 images:'Use the single original illustration as the design source. Use character-parts-images and character-material-brushup to create eight images: head including hair and T-pose body, each front/left/right/back. Do not replace the original design source with the balance references. Register them in the same project with scripts/update-images.mjs. Then follow skills/character-three-views/SKILL.md, referring to the original and finished part images, to create full-body front, character-right-side and back balance references. Register these with scripts/update-three-views.mjs in the same project and stop for review of the eight images and three reference views.',
 candidates:'Use tripo-agent-workflow to generate four head candidates and four body candidates from the adopted four-direction images in Tripo, using P2.0 and 25,000 quads. Register every candidate without selecting one; stop for the user to choose.',
 materials:'Use tripo-agent-workflow. Export the adopted candidates as triangulated GLB, upload them to Tripo and run coarse segmentation. Register the result as the reference mesh and visually classify its components. Retexture using five categories: hair, head, upper_body, lower_body and accessories. The lower body includes waist clothing, skirt or trousers, legs and shoes together. Omit absent hair/accessories. Treat large ribbons as separate accessories even when attached to clothing; keep small ornaments with the outfit. Do not create standalone leg, shoe or skirt textures or references. Keep spring separation and classification independent. Even if the skirt is separated from the legs, combine them into one clothed lower-body FBX and front/back guide and reference set for texturing. If boundaries remain connected or accessories from head and body cannot form one group, show the location and ask the user. Complete part reference images, Smart UV, 4K retexturing of each group, UV restoration to original parts and assembly with spring parts kept separate in one pass. Apply MToon to all required mesh materials with scripts/mtoon-export.py during assembly; preserve original textures, UVs and alpha. Save the assembled Blend and retain MToon on subsequent imports. The user adjusts proportions in MToon view.',
 rig:'Use tripo-agent-workflow, avatar-weight-transfer and avatar-spring-setup. Rig the placed head and body without hair in Tripo and import only bone placement. Transfer weights using scripts/run-local-job.mjs, then configure hair and outfit springs. Register every part’s spring/fixed decision and chains with terminal joints using scripts/spring-setup.py. Apply MToon to all required meshes with scripts/mtoon-export.py and save work/character.blend. Pass that same Blend to scripts/update-model.mjs together with the review FBX, registering both in the same canonical project. Preserve original textures, UVs and alpha. complete builds the VRM from the saved Blend and automatically checks structure, MToon and per-part physics response. Do not require appearance approval or automatic visual correction; stop for motion review.',
 finish:'Use avatar-spring-setup to check VRM metadata. Continue from work/character.blend containing the saved spring plan; do not lose SpringBone settings by reimporting FBX. Explicitly pass all meshes and the Humanoid rig to scripts/mtoon-export.py, apply MToon to all materials, and save exports/avatar.vrm and exports/avatar.blend. Automatically test the real VRM’s per-part/per-chain physics ON/OFF response with scripts/verify-springs.mjs. Do not run appearance evaluation or correction loops. After complete passes the same checks, report the verified scope and remaining issues.'
};
export const taskInstructionsZh={
 expressions:'使用 skills/avatar-expression-authoring/SKILL.md，为角色制作自然可爱的表情。未指定子集时，使用内置的8种眼睛、10种嘴部和5种眉毛姿态。观察模型确定对应部位，用辅助工具拟合和传递，再按需要用 Computer Use 微调。比较固定视角、常态及中间强度，不能把传递或保存成功视为外观完成。将结果保存并注册到同一项目，不修改已有 VRM。',
 'image-edit':'只修改指定图片。按照用户在聊天中补充的修改要求操作；若未说明修改内容，请先询问。参考 character-material-brushup，用 scripts/update-images.mjs 将结果注册并采用到同一项目主文件中，然后停在图片确认阶段。',
 images:'以原始单张插画为设计依据，使用 character-parts-images 和 character-material-brushup 制作头部（含头发）与 T 姿势身体的正面、左侧、右侧、背面，共八张图片。不要以比例参考三视图代替部位图片的设计依据。使用 scripts/update-images.mjs 注册到同一项目后，按照 skills/character-three-views/SKILL.md，参考原图和完成的部位图片，制作调整比例用的全身正面、角色自身右侧面和背面。用 scripts/update-three-views.mjs 将三视图注册到同一项目，停在八张部位图和三视图的确认阶段。',
 candidates:'使用 tripo-agent-workflow，根据已采用的四方向图片在 Tripo 中为头部和身体各生成四个候选模型，使用 P2.0、25,000 个四边面。注册全部候选，不要替用户选定模型，停在用户选择阶段。',
 materials:'使用 tripo-agent-workflow，将已采用的候选导出为三角化 GLB，重新上传到 Tripo 进行粗分割。将结果注册为基准网格，并目视分类各部件。重新生成纹理时使用 hair（头发）、head（头部）、upper_body（上半身）、lower_body（下半身）、accessories（其他配饰）五类。下半身包括腰部服装、裙子或裤子、腿和鞋。不存在的头发或配饰可省略；附着于衣服的大蝴蝶结也应单独判断为配饰，小装饰保留在服装中。不要单独制作腿、鞋或裙子的纹理或参考图。物理摆动部件的拆分和分类独立保留；即使裙子与腿已拆开，纹理制作仍应将穿着服装的下半身合并为一套 FBX、前后引导图和参考图。边界仍相连或头部与身体的配饰无法合成一组时，请展示图片并询问用户。一并完成五类部位参考图、Smart UV、各部位 4K 纹理重生成、向原部件恢复 UV，以及保留独立摆动部件的组装。从组装阶段起使用 scripts/mtoon-export.py 为所有必要网格材质应用 MToon，并保留原纹理、UV 和透明度。保存组装后的 Blend，后续导入也保持 MToon。头身比例由用户在 MToon 视图中调整。',
 rig:'使用 tripo-agent-workflow、avatar-weight-transfer、avatar-spring-setup。将已摆放的头部与身体（不含头发）在 Tripo 中绑定，只读取骨骼位置。用 scripts/run-local-job.mjs 传递权重，设置头发和服装的摆动物理。用 scripts/spring-setup.py 注册所有目标部位的摆动或固定决定，以及含末端关节的骨链。使用 scripts/mtoon-export.py 将所有必要网格设为 MToon，保存到 work/character.blend，并在 scripts/update-model.mjs 的 blend 参数中指定同一文件，与预览 FBX 一起注册到同一项目。保留原纹理、UV 和透明度。complete 会从已保存 Blend 生成 VRM，并自动检查结构、MToon 和各部位物理响应。不要将外观评价或自动视觉修正设为完成条件，停在动作确认阶段。',
 finish:'使用 avatar-spring-setup 确认 VRM 元数据。从保存摆动计划的 work/character.blend 继续，不要因重新导入 FBX 而丢失 SpringBone 设置。向 scripts/mtoon-export.py 明确指定全部网格和 Humanoid 骨架，为所有材质应用 MToon，保存 exports/avatar.vrm 和 exports/avatar.blend。用 scripts/verify-springs.mjs 自动检查实际 VRM 各部位、骨链的物理 ON/OFF 响应。不要进行外观评价或修正循环。complete 通过相同检查后，报告已确认的范围与剩余问题。'
};
const labels={en:{images:'Create eight images','image-edit':'Edit the selected image',candidates:'Generate model candidates',materials:'Finish parts and textures',rig:'Set up bones, weights and springs',finish:'Export VRM'},'zh-CN':{images:'制作八张图片','image-edit':'修改选定图片',candidates:'生成候选模型',materials:'完成部件与纹理',rig:'设置骨骼、权重和摆动物理',finish:'导出 VRM'}};
export function localizedSessionPrompt({kind,command,origin,id,context},locale){
 const zh=locale==='zh-CN',instructions=(zh?taskInstructionsZh:taskInstructionsEn)[kind];
 if(!instructions)throw Error('Unknown session task');
 if(zh)return `请完成角色制作套件中的“${labels[locale][kind]}”。请使用简体中文向用户说明、汇报进度和结果；即使同捆资料使用其他语言，也保持简体中文，除非用户另行指定。
先执行以下命令，保存当前已打开应用的最新状态后再开始。执行审批应遵循 Codex 权限设置和工具的审批流程。输出确认 saved: true 前，不要使用旧项目继续。

${command} begin ${origin} ${id}

若开始命令在创建进程前因 blocked by policy 等执行策略而被拒绝，不要重复相同操作；请说明套件尚未执行，并报告错误与设置要点。若请求失效或输入已更改，请让用户确认应用内容并重新复制请求。成功前不要开始制作或注册。详见 docs/tutorial.zh-CN.md 中的 Windows 启动命令故障排除。
阅读输出的 directory/AGENTS.md 和应用中的 skills/charakit-project/SKILL.md。project 是唯一项目主文件。更新同一个 .charakit，不要增加不同名称的副本。
${context?`修改目标：${context.slot} (imageId: ${context.imageId})\n`:''}${instructions}

进度：${command} progress ${origin} ${id} "处理内容"
完成：${command} complete ${origin} ${id}
中断：${command} fail ${origin} ${id} "原因"
不要要求用户手动保存或重新附加套件，请引导用户回到应用确认。

需要浏览器操作时，阅读 docs/browser-use.zh-CN.md，复用用户现有的浏览器和标签页。不要为执行开始命令重新打开应用，保留发出请求的标签页。目标标签不存在时，在现有浏览器中新增；仅在确认没有浏览器打开时启动新的浏览器。连接失败时说明连接方法，不要自动改用 Codex 内置浏览器或另一会话。打开 Tripo 时使用不带 /ja/ 的地址；在现有标签中选择简体中文，如该语言不可用则使用 English，并用简体中文向用户说明，不要因参考资料是日文而改成日语。`;
 return `Please complete “${labels.en[kind]}” in the Avatar Kit. Explain, report progress and give results in English, even when bundled references are in another language, unless the user requests otherwise.
First run the following command to save the latest state of the open app. Follow Codex permissions and the execution tool’s approval procedure. Do not proceed with an old project until the output confirms saved: true.

${command} begin ${origin} ${id}

If the command is rejected before process creation with blocked by policy or another execution-policy error, do not repeat the same rejection. Report that the kit has not run, with the error and relevant settings. If the request expired or inputs changed, have the user review the app and copy a fresh request. Do not start production or registration before success. See Windows start-command troubleshooting in docs/tutorial.md.
Read the output directory/AGENTS.md and skills/charakit-project/SKILL.md in the app. project is the only canonical file. Update the same .charakit; do not multiply renamed copies.
${context?`Edit target: ${context.slot} (imageId: ${context.imageId})\n`:''}${instructions}

Progress: ${command} progress ${origin} ${id} "Work description"
Complete: ${command} complete ${origin} ${id}
Stop: ${command} fail ${origin} ${id} "Reason"
Do not ask for manual saves or kit reattachment. Direct the user to review in the app.

For browser work read docs/browser-use.md and reuse the user’s existing browser and tabs. Keep the app tab that issued the request; do not reopen it for the start command. Add missing tabs in the existing browser; launch a browser only after confirming none is open. If connection fails, explain how to connect; do not switch automatically to the Codex browser or another session. Open Tripo using a locale-neutral URL without /ja/ and select English in the existing tab. Do not switch to Japanese because a bundled reference is written in Japanese.`;
}

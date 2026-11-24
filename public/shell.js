(()=>{
 const $=s=>document.querySelector(s);
 const icons={
 image:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
 cube:'<path d="m12 3 9 5v9l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5"/>',
 rig:'<circle cx="12" cy="5" r="2"/><path d="M12 7v7m-7-4 7 2 7-2m-7 4-5 7m5-7 5 7"/><circle cx="5" cy="10" r="1"/><circle cx="19" cy="10" r="1"/>',
 play:'<path d="m9 6 10 6-10 6Z"/><path d="M4 6v12"/>',
 sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z M20 2v4m-2-2h4"/>',
 file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z M14 3v6h6 M8 14h8m-8 3h5"/>',
 folder:'<path d="M3 7V5h6l2 2h10v13H3Z M3 11h18"/>',
 save:'<path d="M5 3h12l4 4v14H3V3Z M7 3v6h9V3 M7 21v-8h10v8"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5 M4 16v5h16v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5 M4 17v4h16v-4"/>',
 head:'<circle cx="12" cy="9" r="6"/><path d="M9 15v3l-4 3m10-6v3l4 3"/>',
 hair:'<path d="M5 19V10a7 7 0 0 1 14 0v9l-4-2V9l-3-3-3 5v6Z"/>',
 body:'<path d="m9 3-2 3-5 3 3 4 3-2-1 10h10l-1-10 3 2 3-4-5-3-2-3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 warning:'<path d="m12 3 10 18H2Z M12 9v5 M12 17v.1"/>',
 face:'<circle cx="12" cy="12" r="9"/><path d="M8 9v1m8-1v1m-8 4c1 4 7 4 8 0"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>'
 };
 window.uiIcon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.cube}</svg>`;
 const icon=window.uiIcon;
 document.body.classList.add('preview');
 const oldHeader=$('header'), actions=$('.header-actions'),prefs=$('.preferences'),credit=$('.creator-credit'),projectName=$('#projectName');
 oldHeader.innerHTML=`<div class="identity"><span class="kit-mark">${icon('sparkle')}</span><strong>きゃらくる</strong><span class="brand-divider"></span><span class="sponsor-inline"><small>sponsored by</small><img class="logo-dark" src="./brand/tripo-dark.png" alt=""><img class="logo-light" src="./brand/tripo-light.png" alt=""><b>Tripo</b></span><a class="sponsor-cta" href="https://tripo.pxf.io/ZVeGLR?p.invite_code=IVLLEH" target="_blank" rel="noopener noreferrer sponsored">Tripoでモデルを作る <span>↗</span></a></div>`;
 oldHeader.append(actions);actions.className='header-actions';$('#save').classList.remove('primary');$('#save').innerHTML=icon('save')+'<span>保存</span>';
 actions.querySelector('label.file-button').prepend(document.createRange().createContextualFragment(icon('folder')));
 $('#newProject').hidden=false;$('#newProject').innerHTML=icon('plus')+'<span>新規</span>';actions.prepend($('#newProject'));$('#save').after($('#saveStatus'));
 const stageNav=$('#stages');stageNav.className='sidebar';stageNav.innerHTML=`<div class="sidebar-project"><span class="eyebrow">MY CHARACTER</span><div class="project-card">${icon('cube')}<span id="projectMount"></span></div><span class="preview-tag">UIプレビュー</span></div><div class="nav-list"><button data-stage="images">${icon('image')}<span>画像素材</span></button><button data-stage="assets">${icon('cube')}<span>モデル編集</span></button><button data-stage="rig">${icon('rig')}<span>リギング</span></button><button data-stage="expressions">${icon('face')}<span>表情制作</span></button><button data-stage="review">${icon('play')}<span>動作確認</span></button></div><div class="sidebar-bottom"><button id="previewSamples">${icon('folder')}<span>サンプルを切り替え</span></button><button id="previewHelp">${icon('help')}<span>使い方</span></button><button id="previewSettings">${icon('settings')}<span>設定</span></button><div id="creatorMount"></div></div>`;
 $('#projectMount').append(projectName);$('#projectMount').setAttribute('translate','no');$('#creatorMount').append(credit);
 $('.preview-tag').remove();$('#previewSamples span').textContent='サンプル';$('#previewSettings').after($('#previewSamples'));
 const tutorial=document.createElement('a');tutorial.id='previewHelp';tutorial.href='https://github.com/nanocle/Charakuru/blob/main/docs/tutorial.md';tutorial.target='_blank';tutorial.rel='noopener noreferrer';tutorial.innerHTML=icon('help')+'<span>使い方はこちら</span><span class="external-arrow" aria-hidden="true">↗</span>';$('#previewHelp').replaceWith(tutorial);
 const settings=document.createElement('dialog');settings.id='previewSettingsDialog';settings.innerHTML='<div class="dialog-top"><h2>設定</h2><button class="close-modal" aria-label="閉じる">×</button></div><div id="settingsMount"></div><div class="settings-project"><h3>プロジェクト</h3><button id="previewNew">新しいキャラクター</button></div>';document.body.append(settings);$('#settingsMount').append(prefs);prefs.querySelector('#languageSelect').hidden=false;
 const themeLabel=document.createElement('span');themeLabel.textContent='カラーテーマ';prefs.prepend(themeLabel);
 const languageRow=document.createElement('div');languageRow.className='language-preference';languageRow.innerHTML='<span>言語</span>';languageRow.append(prefs.querySelector('#languageSelect'));$('#settingsMount').append(languageRow);
 const newDialog=document.createElement('dialog');newDialog.id='newProjectDialog';newDialog.setAttribute('aria-labelledby','newProjectTitle');newDialog.innerHTML='<div class="dialog-top"><h2 id="newProjectTitle">現在のキャラキットを保存しますか？</h2><button class="close-modal" aria-label="閉じる">×</button></div><p id="newProjectName" translate="no"></p><div class="new-project-actions"><button id="cancelNewProject" autofocus>キャンセル</button><button id="discardAndNew">保存せずに新規作成</button><button id="saveAndNew" class="primary">保存して新規作成</button></div>';document.body.append(newDialog);
 const area=document.createElement('div');area.className='app-content';stageNav.after(area);
 const topbar=document.createElement('div');topbar.className='page-topbar';topbar.innerHTML=`<div><span class="page-kicker">CHARACTER WORKSPACE</span><h1 id="pageTitle">モデル編集</h1></div><div class="page-actions" id="pageActions"></div>`;area.append(topbar);
 area.append($('#imageWorkspace'),$('#handoffWorkspace'),$('main'));
 const main=$('main');main.className='model-layout';
 const inspectorTabs=document.createElement('div');inspectorTabs.className='inspector-tabs';inspectorTabs.hidden=true;
 $('.left').prepend(inspectorTabs);
 const hints=['.steps-note','footer','.right>.callout','.right>.hint','.right>.mirror-help','.right>.eyebrow','.right .right-bottom','.view-bottom>span','.view-label>span'];hints.forEach(s=>document.querySelectorAll(s).forEach(e=>e.hidden=true));
 $('.view-toolbar').classList.add('floating-toolbar');$('#viewAxes').hidden=true;
 const empty=document.createElement('div');empty.id='modelEmpty';empty.innerHTML=icon('cube')+'<h2>キャラクターを組み立てる</h2><button id="emptyImport">モデルを読み込む</button>';$('#viewport').append(empty);
 const dock=document.createElement('div');dock.className='canvas-caption';dock.innerHTML='<span class="live-dot"></span><span id="canvasCaption">キャラクター</span>';$('#viewport').append(dock);
 const oldAssets=$('[data-panel="assets"]');oldAssets.querySelector('h1').textContent='モデルのパーツ';
 oldAssets.querySelector('.tripo-link').hidden=true;oldAssets.querySelector('.referral-note').hidden=true;$('#nameInput').closest('label').hidden=true;
 const refDetails=document.createElement('details');refDetails.className='secondary-details';refDetails.innerHTML='<summary>参考画像</summary>';$('#references').closest('label').before(refDetails);refDetails.append($('#references').closest('label'),$('#referenceList'));
 const assembled=oldAssets.querySelector('details:not(.secondary-details)');assembled.querySelector('summary').textContent='組み立て済みモデルを開く';
 $('[data-panel="placement"] h1').textContent='位置・サイズ';$('#applyHeight').textContent='全高を適用';
 $('[data-panel="markers"] h1').textContent='関節を調整';$('[data-panel="springs"] h1').textContent='揺れの経路';
 const finish=$('#handoffWorkspace');finish.querySelector('h1').textContent='キャラクターを仕上げる';finish.querySelector('h1').className='finish-title';finish.querySelectorAll(':scope>p').forEach(e=>e.hidden=true);
 const promptDetails=document.createElement('details');promptDetails.className='prompt-details';promptDetails.innerHTML='<summary>依頼文を確認</summary>';$('#setupPrompt').before(promptDetails);promptDetails.append($('#setupPrompt'));
 $('#setupDownload').textContent='プロジェクトを保存';$('#setupDownload').classList.remove('primary');$('#setupCopy').textContent='依頼文をコピー';$('#setupCopy').classList.add('primary');
 const samples=document.createElement('dialog');samples.id='samplesDialog';samples.innerHTML=`<div class="dialog-top"><h2>サンプルを開く</h2><button class="close-modal" aria-label="閉じる">×</button></div><div class="sample-options"><button data-sample="parts">${icon('cube')}<span><strong>パーツを編集</strong><small>頭・髪・体と、読み込み済みの骨配置</small></span>${icon('chevron')}</button><button data-sample="walk">${icon('play')}<span><strong>歩行を確認</strong><small>ウェイト転送後のキャラクター</small></span>${icon('chevron')}</button><button data-sample="new">${icon('plus')}<span><strong>最初から試す</strong><small>画像素材の登録から</small></span>${icon('chevron')}</button></div>`;document.body.append(samples);
 const veil=document.createElement('div');veil.id='previewLoading';veil.innerHTML='<div class="kit-mark">'+icon('sparkle')+'</div><strong>キャラクターを読み込んでいます</strong><span class="load-line"></span>';document.body.append(veil);
})();

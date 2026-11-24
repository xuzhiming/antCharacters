import {replaceImage,imagePackage,importImagePackage} from './image-package.mjs';
import {readImageMetadata,withImagePrompt} from './image-metadata.mjs';
import {inspectImage} from './image-info.mjs';
import {t} from './i18n.mjs';
import {currentImageSlots,hasSeparateHairImages,library,adoptImage,adoptedVersions} from './images.mjs';
import {sha256,validateProject} from './project.mjs';
import {unzip,zipStore} from './archive.mjs';
import {THREE_VIEWS} from './three-view-data.mjs';
const labels={head:'頭',hair:'髪',body:'体・衣装',pupils:'瞳',front:'正面',left:'左側面',right:'右側面',back:'背面',neutral:'通常',happy:'喜び',angry:'怒り',sad:'悲しみ',relaxed:'リラックス',surprised:'驚き',blink:'瞬き'};
const title=(s,p)=>(s.part==='pupils')?t(labels[s.part]):`${t(s.part==='head'&&!hasSeparateHairImages(p)?'頭（髪込み）':labels[s.part])} · ${t(labels[s.view])}`;
const $=s=>document.querySelector(s),el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
export function initImageUI({get,commit,dirty,task,download,toast,requestImages}){
 let filter='parts',view='all',selected='head/front/neutral';const urls=new Map();let lastProject;
 const url=v=>{if(!urls.has(v.path))urls.set(v.path,URL.createObjectURL(new Blob([get().files.get(v.path)],{type:v.mime})));return urls.get(v.path);};
 const clear=()=>{for(const u of urls.values())URL.revokeObjectURL(u);urls.clear();};
 const root=$('#imageWorkspace');root.innerHTML=`<div class="image-heading"><div><div class="eyebrow">CHARACTER IMAGE LIBRARY</div><h1>画像素材</h1><p>素材画像を一覧で確認します。</p></div><div class="image-actions"><label class="file-button">画像セットZIPを追加<input id="imageZip" type="file" accept=".zip" hidden></label><button id="imagePNGExport">画像をまとめて保存 ↓</button></div></div><section class="original-section" aria-labelledby="originalTitle"><div class="original-preview" id="originalPreview"><span>元絵未登録</span></div><div class="original-content"><h2 id="originalTitle">元絵</h2><p id="originalFilename" translate="no"></p><label class="file-button primary">元絵を読み込む<input id="originalFile" type="file" accept=".png,.jpg,.jpeg,.webp" hidden></label><button id="originalHandoff" disabled>画像制作を依頼 ↗</button></div></section><div class="image-toolbar"><div id="imageFilters" class="segmented"><button data-filter="parts" class="active">部位の4方向</button></div><select id="imageView" aria-label="画像の方向"><option value="all">全方向</option><option value="front">正面</option><option value="left">左側面</option><option value="right">右側面</option><option value="back">背面</option></select><label><input type="checkbox" id="imageGuides">水平ガイド</label><span id="imageCount"></span></div><p class="image-note">左・右は本人基準です。画像をクリックすると拡大表示・ダウンロードできます。</p><div id="imageGrid" class="image-grid"></div>`;
 const dialog=el('dialog',undefined,document.body);dialog.id='imageDialog';dialog.innerHTML=`<div class="dialog-top"><h2 id="imageTitle"></h2><button id="closeImage" aria-label="画像を閉じる">×</button></div><div class="image-large"><img id="imagePreview" alt="画像"></div><p id="imageInfo" translate="no"></p><details><summary>生成プロンプト</summary><pre id="imageMetadataPrompt" translate="no"></pre></details><div class="dialog-actions"><button id="requestImageEdit">Astraに修正を依頼</button><button id="downloadImage">画像をダウンロード</button></div>`;
 root.insertAdjacentHTML('beforeend','<section id="threeViewImages" hidden><h2>バランス調整用の三面図</h2><p class="image-note">部位画像の制作後に作成した全身の参考画像です。モデル編集で自動表示されます。</p><div id="threeViewImageGrid" class="image-grid"></div></section>');
 const input=el('input',undefined,root);input.type='file';input.id='imageFile';input.accept='.png,.jpg,.jpeg,.webp';input.hidden=true;
 function render(){const {project:p}=get();if(p.id!==lastProject){clear();lastProject=p.id;}const original=p.assets.find(a=>a.path===p.sourceImage&&a.role==='reference');
 $('#originalPreview').replaceChildren();if(original){const img=el('img',undefined,$('#originalPreview'));img.src=url(original);img.alt=t('元になるキャラクターの1枚絵');}else el('span',t('元絵未登録'),$('#originalPreview'));
 $('#originalFilename').textContent=original?.filename||'';$('#originalHandoff').disabled=!original&&!p.imageLibrary?.versions.length;if(original)$('#originalPreview img').onclick=()=>{selected=null;renderDialog();dialog.showModal();};
 const l=library(p),imageSlots=currentImageSlots(p);const slots=imageSlots.filter(s=>(filter==='all'||filter==='parts'&&s.state==='neutral'&&!(s.part==='pupils')||filter==='pupils'&&(s.part==='pupils')||filter==='expressions'&&s.part==='head'&&['front','right'].includes(s.view))&&(s.part==='pupils'||view==='all'||s.view===view));
 $('#imageView').hidden=filter==='pupils';
 $('#imageGrid').replaceChildren();let n=0;for(const s of slots){const v=l.versions.find(v=>v.id===l.slots[s.id]?.adopted),b=el('button',undefined,$('#imageGrid'));b.className='image-card';b.dataset.slot=s.id;const frame=el('div',undefined,b);frame.className='image-frame';if(v){n++;const img=el('img',undefined,frame);img.src=url(v);img.alt=title(s,p);img.loading='lazy';}else el('span','＋ 画像を追加',frame);el('strong',title(s,p),b);el('small',v?`${v.width} × ${v.height}`:'未登録',b);b.onclick=()=>{selected=s.id;if(v){renderDialog();dialog.showModal();}else input.click();};const replace=el('button',v?'差し替え':'画像を読み込む',$('#imageGrid'));replace.className='slot-upload';replace.dataset.upload=s.id;replace.onclick=e=>{e.stopPropagation();selected=s.id;input.click();};const wrapper=el('div',undefined,$('#imageGrid'));wrapper.className='image-slot';wrapper.append(b,replace);}

 $('#imageCount').textContent=`${n} / ${slots.length} 素材`;
 $('#threeViewImageGrid').replaceChildren();let guideCount=0;
 for(const direction of THREE_VIEWS){const guide=p.threeViews?.views[direction],asset=p.assets.find(a=>a.path===guide?.path);if(!asset)continue;guideCount++;
  const b=el('button',undefined,$('#threeViewImageGrid'));b.className='image-card';b.dataset.guide=direction;
  const frame=el('div',undefined,b);frame.className='image-frame';const img=el('img',undefined,frame);img.src=url(asset);img.alt=t('三面図')+' · '+t(labels[direction==='side'?'right':direction]);img.loading='lazy';el('strong',img.alt,b);
  b.onclick=()=>{selected='three-view/'+direction;renderDialog();dialog.showModal();};
 }$('#threeViewImages').hidden=!guideCount;
 $('#originalHandoff').hidden=!original&&!p.imageLibrary?.versions.length;$('#originalFile').closest('label').classList.toggle('primary',!original);$('#imagePNGExport').disabled=!adoptedVersions(p).some(v=>imageSlots.some(s=>s.id===v.slot));if(dialog.open)renderDialog();
 }
 function currentImage(){const p=get().project,l=library(p);if(selected?.startsWith('three-view/'))return p.assets.find(a=>a.path===p.threeViews?.views[selected.split('/')[1]]?.path);return selected===null?p.assets.find(a=>a.path===p.sourceImage):l.versions.find(v=>v.id===l.slots[selected]?.adopted);}
 function renderDialog(){const v=currentImage(),guide=selected?.startsWith('three-view/'),direction=guide&&selected.split('/')[1];$('#imageTitle').textContent=selected===null?t('元絵'):guide?t('三面図')+' · '+t(labels[direction==='side'?'right':direction]):title(currentImageSlots(get().project).find(s=>s.id===selected),get().project);const img=$('#imagePreview');if(v){img.src=url(v);img.alt=$('#imageTitle').textContent;}else img.removeAttribute('src');$('#downloadImage').disabled=!v;$('#requestImageEdit').hidden=selected===null||guide;$('#imageInfo').textContent=v?`${v.filename||''} · ${v.width||''} × ${v.height||''}`:'';$('#imageMetadataPrompt').textContent=v?.prompt||(guide&&v?.mime==='image/png'?readImageMetadata(get().files.get(v.path))?.prompt:null)||t('生成プロンプトは未登録です。');}
 $('#requestImageEdit').onclick=()=>{const v=currentImage();if(v&&selected){dialog.close();requestImages({kind:'image-edit',slot:selected,imageId:v.id});}};
 $('#closeImage').onclick=()=>dialog.close();
 $('#downloadImage').onclick=()=>{const v=currentImage();if(v)download(new Blob([get().files.get(v.path)],{type:v.mime}),(selected?selected.replaceAll('/','-'):'original')+'.'+v.path.split('.').pop());};
 async function add(p,f,slot,file){
  const raw=new Uint8Array(await file.arrayBuffer()),info=await inspectImage(raw,file.name.split('.').pop());
  const prompt=info.mime==='image/png'?readImageMetadata(raw)?.prompt??null:null;
  const bytes=info.mime==='image/png'?withImagePrompt(raw,prompt):raw;
  const id=crypto.randomUUID(),path=`images/${id}.${info.mime==='image/png'?'png':info.mime==='image/webp'?'webp':'jpg'}`;
  replaceImage(p,{id,slot,path,...info,sha256:await sha256(bytes),filename:file.name,createdAt:new Date().toISOString(),method:'import',prompt,note:'',references:[]});f.set(path,bytes);return id;
 }
 $('#originalFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)task('参考画像を保存しています…',async()=>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024**2)throw Error('参考画像は20MB以内のPNG/JPEG/WebPにしてください。');
 const bytes=new Uint8Array(await file.arrayBuffer()),bitmap=await createImageBitmap(new Blob([bytes],{type:file.type}));bitmap.close();
 const p=structuredClone(get().project),f=new Map(get().files),ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path='assets/'+crypto.randomUUID()+'.'+ext;
 p.assets.push({path,role:'reference',filename:file.name,mime:file.type,sha256:await sha256(bytes)});p.sourceImage=path;f.set(path,bytes);validateProject(p);commit(p,f);render();
 });};
 $('#originalHandoff').onclick=requestImages;
 $('#imageFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)task('画像を読み込んでいます…',async()=>{const p=structuredClone(get().project),f=new Map(get().files);await add(p,f,selected,file,{adopt:true});validateProject(p);commit(p,f);render();});};
 $('#imageZip').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)task('画像セットを読み込んでいます…',async()=>{if(file.size>512*1024**2)throw Error('画像ZIPは512MB以内にしてください。');const entries=await unzip(await file.arrayBuffer(),{maxBytes:512*1024**2}),p=structuredClone(get().project),f=new Map(get().files);await importImagePackage(p,f,entries);validateProject(p);commit(p,f);render();toast(t('画像を読み込みました。'));});};
 $('#imageFilters').onclick=e=>{if(!e.target.dataset.filter)return;filter=e.target.dataset.filter;$('#imageFilters').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));render();};$('#imageView').onchange=e=>{view=e.target.value;render();};$('#imageGuides').onchange=e=>{root.classList.toggle('with-guides',e.target.checked);dialog.classList.toggle('with-guides',e.target.checked);};
 $('#imagePNGExport').onclick=()=>task('採用画像をまとめています…',async()=>{const {project:p,files}=get(),entries=await imagePackage(p,files);if(!Object.keys(entries).length)throw Error('採用画像がありません。');download(zipStore(entries),'character-images.zip');});
 return {render,clear};
}

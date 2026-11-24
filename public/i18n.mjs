import {previewEnglish} from './preview-translations.mjs';
import {en} from './translations.mjs';
import {uiEnglish} from './ui-translations.mjs';
import {ko} from './translations-ko.mjs';
import {zh} from './translations-zh.mjs';
import {runtimeTranslations} from './runtime-translations.mjs';
import {normalizeLocale,localeInfo} from './locales.mjs';
Object.assign(ko,runtimeTranslations.ko);Object.assign(zh,runtimeTranslations.zh);
export const english=Object.freeze({...en,...previewEnglish,...uiEnglish,...runtimeTranslations.en});
export const language=()=>normalizeLocale(globalThis.document?.documentElement.lang);
export const say=(ja,en)=>language()==='ja'?ja:language()==='en'?en:t(ja);
// Only UI-owned text is passed here. Interpolated filenames, names and notes stay verbatim.
export function t(source,locale=language()){
 if(normalizeLocale(locale)==='ja'||typeof source!=='string')return source;
 const korean=normalizeLocale(locale)==='ko',chinese=normalizeLocale(locale)==='zh-CN',en=chinese?zh:korean?ko:english;
 const key=source.trim();if(Object.hasOwn(en,key))return source.replace(key,()=>en[key]);
 let m;
 if(chinese){
  if((m=key.match(/^候補 (\d+)$/)))return `候选 ${m[1]}`;
  if((m=key.match(/^(.+)マーカー$/))&&en[m[1]])return `${en[m[1]]}标记`;
  if((m=key.match(/^ミラーON：(.+)も左右対称に動きます。$/)))return `镜像开启：${en[m[1]]||m[1]}也会左右对称移动。`;
  if((m=key.match(/^([\d.]+) × ([\d.]+) · 候補 (\d+)枚$/)))return `${m[1]} × ${m[2]} · ${m[3]} 张候选`;
  if((m=key.match(/^(\d+) \/ (\d+) 素材$/)))return `${m[1]} / ${m[2]} 张素材`;
  if((m=key.match(/^全高 ([\d.]+) m（髪・飾り込み）(?: \/ 頭頂までの目安 ([\d.]+) m)?$/)))return `总高度 ${m[1]} m（含头发与配饰）`+(m[2]?` / 头顶高度约 ${m[2]} m`:'');
  if((m=key.match(/^(\d+)枚を追加しました。既存素材への追加は候補から採用してください。$/)))return `已添加 ${m[1]} 张图片。要替换现有素材，请采用对应候选。`;
  if((m=key.match(/^(.+)を取り込みました。配置を確認してください。$/)))return `已导入${en[m[1]]||m[1]}，请检查位置。`;
  if((m=key.match(/^自動検査済み · 物理 (ON|OFF) · MToon$/)))return `自动检查通过 · 物理${m[1]==='ON'?'开启':'关闭'} · MToon`;
  if((m=key.match(/^(\d+)個の独立した部品。テクスチャ用と揺れ物用を別々に分類します。$/)))return `${m[1]} 个独立部件。纹理和摆动部件分别分类。`;
  if((m=key.match(/^テクスチャ (\d+) \/ (\d+)枚 · 4K$/)))return `纹理 ${m[1]} / ${m[2]} 张 · 4K`;
  if((m=key.match(/^揺れ物は別に(\d+)グループ保存しています。$/)))return `另外保存了 ${m[1]} 组摆动部件。`;
  if((m=key.match(/^読み戻し ([\d.]+) m → 元の全高 ([\d.]+) m（([\d.]+)倍）。髪の位置も確認してください。$/)))return `导入高度 ${m[1]} m → 原总高度 ${m[2]} m（${m[3]} 倍）。也请确认头发位置。`;
 }
 if((m=key.match(/^候補 (\d+)$/)))return `${korean?'후보':'Candidate'} ${m[1]}`;
 if((m=key.match(/^(.+)マーカー$/))&&en[m[1]])return `${en[m[1]]} ${korean?'마커':'marker'}`;
 if((m=key.match(/^ミラーON：(.+)も左右対称に動きます。$/)))return korean?`미러 ON: ${en[m[1]]||m[1]}도 좌우 대칭으로 움직입니다.`:`Mirror ON: ${en[m[1]]||m[1]} moves symmetrically too.`;
 if((m=key.match(/^([\d.]+) × ([\d.]+) · 候補 (\d+)枚$/)))return `${m[1]} × ${m[2]} · ${m[3]} ${korean?'후보':'candidates'}`;
 if((m=key.match(/^(\d+) \/ (\d+) 素材$/)))return `${m[1]} / ${m[2]} ${korean?'이미지':'images'}`;
 if((m=key.match(/^(\d+) · (根元|先端|中間)$/)))return `${m[1]} · ${en[m[2]]}`;
 if((m=key.match(/^(.+)（(m|°)）$/))&&en[m[1]])return `${en[m[1]]} (${m[2]})`;
 if((m=key.match(/^全高 ([\d.]+) m（髪・飾り込み）(?: \/ 頭頂までの目安 ([\d.]+) m)?$/)))return korean?`전체 높이 ${m[1]} m (머리카락·장식 포함)`+(m[2]?` / 머리 꼭대기까지 약 ${m[2]} m`:''):`Total height ${m[1]} m (including hair & accessories)`+(m[2]?` / Approx. head height ${m[2]} m`:'');
 if((m=key.match(/^(\d+)枚を追加しました。既存素材への追加は候補から採用してください。$/)))return korean?`${m[1]}장의 이미지를 추가했습니다. 기존 이미지를 교체하려면 후보를 선택하세요.`:`${m[1]} images added. Adopt a candidate to replace an existing image.`;
 if((m=key.match(/^(.+)を取り込みました。配置を確認してください。$/)))return korean?`${en[m[1]]||m[1]} 가져오기를 완료했습니다. 배치를 확인하세요.`:`${en[m[1]]||m[1]} imported. Check its placement.`;
 if(korean){
  if((m=key.match(/^自動検査済み · 物理 (ON|OFF) · MToon$/)))return `자동 검사 통과 · 물리 ${m[1]} · MToon`;
  if((m=key.match(/^(\d+)個の独立した部品。テクスチャ用と揺れ物用を別々に分類します。$/)))return `${m[1]}개의 독립된 부품입니다. 텍스처와 흔들리는 부위를 각각 분류합니다.`;
  if((m=key.match(/^テクスチャ (\d+) \/ (\d+)枚 · 4K$/)))return `텍스처 ${m[1]} / ${m[2]}장 · 4K`;
  if((m=key.match(/^揺れ物は別に(\d+)グループ保存しています。$/)))return `흔들리는 부위는 별도로 ${m[1]}개 그룹에 저장됩니다.`;
  if((m=key.match(/^読み戻し ([\d.]+) m → 元の全高 ([\d.]+) m（([\d.]+)倍）。髪の位置も確認してください。$/)))return `다시 가져온 높이 ${m[1]} m → 원래 전체 높이 ${m[2]} m (${m[3]}배). 머리카락의 위치도 확인하세요.`;
 }
 // A selected-marker hint consists of independently owned sentences.
 if(key.endsWith('左右は中心線（X = 0）に固定されています。'))return t(key.replace(/ 左右は中心線（X = 0）に固定されています。$/,''),locale)+' '+en['左右は中心線（X = 0）に固定されています。'];
 // Error prefixes contain paths/IDs after the separator, which are never translated.
 for(const [jp,english] of Object.entries(en)){if(jp.endsWith(': ')&&source.startsWith(jp))return english+source.slice(jp.length);}
 return (korean||chinese)&&Object.hasOwn(english,key)?source.replace(key,()=>english[key]):source;
}
const protectedContent='[translate="no"],script,style,#languageSelect,#projectName,#springList,#imageDocuments,#zipChoice,#imageVersions,#imageVersionNote,#imagePrompt,#referenceList figcaption,#referenceList img';
const originalText=new Map();
for(const dict of [english,ko,zh])for(const [source,value] of Object.entries(dict))if(!originalText.has(value.trim()))originalText.set(value.trim(),source.trim());
const sources=new WeakMap();
function translateValue(node,key,read,write){
 const current=read();let record=sources.get(node);if(!record){record=new Map();sources.set(node,record);}let entry=record.get(key);
 if(!entry||current!==entry.output){const key=current.trim(),source=originalText.get(key);entry={source:source?current.replace(key,()=>source):current,output:current};}
 const output=t(entry.source);entry.output=output;record.set(key,entry);if(current!==output)write(output);
}
export function localize(root=document.body){
 if(root.nodeType===3){if(!root.parentElement?.closest(protectedContent+',input,textarea'))translateValue(root,'text',()=>root.nodeValue,v=>root.nodeValue=v);return;}
 if(root.nodeType!==1||root.closest(protectedContent))return;
 for(const attr of ['title','aria-label','placeholder','data-label','alt'])if(root.hasAttribute(attr))translateValue(root,attr,()=>root.getAttribute(attr),v=>root.setAttribute(attr,v));
 if(root.matches('input,textarea'))return;
 for(const child of root.childNodes)localize(child);
}
export function initLocalization(){
 const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='childList')for(const n of r.addedNodes)localize(n);else if(r.type==='characterData')localize(r.target);else localize(r.target);}});
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder','data-label','alt']});
 const refresh=()=>{localize();document.title=localeInfo(language()).title;};
 document.querySelector('#languageSelect').value=language();
 document.querySelector('#languageSelect').addEventListener('change',e=>{document.documentElement.lang=normalizeLocale(e.target.value);try{localStorage.setItem('avatar-ui-preview.language',language());}catch{}window.dispatchEvent(new Event('languagechange'));refresh();});
 refresh();return refresh;
}

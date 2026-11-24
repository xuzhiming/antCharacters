export const VERSION=1;
export const coordinateSystem={unit:'meter',up:'+Z',front:'-Y',characterLeft:'+X',space:'world'};
export const bodyDefinitions=[
 ['hips','腰の中心','中心','骨盤の中心。脚の付け根の高さを目安にします。',null,[0,.015,1.00]],
 ['spine','背骨','中心','腰と胸の間。側面から体の厚みの中心を確認します。','hips',[0,.015,1.14]],
 ['chest','胸の中心','中心','胸郭の中心。衣装の表面ではなく体の内部です。','spine',[0,.015,1.32]],
 ['neck','首の付け根','中心','首が胴体に接続する中心です。','chest',[0,0,1.46]],
 ['head','頭の回転中心','中心','首の上端付近。側面から位置を確認します。','neck',[0,.008,1.54]],
 ...['L','R'].flatMap(side=>{
 const s=side==='L'?1:-1,label=side==='L'?'左':'右';return [
 [`shoulder.${side}`,`${label}肩`,`${label}腕`,'腕の付け根。袖の外側ではなく肩関節の中心です。','chest',[s*.15,.005,1.425]],
 [`elbow.${side}`,`${label}肘`,`${label}腕`,'肘が曲がる中心。側面で前後位置も調整します。',`shoulder.${side}`,[s*.37,.005,1.365]],
 [`wrist.${side}`,`${label}手首`,`${label}腕`,'袖口の飾りではなく手首の中心です。',`elbow.${side}`,[s*.57,.0,1.31]],
 [`hand.${side}`,`${label}手の中心`,`${label}腕`,'手のひらの中央。指モードの拡大位置の目安にもなります。',`wrist.${side}`,[s*.635,0,1.30]],
 [`hip.${side}`,`${label}股関節`,`${label}脚`,'骨盤内の脚の付け根。モデルを透過して位置を確認します。','hips',[s*.073,.01,.97]],
 [`knee.${side}`,`${label}膝`,`${label}脚`,'膝関節の中心です。側面で曲がる位置を確認します。',`hip.${side}`,[s*.082,-.01,.57]],
 [`ankle.${side}`,`${label}足首`,`${label}脚`,'靴の上端ではなく足首の関節中心です。',`knee.${side}`,[s*.09,.008,.17]],
 [`toes.${side}`,`${label}つま先の付け根`,`${label}脚`,'足指が曲がる付け根。靴の最先端ではありません。',`ankle.${side}`,[s*.09,-.085,.085]],
 ];})
].map(([id,label,group,hint,parent,position])=>({id,label,group,hint,parent,position}));
// Optional guides: three joints and a tip for each finger, in Blender coordinates.
export const fingerDefinitions=['L','R'].flatMap(side=>
 [['thumb','親指'],['index','人差し指'],['middle','中指'],['ring','薬指'],['little','小指']].flatMap(([finger,name])=>{
 const joints=finger==='thumb'?['Metacarpal','Proximal','Distal','Tip']:['Proximal','Intermediate','Distal','Tip'];
 return joints.map((joint,i)=>({id:finger+joint+'.'+side,label:(side==='L'?'左':'右')+name+' '+['付け根','中間関節','末端関節','先端'][i],group:(side==='L'?'左':'右')+name,hint:i===3?'指先の中心です。骨の向きと長さの目安にします。':'指が曲がる関節の中心です。上面と側面でも奥行きを合わせてください。',parent:i?finger+joints[i-1]+'.'+side:'hand.'+side,finger,side,jointIndex:i}));
 }));
export const definitions=[...bodyDefinitions,...fingerDefinitions];
export const bodyIds=bodyDefinitions.map(d=>d.id);
export const fingerIds=fingerDefinitions.map(d=>d.id);
export function makeFingerMarkers(markers){
 const result={};
 for(const d of fingerDefinitions){
  const hand=markers['hand.'+d.side].position,wrist=markers['wrist.'+d.side].position;
  const delta=hand.map((v,i)=>v-wrist[i]),length=Math.hypot(...delta),scale=length>1e-5?length:.065;
  const axis=length>1e-5?delta.map(v=>v/length):[d.side==='L'?1:-1,0,0];
  // Fan across the palm; avoid a degenerate cross-product for a forward-pointing hand.
  const reference=Math.abs(axis[1])<.9?[0,1,0]:[0,0,1];
  const dot=reference.reduce((sum,v,i)=>sum+v*axis[i],0),cross=reference.map((v,i)=>v-dot*axis[i]),norm=Math.hypot(...cross);
  const spread={thumb:-.72,index:-.38,middle:0,ring:.35,little:.65}[d.finger];
  const lengths={thumb:.68,index:1,middle:1.12,ring:1.02,little:.8};
  const along=(d.finger==='thumb'?-.1:.36)+d.jointIndex*.34*lengths[d.finger];
  result[d.id]={position:hand.map((v,i)=>v+scale*(axis[i]*along+cross[i]/norm*spread))};
 }
 return result;
}
export const ids=definitions.map(d=>d.id);
export const centerIds=definitions.filter(d=>d.group==='中心').map(d=>d.id);
export function constrainCenters(markers){
 let count=0;for(const id of centerIds){const m=markers[id];if(m.position[0]!==0){m.position[0]=0;count++;}}return count;
}
export const makeMarkers=()=>Object.fromEntries(bodyDefinitions.map(d=>[d.id,{position:[...d.position]}]));
export function validateMarkers(markers){
 if(!markers||typeof markers!=='object'||Object.keys(markers).some(id=>!ids.includes(id))||bodyIds.some(id=>!markers?.[id]))throw Error('マーカー数が一致しません。');
 for(const id of Object.keys(markers)){const m=markers[id];if(!m||!Array.isArray(m.position)||m.position.length!==3||!m.position.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=10))throw Error(`不正なマーカー: ${id}`);}
 return true;
}
export function moveMarker(markers,id,position,mirror){
 const m=markers[id];if(!m)throw Error('Unknown marker');m.position=[...position];if(centerIds.includes(id))m.position[0]=0;
 const partner=id.endsWith('.L')?id.replace('.L','.R'):id.endsWith('.R')?id.replace('.R','.L'):null;
 if(mirror&&partner&&markers[partner]){markers[partner].position=[-position[0],position[1],position[2]];}
}
export function editInView(original,hit,view){
 if(view==='top')return [hit[0],hit[1],original[2]];
 if(view==='front'||view==='back')return [hit[0],original[1],hit[2]];
 if(view==='left'||view==='right')return [original[0],hit[1],hit[2]];
 return [...original];
}

export function stripLegacyReview(markers){return Object.fromEntries(Object.entries(markers).map(([id,m])=>[id,{position:[...m.position]}]));}

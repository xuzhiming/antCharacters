// Archive validation stays independent of the renderer and Blender.
export function validateRigGuide(p){
  const g=p.rigGuide;if(g===undefined)return;
  const vec=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000);
  if(!g||g.version!==1||typeof g.sourceStamp!=='string'||g.sourceStamp.length>8000||! /^[a-f0-9]{64}$/.test(g.sourceHash)||!Array.isArray(g.bones)||!g.bones.length||g.bones.length>512)throw Error('骨配置の情報が不正です。');
  const names=new Set();
  for(const [i,b] of g.bones.entries()){
    if(!b||typeof b.name!=='string'||!b.name||b.name.length>=200||names.has(b.name)||!(b.parent===null||Number.isInteger(b.parent)&&b.parent>=0&&b.parent<i)||!['head','tail','rollAxis'].every(k=>vec(b[k]))||Math.hypot(...b.head.map((v,j)=>v-b.tail[j]))<1e-7||Math.abs(Math.hypot(...b.rollAxis)-1)>1e-4)throw Error('骨配置の階層または座標が不正です。');
    names.add(b.name);
  }
}

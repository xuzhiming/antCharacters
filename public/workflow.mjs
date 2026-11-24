// Workflow state is independent of the legacy asset roles retained in archives.
export const ACTIVE_ROLES = ['body', 'hair', 'head_neutral'];
export const PHASES = ['parts', 'bones', 'rigged', 'weighted', 'springs'];
export const newWorkflow = () => ({version: 1, rigging: 'tripo', phase: 'parts', attachHair: false, boneMap: {}});
export const workflow = p => p.workflow ??= newWorkflow();
export function validRigBounds(b) {
  return !!b&&['min','max'].every(k=>Array.isArray(b[k])&&b[k].length===3&&b[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=1000))&&b.max.every((v,i)=>v>=b.min[i])&&b.max[1]-b.min[1]>1e-5;
}
export function rigSourceStamp(p) {
  return JSON.stringify(['body', 'head_neutral'].map(role => {
    const a = p.assets.find(a => a.role === role);
    return [role, a?.sha256, a?.normalization, p.placements[role === 'head_neutral' ? 'head' : role]];
  }));
}
export function rigExportState(p) {
  if(p.production&&p.production.phase!=='assembled')return 'missing';
  if (!['body', 'head_neutral'].every(role => p.assets.some(a => a.role === role))) return 'missing';
  if (!p.workflow?.rigExport) return 'none';
  return p.workflow.rigExport.sourceStamp === rigSourceStamp(p) ? 'current' : 'stale';
}
export function validateWorkflow(p) {
  const w = p.workflow;
  if (!w) return;
  if (w.version !== 1 || !['tripo','markers'].includes(w.rigging) || !PHASES.includes(w.phase) || typeof w.attachHair !== 'boolean') throw Error('制作工程の情報が不正です。');
  if (!w.boneMap || typeof w.boneMap !== 'object' || Array.isArray(w.boneMap) || Object.keys(w.boneMap).length > 80 || !Object.values(w.boneMap).every(n => typeof n === 'string' && n.length < 200)) throw Error('骨の対応情報が不正です。');
  if (w.rigExport && (typeof w.rigExport.sourceStamp !== 'string' || w.rigExport.sourceStamp.length > 8000 || typeof w.rigExport.at !== 'string')) throw Error('書き出しの記録が不正です。');
  if (w.rigExport?.bounds!==undefined&&!validRigBounds(w.rigExport.bounds)) throw Error('書き出しサイズの記録が不正です。');
  const a=w.returnAlignment;
  if(a&&(a.version!==1||typeof a.sourceStamp!=='string'||a.sourceStamp.length>8000||!['sourceHeight','returnedHeight','scale'].every(k=>Number.isFinite(a[k])&&a[k]>0&&a[k]<=1000)))throw Error('読み戻しサイズの記録が不正です。');
}

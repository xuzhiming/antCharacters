import {packProject,unpackProject} from './project.mjs';
import {transferPreflight} from './weight-plan.mjs';

export async function requestWeightTransfer(project,files){
 transferPreflight(project);
 const json=async response=>{let value;try{value=await response.json();}catch{throw Error('ローカル版を npm start で起動してください。');}if(!response.ok)throw Error(value.error||'処理に失敗しました。');return value;};
 const {blob}=await packProject(project,files);
 const job=await json(await fetch('/api/transfer-weights',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob}));
 const deadline=Date.now()+630000;
 while(Date.now()<deadline){
  await new Promise(resolve=>setTimeout(resolve,700));
  const state=await json(await fetch('/api/transfer-weights/'+job.id));
  if(state.status==='failed')throw Error(state.error||'処理に失敗しました。');
  if(state.status!=='ready')continue;
  const response=await fetch('/api/transfer-weights/'+job.id+'/file');if(!response.ok)throw Error('処理結果を読み込めませんでした。');
  const result=await unpackProject(await response.arrayBuffer());
  if(result.project.id!==project.id||result.project.workflow?.phase!=='weighted')throw Error('処理結果のプロジェクトが一致しません。');
  return result;
 }
 throw Error('処理が制限時間を超えました。');
}

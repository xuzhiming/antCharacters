import {packProject,unpackProject} from './project.mjs';
import {productionPreflight} from './production.mjs';
export async function requestProduction(p,files,operation,onStatus=()=>{}){
  productionPreflight(p,operation);
  const saved=await packProject(p,files),endpoint='/api/production-'+operation;
  const json=async response=>{const result=await response.json();if(!response.ok)throw Error(result.error||'処理に失敗しました。');return result;};
  const job=await json(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:saved.blob}));
  const url=endpoint+'/'+job.id,start=Date.now();
  while(Date.now()-start<650000){
    const state=await json(await fetch(url));
    if(state.status==='failed')throw Error(state.error||'部位処理に失敗しました。');
    if(state.status==='ready'){const response=await fetch(url+'/file');if(!response.ok)throw Error('結果を取得できません。');return unpackProject(await response.arrayBuffer());}
    onStatus('Blenderで処理中…');await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw Error('結果の取得がタイムアウトしました。元のキットは保持されています。');
}

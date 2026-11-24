// Development server. Production hosting only needs public/ (npm run build).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleJobRequest,sameOrigin} from './server-jobs.mjs';
import {handleBodyHairRequest} from './server-body-hair.mjs';
import {localConfig,sampleAvailability} from './server-config.mjs';
import {createSessionHandler} from './server-session.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),pub=path.join(root,'public');
const port=Number(process.env.PORT||8766);
const handleSession=createSessionHandler(root);
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.txt':'text/plain','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};
http.createServer(async(req,res)=>{const send=(status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);};try{
 if(!sameOrigin(req))return send(403,JSON.stringify({error:'Local access only'}));
  const route=new URL(req.url,'http://localhost');
  const help={'/help/agent-capability-handoff.md':'agent-capability-handoff.md','/help/expression-authoring.md':'expression-authoring.md','/help/expression-authoring.ja.md':'expression-authoring.ja.md','/help/tutorial.md':'tutorial.md','/help/tutorial.ja.md':'tutorial.ja.md','/help/tutorial.ko.md':'tutorial.ko.md','/help/tutorial.zh-CN.md':'tutorial.zh-CN.md'}[route.pathname];
  if(help&&req.method==='GET')return send(200,await fs.readFile(path.join(root,'docs',help)),'text/plain; charset=utf-8');
 if(route.pathname==='/api/samples'&&req.method==='GET'){
  return send(200,JSON.stringify(await sampleAvailability()));
 }
 if(await handleSession(req,res,route.pathname))return;
 if(await handleBodyHairRequest(req,res,route.pathname))return;
 if(await handleJobRequest(req,res,route.pathname))return;
 if(req.method!=='GET')return send(405,JSON.stringify({error:'Read only'}));
 if(route.pathname.startsWith('/sample/')){
  const key={'/sample/parts.charakit':'parts','/sample/walk.charakit':'walk','/sample/reference.png':'reference'}[route.pathname];
  const config=await localConfig(),file=key&&config.samples?.[key];
  if(!file)return send(404,JSON.stringify({error:'サンプルが設定されていません。'}));
  return send(200,await fs.readFile(file),key==='reference'?'image/png':'application/octet-stream');
 }
 if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return send(403,JSON.stringify({error:'Local access only'}));
 const u=new URL(req.url,'http://localhost');
 const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
 const file=path.resolve(pub,rel);if(!file.startsWith(pub+path.sep))return send(403,'{}');
 return send(200,await fs.readFile(file),mime[path.extname(file)]||'application/octet-stream');
 }catch(e){send(e.code==='ENOENT'?404:400,JSON.stringify({error:e.message}));}
}).listen(port,'127.0.0.1',()=>console.log(`AI Character Modeling Kit http://127.0.0.1:${port}`));

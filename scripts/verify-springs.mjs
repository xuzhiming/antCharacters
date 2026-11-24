import {register} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const threeURL=new URL('../public/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){return s==='three'?{url:${JSON.stringify(threeURL)},shortCircuit:true}:next(s,c);}`),import.meta.url);
export async function verifyExportSprings(bytes,plan){const {verifySpringMotion}=await import('../public/spring-physics.mjs');return verifySpringMotion(bytes,{plan});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [vrm,planFile,out]=process.argv.slice(2);if(!vrm||!planFile)throw Error('Usage: node scripts/verify-springs.mjs AVATAR.vrm spring-plan.json [report.json]');
 const report=await verifyExportSprings(await fs.readFile(vrm),JSON.parse(await fs.readFile(planFile,'utf8')));
 if(out)await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}

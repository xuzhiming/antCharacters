// Deliver only image files (with provenance metadata) inside one importable ZIP.
import fs from 'node:fs/promises';import path from 'node:path';
import {writeImageMetadata} from '../public/image-metadata.mjs';import {zipStore} from '../public/archive.mjs';
import {VIEWS,IMAGE_PARTS} from '../public/images.mjs';
import {imageInfo} from '../public/image-info.mjs';
const [configPath,output]=process.argv.slice(2);if(!configPath||!output)throw Error('Usage: node scripts/package-images.mjs images.json images.zip');
const c=JSON.parse(await fs.readFile(configPath,'utf8')),base=path.dirname(path.resolve(configPath)),entries={};
for(const item of c.images){
 if(!/^(head|hair|body)\/(front|left|right|back)$/.test(item.slot)||typeof item.prompt!=='string')throw Error('Set a part/view slot and the actual prompt');
 const key=item.slot+'.png';if(entries[key])throw Error('Duplicate image slot');entries[key]=writeImageMetadata(await fs.readFile(path.resolve(base,item.file)),{version:1,prompt:item.prompt,references:[]});
}
const required=IMAGE_PARTS.flatMap(part=>VIEWS.map(view=>`${part}/${view}.png`));
// Accept complete legacy sets without requiring separate hair for new work.
if(!required.every(key=>entries[key])||![8,12].includes(Object.keys(entries).length))throw Error('The initial image package must contain all 8 head/body views (or all 12 legacy head/hair/body views)');
if(c.threeViews){
 if(!Array.isArray(c.threeViews)||c.threeViews.length!==3||new Set(c.threeViews.map(i=>i.view)).size!==3)throw Error('Include all three reference views');
 for(const item of c.threeViews){
  if(!['front','side','back'].includes(item.view)||typeof item.prompt!=='string')throw Error('Set front/side/back and the actual prompt');
  const bytes=await fs.readFile(path.resolve(base,item.file));imageInfo(bytes,'png');
  entries['three-view/'+item.view+'.png']=writeImageMetadata(bytes,{version:1,prompt:item.prompt,references:[]});
 }
}
await fs.writeFile(output,new Uint8Array(await zipStore(entries).arrayBuffer()),{flag:'wx'});console.log(output);

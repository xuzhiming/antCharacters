import {inspectPreviewGLTF} from './preview-gltf.mjs';

function dataLength(uri,mime){
  if(typeof uri!=='string'||!new RegExp('^data:('+mime+');base64,[A-Za-z0-9+/]*={0,2}$').test(uri))throw Error('テクスチャの埋込みデータが不正です。');
  try{const size=atob(uri.slice(uri.indexOf(',')+1)).length;if(!size)throw Error();return size;}
  catch{throw Error('テクスチャの埋込みデータが不正です。');}
}
function binaryLength(buffer){
  const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67)return 0;
  let size=0,found=false;
  for(let offset=12;offset<buffer.byteLength;){
    const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;
    if(type===0x004e4942){if(found)throw Error('テクスチャのバッファが不正です。');size=length;found=true;}
    offset+=length;
  }
  return size;
}
function textureInfos(value){
  const infos=[];
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
    if(key.endsWith('Texture'))infos.push(item);else infos.push(...textureInfos(item));
  }
  return infos;
}
function inspectTexture(json,info,binLength){
  const fail=()=>{throw Error('MToonのテクスチャ参照・埋込み範囲が不正です。');};
  const entry=(list,index)=>{
    if(!Number.isSafeInteger(index)||index<0||!Array.isArray(list)||!list[index]||typeof list[index]!=='object'||Array.isArray(list[index]))fail();
    return list[index];
  };
  const texture=entry(json.textures,info?.index),image=entry(json.images,texture.source);
  if(texture.sampler!==undefined)entry(json.samplers,texture.sampler);
  if(image.uri!==undefined){
    if(image.bufferView!==undefined)fail();
    dataLength(image.uri,'image/(png|jpeg|webp)');return;
  }
  if(!['image/png','image/jpeg','image/webp'].includes(image.mimeType))fail();
  const view=entry(json.bufferViews,image.bufferView),buffer=entry(json.buffers,view.buffer);
  const offset=view.byteOffset===undefined?0:view.byteOffset,length=view.byteLength,total=buffer.byteLength;
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<=0||
    !Number.isSafeInteger(total)||total<0||offset>total||length>total-offset)fail();
  if(buffer.uri!==undefined){if(dataLength(buffer.uri,'application/(octet-stream|gltf-buffer)')<total)fail();}
  else if(view.buffer!==0||total>binLength)fail();
}

// Validate bytes from the actual exported model, rather than an agent's report.
export function inspectMToonVRM(bytes){
  const buffer=bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const json=inspectPreviewGLTF(buffer,'vrm');
  const binLength=binaryLength(buffer);
  if(json.extensions?.VRMC_vrm?.specVersion!=='1.0')throw Error('MToonを適用したVRM 1.0を書き出してください。');
  const materials=json.materials??[],used=new Set();
  for(const mesh of json.meshes??[])for(const primitive of mesh.primitives??[]){
    if(!Number.isInteger(primitive.material)||!materials[primitive.material])throw Error('VRMにマテリアル未設定のメッシュがあります。');
    used.add(primitive.material);
  }
  if(!used.size||!json.extensionsUsed?.includes('VRMC_materials_mtoon'))throw Error('VRMの全マテリアルにMToonを適用してください。');
  for(const index of used){
    const material=materials[index];
    if(material.extensions?.VRMC_materials_mtoon?.specVersion!=='1.0')throw Error('MToonが未適用です: '+(material.name??index));
    for(const texture of textureInfos(material))inspectTexture(json,texture,binLength);
  }
  return {materials:used.size,mtoon:used.size,textures:json.textures?.length??0};
}

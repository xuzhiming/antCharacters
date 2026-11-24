import {crc32,safePath} from './archive.mjs';
const enc=new TextEncoder(),dec=new TextDecoder(),key='AvatarKit';
function chunks(bytes){
 const a=new Uint8Array(bytes),v=new DataView(a.buffer,a.byteOffset,a.byteLength),out=[];
 if(a.length<20||a.slice(0,8).join()!=='137,80,78,71,13,10,26,10')throw Error('PNGを選んでください。');
 for(let i=8;i<a.length;){if(i+12>a.length)throw Error('PNGが途切れています。');const n=v.getUint32(i),end=i+12+n;if(end>a.length)throw Error('PNGが途切れています。');const type=dec.decode(a.subarray(i+4,i+8));out.push({type,data:a.subarray(i+8,end-4),raw:a.subarray(i,end)});i=end;if(type==='IEND')return out;}
 throw Error('PNGの終端がありません。');
}
const isOurs=c=>c.type==='iTXt'&&dec.decode(c.data.subarray(0,c.data.indexOf(0)))===key;
// Keep the prompt, without dependencies on reference-image files. Read legacy metadata too.
export function withImagePrompt(bytes,prompt){
 return prompt!==null||readImageMetadata(bytes)?writeImageMetadata(bytes,{version:1,prompt,references:[]}):bytes;
}
export function readImageMetadata(bytes){
 const c=chunks(bytes).find(isOurs);if(!c)return null;
 const d=c.data;let pos=d.indexOf(0)+1;if(d[pos++]!==0||d[pos++]!==0)throw Error('非対応の画像メタデータです。');
 for(let i=0;i<2;i++){pos=d.indexOf(0,pos)+1;if(!pos)throw Error('画像メタデータが不正です。');}
 if(d.length-pos>1024*1024)throw Error('画像メタデータが大きすぎます。');
 const value=JSON.parse(dec.decode(d.subarray(pos)));validateMetadata(value);return value;
}
function validateMetadata(m){if(m.version!==1||!(m.prompt===null||typeof m.prompt==='string')||!Array.isArray(m.references)||m.references.length>64)throw Error('画像メタデータが不正です。');for(const ref of m.references)safePath(ref);}
export function writeImageMetadata(bytes,metadata){
 validateMetadata(metadata);const list=chunks(bytes).filter(c=>!isOurs(c));
 const text=enc.encode(JSON.stringify(metadata));if(text.length>1024*1024)throw Error('画像メタデータが大きすぎます。');
 const prefix=enc.encode(key+'\0\0\0\0\0'),payload=new Uint8Array(prefix.length+text.length);payload.set(prefix);payload.set(text,prefix.length);
 const chunk=new Uint8Array(payload.length+12),v=new DataView(chunk.buffer);v.setUint32(0,payload.length);chunk.set(enc.encode('iTXt'),4);chunk.set(payload,8);v.setUint32(chunk.length-4,crc32(chunk.subarray(4,chunk.length-4)));
 const parts=[new Uint8Array(bytes).subarray(0,8),list[0].raw,chunk,...list.slice(1).map(c=>c.raw)],result=new Uint8Array(parts.reduce((n,a)=>n+a.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}

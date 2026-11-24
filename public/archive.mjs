// Minimal ZIP32: write STORE, read STORE/DEFLATE. No executable archive entries.
const enc=new TextEncoder(), dec=new TextDecoder();
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export const crc32=a=>{let c=0xffffffff;for(const b of a)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function safePath(n){if(!n||n.startsWith('/')||n.includes('\\')||n.includes(':')||n.split('/').some(p=>p==='..'||p==='.'||p==='')||/[\x00-\x1f]/.test(n))throw Error('不正なファイルパスです。');return n;}
const bytes=x=>x instanceof Uint8Array?x:new Uint8Array(x);
export function zipStore(entries){
 const parts=[],central=[];let offset=0,total=0;if(Object.keys(entries).length>512)throw Error('ファイル数が多すぎます。');
 for(const [name,value] of Object.entries(entries)){
  safePath(name);const n=enc.encode(name),a=bytes(value),crc=crc32(a);total+=a.length;if(total>1024**3)throw Error('プロジェクトは1GB以内にしてください。');
  const local=new Uint8Array(30+n.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,a.length,true);v.setUint32(22,a.length,true);v.setUint16(26,n.length,true);local.set(n,30);parts.push(local,a);
  const c=new Uint8Array(46+n.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,crc,true);w.setUint32(20,a.length,true);w.setUint32(24,a.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=local.length+a.length;
 }
 const size=central.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
export async function unzip(input,{maxBytes=1024**3,maxEntries=512}={}){
 const a=bytes(input),v=new DataView(a.buffer,a.byteOffset,a.byteLength);let end=-1;
 for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===a.length){end=i;break;}
 if(end<0)throw Error('ZIP形式を読み取れません。');
 const count=v.getUint16(end+10,true);let p=v.getUint32(end+16,true),total=0;const out=Object.create(null);
 if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||count>maxEntries||p+v.getUint32(end+12,true)>end)throw Error('分割ZIP / ZIP64または大きすぎるZIPは使えません。');
 for(let i=0;i<count;i++){
  if(p+46>end||v.getUint32(p,true)!==0x02014b50)throw Error('ZIPの目録が不正です。');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),packed=v.getUint32(p+20,true),size=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),start=v.getUint32(p+42,true);
  if(p+46+nl+el+cl>end)throw Error('ZIPの目録が途切れています。');const name=dec.decode(a.subarray(p+46,p+46+nl));p+=46+nl+el+cl;
  if(name.endsWith('/'))continue;safePath(name);if(Object.hasOwn(out,name))throw Error('同名ファイルが重複しています。');
  total+=size;if(total>maxBytes||flags&1||![0,8].includes(method)||start+30>a.length)throw Error('暗号化・非対応圧縮、または展開サイズの上限を超えています。');
  if(v.getUint32(start,true)!==0x04034b50)throw Error('ZIPデータが不正です。');
  const pos=start+30+v.getUint16(start+26,true)+v.getUint16(start+28,true);if(pos+packed>end)throw Error('ZIPが途切れています。');
  let data=a.slice(pos,pos+packed);
  if(method===8){
   const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const chunks=[];let length=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>size||length>maxBytes)throw Error('展開サイズが不正です。');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   data=new Uint8Array(length);let off=0;for(const c of chunks){data.set(c,off);off+=c.length;}
  }
  if(data.length!==size||crc32(data)!==crc)throw Error('ファイルの破損を検出しました。');out[name]=data;
 }
 return out;
}

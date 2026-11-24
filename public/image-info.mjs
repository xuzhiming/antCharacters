// Read dimensions without re-encoding image bytes. Browser imports also decode below.
// JPEG: ITU T.81 B.2.2; WebP: developers.google.com/speed/webp/docs/riff_container
export function imageInfo(bytes, extension) {
 const a=new Uint8Array(bytes),v=new DataView(a.buffer,a.byteOffset,a.byteLength);
 const text=(i,n)=>String.fromCharCode(...a.subarray(i,i+n));
 const invalid=()=>{throw Error('画像の形式・サイズを確認してください。');};
 if(a.length>20*1024**2)throw Error('画像は20MB以内にしてください。');
 let mime,width,height;
 if(a.length>=33&&a.subarray(0,8).join()==='137,80,78,71,13,10,26,10'&&text(12,4)==='IHDR'){
  mime='image/png';width=v.getUint32(16);height=v.getUint32(20);
 }else if(a.length>=4&&a[0]===255&&a[1]===216){
  mime='image/jpeg';
  for(let i=2;i<a.length;){
   if(a[i++]!==255)invalid();while(a[i]===255)i++;
   const marker=a[i++];if(marker===0xda||marker===0xd9)break;
   if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
   if(i+2>a.length)invalid();const length=v.getUint16(i);if(length<2||i+length>a.length)invalid();
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    if(length<8)invalid();height=v.getUint16(i+3);width=v.getUint16(i+5);break;
   }
   i+=length;
  }
 }else if(a.length>=20&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'){
  mime='image/webp';const end=v.getUint32(4,true)+8;if(end>a.length)invalid();
  for(let i=12;i+8<=end;){
   const kind=text(i,4),size=v.getUint32(i+4,true),p=i+8;if(p+size>end)invalid();
   if(kind==='VP8X'&&size>=10){
    const u24=j=>a[j]+a[j+1]*256+a[j+2]*65536;width=u24(p+4)+1;height=u24(p+7)+1;break;
   }
   if(kind==='VP8L'&&size>=5&&a[p]===0x2f){
    const bits=v.getUint32(p+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;break;
   }
   if(kind==='VP8 '&&size>=10&&a[p+3]===0x9d&&a[p+4]===1&&a[p+5]===0x2a){
    width=v.getUint16(p+6,true)&0x3fff;height=v.getUint16(p+8,true)&0x3fff;break;
   }
   i=p+size+(size%2);
  }
 }
 if(!mime||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=8192))invalid();
 if(extension&&mime!==({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'})[extension.toLowerCase()])invalid();
 return {mime,width,height};
}

export async function inspectImage(bytes,extension){
 const info=imageInfo(bytes,extension);
 if(typeof createImageBitmap==='function'){
  const bitmap=await createImageBitmap(new Blob([bytes],{type:info.mime}));
  info.width=bitmap.width;info.height=bitmap.height;bitmap.close();
 }
 return info;
}

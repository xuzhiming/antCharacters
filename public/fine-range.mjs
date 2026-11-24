// A small window around the current value. Numeric inputs keep the full range.
export function fineRange(key,value){
 const settings={scale:{radius:.1,min:.1,max:3,step:.001},position:{radius:.05,min:-2,max:2,step:.0001},rotation:{radius:10,min:-180,max:180,step:.1}};
 const s=settings[key];if(!s||!Number.isFinite(value))throw Error('Invalid transform range');
 const min=Math.max(s.min,Math.min(value-s.radius,s.max-2*s.radius));
 return {min:Number(min.toFixed(4)),max:Number((min+2*s.radius).toFixed(4)),step:s.step};
}

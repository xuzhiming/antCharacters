export const LOCALES=Object.freeze({
 ja:Object.freeze({label:'日本語',title:'アバターキット',tutorial:'tutorial.ja.md'}),
 en:Object.freeze({label:'English',title:'Avatar Kit',tutorial:'tutorial.md'}),
 ko:Object.freeze({label:'한국어',title:'아바타 키트',tutorial:'tutorial.ko.md'}),
 'zh-CN':Object.freeze({label:'简体中文',title:'角色制作套件',tutorial:'tutorial.zh-CN.md'})
});
export function normalizeLocale(value){
 const tag=typeof value==='string'?value.toLowerCase().replaceAll('_','-'):'';
 if(/^zh(?:-|$)/.test(tag))return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(tag)?'en':'zh-CN';
 const code=tag.split('-')[0];
 return Object.hasOwn(LOCALES,code)?code:'en';
}
export const localeInfo=value=>LOCALES[normalizeLocale(value)];

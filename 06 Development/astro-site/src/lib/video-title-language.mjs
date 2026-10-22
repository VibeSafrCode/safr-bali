// Media title language is source metadata, not the interface locale. Never infer
// it from script, country, hostname, video ID or a previously displayed item.
const TITLE_LANGUAGES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);

export function videoTitleLanguage(value) {
 return typeof value==='string'&&TITLE_LANGUAGES.includes(value)?value:'und';
}

// One synchronous caption commit updates text and language, including known→
// unknown replacements. `und` deliberately prevents inheritance of the UI lang.
export function applyNativeVideoTitle(node,video) {
 if (!video || typeof video.title!=='string') throw new TypeError('Invalid media title');
 const language=videoTitleLanguage(video.titleLanguage);
 node.textContent=video.title;
 node.setAttribute('lang',language);
}

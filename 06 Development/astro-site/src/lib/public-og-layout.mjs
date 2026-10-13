import {publicOgTypeface} from "./public-og-typeface.mjs";
export const PUBLIC_OG_TITLE_BOX = Object.freeze({left:72,top:202,width:1056,height:310});
const sizes=Object.freeze([54,50,46,42,38,34,30,26,22,20]);
const escape=value=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
function validateTitle(title){
 if(typeof title!=="string"||title.length===0||title.length>2048||title.trim().length===0||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(title)||!title.isWellFormed())throw new Error("Invalid OG title");
}
export function publicOgTitleInput(title,locale,fontSize=54){
 validateTitle(title);const face=publicOgTypeface(locale);
 if(!sizes.includes(fontSize))throw new Error("Invalid OG font size");
 // Full supplied title is escaped once, never split/truncated or interpreted as markup.
 // A presentation-only RTL mark establishes the base direction for mixed Latin codes.
 const markup='<span foreground="#f5f1e7" lang="'+escape(face.language)+'" font_family="'+escape(face.families.join(","))+'" insert_hyphens="false">'+(locale==="ar"?"\u200f":"")+escape(title)+'</span>';
 return Object.freeze({text:markup,font:face.families[0]+" "+fontSize,width:PUBLIC_OG_TITLE_BOX.width,dpi:72,rgba:true,wrap:"word-char",align:locale==="ar"?"right":"left"});
}
export async function renderPublicOgTitle(sharp,title,locale){
 if(typeof sharp!=="function")throw new Error("OG renderer unavailable");
 validateTitle(title);publicOgTypeface(locale);
 for(const fontSize of sizes){
  const {data,info}=await sharp({text:publicOgTitleInput(title,locale,fontSize)}).png().toBuffer({resolveWithObject:true});
  if(!info||!Number.isSafeInteger(info.width)||!Number.isSafeInteger(info.height)||info.width<1||info.height<1)throw new Error("Invalid OG text dimensions");
  if(info.width<=PUBLIC_OG_TITLE_BOX.width&&info.height<=PUBLIC_OG_TITLE_BOX.height){
   return Object.freeze({data,info:Object.freeze({...info}),fontSize,left:PUBLIC_OG_TITLE_BOX.left+(locale==="ar"?PUBLIC_OG_TITLE_BOX.width-info.width:0),top:PUBLIC_OG_TITLE_BOX.top});
  }
 }
 throw new Error("Complete OG title does not fit"); // Never hide the tail behind a successful render.
}

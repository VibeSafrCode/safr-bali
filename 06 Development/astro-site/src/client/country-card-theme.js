// Decode before swapping; failed night assets leave the approved daytime photo.
const cards=Array.from(document.querySelectorAll('[data-country-theme-image]')).map(image=>({image,daySrc:image.getAttribute('src'),daySet:image.getAttribute('srcset')}));
let generation=0;
async function updateCards(){
 const current=++generation;
 const dark=document.documentElement.dataset.theme==='dark';
 await Promise.all(cards.map(async({image,daySrc,daySet})=>{
  const src=dark?image.dataset.nightSrc:daySrc;
  const srcset=dark?image.dataset.nightSrcset:daySet;
  const candidate=new Image();candidate.sizes=image.sizes;
  if(srcset)candidate.srcset=srcset;
  candidate.src=src;
  try{await candidate.decode();}catch{return;}
  if(current!==generation)return;
  if(srcset)image.setAttribute('srcset',srcset);else image.removeAttribute('srcset');
  image.src=src;
 }));
}
new MutationObserver(updateCards).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
void updateCards();

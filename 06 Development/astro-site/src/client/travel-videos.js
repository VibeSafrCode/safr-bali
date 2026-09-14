const section=document.querySelector('[data-travel-videos]');
const rail=section?.querySelector('[data-video-carousel]');
if(rail instanceof HTMLElement){
 const previous=section.querySelector('[data-video-prev]'),next=section.querySelector('[data-video-next]');
 const update=()=>{previous.disabled=rail.scrollLeft<2;next.disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2;};
 const move=direction=>rail.scrollBy({left:direction*rail.clientWidth*.85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));rail.addEventListener('scroll',update,{passive:true});new ResizeObserver(update).observe(rail);update();
}

const section=document.querySelector('[data-travel-videos]');
const player=section?.querySelector('[data-playlist-player]');
if(player instanceof HTMLElement){
 const launch=player.querySelector('[data-playlist-launch]'),close=player.querySelector('[data-playlist-close]'),slot=player.querySelector('[data-playlist-frame]');
 launch.addEventListener('click',()=>{
  const id=player.dataset.playlistId;
  if(!id || !/^[A-Za-z0-9_-]+$/.test(id) || slot.childElementCount) return;
  const frame=document.createElement('iframe');
  frame.src=`https://www.youtube-nocookie.com/embed?listType=playlist&list=${encodeURIComponent(id)}&autoplay=0&playsinline=1`;
  frame.title='YouTube · SAFRWAY';frame.allow='encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  slot.append(frame);launch.hidden=true;close.hidden=false;frame.focus({preventScroll:true});
 });
 close.addEventListener('click',()=>{slot.replaceChildren();close.hidden=true;launch.hidden=false;launch.focus({preventScroll:true});});
}
const rail=section?.querySelector('[data-video-carousel]');
if(rail instanceof HTMLElement){
 const previous=section.querySelector('[data-video-prev]'),next=section.querySelector('[data-video-next]');
 const update=()=>{previous.disabled=rail.scrollLeft<2;next.disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2;};
 const move=direction=>rail.scrollBy({left:direction*rail.clientWidth*.85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));rail.addEventListener('scroll',update,{passive:true});new ResizeObserver(update).observe(rail);update();
}

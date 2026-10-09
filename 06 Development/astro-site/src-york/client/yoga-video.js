/** One pinned public video; no playlist/API transport or page-load playback. */
export function mountYogaVideo(section,doc=section.ownerDocument) {
  const watch=section.querySelector('[data-video-watch]');
  const slot=section.querySelector('[data-video-frame]');
  const close=section.querySelector('[data-video-close]');
  if(!watch||!slot||!close)return ()=>{};
  const src=section.dataset.embedUrl;
  const video=/^https:\/\/www\.youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})\?autoplay=1&playsinline=1&rel=0$/.exec(src??'');
  if(!video)return ()=>{};
  const poster=section.querySelector('[data-video-poster]');
  if(poster){poster.src=`https://i.ytimg.com/vi/${video[1]}/hqdefault.jpg`;poster.hidden=false;}
  const hide=restoreFocus=>{
    slot.replaceChildren();slot.hidden=true;watch.hidden=false;close.hidden=true;
    if(restoreFocus)watch.focus({preventScroll:true});
  };
  const open=event=>{
    if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button>0)return;
    event.preventDefault();
    if(slot.childElementCount)return;
    const frame=doc.createElement('iframe');
    frame.src=src;frame.title=section.dataset.frameTitle??'YouTube';
    frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
    slot.append(frame);slot.hidden=false;watch.hidden=true;close.hidden=false;
    close.focus({preventScroll:true});
  };
  const dismiss=()=>hide(true);
  const key=event=>{if(event.key==='Escape'&&slot.childElementCount){event.preventDefault();hide(true);}};
  const leave=()=>hide(false);
  watch.addEventListener('click',open);close.addEventListener('click',dismiss);
  section.addEventListener('keydown',key);doc.defaultView?.addEventListener('pagehide',leave);
  return ()=>{leave();watch.removeEventListener('click',open);close.removeEventListener('click',dismiss);section.removeEventListener('keydown',key);doc.defaultView?.removeEventListener('pagehide',leave);};
}
if(typeof document!=='undefined')document.querySelectorAll('[data-yoga-video]').forEach(section=>mountYogaVideo(section));

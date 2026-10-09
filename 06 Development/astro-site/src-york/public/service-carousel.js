export const CAROUSEL_INTERVAL=7000;
export function loopPosition(current,start,span) {
  return span>0?start+((current-start)%span+span)%span:0;
}
/** One animation owner. Commands use a logical target, never an in-flight offset. */
export function createLoopTrack(track,view,onIdle=()=>{}) {
  const originals=[...track.querySelectorAll('.carousel-slide')];
  let copies=[],span=0,start=0,step=0,position=0,target=0,valid=false;
  let frame=null,generation=0,lastWritten=null,measuredWidth=0,measuredViewport=0;
  const raf=view?.requestAnimationFrame?.bind(view);
  const caf=view?.cancelAnimationFrame?.bind(view);
  const now=()=>view?.performance?.now?.()??Date.now();
  const enabled=()=>valid&&originals.length>1;
  const moving=()=>frame!==null;
  const write=left=>{lastWritten=left;track.scrollTo({left,behavior:'instant'});};
  const render=value=>{position=value;write(loopPosition(start+value,start,span));};
  const abortFrame=()=>{generation++;if(frame!==null)caf?.(frame);frame=null;};
  const readNative=()=>{if(enabled()){position=track.scrollLeft-start;target=position;}};
  const cancel=()=>{abortFrame();readNative();};
  const layout=()=>{
    const width=originals[0]?.getBoundingClientRect().width??0;
    const viewport=track.clientWidth;
    if(width<1||viewport<1){abortFrame();valid=false;return false;}
    if(valid&&width===measuredWidth&&viewport===measuredViewport)return false;
    const phase=span?loopPosition(position,0,span)/span:0;
    abortFrame();copies.forEach(copy=>copy.remove());copies=[];
    const rawGap=Number.parseFloat(view?.getComputedStyle?.(track).columnGap??'12');
    const gap=Number.isFinite(rawGap)?rawGap:12;
    measuredWidth=width;measuredViewport=viewport;step=width+gap;
    span=step*originals.length;start=0;valid=true;
    if(!enabled()){position=target=0;write(0);return true;}
    // Room for native touch momentum. Rebase only after the gesture settles.
    const sides=Math.max(4,Math.ceil(viewport/span)+2);
    const copySet=()=>originals.map(slide=>{
      const copy=slide.cloneNode(true);
      copy.setAttribute('data-carousel-copy','');copy.setAttribute('aria-hidden','true');
      copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
      copy.querySelectorAll('a,button,input,select,textarea,[tabindex]').forEach(node=>node.setAttribute('tabindex','-1'));
      copies.push(copy);return copy;
    });
    const before=[],after=[];
    for(let i=0;i<sides;i++){before.push(...copySet());after.push(...copySet());}
    track.prepend(...before);track.append(...after);start=sides*span;
    target=phase*span;render(target);return true;
  };
  const recenter=()=>{
    if(!enabled()||moving())return;
    const left=loopPosition(track.scrollLeft,start,span);
    if(Math.abs(left-track.scrollLeft)>.5)write(left);
    position=left-start;target=position;
  };
  const move=(direction,reduce)=>{
    if(!enabled())return;
    if(!moving()){readNative();target=Math.round(position/step)*step;}
    target+=direction*step;
    const from=position,to=target;
    abortFrame();const request=generation;
    if(reduce||!raf){render(to);recenter();onIdle();return;}
    const began=now(),duration=Math.min(620,300+60*Math.abs(to-from)/step);
    const tick=time=>{
      if(request!==generation)return;
      const progress=Math.min(1,Math.max(0,(time-began)/duration));
      render(from+(to-from)*(1-(1-progress)**3));
      if(progress<1)frame=raf(tick);
      else{frame=null;recenter();onIdle();}
    };
    frame=raf(tick);
  };
  const pan=delta=>{if(enabled()){position+=delta;target=position;render(position);}};
  const reveal=node=>{
    const slide=node?.closest?.('.carousel-slide');const index=originals.indexOf(slide);
    if(index<0||!enabled())return;
    cancel();const left=start+index*step,right=left+measuredWidth;
    if(left<track.scrollLeft)write(left);
    else if(right>track.scrollLeft+track.clientWidth)write(right-track.clientWidth);
    readNative();
  };
  layout();
  return {enabled,moving,layout,move,pan,recenter,readNative,cancel,reveal,first:originals[0],count:originals.length,
    ownScroll:()=>lastWritten!==null&&Math.abs(track.scrollLeft-lastWritten)<.5,
    dispose(){abortFrame();const left=loopPosition(position,0,span);copies.forEach(copy=>copy.remove());copies=[];write(left);valid=false;}};
}

/** Native touch scrolling; controlled arrow motion and optional mouse dragging. */
export function initServiceCarousels(doc) {
  const dispose=[],view=doc.defaultView;
  for(const carousel of doc.querySelectorAll('[data-service-carousel]')) {
    if(carousel.hasAttribute('data-carousel-ready'))continue;
    const track=carousel.querySelector('[data-carousel-track]');
    const previous=carousel.querySelector('[data-carousel-prev]'),next=carousel.querySelector('[data-carousel-next]'),play=carousel.querySelector('[data-carousel-play]');
    if(!track||!previous||!next||!play)continue;
    const reduce=view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    let paused=Boolean(reduce?.matches),hovered=false,focused=false,resumeIntent=false;
    let timer=null,idleTimer=null,pointerIntent=null,gesture=null,touchActive=false,nativeMoving=false,suppressClick=false,clickTimer=null;
    let pendingLayout=false,motionSource=null;
    const listeners=[],later=(fn,ms)=>(view?.setTimeout??setTimeout)(fn,ms),clear=id=>(view?.clearTimeout??clearTimeout)(id);
    const listen=(node,type,fn,options)=>{node?.addEventListener?.(type,fn,options);listeners.push(()=>node?.removeEventListener?.(type,fn,options));};
    const stop=()=>{if(timer!==null)clear(timer);timer=null;};
    const stopIdle=()=>{if(idleTimer!==null)clear(idleTimer);idleTimer=null;};
    let schedule=()=>{};
    const loop=createLoopTrack(track,view,()=>{motionSource=null;settle();});
    const cancelMotion=()=>{loop.cancel();motionSource=null;};
    const label=()=>{
      play.setAttribute('aria-pressed',String(paused));play.dataset.paused=String(paused);
      play.setAttribute('aria-label',reduce?.matches?play.dataset.reducedLabel:paused?play.dataset.playLabel:play.dataset.pauseLabel);
    };
    schedule=()=>{
      stop();const unavailable=!loop.enabled();
      previous.disabled=unavailable;next.disabled=unavailable;play.disabled=unavailable||Boolean(reduce?.matches);
      if(paused||((hovered||focused)&&!resumeIntent)||gesture||touchActive||nativeMoving||loop.moving()||doc.visibilityState==='hidden'||reduce?.matches||unavailable)return;
      timer=later(()=>{timer=null;motionSource='auto';loop.move(1,false);schedule();},CAROUSEL_INTERVAL);
    };
    const manual=()=>{paused=true;resumeIntent=false;label();stop();};
    const flushLayout=()=>{if(pendingLayout&&!gesture&&!touchActive){pendingLayout=false;loop.layout();motionSource=null;}};
    function settle(){
      stopIdle();if(gesture||touchActive||loop.moving())return;
      nativeMoving=false;flushLayout();
      if(!focused)loop.recenter();schedule();
    }
    const waitIdle=()=>{stopIdle();idleTimer=later(()=>{idleTimer=null;settle();},160);};
    const moveManual=direction=>{
      manual();if(gesture||touchActive)return;
      stopIdle();flushLayout();nativeMoving=false;motionSource='manual';loop.move(direction,Boolean(reduce?.matches));
    };
    listen(previous,'click',()=>moveManual(-1));
    listen(next,'click',()=>moveManual(1));
    listen(play,'pointerdown',()=>{pointerIntent=!paused;});
    listen(play,'pointercancel',()=>{pointerIntent=null;});listen(play,'keydown',()=>{pointerIntent=null;});
    listen(play,'click',()=>{
      if(reduce?.matches)return;
      const intent=pointerIntent??!paused;
      play.focus?.({preventScroll:true});
      paused=intent;pointerIntent=null;resumeIntent=!paused;
      if(paused)cancelMotion();
      label();schedule();
    });
    listen(track,'pointerdown',event=>{
      if((event.button??0)!==0||!loop.enabled())return;
      stop();cancelMotion();stopIdle();nativeMoving=false;suppressClick=false;
      gesture={id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY,lastX:event.clientX,dragged:false};
    });
    listen(track,'pointermove',event=>{
      if(!gesture||event.pointerId!==gesture.id)return;
      const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
      if(!gesture.dragged&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){gesture.dragged=true;manual();}
      if(gesture.type==='mouse'&&gesture.dragged){
        event.preventDefault();track.setPointerCapture?.(gesture.id);track.setAttribute('data-dragging','');
        loop.pan(gesture.lastX-event.clientX);
      }
      gesture.lastX=event.clientX;
    });
    const release=event=>{
      if(!gesture||event.pointerId!==gesture.id)return;
      const {dragged,id}=gesture;gesture=null;
      if(track.hasPointerCapture?.(id))track.releasePointerCapture?.(id);
      track.removeAttribute('data-dragging');
      if(dragged){suppressClick=true;if(clickTimer!==null)clear(clickTimer);clickTimer=later(()=>{suppressClick=false;clickTimer=null;},350);}
      waitIdle();
    };
    listen(doc,'pointerup',release);listen(doc,'pointercancel',release);
    listen(track,'lostpointercapture',release);
    listen(track,'touchstart',()=>{touchActive=true;stop();},{passive:true});
    const touchEnd=event=>{touchActive=Boolean(event.touches?.length);if(!touchActive)waitIdle();};
    listen(doc,'touchend',touchEnd,{passive:true});listen(doc,'touchcancel',touchEnd,{passive:true});
    listen(track,'click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
    listen(track,'dragstart',event=>event.preventDefault());
    // Copies keep native link clicks but never receive hidden mouse focus.
    listen(track,'mousedown',event=>{if(event.target.closest?.('[data-carousel-copy]'))event.preventDefault();});
    listen(track,'wheel',event=>{if(Math.abs(event.deltaX??0)>0||event.shiftKey){manual();cancelMotion();nativeMoving=true;waitIdle();}});
    listen(track,'scroll',()=>{
      if(loop.moving()||loop.ownScroll()||gesture?.type==='mouse')return;
      if(gesture||touchActive)manual();
      loop.readNative();nativeMoving=true;stop();waitIdle();
    });
    listen(track,'scrollend',()=>{if(nativeMoving&&!gesture&&!touchActive&&!loop.moving())settle();});
    listen(carousel,'pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;resumeIntent=false;if(motionSource==='auto')cancelMotion();schedule();}});
    listen(carousel,'pointerleave',()=>{hovered=false;schedule();});
    listen(carousel,'focusin',event=>{
      focused=true;manual();if(motionSource==='auto')cancelMotion();
      if(event.target?.closest?.('.carousel-slide')){loop.reveal(event.target);motionSource=null;}
    });
    listen(carousel,'focusout',event=>{if(!carousel.contains(event.relatedTarget)){focused=false;settle();}});
    const dropGesture=()=>{const id=gesture?.id;gesture=null;touchActive=false;track.removeAttribute('data-dragging');if(id!==undefined&&track.hasPointerCapture?.(id))track.releasePointerCapture?.(id);};
    listen(doc,'visibilitychange',()=>{if(doc.visibilityState==='hidden'){dropGesture();stopIdle();nativeMoving=false;cancelMotion();}else if(pendingLayout){pendingLayout=false;loop.layout();}schedule();});
    const resize=()=>{
      if(gesture||touchActive||nativeMoving){pendingLayout=true;return;}
      if(loop.layout()){motionSource=null;nativeMoving=false;stopIdle();}schedule();
    };
    listen(view,'resize',resize);
    const observer=view?.ResizeObserver?new view.ResizeObserver(resize):null;
    observer?.observe(track);if(loop.first)observer?.observe(loop.first);
    listen(reduce,'change',()=>{if(reduce.matches){manual();cancelMotion();}label();schedule();});
    carousel.setAttribute('data-carousel-ready','');if(loop.count<2)carousel.setAttribute('data-carousel-static','');
    label();schedule();
    dispose.push(()=>{stop();stopIdle();if(clickTimer!==null)clear(clickTimer);observer?.disconnect();listeners.forEach(remove=>remove());dropGesture();loop.dispose();carousel.removeAttribute('data-carousel-ready');carousel.removeAttribute('data-carousel-static');});
  }
  return ()=>dispose.forEach(remove=>remove());
}
if(typeof document!=='undefined')initServiceCarousels(document);

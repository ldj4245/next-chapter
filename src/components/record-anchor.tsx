'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function RecordAnchor() {
  const pathname=usePathname();
  useEffect(()=>{
    let observer:MutationObserver|undefined,stop:ReturnType<typeof setTimeout>|undefined;
    function watch(){
      observer?.disconnect();clearTimeout(stop);
      let id='';try{id=decodeURIComponent(window.location.hash.slice(1));}catch{return;}
      if(!/^(?:task|reflection|session|week-review|goal|note|memo|revisit|resource|bookmark)-[a-zA-Z0-9-]+$/.test(id))return;
      const reveal=()=>{
        const target=document.getElementById(id);if(!target)return;
        for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement&&!parent.open)parent.open=true;
        if(target.closest('[hidden]'))return;
        requestAnimationFrame(()=>target.scrollIntoView({block:'center',behavior:'auto'}));observer?.disconnect();clearTimeout(stop);
      };
      observer=new MutationObserver(reveal);observer.observe(document.getElementById('main')??document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
      reveal();stop=setTimeout(()=>observer?.disconnect(),15000);
    }
    watch();window.addEventListener('hashchange',watch);
    return()=>{observer?.disconnect();clearTimeout(stop);window.removeEventListener('hashchange',watch);};
  },[pathname]);
  return null;
}

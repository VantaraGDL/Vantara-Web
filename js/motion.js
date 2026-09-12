// Presentation only: no product state, navigation or request handling.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sections = '.hero-content,.featured-catalog,#new-releases,.home-discovery,.catalog-header,#catalog-products,.product-gallery,.product-data,.outfit,.related-section,.about-hero,.about-content,.about-cta,.contact-header,.contact-options,.contact-info';
const seen = new WeakSet();
const active = new Set();
const effects = new WeakMap();
const tokens = getComputedStyle(document.body);
const duration = name => parseFloat(tokens.getPropertyValue(name)) || 180;
function fade(element, entrance = false) {
    if (reduced.matches || !element?.isConnected || !element.animate) return;
    effects.get(element)?.cancel();
    const effect = element.animate(entrance
        ? [{opacity:0,translate:'0 var(--motion-distance)'},{opacity:1,translate:'0 0'}]
        : [{opacity:.8},{opacity:1}],
        {duration:duration(entrance?'--motion-entry':'--motion-fast'),easing:tokens.getPropertyValue('--motion-ease').trim() || 'ease-out'});
    effects.set(element,effect);active.add(effect);
    const clear=()=>active.delete(effect);effect.onfinish=clear;effect.oncancel=clear;
}
const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);entry.target.classList.add('is-visible');fade(entry.target,true);}
},{threshold:0,rootMargin:'0px 0px 48px 0px'}) : null;
function register(root) {
    if(!(root instanceof Element))return;
    const elements=[...(root.matches(sections)?[root]:[]),...root.querySelectorAll(sections)];
    for(const element of elements)if(!seen.has(element)){
        seen.add(element);
        if(element.parentElement?.closest(sections))continue;
        element.classList.add('reveal');
        if(observer&&!reduced.matches)observer.observe(element);
    }
}
register(document.body);
// Product sections arrive asynchronously; batch only changed elements, not scroll events.
new MutationObserver(records=>{
    const changed=new Set();
    for(const record of records){
        record.addedNodes.forEach(register);
        const target=record.target instanceof Element?record.target:record.target.parentElement;
        const feedback=target?.closest('#order-summary,.low-stock-note');
        if(feedback?.textContent.trim())changed.add(feedback);
    }
    changed.forEach(element=>fade(element));
}).observe(document.body,{childList:true,subtree:true,characterData:true});
document.addEventListener('load',event=>{if(event.target.id==='main-product-image')fade(event.target);},true);

document.addEventListener('focusin',event=>{
    // Never let reveal hide or move a control while it is being used.
    const section=event.target.closest('.reveal');
    if(section){observer?.unobserve(section);effects.get(section)?.cancel();}
});
reduced.addEventListener('change',()=>{
    if(reduced.matches){observer?.disconnect();active.forEach(effect=>effect.cancel());active.clear();}
});

export function renderNewReleases(products) {
    const root = document.querySelector('#new-releases');
    if (!root) return;
    const releases = products.filter(p => p.published && p.newRelease).sort((a,b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || b.id - a.id);
    root.hidden = !releases.length;
    root.closest('.featured').classList.toggle('without-releases', !releases.length);
    if (!releases.length) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const stage = root.querySelector('.release-stage');
    const controls = root.querySelector('.release-controls');

    let current = 0, timer, hovered = false, focused = false;
    let pointerFocusedDot = null;
    const slides = releases.map((product,index) => {
        const link = document.createElement('a');
        link.className = 'release-slide'; link.href = `producto.html?id=${product.id}`;
        link.hidden = index !== 0;
        link.setAttribute('aria-label', `${product.name || product.model} — Ver producto`);
        if (product.images[0]) {
            const image = document.createElement('img');
            image.src = product.images[0]; image.alt = ''; image.loading = 'lazy';
            link.append(image);
        }
        const copy = document.createElement('div'); copy.className = 'release-copy';
        const add = (tag,cls,text) => {const el=document.createElement(tag);el.className=cls;el.textContent=text;copy.append(el);};
        add('p','release-label','NUEVO LANZAMIENTO');
        add('p','release-brand',product.brand);
        add('h3','release-name',product.name || product.model);
        add('span','release-cta','VER PRODUCTO →');
        link.append(copy);stage.append(link);return link;
    });
    const dots = releases.length < 2 ? [] : releases.map((product,index) => {
        const dot = document.createElement('button');
        dot.type = 'button'; dot.className = 'release-dot';
        dot.setAttribute('aria-label', 'Ver lanzamiento ' + (index + 1));
        dot.addEventListener('click', event => {
            stop();
            // Pointer clicks leave focus on the button. Preserve that focus without
            // treating it as keyboard navigation; hover still pauses as usual.
            pointerFocusedDot = event.detail > 0 ? dot : null;
            focused = root.contains(document.activeElement) && document.activeElement !== pointerFocusedDot;
            show(index);
            schedule();
        });
        controls.append(dot);return dot;
    });
    function stop(){clearTimeout(timer);timer=undefined;}
    function schedule(){
        stop();
        if(releases.length<2 || motion.matches || hovered || focused || document.hidden)return;
        timer=setTimeout(()=>{show(current+1);schedule();},4000);
    }
    function show(index){
        slides[current].hidden=true;current=(index+slides.length)%slides.length;
        slides[current].hidden=false;
        dots.forEach((dot,i)=>{if(i===current)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});
    }
    controls.hidden=releases.length<2;
    root.classList.toggle('has-release-dots', releases.length>1);
    root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;stop();}});
    root.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'){hovered=false;schedule();}});
    root.addEventListener('focusin',()=>{pointerFocusedDot=null;focused=true;stop();});
    root.addEventListener('keydown',()=>{pointerFocusedDot=null;focused=true;stop();});
    root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget)){pointerFocusedDot=null;focused=false;schedule();}});
    motion.addEventListener('change',schedule);
    document.addEventListener('visibilitychange',schedule);
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',schedule);
    show(0);schedule();
}

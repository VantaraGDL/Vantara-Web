import {renderNewReleases} from './new-releases.js?v=releases-2';
import {catalogApi} from './catalog-api.js?v=production-fixes-1';
import {createProductCard} from './product-ui.js?v=collection-cart-2';
const container=document.querySelector('#featured-products');
function setupFeaturedRow() {
    const controls=document.createElement('div');
    controls.className='featured-row-controls';controls.hidden=true;
    const previous=document.createElement('button'),next=document.createElement('button');
    for(const [button,label,text] of [[previous,'Productos anteriores','←'],[next,'Productos siguientes','→']]){
        button.type='button';button.setAttribute('aria-label',label);
        button.setAttribute('aria-controls',container.id);button.textContent=text;controls.append(button);
    }
    container.closest('.featured-catalog').querySelector('.section-header a').before(controls);
    container.tabIndex=0;container.setAttribute('role','region');container.setAttribute('aria-labelledby','featured-title');
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>{
        const end=Math.max(0,container.scrollWidth-container.clientWidth);
        controls.hidden=end<=2;
        previous.disabled=container.scrollLeft<=2;
        next.disabled=container.scrollLeft>=end-2;
    };
    const move=direction=>{
        const card=container.firstElementChild;
        const gap=parseFloat(getComputedStyle(container).columnGap)||0;
        container.scrollBy({left:direction*(card.getBoundingClientRect().width+gap),behavior:motion.matches?'instant':'smooth'});
    };
    previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    container.addEventListener('scroll',sync,{passive:true});
    container.addEventListener('keydown',event=>{
        if(event.target!==container||!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();move(event.key==='ArrowLeft'?-1:1);
    });
    const observer=new ResizeObserver(sync);observer.observe(container);
    sync();
}
const status=document.createElement('p');
status.setAttribute('role','status');status.textContent='Cargando destacados…';container.before(status);
try {
    const products=await catalogApi.loadProducts();
    renderNewReleases(products);
    const featured=products.filter(p=>p.featured);
    featured.forEach(p=>container.append(createProductCard(p)));
    if(featured.length)setupFeaturedRow();
    status.textContent=featured.length ? (featured.some(p=>p.imageError)?'Algunas imágenes no pudieron cargarse.':'') : 'No hay productos destacados disponibles por el momento.';
}catch{
    status.setAttribute('role','alert');status.textContent='No se pudieron cargar los destacados. Recarga la página para reintentar.';
}

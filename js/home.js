import {catalogApi} from './catalog-api.js';
import {createProductCard} from './product-ui.js';
const container=document.querySelector('#featured-products');
const status=document.createElement('p');
status.setAttribute('role','status');status.textContent='Cargando destacados…';container.before(status);
try {
    const products=await catalogApi.loadProducts();
    const featured=products.filter(p=>p.featured);
    featured.forEach(p=>container.append(createProductCard(p)));
    status.textContent=featured.length ? (featured.some(p=>p.imageError)?'Algunas imágenes no pudieron cargarse.':'') : 'No hay productos destacados disponibles por el momento.';
}catch{
    status.setAttribute('role','alert');status.textContent='No se pudieron cargar los destacados. Recarga la página para reintentar.';
}

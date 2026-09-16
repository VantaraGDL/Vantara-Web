// Metadata only. Never publish blob URLs, credentials or private Storage paths.
const origin = 'https://vantaragdl.com';
const fallback = origin + '/assets/img/fondo-homepage.png';
function meta(key, value, property = false) {
  const attr = property ? 'property' : 'name';
  let node = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!node) { node = document.createElement('meta'); node.setAttribute(attr,key); document.head.append(node); }
  node.content = value;
}
function publicImage(path) {
  // Repository images are publicly fetchable without auth headers. Private
  // package/product images must retain their existing access controls.
  if (typeof path !== 'string' || !/^\/?assets\/img\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..')) return fallback;
  return new URL('/'+path.replace(/^\//,''),origin).href;
}
function describe(text) { return String(text || '').replace(/\s+/g,' ').trim().slice(0,170); }
function presentation(title, description, image) {
  document.title=title;
  meta('description',description);
  meta('og:title',title,true);meta('og:description',description,true);
  meta('og:type','website',true);meta('og:image',publicImage(image),true);
  meta('twitter:card','summary_large_image');meta('twitter:title',title);
  meta('twitter:description',description);meta('twitter:image',publicImage(image));
}
export function resetDetailMetadata(kind, unavailable = false) {
  const label=kind==='package'?'Paquete':'Producto';
  document.head.querySelector('link[rel="canonical"]')?.remove();
  document.head.querySelector('meta[property="og:url"]')?.remove();
  presentation(`${label}${unavailable?' no disponible':''} | Vant’ara`,
    unavailable?`Este ${label.toLowerCase()} no está disponible.`:`Consulta ${kind==='package'?'los productos y tallas del paquete':'los detalles y tallas del producto'} en Vant’ara.`);
  if(unavailable){meta('robots','noindex, follow');document.head.querySelector('meta[name="robots"]').dataset.detailSeo='true';}
}
export function setDetailMetadata(kind, item, image) {
  if (!Number.isSafeInteger(item.id) || item.id<=0) return;
  const name=item.name||item.model;
  const description=describe(item.description) || `${name}. Consulta ${kind==='package'?'sus productos incluidos y tallas disponibles':'sus detalles, tallas y disponibilidad'} en Vant’ara.`;
  const url=`${origin}/${kind==='package'?'paquete':'producto'}.html?id=${item.id}`;
  presentation(`${name} | Vant’ara`,description,image);
  let canonical=document.head.querySelector('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}
  canonical.href=url;meta('og:url',url,true);
  document.head.querySelector('meta[name="robots"][data-detail-seo]')?.remove();
}

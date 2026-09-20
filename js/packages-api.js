import { projectUrl } from '../admin/js/config.js?v=supabase-2';
import { createCatalogApi } from './catalog-api.js?v=production-fixes-1';

const catalog = createCatalogApi();
const request = catalog.requestPublic;
const placeholder = 'assets/img/producto-pendiente.svg';
const urls = new Set();
const imageCache = new Map();
const select = 'id,name,description,discount_percent,image_path,published,package_images(storage_path,position,is_primary),package_items(id,product_id,position)';

export function packageLoadError(error, context = 'paquetes') {
  const text = error.name === 'AbortError' || (error instanceof TypeError && !error.status)
    ? 'No pudimos conectar. Revisa tu conexión e intenta de nuevo.'
    : 'No pudimos cargar los paquetes. Intenta de nuevo.';
  // Safe diagnostics: no JWTs, request headers, URLs or database response bodies.
  console.warn('[Paquetes]', { context, status: error.status || null, code: error.code || null, type: error.name || 'Error' });
  return text;
}

export function validPackageId(value) {
  return /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

async function downloadImage(pack) {
  if (!pack.image_path || !new RegExp(`^packages/${Number(pack.id)}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(pack.image_path)) return placeholder;
  try {
    // Private Storage read with the publishable key, never an admin JWT.
    // RLS permits only gallery associations of a published package.
    const response = await request(`${projectUrl}/storage/v1/object/authenticated/package-images/${pack.image_path}`);
    const blob = await response.blob();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('Formato de imagen inválido');
    const url = URL.createObjectURL(blob);
    try {
      const preview = new Image(); preview.src = url;
      await preview.decode();
    } catch (error) { URL.revokeObjectURL(url); throw error; }
    urls.add(url); return url;
  } catch (error) { packageLoadError(error, `imagen del paquete ${pack.id}`); return placeholder; }
}

function imageURL(pack) {
  const key = pack.image_path;
  if (!key) return Promise.resolve(placeholder);
  if (!imageCache.has(key)) imageCache.set(key, downloadImage(pack));
  return imageCache.get(key);
}
async function galleryURLs(row, fullGallery) {
  const ordered = [...(row.package_images || [])].sort((a, b) => a.position - b.position);
  const primary = ordered.find(image => image.is_primary) || ordered[0];
  const entries = primary ? [primary, ...ordered.filter(image => image !== primary)] : [];
  if (!entries.length) return [placeholder];
  const images = [];
  // Bounded per-package work; list cards fetch only the representative image.
  for (const entry of fullGallery ? entries : entries.slice(0, 1)) {
    const url = await imageURL({ id: row.id, image_path: entry.storage_path });
    if (url !== placeholder) images.push(url);
  }
  return images.length ? images : [placeholder];
}

async function hydrate(rows, fullGallery = false, publishedProducts = null, media = true) {
  if (!rows.length) return [];
  let products = [], productError = null;
  try { products = publishedProducts ?? await (media ? catalog.loadProducts() : catalog.loadProductsData()); }
  catch (error) { productError = packageLoadError(error, 'productos publicados'); }
  const byId = new Map(products.map(p => [p.id, p]));
  const result = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++, row = rows[index];
      const items = [...(Array.isArray(row.package_items) ? row.package_items : [])].filter(item => item && Number.isSafeInteger(Number(item.product_id)))
        .sort((a, b) => a.position - b.position || a.id - b.id)
        .map(item => ({ productId: Number(item.product_id), position: item.position, product: byId.get(Number(item.product_id)) || null }));
      const priceQuery = new URLSearchParams({ p_package_id: String(row.id) });
      let pricing = null, loadError = productError;
      try { pricing = await (await request(`${projectUrl}/rest/v1/rpc/get_catalog_package_price?${priceQuery}`)).json(); }
      catch (error) { loadError = packageLoadError(error, `precio (RPC) del paquete ${row.id}`); }
      const complete = items.length >= 2 && items.every(i => i.product && i.product.price !== null) && pricing?.complete_price === true
        && pricing.original_subtotal !== null && pricing.final_total !== null
        && Number.isFinite(Number(pricing.original_subtotal)) && Number.isFinite(Number(pricing.final_total));
      const images = media ? await galleryURLs(row, fullGallery) : [placeholder];
      result[index] = {
        id: Number(row.id), name: row.name, description: row.description || '',
        discountPercent: row.discount_percent, image: images[0], images, items, loadError,
        imagePath: ([...(row.package_images || [])].sort((a,b) => Number(b.is_primary)-Number(a.is_primary) || a.position-b.position)[0]?.storage_path) || null,
        pricing: { complete, originalSubtotal: complete ? Number(pricing.original_subtotal) : null,
          finalTotal: complete ? Number(pricing.final_total) : null }
      };
    }
  }));
  return result;
}

export async function getPublishedPackages() {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const query = new URLSearchParams({ select, published: 'eq.true', order: 'id.asc', limit: '100', offset: String(offset) });
    const page = await (await request(`${projectUrl}/rest/v1/packages?${query}`)).json();
    if (!Array.isArray(page)) throw new Error('Respuesta de paquetes inválida.');
    rows.push(...page.filter(p => p.published === true));
    if (page.length < 100) break;
  }
  return hydrate(rows);
}

export async function getPackageById(id, { fullGallery = true, products = null, media = true } = {}) {
  if (!validPackageId(id)) return null;
  const query = new URLSearchParams({ select, published: 'eq.true', id: `eq.${Number(id)}`, limit: '1' });
  const rows = await (await request(`${projectUrl}/rest/v1/packages?${query}`)).json();
  if (!Array.isArray(rows)) throw new Error('Respuesta de paquetes inválida.');
  return (await hydrate(rows.filter(p => p.published === true), fullGallery, products, media))[0] || null;
}

export const loadPackagePrimaryImage=pack=>imageURL({id:pack.id,image_path:pack.imagePath});

export function disposePackageMedia() {
  urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); imageCache.clear(); catalog.dispose();
}
window.addEventListener('pagehide', event => { if (!event.persisted) disposePackageMedia(); });

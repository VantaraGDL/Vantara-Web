import {projectUrl, publishableKey} from '../admin/js/config.js?v=supabase-2';

// Public requests deliberately never read the admin session or send its JWT.
export const PRODUCT_SELECT = 'id,name,model,color,material,finish,description,price,featured,published,position,requires_size,max_quantity,brands(id,name),categories(id,name),collections(id,name,discount_enabled,discount_amount,minimum_pieces),product_variants(id,size,stock,position),product_images(id,path,alt,position,bucket_id,media_state)';
const placeholder = 'assets/img/producto-pendiente.svg';
const byPosition = (a,b) => a.position-b.position || a.id-b.id;

export function transformProduct(row) {
    const variants = [...(row.product_variants || [])].sort(byPosition);
    return {
        id: Number(row.id), name: row.name, model: row.model, color: row.color,
        material: row.material, finish: row.finish, description: row.description,
        price: row.price === null ? null : Number(row.price), featured: row.featured === true,
        brand: row.brands?.name || '', category: row.categories?.id || '',
        categoryName: row.categories?.name || '', position: row.position,
        collection: row.collections?.id || null, collectionName: row.collections?.name || '',
        collectionDiscount: row.collections ? {
            enabled: row.collections.discount_enabled === true,
            amount: Number(row.collections.discount_amount), minimumPieces: row.collections.minimum_pieces
        } : null,
        requiresSize: row.requires_size, maxQuantity: row.max_quantity,
        variants,
        sizes: row.requires_size ? variants.map(v=>v.size) : [],
        // Compatibility projection only; variants remain the database source of truth.
        stock: row.requires_size ? Object.fromEntries(variants.map(v=>[v.size,v.stock])) : variants[0]?.stock ?? null,
        images: [], imageRecords: [...(row.product_images || [])].filter(i=>i.media_state==='ready').sort(byPosition)
    };
}

export function createCatalogApi({fetcher=globalThis.fetch, makeObjectURL=blob=>URL.createObjectURL(blob),
    revokeObjectURL=url=>URL.revokeObjectURL(url)}={}) {
    const urls = new Set();
    async function request(url) {
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(),20000);
        try {
            const response = await fetcher(url,{headers:{apikey:publishableKey},credentials:'omit',cache:'no-store',signal:controller.signal});
            if (!response.ok) throw new Error('No se pudo consultar el catálogo. Intenta recargar la página.');
            return response;
        } finally { clearTimeout(timer); }
    }
    async function imageURL(image, productId) {
        if (!image.bucket_id) {
            return /^assets\/img\/[a-zA-Z0-9_./-]+$/.test(image.path) && !image.path.includes('..') ? image.path : placeholder;
        }
        if (image.bucket_id!=='product-images' || !new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(image.path)) return placeholder;
        const response = await request(`${projectUrl}/storage/v1/object/authenticated/product-images/${image.path}`);
        const blob = await response.blob();
        if (!['image/jpeg','image/png','image/webp'].includes(blob.type)) throw new Error('Imagen no disponible.');
        const url = makeObjectURL(blob); urls.add(url); return url;
    }
    return {
        async loadProducts() {
            const rows=[];
            for (let offset=0;;offset+=100) {
                const query = new URLSearchParams({select:PRODUCT_SELECT,published:'eq.true',order:'position.asc,id.asc',limit:'100',offset:String(offset)});
                const page=await (await request(`${projectUrl}/rest/v1/products?${query}`)).json();
                if (!Array.isArray(page)) throw new Error('Respuesta del catálogo inválida.');
                rows.push(...page.filter(p=>p.published===true));
                if(page.length<100)break;
            }
            const products=rows.map(transformProduct);
            // Bound concurrent downloads; failed images keep their position as placeholders.
            let next=0;
            const jobs=products.flatMap(p=>p.imageRecords.map((image,index)=>async()=>{
                try { p.images[index]=await imageURL(image,p.id); }
                catch { p.images[index]=placeholder; p.imageError=true; }
            }));
            await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(next<jobs.length)await jobs[next++]();}));
            return products;
        },
        dispose(){urls.forEach(revokeObjectURL);urls.clear();}
    };
}
export const catalogApi=createCatalogApi();
if(typeof window!=='undefined')window.addEventListener('pagehide',event=>{if(!event.persisted)catalogApi.dispose();});

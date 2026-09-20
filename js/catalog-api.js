import {projectUrl, publishableKey} from '../admin/js/config.js?v=supabase-2';

// Public requests deliberately never read the admin session or send its JWT.
export const PRODUCT_SELECT = 'id,name,model,color,material,finish,description,price,on_sale,discount_percent,featured,new_release,created_at,published,position,requires_size,max_quantity,brands(id,name),categories(id,name),collections(id,name,discount_enabled,discount_amount,minimum_pieces),product_variants(id,size,stock,position),product_images(id,path,alt,position,bucket_id,media_state)';
const VALIDATION_SELECT = 'id,name,model,price,on_sale,discount_percent,published,position,requires_size,max_quantity,brands(id,name),categories(id,name),collections(id,name,discount_enabled,discount_amount,minimum_pieces),product_variants(id,size,stock,position),product_images(id,path,position,bucket_id,media_state)';
const placeholder = 'assets/img/producto-pendiente.svg';
const byPosition = (a,b) => a.position-b.position || a.id-b.id;

export function transformProduct(row) {
    const variants = [...(row.product_variants || [])].sort(byPosition);
    return {
        id: Number(row.id), name: row.name, model: row.model, color: row.color,
        material: row.material, finish: row.finish, description: row.description,
        price: row.price === null ? null : Number(row.price), featured: row.featured === true,
        onSale: row.on_sale === true, discountPercent: row.discount_percent === null ? null : Number(row.discount_percent),
        newRelease: row.new_release === true, published: row.published === true, createdAt: row.created_at,
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
    const urls = new Set(), imageCache = new Map();
    async function request(url) {
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(),20000);
        try {
            const response = await fetcher(url,{headers:{apikey:publishableKey},credentials:'omit',cache:'no-store',signal:controller.signal});
            if (!response.ok) {
                const error = new Error('No se pudo consultar el catálogo. Intenta recargar la página.');
                error.status = response.status;
                // Keep only the error code; never expose response bodies or credentials.
                try { const body = await response.json(); if (/^[A-Za-z0-9_]{1,40}$/.test(body.code || '')) error.code = body.code; } catch {}
                throw error;
            }
            return response;
        } finally { clearTimeout(timer); }
    }
    async function imageURL(image, productId) {
        if (!image.bucket_id) {
            return /^assets\/img\/[a-zA-Z0-9_./-]+$/.test(image.path) && !image.path.includes('..') ? image.path : placeholder;
        }
        if (image.bucket_id!=='product-images' || !new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(image.path)) return placeholder;
        if(!imageCache.has(image.path)) {
            const pending=(async()=>{
                const response = await request(`${projectUrl}/storage/v1/object/authenticated/product-images/${image.path}`);
                const blob = await response.blob();
                if (!['image/jpeg','image/png','image/webp'].includes(blob.type)) throw new Error('Imagen no disponible.');
                const url = makeObjectURL(blob); urls.add(url); return url;
            })();
            imageCache.set(image.path,pending);
            pending.catch(()=>{if(imageCache.get(image.path)===pending)imageCache.delete(image.path);});
        }
        return imageCache.get(image.path);
    }
    return {
        // Expose transport on the API instance, not on individual products.
        requestPublic: request,
        async loadProductsData({full=false}={}) {
            const rows=[];
            for (let offset=0;;offset+=100) {
                const query = new URLSearchParams({select:full?PRODUCT_SELECT:VALIDATION_SELECT,published:'eq.true',order:'position.asc,id.asc',limit:'100',offset:String(offset)});
                const page=await (await request(`${projectUrl}/rest/v1/products?${query}`)).json();
                if (!Array.isArray(page)) throw new Error('Respuesta del catálogo inválida.');
                rows.push(...page.filter(p=>p.published===true));
                if(page.length<100)break;
            }
            return rows.map(transformProduct);
        },
        async loadProductImages(products,{primaryOnly=false}={}) {
            // Bound concurrent downloads; failed images keep their position as placeholders.
            let next=0;
            const jobs=products.flatMap(p=>(primaryOnly?p.imageRecords.slice(0,1):p.imageRecords).map((image,index)=>async()=>{
                try { p.images[index]=await imageURL(image,p.id); }
                catch { p.images[index]=placeholder; p.imageError=true; }
            }));
            await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(next<jobs.length)await jobs[next++]();}));
            return products;
        },
        async loadProducts(){return this.loadProductImages(await this.loadProductsData({full:true}));},
        releaseUnusedImages(products){
            const keep=new Set(products.flatMap(p=>p.imageRecords.map(i=>i.path)));
            for(const [path,pending] of imageCache)if(!keep.has(path)){
                imageCache.delete(path);
                pending.then(url=>{urls.delete(url);revokeObjectURL(url);},()=>{});
            }
        },
        dispose(){this.releaseUnusedImages([]);urls.clear();}
    };
}
export const catalogApi=createCatalogApi();
if(typeof window!=='undefined')window.addEventListener('pagehide',event=>{if(!event.persisted)catalogApi.dispose();});

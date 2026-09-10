import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createCatalogApi,transformProduct} from './catalog-api.js';
import {getTotalStock,quantityLimit,sizeUnavailable,productSizes,calculateOrder,escapeHTML} from './catalog-logic.js';

const base={id:2,name:'Essentials Hoodie Light Oatmeal',model:'Light Oatmeal',color:'Crema',material:null,description:null,finish:null,
    price:999,featured:true,published:true,position:1,requires_size:true,max_quantity:5,
    brands:{id:'Essentials',name:'Essentials'},categories:{id:'Hoodies',name:'Hoodies'},
    collections:{id:'light-oatmeal',name:'Light Oatmeal',discount_enabled:true,discount_amount:150,minimum_pieces:2},
    product_variants:[{id:2,size:'M',stock:null,position:1},{id:1,size:'S',stock:3,position:0},{id:3,size:'L',stock:0,position:2}],
    product_images:[{id:1,path:'assets/img/catalogo/essentials-hoodie-light-oatmeal.png',bucket_id:null,position:0,media_state:'ready'}]};
const tee={...base,id:8,name:'Essentials T-shirt Light Oatmeal',featured:false,price:899,categories:{id:'T-Shirts',name:'Playeras'}};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function apiFor(rows) {return createCatalogApi({fetcher:async(url,options)=>{
    assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Authorization,undefined);assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
    const query=new URL(url).searchParams;assert.equal(query.get('published'),'eq.true');
    return response(rows.slice(Number(query.get('offset')),Number(query.get('offset'))+100));
}});}
assert.deepEqual(await apiFor([]).loadProducts(),[]);
const one=await apiFor([base]).loadProducts();assert.equal(one.length,1);
const two=await apiFor([base,tee,{...base,id:46,published:false}]).loadProducts();assert.equal(two.length,2);
assert.equal(two.filter(p=>p.featured).length,1);assert.equal(two.find(p=>p.id===46),undefined);
assert.deepEqual(two[0].sizes,['S','M','L']);assert.equal(two[0].images[0],base.product_images[0].path);
assert.equal(getTotalStock(two[0]),3);assert.equal(sizeUnavailable(two[0],'M'),false);assert.equal(sizeUnavailable(two[0],'L'),true);
assert.equal(quantityLimit(two[0],'M'),5);assert.equal(quantityLimit(two[0],'S'),3);assert.equal(quantityLimit(two[0],'L'),0);
const unique=transformProduct({...base,requires_size:false,product_variants:[{id:9,size:'Única',stock:0,position:0}]});
assert.deepEqual(productSizes(unique),[]);assert.equal(quantityLimit(unique,null),0);
unique.variants[0].stock=null;assert.equal(quantityLimit(unique,null),5);assert.equal(getTotalStock(unique),null);
assert.equal(quantityLimit({...unique,variants:[]},null),0);
const selection=new Map([[2,{size:'S',quantity:1}],[8,{size:'M',quantity:1}]]);
assert.deepEqual(calculateOrder(two,selection),{completePrice:true,subtotal:1898,discount:150,total:1748});
assert.equal(calculateOrder([two[0]],selection).discount,0);
selection.get(2).quantity=2;assert.equal(calculateOrder([two[0]],selection).discount,150);
two[0].collectionDiscount={enabled:true,amount:75,minimumPieces:3};
assert.equal(calculateOrder([two[0]],selection).discount,0);selection.get(2).quantity=3;
assert.equal(calculateOrder([two[0]],selection).discount,75);
two[0].collectionDiscount.enabled=false;assert.equal(calculateOrder([two[0]],selection).discount,0);
assert.equal(calculateOrder([{...two[0],price:null}],selection).completePrice,false);
assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
// Execute the existing array search/order functions, not a duplicated implementation.
const catalog=fs.readFileSync(new URL('./catalogo.js',import.meta.url),'utf8');
const logic=catalog.slice(catalog.indexOf('function productMatchesSearch'),catalog.indexOf('categoryFilter.addEventListener'));
const context=vm.createContext({selectedSort:'default',rows:two});vm.runInContext(logic,context);
assert.equal(context.productMatchesSearch(two[0],'crema'),true);
assert.equal(context.productMatchesSearch(two[1],'playeras'),true);
assert.equal(context.productMatchesSearch(two[0],'inexistente'),false);
context.selectedSort='price-asc';assert.equal(context.sortProducts(two)[0].id,8);
context.selectedSort='default';assert.equal(context.sortProducts(two)[0].id,2);
// Exercise the real filter pipeline using minimal nonvisual DOM substitutes.
Object.assign(context,{products:two,selectedCategory:'Hoodies',selectedBrand:'Essentials',searchTerm:'',loadError:false,
    stockOnly:{checked:true},catalogContainer:{innerHTML:'',appendChild(){}},catalogCount:{},noProductsMessage:{},getTotalStock,createProductCard:p=>p});
vm.runInContext(catalog.slice(catalog.indexOf('function renderCatalog'),catalog.indexOf('function productMatchesSearch')),context);
context.renderCatalog();assert.equal(context.catalogCount.textContent,'1 producto');
context.selectedBrand='Alo';context.renderCatalog();assert.equal(context.catalogCount.textContent,'0 productos');assert.equal(context.noProductsMessage.hidden,false);
const detail=fs.readFileSync(new URL('./producto.js',import.meta.url),'utf8');
const detailContext=vm.createContext({products:two,relatedSection:{},relatedProducts:{innerHTML:'',appendChild(){}},createProductCard:p=>p});
vm.runInContext(detail.slice(detail.indexOf('function renderRelatedProducts'),detail.indexOf('function renderQuantity')),detailContext);
detailContext.renderRelatedProducts(two[0]);assert.notEqual(detailContext.relatedSection.hidden,true);
detailContext.products=one;detailContext.renderRelatedProducts(one[0]);assert.equal(detailContext.relatedSection.hidden,true);
Object.assign(detailContext,{escapeHTML,knownPrice:p=>p.price!==null,money:String,getProductImages:p=>p.images,createSizes:()=>'',renderQuantity:()=>''});
vm.runInContext(detail.slice(detail.indexOf('function renderCollection'),detail.indexOf('function updateOrderSummary')),detailContext);
assert.equal(detailContext.renderCollection(one[0]),'');detailContext.products=two;
const outfit=detailContext.renderCollection(two[0]);assert.match(outfit,/data-outfit-id="8"/);assert.doesNotMatch(outfit,/data-outfit-id="2"/);

let downloaded=0,revoked=0;
const storageRow={...base,product_images:[
    {id:3,path:'products/2/12345678-1234-1234-1234-123456789abc.png',bucket_id:'product-images',position:0,media_state:'ready'},
    {...base.product_images[0],position:1},
    {id:4,path:'products/2/12345678-1234-1234-1234-123456789abd.png',bucket_id:'product-images',position:2,media_state:'uploading'}]};
const storageApi=createCatalogApi({fetcher:async url=>{
    if(url.includes('/rest/'))return response([storageRow]);
    assert.match(url,/\/object\/authenticated\/product-images\/products\/2\//);downloaded++;
    return new Response(new Blob(['fixture'],{type:'image/png'}));
},makeObjectURL:()=> 'blob:test-image',revokeObjectURL:()=>revoked++});
const storage=await storageApi.loadProducts();assert.equal(downloaded,1);assert.equal(storage[0].images.length,2);
assert.equal(storage[0].images[0],'blob:test-image');assert.match(storage[0].images[1],/^assets\/img\//);
storageApi.dispose();assert.equal(revoked,1);
const broken=createCatalogApi({fetcher:async url=>url.includes('/rest/')?response([storageRow]):new Response('',{status:403})});
assert.equal((await broken.loadProducts())[0].imageError,true);
await assert.rejects(createCatalogApi({fetcher:async()=>new Response('',{status:503})}).loadProducts());
assert.equal((await apiFor(Array.from({length:101},(_,i)=>({...base,id:i+1}))).loadProducts()).length,101);
for(const file of ['index.html','catalogo.html','producto.html']) {
    const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(html,/<script[^>]+src="js\/productos.js"/);assert.match(html,/<script type="module"/);
}
console.log('PASS: 0/1/2 publicados, ocultos, destacados, filtros, búsqueda, orden, stock NULL/0/Única, límites, relacionados, conjunto/descuentos, imágenes repo/Storage, paginación, errores y rutas de entrada. Datos simulados; sin navegador ni escrituras.');

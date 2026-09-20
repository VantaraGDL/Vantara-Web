import {projectUrl,publishableKey} from '../admin/js/config.js?v=supabase-2';

const attempts=new Map();
export function invalidateOrderAttempt(source){
 attempts.delete(source);
 try{sessionStorage.removeItem('vantara_order_attempt_'+source);}catch{}
}
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw new Error('Revisa los artículos y tallas del pedido.');return n;};
export function orderItems(rows) {
 return rows.map(row=>{
  if(row.type==='package')return {type:'package',package_id:id(row.package_id),items:row.items.map(i=>({product_id:id(i.product_id),variant_id:id(i.variant_id)})).sort((a,b)=>a.product_id-b.product_id)};
  const quantity=Number(row.quantity);
  if(!Number.isInteger(quantity)||quantity<1||quantity>5)throw new Error('Revisa las cantidades del pedido.');
  return {type:'product',product_id:id(row.product_id),variant_id:id(row.variant_id),quantity};
 }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function randomKey(){
 if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
 if(!globalThis.crypto?.getRandomValues)throw new Error('No pudimos preparar el pedido. Actualiza tu navegador.');
 return Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function prepareOrderAttempt(source,rows) {
 if(!['product','package','cart'].includes(source))throw new Error('Origen de pedido inválido.');
 const items=orderItems(rows);
 if(!items.length)throw new Error('Selecciona artículos para tu pedido.');
 const signature=JSON.stringify({source,items}),storageKey='vantara_order_attempt_'+source;
 let saved=attempts.get(source);
 if(!saved){try{saved=JSON.parse(sessionStorage.getItem(storageKey));}catch{}}
 if(!saved||saved.signature!==signature||!/^[-\w]{32,200}$/.test(saved.key||''))saved={signature,key:randomKey(),started:false};
 // The signature stores the immutable source/items, including across reloads.
 const original=JSON.parse(saved.signature);
 const payload={p_source:original.source,p_items:original.items,p_customer_name:null,p_customer_phone:null,p_idempotency_key:saved.key};
 attempts.set(source,saved);
 // Only the request identity/key, never prices, customer details or admin tokens.
 try{sessionStorage.setItem(storageKey,JSON.stringify(saved));}catch{}
 let inFlight=null;
 return {
  get started(){return saved.started===true;},
  get current(){return attempts.get(source)?.key===saved.key;},
  get items(){return JSON.parse(JSON.stringify(original.items));},
  async create(){
   if(inFlight)return inFlight;
   saved.started=true;
   try{sessionStorage.setItem(storageKey,JSON.stringify(saved));}catch{}
   inFlight=register(payload);
   try{return await inFlight;}
   catch(error){
    if(error.uncertain===false){
     saved.started=false;
     if(attempts.get(source)?.key===saved.key){try{sessionStorage.setItem(storageKey,JSON.stringify(saved));}catch{}}
    }
    throw error;
   }finally{inFlight=null;}
  },
  complete(){if(attempts.get(source)?.key===saved.key)attempts.delete(source);try{if(JSON.parse(sessionStorage.getItem(storageKey))?.key===saved.key)sessionStorage.removeItem(storageKey);}catch{}}
 };
}
const amount=value=>{const n=Number(value);if(value==null||!Number.isFinite(n)||n<0)throw new Error('Respuesta de importes inválida');return n;};
function normalize(data) {
 if(!data||!/^VNT-[0-9]+$/.test(data.public_code)||!['pending','confirmed','cancelled'].includes(data.status)||!Array.isArray(data.items)||!data.items.length)throw new Error('Respuesta de pedido inválida');
 const rows=[],packages=new Map();
 for(const item of data.items){
  if(item.line_type==='package_item'){
   const group=String(item.package_group);
   if(!packages.has(group)){
    const row={type:'package',package_name:item.package_name_snapshot,package_id:id(item.package_id),discount_percent:item.package_discount_percent_snapshot,original_subtotal:0,final_price:0,items:[]};
    packages.set(group,row);rows.push(row);
   }
   const row=packages.get(group);
   // Sum stored amounts in cents, never reapply a discount formula.
   row.original_subtotal=(Math.round(row.original_subtotal*100)+Math.round(amount(item.unit_original_price)*100))/100;
   row.final_price=(Math.round(row.final_price*100)+Math.round(amount(item.line_total)*100))/100;
   row.items.push({product_name:item.product_name_snapshot,size:item.size_snapshot});
  }else if(item.line_type==='product')rows.push({type:'product',name:item.product_name_snapshot,size:item.size_snapshot,quantity:item.quantity,originalPrice:amount(item.unit_original_price),price:amount(item.unit_effective_price),discountPercent:item.discount_percent_snapshot,individualSaleApplied:item.discount_percent_snapshot!=null});
  else throw new Error('Artículo de pedido inválido');
 }
 const total=amount(data.total),collectionDiscount=amount(data.collection_discount_total);
 return {order_id:id(data.order_id??data.id),public_code:data.public_code,status:data.status,reused:data.reused===true,total,rows,
  calculation:{completePrice:true,originalSubtotal:amount(data.subtotal),discountTotal:amount(data.discount_total),effectiveSubtotal:(Math.round(total*100)+Math.round(collectionDiscount*100))/100,collectionDiscountTotal:collectionDiscount,finalTotal:total}};
}
async function register(payload){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const response=await fetch(projectUrl+'/rest/v1/rpc/create_catalog_order',{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(payload),signal:controller.signal});
  if(!response.ok){
   let code='';try{const body=await response.json();code=String(body.code||'');console.error('Registro de pedido rechazado',{status:response.status,code,message:body.message});}catch{}
   const error=new Error(response.status<500?'No pudimos registrar tu pedido. Revisa la disponibilidad, tallas y cantidades e intenta nuevamente.':'No pudimos confirmar el registro del pedido. Intenta nuevamente.');error.publicMessage=true;error.uncertain=response.status>=500||response.status===408||response.status===429;throw error;
  }
  return normalize(await response.json());
 }catch(error){
  if(error.publicMessage)throw error;
  console.error('No se pudo confirmar la respuesta del pedido',{name:error.name});
  throw new Error('No pudimos confirmar el registro del pedido. Intenta nuevamente.');
 }finally{clearTimeout(timer);}
}
